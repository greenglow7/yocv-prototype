# YoCV Phase 1: live AI generation and Yoma data sources — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace YoCV's simulated generation with a real, grounded model call behind a small Node server, add Yoma's public skill taxonomy and learning opportunities as live data sources, and document everything so the repo launches on its own.

**Architecture:** A dependency-free Node server (`server.js` plus `server/*`) serves the existing buildless frontend and exposes three JSON routes. Generation runs through a provider interface (Azure OpenAI, OpenAI-compatible, or local rules) and a validation pipeline that rejects ungrounded claims. The frontend calls the routes, falls back to browser-local rules when offline, and renders Yoma skills and opportunities.

**Tech Stack:** Node 20+ built-ins only (`node:http`, `node:fs`, `fetch`, `AbortSignal.any`, `node:test`, `node:assert/strict`). Vanilla HTML/CSS/JS frontend. Azure OpenAI chat completions with strict JSON schema. Yoma public API v3.

**Spec:** `docs/superpowers/specs/2026-11-12-yocv-live-ai-yoma-data-design.md`

## Global Constraints

- No runtime npm dependencies; `package.json` keeps `"engines": {"node": ">=20"}`.
- Model keys only in `server/config.js` via `.env` or process env; never logged, never in error messages, never sent to the browser.
- The model receives only `role`, `context`, `dates`, `experience`, skill menu names. Never `profile.*`.
- Credential and document claims come from `core.evidenceClaims`, never from the model.
- Strict JSON schema must not contain `minItems`/`maxItems`; limits 4 bullets / 3 skills enforced by truncation in `server/generation.js`.
- Yoma queries: `nameContains`/`valueContains` 3 to 50 characters, always `pageNumber` and `pageSize`, header `user-agent: YoCV-prototype`, header `accept: application/json`.
- Existing `tests/core.test.cjs` stays byte-identical and passing.
- All user-facing copy uses the exact strings in the spec where the spec fixes them (mode pill texts, empty-state messages, labels).
- Static allowlist: `/`, `/index.html`, `/styles.css`, `/core.js`, `/app.js`, `/data/sample-credential.json`; everything else 404.
- Commit after every task with the attribution line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Experience text containing only numbers and symbols (e.g. "2024 2025 2026 ...") passes the 12-char/3-word check and yields zero grounded bullets: route must return 200 with empty claims, not 502. Test pinned in Task 6.
2. Model output where `sourceQuote` is the entire 4000-character input: valid but the card would render a wall of text; `claimHTML` must truncate the displayed quote to 240 characters with an ellipsis while the evidence record keeps it whole. Test pinned in Task 5 (core helper `shortQuote`).
3. Yoma returns HTTP 200 with a body that is not JSON (maintenance page): client must treat it as unavailable, not crash. Test pinned in Task 3.
4. A request body larger than 64 KB or with a non-object JSON root must return 400, never hang or throw. Test pinned in Task 7.
5. The role name arrives with different casing or trailing whitespace from an edited client: server rejects with `invalid_input` rather than silently defaulting to the first role. Test pinned in Task 7.

---

### Task 1: Environment and configuration

**Files:**
- Create: `server/env.js`, `server/config.js`, `.env.example`
- Modify: `package.json` (scripts `start`, `test`)
- Test: `tests/config.test.cjs`

**Interfaces:**
- Produces: `parseEnv(text) -> object` (ignores blank lines and `#` comments, strips surrounding quotes, trims; inline `# comment` after a value is stripped), `loadEnvFile(path) -> object` (returns `{}` when missing).
- Produces: `loadConfig({ env = process.env, cwd = process.cwd() }) -> Config` where `Config = { provider: 'azure-openai'|'openai-compatible'|'local', model: string|null, azure: {endpoint, apiKey, deployment, apiVersion}|null, openai: {baseUrl, apiKey, model}|null, yomaBase: string, port: number, host: string }`. `.env` values are read from `cwd` and process env wins over file values. Azure chosen when endpoint, key and deployment are all non-empty; else openai when key non-empty; else local. Endpoint and baseUrl have trailing slashes stripped. Defaults: apiVersion `2024-10-21`, openai baseUrl `https://api.openai.com/v1`, model `gpt-4.1-mini`, yomaBase `https://api.yoma.world/api/v3`, port 4173, host `127.0.0.1`.

- [ ] **Step 1: Write failing tests** in `tests/config.test.cjs`: `parseEnv` handles comments, quotes, inline comments, CRLF; `loadConfig` picks azure/openai/local by precedence; process env overrides file; trailing slash stripped; `model` equals deployment for azure, `OPENAI_MODEL` for openai, `null` for local.
- [ ] **Step 2: Run** `node --test tests/config.test.cjs` → FAIL (module not found).
- [ ] **Step 3: Implement** `server/env.js` and `server/config.js` per the interface. Write `.env.example` with the exact block from spec §9. Set `package.json` scripts: `"start": "node server.js"`, `"test": "node --test tests/"`.
- [ ] **Step 4: Run** `node --test tests/config.test.cjs` → PASS; `npm test` → existing 10 still PASS.
- [ ] **Step 5: Commit** `feat(server): env parsing and provider configuration`.

### Task 2: Grounding validators

**Files:**
- Create: `server/validate.js`
- Test: `tests/validate.test.cjs`

**Interfaces:**
- Produces: `normalise(text) -> string` (lowercase, curly quotes to straight, collapse whitespace, trim). `quoteInSource(quote, experience) -> {ok} | {ok:false, reason:'quote_not_in_source'}` (min 8 chars after normalisation). `noInventedNumbers(text, {experience, context, dates}) -> {ok}|{ok:false, reason:'invented_number'}` (digit sequences `\d+`). `lengthOk(text) -> {ok}|{ok:false, reason:'length'}` (1..180). `noBannedClaims(text) -> {ok}|{ok:false, reason:'asserts_credential'}` (word-boundary, case-insensitive: certified, verified, licensed, qualified, award, degree, diploma). `resolveSkill(name, menu) -> entry|null`. `dedupe(claims) -> {kept, rejected}` (normalised `text`, rejected entries `{...claim, reason:'duplicate'}`).

- [ ] **Step 1: Write failing tests**: curly-quote and whitespace-insensitive match; 7-char quote rejected; number present only in `dates` accepted; "2 years" invented rejected; "Certified barista" rejected while "awarded" is not matched as `award` (word boundary); `resolveSkill('customer service', menu)` returns the `Customer Service` entry; dedupe keeps first of two equal-after-normalisation claims.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `server/validate.js` as a CommonJS module exporting the seven functions.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): grounding validators`.

### Task 3: Yoma client with cache

**Files:**
- Create: `server/yoma.js`, `data/role-skills.json`
- Test: `tests/yoma.test.cjs`

**Interfaces:**
- Produces: `class YomaUnavailable extends Error` (`code = 'yoma_unavailable'`). `createYomaClient({ baseUrl, fetch = globalThis.fetch, now = Date.now, ttlMs = 3600000, reachTtlMs = 300000, timeoutMs = 10000 }) -> client`.
- `client.skillByName(name) -> Promise<{ item: {id,name,infoURL}|null, source: 'live'|'cache' }>`: GET `/lookup/skill?nameContains=<enc>&pageNumber=1&pageSize=20`, exact case-insensitive match; names outside 3..50 chars resolve to `{item:null, source:'live'}` without a request.
- `client.opportunityTypes() -> Promise<{ items, source }>`; `client.learningTypeId() -> Promise<string>` (type whose `name === 'Learning'`).
- `client.searchLearningOpportunities(phrase) -> Promise<{ items, totalCount, source }>`: POST `/opportunity/search` body `{pageNumber:1, pageSize:12, valueContains: phrase, types:[learningTypeId]}`; items mapped to the spec §4 shape with `skills` as `{id,name,infoURL}` objects; phrase outside 3..50 chars → `{items:[], totalCount:0, source:'live'}` without a request.
- `client.reachable() -> Promise<boolean>` (cached `reachTtlMs`).
- Cache: key `method + url + body`; on network error, timeout, non-2xx (except 400) or non-JSON body, return stale entry with `source:'cache'` if present else throw `YomaUnavailable`. A 400 throws `Error` with `code = 'yoma_bad_request'` (programming error) and is not cached.
- `data/role-skills.json`: exact content from spec §3.1.

- [ ] **Step 1: Write failing tests** with an injected fake `fetch` recording calls: exact-match selection ignores alphabetical noise; short name skipped with no call; URL and headers (`user-agent`, `accept`) asserted; learning type id resolved; opportunities body shape and skills mapping; completable flag preserved; cache hit makes no second call; stale served after failure with `source:'cache'`; `YomaUnavailable` when no cache; 200 with HTML body → unavailable; 400 → `yoma_bad_request`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `server/yoma.js` and write `data/role-skills.json`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): Yoma public API client with TTL cache`.

### Task 4: Model providers

**Files:**
- Create: `server/providers/index.js`, `server/providers/schema.js`, `server/providers/azure-openai.js`, `server/providers/openai-compatible.js`, `server/providers/local.js`, `server/providers/errors.js`
- Test: `tests/providers.test.cjs`

**Interfaces:**
- Produces: `class ProviderError extends Error { code, retryable, status }` in `errors.js`.
- `buildSchema(menuNames: string[]) -> object` in `schema.js`: spec §5.2; when `menuNames` is empty, `skills` absent from `properties` and `required`. `validateOutput(obj, menuNames) -> {ok:true}|{ok:false, reason}` checks the exact shape (arrays of objects with string fields, skill names in menu).
- `buildMessages({role, context, dates, experience, menuNames}) -> [{role:'system',content}, {role:'user',content}]` in `schema.js` with the spec §5.3 rules; experience wrapped in `<<<EXPERIENCE>>> ... <<<END>>>`.
- `createAzureProvider(azureConfig, { fetch, sleep, timeoutMs = 20000 }) -> { name:'azure-openai', model, generate(input, {signal}) }`. `generate` resolves `{ output }` (validated object) or rejects `ProviderError` with the mapping in spec §4/§5.1. URL per `apiVersion` (`v1` form when `apiVersion === 'v1'`).
- `createOpenAICompatibleProvider(openaiConfig, deps)` same contract, `name:'openai-compatible'`.
- `createLocalProvider(core) -> { name:'local', model:null, generate(input) }` mapping `core.localExperienceClaims` to the output shape (`sourceQuote` = original sentence; skill `name` = rule skill name, which the pipeline resolves or rejects).
- `createProvider(config, core, deps) -> provider` in `index.js` by `config.provider`.
- Shared HTTP logic lives in one internal function used by both remote adapters (`callChatCompletions({url, headers, body, fetch, sleep, timeoutMs, signal})`).

- [ ] **Step 1: Write failing tests**: schema has no `maxItems`, enum equals menu, empty menu removes `skills`; messages never contain profile keys; Azure URL for dated and `v1` forms, `api-key` header, body has `response_format.json_schema.strict === true`; success parses content; 429 then 200 succeeds with one sleep call; 500 then 200; timeout with `timeoutMs: 5` → `provider_timeout` retryable, no retry; 401 → `provider_auth` not retryable; 400 `content_filter` → `provider_bad_output` not retryable; `message.refusal` → `provider_bad_output`; `finish_reason:'length'` → `provider_bad_output`; bad JSON → `provider_bad_output`; error messages do not contain the key string; local provider yields `sourceQuote` equal to the original sentence for "I looked after my younger siblings after school." (text "Cared for my younger siblings after school.").
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the six files.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): model providers with strict schema and error mapping`.

### Task 5: core.js refactor and credential fixture

**Files:**
- Modify: `core.js`
- Create: `data/sample-credential.json`
- Test: `tests/core-extended.test.cjs` (existing `tests/core.test.cjs` untouched)

**Interfaces:**
- Produces in `core.js` (UMD, same export object): `localExperienceClaims(input) -> claims[]` (experience claims carry `sourceQuote` = original sentence, `generated:'local'`; rule skill claim as today plus `generated:'local'`); `evidenceClaims(input) -> claims[]` (credential and document claims exactly as today); `generateClaims(input)` = `localExperienceClaims(input).concat(evidenceClaims(input))` with identical output to today for existing tests; `setCredential(fixture)` mapping per spec §8.2 table into the exported `credential` object (`id,title,issuer,date,statement,sourceLabel,sourceMeta,synthetic:false,sample:true`); `shortQuote(text, max = 240) -> string`; `buildEvidence(profile, role, claims, generation?)` adds `generation` and derives `generationMode`; `buildTextCV(profile, role, claims, generation?)` footer and skill lines per §8.2; `labels.verified = 'Issuer-recorded achievement · representative Yoma sample'`.
- `data/sample-credential.json`: `{ "_note": "Representative sample based on Yoma's SSICredentialInfo model (src/web/src/api/models/credential.ts in didx-xyz/yoma, read 2026-11-12). Not issued by Yoma.", "id": "sample-credential-atingi-digital-skills", "artifactType": "JWS", "schemaType": "Opportunity", "issuer": "Yoma (Youth Agency Marketplace)", "issuerLogoURL": null, "title": "Digital Skills Foundations", "dateIssued": "2026-09-12T00:00:00+00:00", "attributes": [ {"name":"Organization_Name","nameDisplay":"Organisation","valueDisplay":"Atingi"}, {"name":"Opportunity_Title","nameDisplay":"Opportunity","valueDisplay":"Digital Skills Foundations"}, {"name":"Opportunity_Summary","nameDisplay":"Summary","valueDisplay":"Completed Digital Skills Foundations, a self-paced online course on everyday digital tools."}, {"name":"Opportunity_Skills","nameDisplay":"Skills","valueDisplay":"Digital Literacy"}, {"name":"MyOpportunity_DateCompleted","nameDisplay":"Date completed","valueDisplay":"2026-09-10"}, {"name":"Opportunity_VerificationMethod","nameDisplay":"Verification method","valueDisplay":"Automatic"} ] }`.

- [ ] **Step 1: Write failing tests**: `localExperienceClaims` caregiving example gives `sourceQuote` "I looked after my younger siblings after school." and `text` "Cared for my younger siblings after school."; `evidenceClaims` with credential true returns one learning claim; `generateClaims` deep-equals the concat; `setCredential(fixture)` yields `sourceLabel` "Atingi via Yoma", `dates` "September 2026", `statement` "Completed Digital Skills Foundations."; `buildEvidence(..., {mode:'live', provider:'azure-openai', model:'gpt-4.1-mini', rejected:[{}]})` has `generationMode` "Live AI generation (azure-openai, gpt-4.1-mini); 1 suggestion rejected by grounding checks"; without generation it is unchanged; `buildTextCV` with live generation footer contains "Live AI generation" and a skill claim with `yomaSkill.name` "Customer Service" and text "Customer communication" renders "Customer communication (Yoma skill: Customer Service)"; `shortQuote` truncates 300 chars to 240 plus "…".
- [ ] **Step 2: Run** `node --test tests/core-extended.test.cjs` → FAIL.
- [ ] **Step 3: Implement** the changes in `core.js` and write the fixture.
- [ ] **Step 4: Run** `npm test` → all PASS including the untouched original ten.
- [ ] **Step 5: Commit** `feat(core): split local and evidence claims, Yoma-shaped credential, generation metadata`.

### Task 6: Generation pipeline

**Files:**
- Create: `server/generation.js`
- Test: `tests/generation.test.cjs`

**Interfaces:**
- Consumes: Task 2 validators, Task 3 client, Task 4 providers and `ProviderError`, Task 5 `core`.
- Produces: `buildSkillMenu(role, { yoma, roleSkills }) -> Promise<{ menu: [{id,name,infoURL}], source: 'live'|'cache'|'none' }>` (drops names containing `certif`, `licens`, `diploma`, `degree`, case-insensitive; `source:'none'` with empty menu when every lookup throws `YomaUnavailable`; mixed sources report `'cache'` if any came from cache).
- `runGeneration({ input: {role, experience, context, dates}, provider, yoma, roleSkills, core, now = Date.now }) -> Promise<{ claims, generation }>` per spec §3.2 steps 2 to 5 and §4 success shape. Experience claims: `{id:'experience-i', kind:'experience', text, originalText:text, sourceQuote, sourceId:'experience', sourceLabel: context || 'Your experience', sourceText: experience, category:'self', originalCategory:'self', context, dates, decision:'pending', edited:false, generated:'model'|'local', reason}`. Skill claims: same source fields, `kind:'skill'`, `text: menuEntry.name`, `yomaSkill: menuEntry`. Order: experience then skills. `ProviderError` propagates untouched.

- [ ] **Step 1: Write failing tests** with fake provider and fake yoma: good output → claims shaped as above with Yoma skills attached; one ungrounded bullet dropped and listed with `quote_not_in_source`; invented number dropped; 6 bullets → 4 kept, 2 `over_limit`; duplicate dropped; skill not in menu dropped `skill_not_in_menu`; menu excludes "Customer Service Certification"; yoma throws → `skillMenuSource:'none'`, provider called with empty menu, one `yoma_skill_menu_unavailable` rejected entry; provider input never contains profile fields (pass a profile in `input` and assert absent); provider throwing `ProviderError` propagates; Review Focus 1: provider returns bullets whose quotes are not in a numbers-only input → `claims.length === 0`, no throw.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `server/generation.js`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(server): grounded generation pipeline with Yoma skill menu`.

### Task 7: HTTP server and routes

**Files:**
- Create: `server.js`
- Test: `tests/server.test.cjs`

**Interfaces:**
- Consumes: all server modules.
- Produces: `createApp({ config, provider, yoma, roleSkills, core, rootDir, maxInFlight = 4 }) -> http.Server` (not listening) exported from `server.js` via `module.exports`; when run directly (`require.main === module`) it loads config, builds real dependencies, listens on `config.host:config.port`, and prints `YoCV server on http://host:port · mode: live|sample · provider: <name> · Yoma: <baseUrl>`.
- Routes exactly per spec §4: `GET /api/status`, `POST /api/generate`, `GET /api/yoma/opportunities`. JSON bodies limited to 64 KB (413 → respond 400 `invalid_input`); non-object JSON → 400. `role` compared exactly against `Object.keys(roleSkills)`. `mode:'live'` with `config.provider === 'local'` → 502 `provider_not_configured`; `mode:'sample'` uses the local provider regardless of config (server constructs a local provider lazily from `core`). Static allowlist with content types; `Cache-Control: no-store` on API responses.

- [ ] **Step 1: Write failing tests** booting `createApp` on port 0 with fake provider and fake yoma: status shape; generate 400 on short experience, on role "retail assistant " (Review Focus 5), on 70 KB body and on JSON array root (Review Focus 4); generate 200 shape; `mode:'sample'` returns `generation.mode === 'sample'` even when a fake live provider is configured; 5 concurrent generates with a slow fake provider → one 503 `busy`; opportunities three states (items, empty, unavailable) with `matchedQuery`; static: `/` serves index.html, `/data/sample-credential.json` served, `/server/config.js`, `/.env`, `/tests/core.test.cjs`, `/docs/x` → 404; API responses carry `Cache-Control: no-store`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `server.js`.
- [ ] **Step 4: Run** `npm test` → PASS; `npm start` prints the banner in sample mode; `curl -s localhost:4173/api/status` shows `"mode":"sample"`; `curl -s "localhost:4173/api/yoma/opportunities?role=Retail%20assistant"` returns live items.
- [ ] **Step 5: Commit** `feat(server): HTTP server, routes, static allowlist`.

### Task 8: Frontend integration

**Files:**
- Modify: `app.js`, `index.html`, `styles.css`
- Verify: browser pass (no automated test; the server tests cover the contract)

**Interfaces:**
- Consumes: routes from Task 7, `core` additions from Task 5.
- Produces: spec §8.3 and §8.4 behaviour. New state: `state.status`, `state.generation`, `state.opportunities = {items, state:'loading'|'ready'|'empty'|'unavailable'|'hidden', source, matchedQuery}`. Functions: `loadStatus()`, `loadCredential()`, `generate()` (fetch-based with fallbacks), `loadOpportunities()`, `opportunitiesHTML()`, `modePill()`. Error block id `generation-error` receives focus on failure; `data-action` values `retry-generate` and `sample-generate`.

- [ ] **Step 1: Implement** status load and mode pill (texts: `Live AI · <model>`, `Sample mode`, `Sample mode (offline)`), credential load and `evidence()` rendering from `C.credential` with checkbox label "Include this sample achievement".
- [ ] **Step 2: Implement** `generate()` against `/api/generate` with the spec §3.2 step 6 and 7 behaviour, busy texts, error block with conditional Retry, sample fallback, browser-local fallback when fetch rejects.
- [ ] **Step 3: Implement** claim card changes: quote line "Based on: “<shortQuote>”" when `sourceQuote` present; "Yoma skill" tag linking to `infoURL`; kind label "AI-suggested" vs "Template suggestion" from `generated`.
- [ ] **Step 4: Implement** preview "Strengthen this CV on Yoma" section with the three states and labels "Live from Yoma" / "From Yoma (cached)"; evidence record and downloads include `generation` and rejected list; `cvHTML` footnote from generation; about dialog and notices updated to the new copy; CSS for pill variants, quote line, opportunity cards; no horizontal overflow at 360 px.
- [ ] **Step 5: Verify** in the browser with `npm start` (sample mode): full journey with Amina; evidence record shows "Local sample templates"; opportunities render for all three roles; stop the server and open `index.html` from disk → pill "Sample mode (offline)", journey still completes, opportunities hidden; 360 px viewport check; keyboard pass through error state (simulate by pointing `/api/generate` at a fake failure via a query flag is out of scope: instead test with `mode:'live'` against local provider to get `provider_not_configured`).
- [ ] **Step 6: Commit** `feat(web): live generation, Yoma skills and opportunities, honest mode states`.

### Task 9: Live smoke test, docs, testing log

**Files:**
- Create: `tests/live.test.cjs`, `docs/testing-log.md`
- Modify: `README.md`, `presentation/integration-notes.md`, `presentation/demo-script.md`

- [ ] **Step 1: Write** `tests/live.test.cjs`: `test.skip` unless `AZURE_OPENAI_API_KEY` or `OPENAI_API_KEY` is set; real generate with Amina's shop text asserting every experience claim's `sourceQuote` is in the text and at least one claim exists; real `skillByName('Customer Service')` equals `448bb36e-6e5a-4c5a-9150-78703666c37a`; real opportunities for "Retail assistant" returns `unavailable === false`.
- [ ] **Step 2: Run** `npm test` with and without keys present; record the provider and model exercised (or "none available") in `docs/testing-log.md`.
- [ ] **Step 3: Run** the manual scenarios from spec §11 against `npm start`, recording results and open issues in `docs/testing-log.md`.
- [ ] **Step 4: Write** README (spec §12), integration notes (endpoints, limits, dates, credential model reference, what a live integration needs, changes since midterm), demo script (spec §12) with the real-versus-simulated table from spec §13 including the "provider actually tested" row filled in.
- [ ] **Step 5: Commit** `docs: setup, integration notes, demo script, testing log`.
