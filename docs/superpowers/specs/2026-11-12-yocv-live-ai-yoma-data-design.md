# YoCV Phase 1: live AI generation and Yoma data sources

Date: 2026-11-12
Status: approved design, spec for review
Scope: Week 6 refinement of the existing YoCV prototype. Phase 2 (informal-work trust card) is a separate spec.

## 1. Goal and success criteria

YoCV today is a buildless HTML/JS app with a five-step journey (role, experience, evidence, review, CV), a rule-based generator in `core.js`, a synthetic credential, and a review model where user acceptance confirms wording and never verification. It has no server, no AI call, no Yoma data, and ten passing tests.

Phase 1 keeps the journey and the review model and replaces the simulated parts so the prototype meets the Week 6 brief:

1. Claim generation uses a real model call (Azure OpenAI preferred, provider modular) with hard grounding rules, and the UI says truthfully whether it is live or sample.
2. At least one real Yoma data source is used: Yoma's anonymous production API for the skill taxonomy and for learning opportunities. The credential becomes a representative sample shaped exactly on Yoma's wallet schema.
3. The repo can be launched independently with documented setup, environment variables and sample data, and documents what works, what is simulated, and what a live Yoma integration still needs.
4. The prototype is tested with realistic inputs, edge cases and model failures, and remaining problems are documented.

Done means:

- `npm start` serves the app on port 4173. With Azure credentials in `.env`, "Create my draft" produces model-generated claims; without them, the app runs in sample mode and the header pill says so.
- A claim cannot reach the review step if its supporting quote is not in the user's text, if it contains a number the user did not write, or if its skill is not a Yoma skill. Tests prove this.
- Every suggested skill on the CV carries a Yoma skill id and Lightcast link.
- The preview step shows live Yoma learning opportunities for the chosen role, or an honest "unavailable" note.
- All existing tests still pass, new tests cover validators, adapters, Yoma client and routes with mocked network, and a live smoke test runs only when credentials exist.
- README, integration notes and demo script describe the new state accurately, including a real-versus-simulated table.

## 2. Constraints

- Buildless frontend stays. No bundler, no framework, no runtime npm dependencies. Node 20+ built-ins only (`node:http`, `fetch`, `node:test`).
- Opening `index.html` directly from disk must still work, in sample mode.
- Model keys live server-side only. The model never receives the user's name, email, phone or city.
- The model only transforms the user's self-reported experience text. Credential and document claims are built by local code from their sources, never by the model.
- No Yoma login, no local Yoma docker stack, no file reading in this phase.
- Yoma's repository is GPL-3.0. We call its public API and copy no code from it.
- Mobile and low-bandwidth use: no new assets heavier than a few KB, Yoma logos loaded lazily.

## 3. Architecture

```
index.html, styles.css, core.js, app.js      existing frontend (modified)
server.js                                    entry: HTTP server, static files, routes
server/config.js                             reads .env and process.env, validates
server/env.js                                tiny .env parser (no dotenv dependency)
server/providers/index.js                    picks provider from config
server/providers/azure-openai.js             Azure OpenAI chat completions, strict JSON schema
server/providers/openai-compatible.js        any OpenAI-compatible endpoint (optional)
server/providers/local.js                    wraps core.js rules (sample mode)
server/generation.js                         prompt, output schema, assembly of claims
server/validate.js                           grounding validators
server/yoma.js                               Yoma API client with cache
server/cache.js                              in-memory TTL cache
data/sample-credential.json                  representative Yoma wallet credential
data/role-skill-keywords.json                per-role keyword lists for the skill menu
tests/*.test.cjs                             existing plus new tests
.env.example, README.md, presentation/*      docs
```

Request flow for "Create my draft":

1. Frontend posts `{role, experience, context, dates}` to `POST /api/generate`. Profile fields are never sent.
2. Server builds the skill menu for the role: for each keyword in `data/role-skill-keywords.json[role]`, query Yoma `GET /api/v3/lookup/skill?nameContains=<keyword>&pageNumber=1&pageSize=5`, union the results, cache one hour. The menu is a list of `{id, name, infoURL}` real Yoma skills.
3. Server calls the provider with the experience text and the menu. The output schema constrains skill names to the menu via `enum`.
4. Server validates every claim (section 6). Rejected claims are dropped and recorded.
5. Server assembles claims in the existing `core.js` claim shape and returns `{claims, generation}`.
6. Frontend appends credential and document claims using local code, then goes to the review step.
7. If the provider fails, the server returns a structured error. The frontend keeps the input and offers "Retry" and "Continue in sample mode". Sample mode calls `POST /api/generate` with `{mode:'sample'}` which uses the local provider, or, when the server is unreachable, runs `core.js` rules in the browser.

## 4. Server routes

All routes return JSON. Static files are served only from an allowlist: `index.html`, `styles.css`, `core.js`, `app.js`, `data/*.json`. Dotfiles, `server/`, `tests/`, `docs/` are never served.

### GET /api/status

Response:

```json
{
  "mode": "live" | "sample",
  "provider": "azure-openai" | "openai-compatible" | "local",
  "model": "<deployment or model name, or null>",
  "yoma": { "reachable": true, "baseUrl": "https://api.yoma.world/api/v3", "checkedAt": "ISO" }
}
```

`yoma.reachable` is the result of a cached (five minutes) call to `GET /opportunity/type`.

### POST /api/generate

Request:

```json
{ "role": "Retail assistant", "experience": "...", "context": "...", "dates": "...", "mode": "live" | "sample" }
```

Validation: `role` must be one of the three roles; `experience` 12 to 4000 chars and at least three words (same rule as `core.generateClaims`); `context` up to 120 chars; `dates` up to 100 chars. Invalid input returns 400 with `{error:{code:'invalid_input', message}}` using the same wording the frontend uses today.

Success response (200):

```json
{
  "claims": [ { "...existing claim shape...", "yomaSkill": { "id": "...", "name": "...", "infoURL": "..." } } ],
  "generation": {
    "mode": "live" | "sample",
    "provider": "azure-openai",
    "model": "gpt-4.1-mini",
    "generatedAt": "ISO",
    "durationMs": 1234,
    "skillMenuSize": 23,
    "rejected": [ { "kind": "experience", "text": "...", "reason": "quote_not_in_source" } ]
  }
}
```

Failure response: 502 `{error:{code, message, retryable:true|false}}` where `code` is one of `provider_not_configured`, `provider_timeout`, `provider_rate_limited`, `provider_auth`, `provider_bad_output`, `provider_error`, `yoma_unavailable_skills` (menu could not be built and no cached menu exists). Messages are plain language for the UI, for example "The AI service did not answer in time. You can retry or continue in sample mode."

Rate limit: 20 requests per minute per client IP on this route, 429 `{error:{code:'rate_limited'}}`.

### GET /api/yoma/skills?q=<text>

Proxies `GET /lookup/skill?nameContains=<q>&pageNumber=1&pageSize=10`. Returns `{items:[{id,name,infoURL}], source:'live'|'cache', unavailable:false}`. Used by tests and by the evidence record link check; the frontend does not need it in Phase 1 but it documents the integration.

### GET /api/yoma/opportunities?role=<role>

Looks up the Learning type id from `GET /opportunity/type` (cached), then `POST /opportunity/search` with `{pageNumber:1, pageSize:6, valueContains:<role query terms>, types:[learningTypeId]}`. Role query terms come from `data/role-skill-keywords.json[role].opportunityQuery`. Returns:

```json
{ "items": [ { "id", "title", "organizationName", "organizationLogoURL", "summary", "yomaInfoURL", "commitmentIntervalDescription", "difficulty", "skills": ["name"], "zltoReward", "isCompletable" } ], "source": "live"|"cache", "unavailable": false, "totalCount": 72 }
```

Only `isCompletable: true` items are returned. On Yoma failure with no cache: `{items:[], unavailable:true}` with 200, never a 5xx, so the preview page still renders.

## 5. Model provider

Interface in `server/providers/index.js`:

```js
// returns { output, model } where output matches the schema in section 5.2
async function generate({ role, experience, context, dates, skillMenu }, { signal })
```

### 5.1 Azure OpenAI adapter

- URL: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}` (default api-version `2024-10-21`, which supports `json_schema` response format).
- Headers: `api-key`, `content-type: application/json`.
- Body: `messages` (system + user), `response_format: {type:'json_schema', json_schema:{name:'yocv_claims', strict:true, schema}}`, `temperature: 0.2`, `max_tokens: 800`.
- Timeout 20 s via `AbortSignal.timeout`. One retry after 1.5 s on network error, 429, 500, 502, 503, 504. 401/403 map to `provider_auth`, 429 after retry to `provider_rate_limited`, timeout to `provider_timeout`, unparsable or schema-violating content to `provider_bad_output`.
- Response content is parsed as JSON and re-checked against the schema server-side (we do not trust `strict` alone).

### 5.2 Output schema (strict JSON schema, `additionalProperties:false`, all fields required)

```json
{
  "type": "object",
  "properties": {
    "experience": {
      "type": "array", "maxItems": 4,
      "items": { "type": "object", "properties": {
        "text": { "type": "string" },
        "sourceQuote": { "type": "string" },
        "reason": { "type": "string" }
      }, "required": ["text","sourceQuote","reason"], "additionalProperties": false }
    },
    "skills": {
      "type": "array", "maxItems": 3,
      "items": { "type": "object", "properties": {
        "name": { "type": "string", "enum": ["<menu names>"] },
        "sourceQuote": { "type": "string" },
        "reason": { "type": "string" }
      }, "required": ["name","sourceQuote","reason"], "additionalProperties": false }
    }
  },
  "required": ["experience","skills"],
  "additionalProperties": false
}
```

If the skill menu is empty (Yoma unreachable and no cache), the `skills` array is omitted from the schema and the response carries `rejected: [{kind:'skill', reason:'yoma_skill_menu_unavailable'}]` once, so the UI can say skills were not suggested.

### 5.3 Prompt rules (system message)

- You rewrite a young person's own description of informal experience into short CV bullets for the target role.
- Each bullet must be supported by a verbatim quote from the text. Never add numbers, employers, dates, titles, tools or outcomes the text does not contain.
- Use plain English, one responsibility per bullet, 6 to 25 words, start with a verb, no first person.
- Choose at most three skills from the provided list only, each with a quote showing the evidence.
- `reason` explains in one sentence, addressed to the user, why the wording was chosen and reminds them to check it.
- Output JSON only.

User message: role, context, dates, the experience text inside clear delimiters, and the skill menu names.

### 5.4 OpenAI-compatible adapter

Same body as Azure with `model` set to `OPENAI_MODEL`, URL `${OPENAI_BASE_URL}/chat/completions`, header `authorization: Bearer`. Enabled only when `OPENAI_API_KEY` is set and Azure is not. Exists so the live path can be verified with whichever key the team has; the deck names Azure as the target.

### 5.5 Local adapter

Calls `core.localExperienceClaims(input)` (the existing rules, see section 8) and maps the result to the same output shape so the server pipeline, validators and evidence metadata are identical in both modes. Skill suggestions from the rules are resolved against the Yoma menu by case-insensitive name match where possible.

## 6. Validators (`server/validate.js`)

Applied to every model or local claim. Each returns `{ok:true}` or `{ok:false, reason}`.

1. `quoteInSource(sourceQuote, experience)`: after normalising whitespace, curly quotes and case, the quote must be a substring of the experience text and at least 8 characters.
2. `noInventedNumbers(text, experience)`: every digit sequence in `text` must appear in `experience`.
3. `lengthOk(text)`: 1 to 180 characters for experience bullets.
4. `skillInMenu(name, menu)`: exact case-insensitive match returning the menu entry.
5. `noBannedClaims(text)`: rejects wording that asserts verification or credentials ("certified", "verified", "licensed", "qualified", "award", "degree") since the model only sees self-reported text.
6. `dedupe(claims)`: drop a claim whose text equals an earlier one after normalisation.

Rejected claims are returned in `generation.rejected` with the reason code. If every experience claim is rejected, the route returns 200 with zero experience claims and the frontend shows the existing "nothing could be suggested" error path with the rejection count.

## 7. Yoma client (`server/yoma.js`)

- Base URL from `YOMA_API_BASE` (default `https://api.yoma.world/api/v3`).
- Functions: `searchSkills(q)`, `opportunityTypes()`, `searchLearningOpportunities(query)`, `reachable()`.
- Timeout 10 s. Header `accept: application/json`, no auth.
- Cache (`server/cache.js`): Map keyed by URL plus body, TTL one hour for skills and opportunities, five minutes for reachability. On fetch failure, return the stale cached value if any with `source:'cache'`; otherwise throw `YomaUnavailable`.
- The three endpoints and their response fields are recorded in `presentation/integration-notes.md` with the date they were checked.

## 8. Frontend changes

### core.js

- Split `generateClaims(input)` into `localExperienceClaims(input)` (experience bullets and rule-based skill) and `evidenceClaims(input)` (credential and document claims). `generateClaims` keeps its current behaviour by composing the two, so existing tests pass unchanged.
- Add `attachYomaSkill(claim, yomaSkill)` which sets `claim.yomaSkill` and `claim.sourceLabel` suffix "Yoma skill".
- `labels.verified` becomes "Issuer-recorded achievement · representative Yoma sample". `credential` is replaced by `setCredential(fixture)` so the app can load `data/sample-credential.json`; the built-in value stays as fallback for file:// use.
- `buildEvidence` gains a `generation` section (mode, provider, model, generatedAt, rejected list). `generationMode` text derives from it: "Live AI generation (azure-openai, gpt-4.1-mini), 1 suggestion rejected by grounding checks" or "Local sample templates; no live AI call".
- `buildTextCV` footer says "YoCV prototype · Live AI generation" or "· Sample generation" accordingly, and skill lines append the Yoma skill name when different from the claim text.

### app.js

- On load, `GET /api/status`. Header pill shows "Live AI · gpt-4.1-mini", "Sample mode", or "Sample mode (offline)" when the server is unreachable. The evidence step notice and the review aside key item say the same.
- `generate()` posts to `/api/generate`. Busy state shows "Asking the AI…" with a cancel button (AbortController). On success, `state.claims = response.claims.concat(C.evidenceClaims(state))`, `state.generation = response.generation`.
- On structured failure, the error block shows the message plus two buttons: "Retry" and "Continue in sample mode". Sample mode posts `{mode:'sample'}`; if the server itself is unreachable, it runs `C.generateClaims` in the browser and sets `generation.mode='sample'`, `provider:'browser-local'`.
- Claim cards: AI-suggested claims show the quote as the source line ("Based on: “…”") and a small "Yoma skill" tag with the Lightcast link on skill claims.
- Preview step gains a section "Strengthen this CV on Yoma": up to four learning opportunities from `/api/yoma/opportunities?role=`, each with organisation logo (lazy), title, hours, and a link to its yoma.world page, labelled "Live from Yoma". When unavailable, a one-line note. Fetched when the preview step opens, cached in state.
- Evidence record (HTML and JSON downloads) includes the generation section and the rejected list.
- About dialog and the "Working versus simulated" copy updated to the new state.

### index.html and styles.css

- Mode pill gets `live`, `sample` and `offline` variants (text plus colour, never colour alone).
- Styles for the opportunity cards and the quote line, mobile first, no horizontal overflow at 360 px.

## 9. Configuration

`.env.example`:

```
# Azure OpenAI (preferred). Leave empty to run in sample mode.
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_API_VERSION=2024-10-21

# Optional alternative: any OpenAI-compatible endpoint. Used only if Azure is not configured.
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

# Yoma public API (anonymous endpoints). Change for stage if a client is issued.
YOMA_API_BASE=https://api.yoma.world/api/v3

PORT=4173
HOST=127.0.0.1
```

`server/config.js` resolves the provider: Azure if endpoint, key and deployment are all set; else OpenAI-compatible if key set; else local. It never logs secrets. Startup prints the mode and the Yoma base URL.

## 10. Error handling summary

| Situation | Behaviour |
|---|---|
| No model configured | Status says sample; generate runs local provider; UI says sample mode |
| Model timeout or 5xx | One retry; then 502 with retryable message; UI offers Retry and sample mode; input kept |
| Model 401/403 | 502 `provider_auth`, message tells the operator to check keys; UI offers sample mode |
| Model returns non-JSON or schema violation | 502 `provider_bad_output`; counted in server log; UI offers Retry and sample mode |
| Model returns ungrounded claims | Dropped by validators, listed in `generation.rejected`, shown in evidence record |
| Yoma skills lookup down, cache present | Menu from cache, `source:'cache'` noted in generation |
| Yoma skills lookup down, no cache | Live generation proceeds without skills; one rejected entry explains; UI note on review step |
| Yoma opportunities down | Preview shows "Yoma opportunities unavailable right now" |
| Server unreachable (file:// or stopped) | Pill "Sample mode (offline)"; browser-local rules; opportunities section hidden |
| Rate limit on /api/generate | 429 with message; UI shows it and keeps input |

## 11. Tests

Existing `tests/core.test.cjs` unchanged and passing. New:

- `tests/validate.test.cjs`: each validator with passing and failing cases, including curly quotes, whitespace, invented numbers, banned words, dedupe.
- `tests/generation.test.cjs`: pipeline with a fake provider returning good, partially ungrounded, fully ungrounded and malformed output; asserts claim shapes, rejected lists, Yoma skill attachment, and that profile fields never appear in the provider input.
- `tests/providers.test.cjs`: Azure adapter with mocked `fetch` for success, 429 then success, timeout, 401, bad JSON; asserts URL, headers and body shape (no secrets in errors).
- `tests/yoma.test.cjs`: client with mocked `fetch` for skills, types, opportunities, cache hit, stale-on-failure, and unavailable.
- `tests/server.test.cjs`: boots `server.js` on an ephemeral port with a fake provider and mocked Yoma; checks `/api/status`, `/api/generate` validation and success, rate limit, static allowlist (requests for `/server/config.js` and `/.env` return 404).
- `tests/live.test.cjs`: skipped unless Azure or OpenAI variables are set; one real generate call with Amina's text asserts grounded output and at least one Yoma skill. Also one real call to Yoma `lookup/skill` asserting a "Customer Service" result.
- Manual scenarios recorded in `docs/testing-log.md`: Amina sample, a caregiving story, a one-line input, a 4000-character input, text with numbers, text in isiZulu or Swahili (model may answer in English; documented), a hostile input trying to inject instructions, keys removed mid-session, Yoma blocked by hosts file.

## 12. Documentation

- README: what it is, quick start (`npm install` not needed, `npm start`), env setup for Azure, sample mode, what data leaves the device, Yoma data sources used, real-versus-simulated table, tests, source layout, known limitations.
- `presentation/integration-notes.md`: updated endpoint list with checked date and response fields; what a live integration needs (Keycloak client for user data, wallet credential read, hosting under yoma.world, consent); what changed since the midterm.
- `presentation/demo-script.md`: three-minute script showing live mode, a rejected suggestion, Yoma skills and opportunities, and sample-mode fallback.
- `docs/testing-log.md`: scenarios run, results, open issues for the next sprint.

## 13. Real versus simulated (as it will be stated)

| Element | Status |
|---|---|
| Claim generation | Real model call when configured (Azure OpenAI); local rules otherwise, labelled |
| Grounding validators | Real, server-side |
| Skill taxonomy | Real, live Yoma production API (Lightcast skills) |
| Learning opportunities | Real, live Yoma production API |
| Credential | Representative sample shaped on Yoma wallet schema; no login, so not the user's own |
| Uploaded document | Name and user statement only; file never read |
| User identity and Yoma profile | Not connected (needs Keycloak client) |
| Verification of anything | None; acceptance confirms wording only |

## 14. Out of scope

Yoma login and profile reads, local Yoma docker stack, document OCR, PDF generation beyond browser print, persistence, analytics, any language other than English for generation, the trust card (Phase 2).
