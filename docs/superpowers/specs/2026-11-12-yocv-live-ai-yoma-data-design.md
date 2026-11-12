# YoCV Phase 1: live AI generation and Yoma data sources

Date: 2026-11-12 (revised after three-lens review the same day)
Status: approved design
Scope: Week 6 refinement of the existing YoCV prototype. Phase 2 (informal-work trust card) is a separate spec.

## 1. Goal and success criteria

YoCV today is a buildless HTML/JS app with a five-step journey (role, experience, evidence, review, CV), a rule-based generator in `core.js`, a synthetic credential, and a review model where user acceptance confirms wording and never verification. It has no server, no AI call, no Yoma data, and ten passing tests.

Phase 1 keeps the journey and the review model and replaces the simulated parts so the prototype meets the Week 6 brief:

1. Claim generation uses a real model call (Azure OpenAI as the documented target, provider modular) with hard grounding rules, and the UI says truthfully whether it is live or sample.
2. At least one real Yoma data source is used: Yoma's public, unauthenticated, read-only production endpoints for the skill taxonomy and for learning opportunities. The credential becomes a representative sample based on Yoma's wallet credential model.
3. The repo can be launched independently with documented setup, environment variables and sample data, and documents what works, what is simulated, which provider was actually exercised, and what a live Yoma integration still needs.
4. The prototype is tested with realistic inputs, edge cases and model failures, and remaining problems are documented.

Done means:

- `npm start` serves the app on port 4173. With Azure credentials in `.env`, "Create my draft" produces model-generated claims; without them, the app runs in sample mode and the header pill says so.
- A claim cannot reach the review step if its supporting quote is not in the user's text, if it contains a number the user did not write, or (in live and server sample mode) if its skill is not a Yoma skill. Tests prove this.
- In live and server sample mode every suggested skill on the CV carries a Yoma skill id and Lightcast link. In browser-offline mode skill claims carry no Yoma tag and the evidence record says so.
- The preview step shows live Yoma learning opportunities for the chosen role, "no matches yet", or "unavailable", each as a distinct state.
- All existing tests still pass, new tests cover validators, adapters, Yoma client and routes with injected fakes, and a live smoke test runs only when credentials exist.
- README, integration notes and demo script describe the new state accurately, including a real-versus-simulated table with a "provider actually tested" row.

## 2. Constraints

- Buildless frontend stays. No bundler, no framework, no runtime npm dependencies. Node 20+ built-ins only (`node:http`, `fetch`, `AbortSignal.any`, `node:test`). The dev machine runs Node 25; Node 20 compatibility rests on the Node docs, noted in the README.
- Opening `index.html` directly from disk must still work, in sample mode.
- Model keys live server-side only. The model never receives the user's name, email, phone or city.
- The model only transforms the user's self-reported experience text. Credential and document claims are built by local code from their sources, never by the model.
- No Yoma login, no local Yoma docker stack, no reading of the user's uploaded document in this phase.
- Yoma's repository is GPL-3.0. We call its public API and copy no code from it.
- Yoma API facts verified 2026-11-12: `nameContains` and `valueContains` must be 3 to 50 characters; `pageNumber` and `pageSize` are mandatory; results of `lookup/skill` are alphabetical substring matches; `valueContains` on opportunity search behaves as a phrase match; requests must send a non-default user agent (Python's default was refused with 403, Node's fetch and curl are accepted).
- Mobile and low-bandwidth use: no new assets heavier than a few KB, Yoma logos loaded lazily.

## 3. Architecture

```
index.html, styles.css, core.js, app.js      existing frontend (modified)
package.json                                 scripts: start, test
server.js                                    entry: HTTP server, static allowlist, routes
server/config.js                             reads .env and process.env, picks provider
server/env.js                                tiny .env parser (no dotenv dependency)
server/providers/index.js                    provider factory
server/providers/azure-openai.js             Azure OpenAI chat completions, strict JSON schema
server/providers/openai-compatible.js        any OpenAI-compatible endpoint (optional)
server/providers/local.js                    wraps core.js rules (sample mode)
server/generation.js                         prompt, output schema, pipeline, claim assembly
server/validate.js                           grounding validators
server/yoma.js                               Yoma API client with TTL cache
data/sample-credential.json                  representative Yoma wallet credential
data/role-skills.json                        per-role Yoma skill names and opportunity queries
tests/*.test.cjs                             existing plus new tests
docs/testing-log.md                          scenarios, results, open issues
.env.example, README.md, presentation/*      docs
```

### 3.1 `data/role-skills.json`

One object keyed by the three role names used in `app.js` (`Retail assistant`, `Customer support assistant`, `Community outreach assistant`). The server validates `role` against these keys.

```json
{
  "Retail assistant": {
    "skillNames": ["Customer Service", "Cash Handling", "Merchandising", "Stock Control", "Inventory Management", "Retail Sales", "Teamwork", "Organizational Skills", "Time Management", "Reliability", "Willingness To Learn"],
    "opportunityQueries": ["retail", "customer service"]
  },
  "Customer support assistant": {
    "skillNames": ["Customer Support", "Customer Service", "Active Listening", "Problem Solving", "Interpersonal Communications", "Conflict Resolution", "Record Keeping", "Scheduling", "Digital Literacy", "Computer Literacy", "Data Entry", "Multitasking"],
    "opportunityQueries": ["customer service", "customer"]
  },
  "Community outreach assistant": {
    "skillNames": ["Community Outreach", "Event Planning", "Public Speaking", "Teamwork", "Interpersonal Communications", "Organizational Skills", "Social Media", "Gardening", "Caregiving", "Cooking", "Reliability", "Willingness To Learn"],
    "opportunityQueries": ["community", "volunteer"]
  }
}
```

Every `skillNames` entry above was confirmed on 2026-11-12 to exist as an exact (case-insensitive) name in Yoma's skill lookup. Names that do not exist in Yoma ("Communication", "Attention To Detail", "Volunteering", "Sales", "Planning") are deliberately absent.

### 3.2 Request flow for "Create my draft"

1. Frontend posts `{role, experience, context, dates, mode}` to `POST /api/generate`. Profile fields are never sent. `mode` omitted means "use the configured provider".
2. Server builds the skill menu for the role: for each name in `skillNames`, `GET /lookup/skill?nameContains=<name>&pageNumber=1&pageSize=20`, keep only the item whose name equals the query case-insensitively, drop any menu entry whose name contains "certif", "licens", "diploma" or "degree". Cache one hour. The menu is a list of `{id, name, infoURL}` real Yoma skills.
3. Server calls the provider with the experience text and the menu. The output schema constrains skill names to the menu via `enum`.
4. Server truncates to 4 experience bullets and 3 skills (recording extras as rejected `over_limit`), then validates every claim (section 6). Rejected claims are dropped and recorded.
5. Server assembles claims in the `core.js` claim shape (section 8.1) and returns `{claims, generation}`.
6. Frontend appends credential and document claims using `C.evidenceClaims(state)`, then goes to the review step. If `response.claims` is empty the frontend stays on the evidence step and shows: "No grounded suggestions could be made from this text. Add one or two concrete responsibilities, or continue in sample mode." regardless of evidence claims.
7. If the provider fails, the server returns a structured error. The frontend keeps the input and shows the message; "Retry" appears only when `error.retryable` is true; "Continue in sample mode" always appears. Sample mode posts `{mode:'sample'}`. When the server itself is unreachable, the frontend runs `C.generateClaims` in the browser and sets `generation = {mode:'sample', provider:'browser-local'}`.

## 4. Server routes

All routes return JSON. Static files are served only from an allowlist: `/`, `/index.html`, `/styles.css`, `/core.js`, `/app.js`, `/data/sample-credential.json`. Everything else (dotfiles, `server/`, `tests/`, `docs/`, `.env`) returns 404.

### GET /api/status

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

Request: `{ role, experience, context, dates, mode? }` with `mode` in `live | sample`.

Validation: `role` must be a key of `data/role-skills.json`; `experience` 12 to 4000 characters and at least three words (same rule and wording as `core.generateClaims`); `context` up to 120; `dates` up to 100. Invalid input: 400 `{error:{code:'invalid_input', message, retryable:false}}`.

Success (200):

```json
{
  "claims": [ "...claim shape from section 8.1..." ],
  "generation": {
    "mode": "live" | "sample",
    "provider": "azure-openai" | "openai-compatible" | "local",
    "model": "gpt-4.1-mini" | null,
    "generatedAt": "ISO",
    "durationMs": 1234,
    "skillMenuSize": 11,
    "skillMenuSource": "live" | "cache" | "none",
    "rejected": [ { "kind": "experience" | "skill", "text": "...", "reason": "quote_not_in_source" } ]
  }
}
```

`text` in a rejected entry is the model's text, or an empty string for menu-level entries such as `yoma_skill_menu_unavailable`.

Failure (502): `{error:{code, message, retryable}}` with `code` one of:

| code | when | retryable |
|---|---|---|
| `provider_not_configured` | client sent `mode:'live'` and no provider is configured | false |
| `provider_timeout` | no answer within 20 s (no retry) | true |
| `provider_rate_limited` | 429 after one retry | true |
| `provider_auth` | 401 or 403 | false |
| `provider_bad_output` | non-JSON, schema violation, `message.refusal`, `finish_reason:'length'`, or 400 `content_filter` | false for content_filter, true otherwise |
| `provider_error` | other 4xx/5xx after one retry | true |

Messages are plain language, for example "The AI service did not answer in time. You can retry or continue in sample mode." Secrets never appear in messages or logs.

Concurrency guard: at most 4 generate requests in flight; a fifth gets 503 `{error:{code:'busy', message:'The server is busy, try again in a moment.', retryable:true}}`.

### GET /api/yoma/opportunities?role=<role>

Looks up the Learning type id from `GET /opportunity/type` (cached), then for each phrase in `opportunityQueries` in order, `POST /opportunity/search` with `{pageNumber:1, pageSize:12, valueContains:<phrase>, types:[learningTypeId]}` until a non-empty result; filters `isCompletable === true`; returns at most 4.

```json
{ "items": [ { "id", "title", "organizationName", "organizationLogoURL", "summary", "yomaInfoURL", "commitmentIntervalDescription", "difficulty", "skills": [{"id","name","infoURL"}], "zltoReward", "isCompletable" } ],
  "matchedQuery": "retail" | null, "totalCount": 22, "source": "live" | "cache", "unavailable": false }
```

Three distinct states: items present; `items: []` with `unavailable:false` ("No Yoma learning opportunities matched this role yet"); `unavailable:true` (Yoma could not be reached and nothing cached). Always 200. Verified phrase counts on 2026-11-12: "retail" 22, "customer service" 45, "customer" 72, "community" 30, "customer support" 1, "community outreach" 0, "retail customer service" 0.

## 5. Model provider

Interface:

```js
// server/providers/index.js
createProvider(config, deps)  // deps = { fetch, sleep, timeoutMs } with defaults
provider.name, provider.model
await provider.generate({ role, experience, context, dates, skillMenu }, { signal })
// returns { output }  where output matches 5.2
```

Adapters take injected `fetch`, `sleep` and `timeoutMs` so tests pass a fake fetch and a no-op sleep.

### 5.1 Azure OpenAI adapter

- Default URL: `${AZURE_OPENAI_ENDPOINT}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${AZURE_OPENAI_API_VERSION}` (default `2024-10-21`, GA, supports `response_format: json_schema` with `strict`). When `AZURE_OPENAI_API_VERSION=v1`, use `${AZURE_OPENAI_ENDPOINT}/openai/v1/chat/completions` with `model: AZURE_OPENAI_DEPLOYMENT` in the body. Both forms documented in the README.
- Headers: `api-key`, `content-type: application/json`, `user-agent: YoCV-prototype`.
- Body: `messages` (system + user), `response_format: {type:'json_schema', json_schema:{name:'yocv_claims', strict:true, schema}}`, `temperature: 0.2`, `max_tokens: 800`.
- Timeout 20 s via `AbortSignal.any([callerSignal, AbortSignal.timeout(timeoutMs)])`. Timeout rejects with `err.name === 'TimeoutError'`; caller abort with `'AbortError'`.
- Retry once after 1.5 s only on network error, 429, 500, 502, 503, 504. No retry on timeout.
- Error mapping per the table in section 4. Response handling: parse `choices[0].message.content` as JSON; if `message.refusal` is set, or `finish_reason === 'length'`, or JSON fails to parse, or the parsed object violates the schema (checked server-side with a small validator for the exact shape we expect), return `provider_bad_output`.

### 5.2 Output schema (strict JSON schema)

No `maxItems`/`minItems` (Azure rejects them in strict mode). Limits are enforced in the prompt and by server-side truncation.

```json
{
  "type": "object",
  "properties": {
    "experience": {
      "type": "array",
      "items": { "type": "object", "properties": {
        "text": { "type": "string" },
        "sourceQuote": { "type": "string" },
        "reason": { "type": "string" }
      }, "required": ["text","sourceQuote","reason"], "additionalProperties": false }
    },
    "skills": {
      "type": "array",
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

If the skill menu is empty (Yoma unreachable and no cache), `skills` is removed from both `properties` and `required`, and the response carries one rejected entry `{kind:'skill', text:'', reason:'yoma_skill_menu_unavailable'}` so the review step can say skills were not suggested.

### 5.3 Prompt rules (system message)

- You rewrite a young person's own description of informal experience into short CV bullets for the target role.
- Each bullet must be supported by a verbatim quote copied from the text. Never add numbers, employers, dates, titles, tools or outcomes the text does not contain. Do not copy the context or dates fields into bullets.
- Plain English, one responsibility per bullet, 6 to 25 words, start with a verb, no first person. At most four bullets.
- Choose at most three skills from the provided list only, each with a quote showing the evidence. If none fits, return an empty skills list.
- `reason` is one sentence addressed to the user explaining the wording and reminding them to check it.
- Output JSON only.

User message: role, context, dates, the experience text inside clear delimiters, and the skill menu names.

### 5.4 OpenAI-compatible adapter

Same body as Azure with `model: OPENAI_MODEL`, URL `${OPENAI_BASE_URL}/chat/completions`, header `authorization: Bearer`. Enabled only when `OPENAI_API_KEY` is set and Azure is not. It exists so the live path can be verified with whichever key the team has; the README and slide state which provider the live smoke test actually ran against.

### 5.5 Local adapter

Calls `core.localExperienceClaims(input)` and maps each bullet to `{text, sourceQuote: <original sentence before polishing>, reason}`. The rule-based skill suggestion is resolved against the menu by case-insensitive name match; if unmatched it is dropped and recorded as `{kind:'skill', text, reason:'skill_not_in_menu'}`. The pipeline, validators and evidence metadata are identical in both modes.

## 6. Validators (`server/validate.js`)

Per-claim validators return `{ok:true}` or `{ok:false, reason}`:

1. `quoteInSource(sourceQuote, experience)`: after normalising whitespace, curly quotes and case, the quote must be a substring of the experience text and at least 8 characters. Reason `quote_not_in_source`.
2. `noInventedNumbers(text, {experience, context, dates})`: every digit sequence in `text` must appear in the experience, context or dates. Reason `invented_number`.
3. `lengthOk(text)`: 1 to 180 characters. Reason `length`.
4. `noBannedClaims(text)` (experience bullets only): rejects wording asserting verification or credentials: certified, verified, licensed, qualified, award, degree, diploma. Reason `asserts_credential`.

List-level helpers:

5. `resolveSkill(name, menu)` returns the menu entry or `null` (reason `skill_not_in_menu`).
6. `dedupe(claims)` returns `{kept, rejected}` where a claim whose normalised text equals an earlier one is rejected with reason `duplicate`.

## 7. Yoma client (`server/yoma.js`)

- Base URL from `YOMA_API_BASE` (default `https://api.yoma.world/api/v3`). Header `accept: application/json`, `user-agent: YoCV-prototype`. No auth. Timeout 10 s.
- Functions: `skillByName(name)`, `opportunityTypes()`, `searchLearningOpportunities(phrase, learningTypeId)`, `reachable()`.
- Query guard: any `nameContains`/`valueContains` outside 3 to 50 characters is skipped (never sent). A Yoma 400 is logged as a programming error and surfaced as such, not as unavailability.
- Cache: Map keyed by method, URL and body with TTL one hour (skills, opportunities, types) and five minutes (reachability). On fetch failure return the stale cached value with `source:'cache'` if present, otherwise throw `YomaUnavailable`.
- Injected `fetch` for tests.

## 8. Frontend changes

### 8.1 Claim shape

Existing fields stay. New optional fields:

- `sourceQuote`: the verbatim quote (model or local). `sourceText` remains the full experience text. `claimHTML` renders `sourceQuote` when present, else `sourceText`.
- `yomaSkill`: `{id, name, infoURL}` on skill claims resolved against Yoma. `sourceLabel` is untouched; the card renders a "Yoma skill" tag with the Lightcast link from `yomaSkill`.
- `generated`: `'model' | 'local'` so the card's reason line can say "AI-suggested" or "Template suggestion".

### 8.2 core.js

- Split `generateClaims(input)` into `localExperienceClaims(input)` (bullets with `text` and `sourceQuote` = original sentence, plus the rule-based skill) and `evidenceClaims(input)` (credential and document claims). `generateClaims` composes the two and keeps today's output shape so existing tests pass.
- Credential: `credential` becomes a mutable export set by `setCredential(fixture)`; the built-in value stays as the file:// fallback. Mapping from the wallet-shaped fixture to the claim:

| Fixture field | Claim field |
|---|---|
| `id` | `sourceId` |
| `title` | `context` |
| `issuer` + attribute `Organization_Name` | `sourceLabel` = "Atingi via Yoma" |
| `dateIssued` | `dates` = month and year, e.g. "September 2026" |
| attribute `Summary` or `title` | `text` = "Completed <title>." and `sourceText` |
| `artifactType`, `schemaType` | kept in the evidence record under `sourceMeta` |

  `labels.verified` becomes "Issuer-recorded achievement · representative Yoma sample".
- `buildEvidence(profile, role, claims, generation?)` and `buildTextCV(profile, role, claims, generation?)` take an optional fourth argument. Without it the current wording stays. With it: `generationMode` reads "Live AI generation (azure-openai, gpt-4.1-mini); 1 suggestion rejected by grounding checks" or "Local sample templates; no live AI call"; the text CV footer says "YoCV prototype · Live AI generation" or "· Sample generation"; skill lines append the Yoma skill name when it differs from the claim text.

### 8.3 app.js

- New state fields: `state.status` (from `/api/status`, or `{mode:'sample', provider:'browser-local', offline:true}` when unreachable), `state.generation`, `state.opportunities`. `state.sample` keeps its current meaning (Amina's story loaded).
- On load: `GET /api/status`, then `GET /data/sample-credential.json` and `C.setCredential`. Header pill: "Live AI · <model>", "Sample mode", or "Sample mode (offline)", with `aria-label` repeating the text. The evidence step notice, review aside key item, about dialog, `cvHTML` footnote and evidence record all derive from `state.status` and `state.generation`.
- `evidence()` renders the credential card title, issuer, date and checkbox label from `C.credential`.
- `generate()`: posts to `/api/generate`; busy text "Asking the AI…" (live) or "Preparing your draft…" (sample) inside an `aria-live="polite"` region. On success `state.claims = response.claims.concat(C.evidenceClaims(state))`. On failure: error block gets focus, shows message, "Retry" only when retryable, and "Continue in sample mode".
- Preview step: section "Strengthen this CV on Yoma" fetched when the step opens; up to four cards with lazy logo, title, organisation, hours, Yoma skill tags, link to `yomaInfoURL` with descriptive text (title plus organisation); labelled "Live from Yoma" or "From Yoma (cached)"; the two empty states from section 4.
- Evidence record (HTML and JSON) includes `generation` and the rejected list.

### 8.4 index.html and styles.css

- Mode pill variants `live`, `sample`, `offline` (text plus colour). Opportunity cards and quote line styled mobile first, no horizontal overflow at 360 px.

## 9. Configuration

`.env.example`:

```
# Azure OpenAI (documented target). Leave empty to run in sample mode.
AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini
AZURE_OPENAI_API_VERSION=2024-10-21   # or v1

# Optional alternative: any OpenAI-compatible endpoint. Used only if Azure is not configured.
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini

YOMA_API_BASE=https://api.yoma.world/api/v3
PORT=4173
HOST=127.0.0.1
```

`package.json` gains `"start": "node server.js"` and `"test": "node --test tests/"`.

## 10. Error handling summary

| Situation | Behaviour |
|---|---|
| No model configured | Status says sample; generate uses local provider; UI says sample mode |
| Model 5xx, 429 or network error | One retry after 1.5 s; then 502 retryable; UI offers Retry and sample mode; input kept |
| Model timeout | No retry; 502 `provider_timeout` retryable |
| Model 401/403 | 502 `provider_auth`, not retryable; UI offers sample mode only |
| Content filter, refusal, truncated or malformed output | 502 `provider_bad_output`; UI offers sample mode (Retry only when retryable) |
| Model returns ungrounded claims | Dropped by validators, listed in `generation.rejected`, shown in evidence record |
| Model returns zero usable claims | 200 with empty claims; frontend stays on evidence step with the message in 3.2 step 6 |
| Yoma skills lookup down, cache present | Menu from cache, `skillMenuSource:'cache'` |
| Yoma skills lookup down, no cache | Generation proceeds without skills; one rejected entry; review step note |
| Yoma opportunities down | Preview shows "Yoma opportunities unavailable right now" |
| Yoma opportunities empty | Preview shows "No Yoma learning opportunities matched this role yet" |
| Server unreachable (file:// or stopped) | Pill "Sample mode (offline)"; browser-local rules; opportunities section hidden |
| Too many concurrent generates | 503 busy, retryable |

## 11. Tests

Existing `tests/core.test.cjs` unchanged and passing. New:

- `tests/validate.test.cjs`: each validator with passing and failing cases: curly quotes, whitespace, invented numbers, numbers from the dates field accepted, banned words, dedupe, resolveSkill.
- `tests/generation.test.cjs`: pipeline with a fake provider returning good, partially ungrounded, fully ungrounded, over-limit and malformed output; asserts claim shapes, rejected lists, Yoma skill attachment, menu filtering of credential-style names, empty-menu schema variant, and that profile fields never reach the provider input.
- `tests/providers.test.cjs`: Azure adapter with injected fetch and no-op sleep: success, 429 then success, 500 then success, timeout (small `timeoutMs`), 401, content_filter 400, refusal, finish_reason length, bad JSON; asserts URL for both api-version forms, headers, body shape, and that the key never appears in error messages.
- `tests/yoma.test.cjs`: client with injected fetch: exact-match selection, query length guard, types, opportunities with first phrase empty then second non-empty, completable filter, cache hit, stale-on-failure, unavailable.
- `tests/server.test.cjs`: boots `server.js` on an ephemeral port with a fake provider and fake Yoma client: `/api/status`, `/api/generate` validation, success, busy guard, static allowlist (`/server/config.js`, `/.env`, `/tests/core.test.cjs` return 404).
- `tests/live.test.cjs`: skipped unless Azure or OpenAI variables are set; one real generate call with Amina's text asserting grounded output; one real Yoma `skillByName('Customer Service')` asserting the known id; one real opportunities fetch for "Retail assistant" asserting items or a clean empty state.
- `docs/testing-log.md` records manual scenarios with results: Amina sample, caregiving story, one-line input, 4000-character input, text with numbers, text in isiZulu or Swahili, an input that tries to inject instructions, a prepared input known to trigger `quote_not_in_source`, keys removed mid-session, Yoma blocked via hosts file, file:// open, 360 px width, keyboard-only pass through the new states, screen-reader announcement of busy and error states.

## 12. Documentation

- README: what it is, quick start (`npm start`, Node 20+), Azure setup and the v1 option, sample mode, what data leaves the device, Yoma data sources used (public unauthenticated read-only endpoints of api.yoma.world; no API client or approval requested; a stage client and consent would be needed for user data), real-versus-simulated table, tests, source layout, known limitations.
- `presentation/integration-notes.md`: endpoint list with checked date, query limits, response fields; the credential model file the sample is based on and the date read; what a live integration needs; what changed since the midterm.
- `presentation/demo-script.md`: three-minute script: live mode happy path, a prepared input that shows a rejected suggestion in the evidence record, Yoma skill tags, Yoma opportunities, and the sample-mode fallback. Short answers updated, including which provider was exercised live.
- `docs/testing-log.md` as above.

## 13. Real versus simulated (as it will be stated)

| Element | Status |
|---|---|
| Claim generation | Real model call when configured; local rules otherwise, labelled in UI and evidence record |
| Provider actually tested live | Stated at delivery: provider and model the live smoke test ran against; the other adapter marked "implemented, unit-tested with injected fetch, not exercised live" |
| Grounding validators | Real, server-side |
| Skill taxonomy | Real, live Yoma production API (Lightcast skills); menu is a checked per-role subset, not a Yoma role-to-skill mapping |
| Learning opportunities | Real, live Yoma production API; relevance is a keyword phrase search by role, not Yoma's recommendation or the user's profile |
| Caching | Yoma data may be up to one hour stale; responses say `source:'cache'` |
| Credential | Representative sample based on Yoma's wallet credential model; no login, so not the user's own |
| Uploaded document | Name and user statement only; file never read |
| User identity and Yoma profile | Not connected (needs Keycloak client and consent) |
| Verification of anything | None; acceptance confirms wording only |

## 14. Out of scope

Yoma login and profile reads, local Yoma docker stack, document OCR, PDF generation beyond browser print, persistence, analytics, rate limiting beyond the in-flight guard, request cancellation UI, any language other than English for generation, the trust card (Phase 2).
