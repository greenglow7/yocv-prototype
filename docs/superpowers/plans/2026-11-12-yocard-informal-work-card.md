# YoCard Phase 2: informal-work card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add YoCard to the YoCV prototype: a worker connects a Yoma account (sample persona or token), describes their work, reviews an AI draft, consents, and publishes a signed, QR-bearing card page a customer can open and re-check against Yoma.

**Architecture:** New `server/card/*` modules reuse Phase 1's providers, validators and Yoma client. Cards persist as JSON files; records are signed with a server P-256 key; the public page is server-rendered HTML with an SVG image route. A buildless `card.html` drives the worker flow.

**Tech Stack:** Node 20+ built-ins (`node:crypto`, `node:fs`, `node:http`, `fetch`, `node:test`); vanilla HTML/CSS/JS; Yoma public API v3; Azure OpenAI or OpenAI-compatible chat completions with strict JSON schema.

**Spec:** `docs/superpowers/specs/2026-11-12-yocard-informal-work-card-design.md`

## Global Constraints

- Node built-ins only; no npm runtime dependencies; no vendored external code (the QR encoder is written here).
- Model input never includes `user.*` (name, phone, email, photo, date of birth). Confirms lines must cite evidence ids.
- Fixed public strings (copy verbatim): "Read from <first name>'s Yoma account on <date> at <time>", "Phone confirmed by Yoma (not an ID check)", "Stated by <first name>, not checked", "Never pay before the work is done", "Who can see this: anyone with the link", "This image is not proof, open the link", "Student prototype. Not operated by Yoma or UNICEF. Record signed by YoCard, not by Yoma."
- Phone: last three digits only in records and pages; full E.164 only inside the `wa.me` link and only when `whatsapp.enabled`.
- Under-18 accounts (from `dateOfBirth`) cannot read past the account step: 403 `under_18`.
- Yoma query rules from Phase 1 (3 to 50 chars, pagination, `user-agent: YoCV-prototype`).
- Static allowlist in `server.js` gains only `/card.html`, `/card.js`, `/card.css`; `data/cards/` is never served.
- Existing suites stay green. Commit per task with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A description with no prices and no area yields an almost empty self-declared block: the card must still render the confirmed tier and say "No services listed yet" rather than an empty grey box. Test in Task 5.
2. A persona whose live opportunity lookup returns 404 (unpublished) must still render the completion from stored data with "Opportunity details could not be checked with Yoma". Test in Task 3 and Task 5.
3. A card id with path tricks (`/c/../.keys.json`, `/c/ABC.svg.json`) must 404, never read outside `data/cards/`. Test in Task 5.
4. `publish` with `disclose.completions` containing an id not in the snapshot must 400, not publish a card citing nothing. Test in Task 5.
5. A QR for a long public URL (`YOCARD_PUBLIC_URL` of 60 characters plus `/c/<10 chars>`) must still encode (version 4 or above at level M). Test in Task 1.

---

### Task 1: QR encoder

**Files:**
- Create: `server/qr.js`
- Test: `tests/qr.test.cjs`

**Interfaces:**
- Produces: `encodeQr(text, { level = 'M' } = {}) -> { version, size, modules: boolean[][] }` (byte mode, UTF-8, versions 1 to 10, levels L/M/Q/H supported but M is the default and the only one tests pin; smallest fitting version; best of eight masks by the standard penalty rules; throws `RangeError` when the text does not fit version 10).
- Produces: `qrSvg(text, { cellSize = 4, margin = 4, level = 'M', dark = '#1a1024', light = '#ffffff' } = {}) -> string` (an `<svg>` with `viewBox`, a light rect and one `<path>` for dark modules).
- Internals (not exported, but named so the test can be read): `GF` tables, `rsEncode`, `bchFormat`, `versionBits`, `placeFunctionPatterns`, `placeData`, `applyMask`, `penalty`.

- [ ] **Step 1: Write failing tests**: `encodeQr('HELLO WORLD')` version 1 size 21; finder patterns at (0,0), (size-7,0), (0,size-7) match the 7x7 pattern; timing row 6 and column 6 alternate between the finders; dark module at `(4*version+9, 8)` is true; `encodeQr('A'.repeat(15))` is version 1 (capacity 14 at M → version 2), assert version 2 for 15 bytes and version 1 for 14 bytes; `encodeQr('x'.repeat(214))` throws `RangeError`; Review Focus 5: a 73-character URL encodes at version ≥ 4 with size `17 + 4*version`; determinism: two calls produce equal module arrays; `qrSvg` output starts with `<svg` and contains a `<path`; format information bits for the chosen mask verify against the BCH table (recompute from the mask the encoder reports in `modules` metadata: expose `mask` in the return value and assert `0 <= mask <= 7`).
- [ ] **Step 2: Run** `node --test tests/qr.test.cjs` → FAIL.
- [ ] **Step 3: Implement** `server/qr.js` following ISO/IEC 18004 byte mode: capacity table for versions 1 to 10 (data codewords and EC block structure per level), mode indicator 0100, 8-bit count (versions 1 to 9) or 16-bit (version 10), terminator, pad bytes 0xEC/0x11, RS generator per EC codeword count, interleaving, zigzag placement, masks 0 to 7, penalty N1=3 N2=3 N3=40 N4=10, format BCH (generator 0x537, mask 0x5412), version info BCH (generator 0x1F25) for version ≥ 7.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(qr): in-repo QR encoder with SVG output`.

### Task 2: Card signing and storage

**Files:**
- Create: `server/card/sign.js`, `server/card/store.js`
- Modify: `.gitignore` (add `data/cards/`)
- Test: `tests/card-sign.test.cjs`, `tests/card-store.test.cjs`

**Interfaces:**
- `sign.js`: `loadOrCreateKey(dir) -> { privateKey, publicKey, kid }` (PEM stored in `<dir>/.keys.json` as `{kid, privatePem, publicPem}`, created with `crypto.generateKeyPairSync('ec', {namedCurve:'P-256'})`; `kid` = first 16 hex of SHA-256 of the public PEM); `signRecord(key, record, { now = Date.now } = {}) -> jwt` (compact JWS header `{alg:'ES256', typ:'JWT', kid}`, payload `{iss:'yocard-prototype', sub: record.cardId, iat, record}`, signature `crypto.sign('sha256', data, {key, dsaEncoding:'ieee-p1363'})`); `verifyJwt(key, jwt) -> payload | null`; `jwks(key) -> { keys: [{ kty:'EC', crv:'P-256', x, y, kid, use:'sig', alg:'ES256' }] }` via `publicKey.export({format:'jwk'})`.
- `store.js`: `createCardStore(dir, { random = crypto.randomBytes, now = Date.now } = {}) -> store` with `create(record) -> { cardId, ownerSecret }` (cardId 10 chars from the alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, ownerSecret 32 hex; file `<dir>/<cardId>.json` holds `{ cardId, record, ownerSecretHash (sha256 hex), createdAt, withdrawnAt: null, lastCheck: null }`), `get(cardId) -> entry | null` (ids validated against `^[A-Z2-9]{10}$` before touching the filesystem), `withdraw(cardId, ownerSecret) -> boolean`, `touchCheck(cardId, result)`, `list() -> cardId[]`.

- [ ] **Step 1: Write failing tests** (temp dirs via `fs.mkdtempSync`): key created once and reused; jwt has three parts; `verifyJwt` returns the payload with `record` equal; tampering one payload character returns null; `jwks().keys[0]` has `kty` EC, `crv` P-256, `kid`; store create returns a 10-char id matching the alphabet; file exists and contains the hash but not the secret; `get` of `'../x'` is null without throwing; withdraw with wrong secret false and file unchanged; withdraw with right secret true and `withdrawnAt` set.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(card): ES256 signing and file-backed card store`.

### Task 3: Account sources and Yoma opportunity info

**Files:**
- Create: `server/card/account.js`, `server/card/personas.json`
- Modify: `server/yoma.js` (add `opportunityInfo(id)`)
- Test: `tests/card-account.test.cjs`, add cases to `tests/yoma.test.cjs`

**Interfaces:**
- `yoma.opportunityInfo(id) -> Promise<{ item: {id,title,organizationName,organizationLogoURL,type,verificationEnabled,verificationMethod,verificationTypes:[{type,displayName,description}],participantCountCompleted,yomaInfoURL,published,isCompletable,skills:[{id,name,infoURL}]} | null, source }>` via anonymous `GET /opportunity/{id}/info`; 404 → `item: null` (cached); other failures follow the client's stale-or-throw rule. `id` must match `^[0-9a-f-]{36}$` else `item: null` without a request.
- `account.js`: `ageAt(dateOfBirth, now) -> number | null`; `createAccountSource({ config, yoma, fetch = globalThis.fetch, now = Date.now }) -> { kind: 'sample'|'token', listPersonas() -> [{id, displayName, trade, city}], read({ persona } | { token }) -> Promise<snapshot> }` producing the spec §3.1 snapshot. Sample: persona by id (unknown id → `Error` code `unknown_persona`); each completion enriched with `live` from `opportunityInfo` (null on `item: null` or `YomaUnavailable`), stored `organizationName/logo/evidenceTypes/title` used as fallback. Token: `GET /user`, `GET /user/skills`, `POST /myOpportunity/search` body `{action:'Verification', verificationStatuses:['Completed'], pageNumber:1, pageSize:50}`, headers `Authorization: Bearer <token>`, `accept`, `user-agent`; 401/403 → `Error` code `yoma_auth`; network or 5xx → `YomaUnavailable`; mapping: `completions[]` from `items[]` with `evidenceTypes` = `verifications[].verificationType`, `skills` from `/user/skills` with organisations. Evidence ids `c1..cn`, `s1..sn`.
- `personas.json`: the five personas from spec §3.2 (four adults with the listed opportunity ids and `dateCompleted` values in 2025 and 2026, `phoneNumber` in E.164 with country code, `phoneNumberConfirmed: true`, `yoIDOnboarded: true`, `dateYoIDOnboarded`, `dateCreated`, `photoURL: null`, `country`, `city`, `dateOfBirth`; Sipho with zero completions and skills; Lerato with `dateOfBirth` making her 17 on 2026-11-12).

- [ ] **Step 1: Write failing tests**: `opportunityInfo` URL, 404 → null, invalid id → null without fetch; sample `read({persona:'thandi'})` returns 3 completions with `live.verificationMethod` from the fake yoma and evidence ids `c1..c3`, skills `s1..`; fake yoma throwing `YomaUnavailable` → `live: null` and stored organisation kept (Review Focus 2); `ageAt('2009-01-01', 2026-11-12)` is 17; token adapter: three requests with bearer header, snapshot fields mapped, `evidenceTypes` from `verifications`, 401 → `yoma_auth`; `listPersonas()` excludes nothing (the age gate is applied by the route, so Lerato is listed with `age`).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (full suite).
- [ ] **Step 5: Commit** `feat(card): account sources (sample personas, Yoma token) and opportunity info`.

### Task 4: Draft pipeline and generic structured completion

**Files:**
- Create: `server/card/draft.js`
- Modify: `server/providers/openai-compatible.js` (add `complete()` to chat providers), `server/providers/azure-openai.js` (pass-through if it wraps `createChatProvider`), `server/providers/local.js` (no `complete`)
- Test: `tests/card-draft.test.cjs`, add a `complete()` case to `tests/providers.test.cjs`

**Interfaces:**
- Providers: `provider.complete({ schemaName, schema, messages, maxTokens = 900, temperature = 0.2 }, { signal }) -> Promise<object>` on Azure and OpenAI-compatible providers: same `callChatCompletions`, parses `choices[0].message.content` as JSON, throws `ProviderError('provider_bad_output')` on refusal, length, or non-JSON. Local provider has no `complete` (`typeof provider.complete !== 'function'`).
- `draft.js`: `evidenceList(snapshot) -> [{evidenceId, kind:'completion'|'skill', title, organizationName, dateCompleted, evidenceTypes, verificationMethod, skills:[name]}]`; `selfDeclaredSchema()`, `confirmsSchema(evidenceIds)` (enum on ids); `localDraft({snapshot, trade, description}) -> {selfDeclared, confirms}`; `validateSelfDeclared(selfDeclared, {description, organisationNames}) -> {value, rejected}`; `validateConfirms(lines, snapshot) -> {lines, rejected}`; `runDraft({ snapshot, trade, description, provider, organisationNames = [], now = Date.now }) -> { selfDeclared, confirms, generation: {mode:'live'|'sample', provider, model, generatedAt, durationMs, rejected:[{kind:'self'|'confirm', field?, text, reason}]} }`. When `provider.complete` is missing, `mode:'sample'` uses `localDraft`. `ProviderError` propagates. Messages built here (system prompts per spec §3.3), user content includes only `trade, description, country` for call 1 and `evidenceList` for call 2.

- [ ] **Step 1: Write failing tests**: `complete()` on an OpenAI-compatible provider with injected fetch returns parsed JSON and sends the given schema name; fake provider implementing `complete` with good output → selfDeclared kept, 2 confirms lines with ids; a line citing `c9` dropped `unknown_evidence`; a line with no ids dropped `uncited_evidence`; a line naming "UNICEF Kenya" while citing an Alison completion dropped `wrong_organisation`; `priceFrom: 150` when the description has no "150" → services entry dropped `invented_number`; headline "Certified stylist" dropped `asserts_credential`; 7 services → 6 kept, one `over_limit`; provider input JSON never contains `displayName`, `phoneNumber`, `dateOfBirth`; local draft from "I do braids and cornrows in Khayelitsha, R150-R400, Mon-Sat" yields a service with priceFrom 150 priceTo 400 currency ZAR and one confirms line per completion citing its id; Sipho (no completions) → `confirms: []`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS (full suite).
- [ ] **Step 5: Commit** `feat(card): AI draft pipeline with evidence-cited confirms lines`.

### Task 5: Routes, public page, SVG card

**Files:**
- Create: `server/card/render.js`, `server/card/routes.js`
- Modify: `server.js` (mount card routes, allowlist `/card.html`, `/card.js`, `/card.css`, pass `publicUrl`), `server/config.js` (`YOMA_ACCESS_TOKEN`, `YOCARD_PUBLIC_URL`), `.env.example`
- Test: `tests/card-routes.test.cjs`, `tests/card-render.test.cjs`

**Interfaces:**
- `render.js`: `publicPage({ record, status, check = null, withdrawn = false, publicUrl }) -> html` (spec §3.6; `status` one of `'ok'|'withdrawn'`; `check` is a check result to render inline); `notFoundPage()`, `withdrawnPage(record)`; `cardSvg({ record, publicUrl, qrSvgFn }) -> svg` (1080x1350, text escaped, QR via `qrSvg`); `maskPhone(e164) -> '••• ••• 123'`; `waLink(record) -> string | null`.
- `routes.js`: `createCardRouter({ config, accountSource, provider, store, key, yoma, publicUrl, now = Date.now, random = crypto.randomBytes }) -> handle(req, res, url) -> boolean` (true when handled). Draft sessions: in-memory `Map<draftToken, {snapshot, createdAt}>` with 30-minute expiry; `draftToken` 24 hex. Routes exactly per spec §3.4. Public record built by `buildRecord({snapshot, trade, selfDeclared, confirms, disclose, code})` (exported for tests) and never contains `dateOfBirth`, `email`, or the full phone unless `whatsapp.enabled`.
- `server.js`: `createApp` accepts `card: {accountSource, store, key}` deps (tests inject fakes); `main()` builds them from config (`data/cards` under `rootDir`).

- [ ] **Step 1: Write failing tests** (render): page contains every fixed string, the masked phone and not the full number when WhatsApp is off, the `wa.me` link when on, `og:` tags, a `<form method="post" action="/c/<id>/check">`; empty self-declared → "No services listed yet" (Review Focus 1); `live: null` completion → "Opportunity details could not be checked with Yoma" (Review Focus 2); SVG contains name, trade, `<path` from the QR, the 6-char code and "This image is not proof, open the link". (routes): status shape; account for `thandi` masks the phone and returns a `draftToken`; `lerato` → 403 `under_18`; draft with fake provider; publish 400 on `consent: false`, on unknown disclosed id (Review Focus 4), on description over 1000 chars; publish 200 returns `cardId`, `url`, `code`, `ownerSecret`; `GET /c/<id>` 200 HTML, `GET /c/<id>.svg` image/svg+xml, `GET /c/<id>.json` has `jwt` that verifies with `/.well-known/jwks.json`; `GET /c/../.keys.json` and `GET /c/ABC.svg.json` → 404 (Review Focus 3); check returns `signals` with `account_exists` ok and `simulated: true` for sample; withdraw wrong secret 403, right secret then page 410; `GET /data/cards/<id>.json` → 404.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** `npm test` → PASS; `npm start`, `curl -s localhost:4173/api/card/status`, publish a Thandi card with curl and open `/c/<id>` to eyeball the HTML.
- [ ] **Step 5: Commit** `feat(card): routes, public card page, SVG image, signing endpoints`.

### Task 6: Worker frontend

**Files:**
- Create: `card.html`, `card.js`, `card.css`
- Modify: `index.html` (landing link), `app.js` (one line in `landing()` for the link)

- [ ] **Step 1: Implement** the four steps from spec §3.7 with the same conventions as `app.js` (escaped templates, data-action buttons, aria-live busy region, focusable error block, Retry only when retryable, "Continue with template draft").
- [ ] **Step 2: Implement** publish result: link, code, inline SVG preview, "Download image" via `<canvas>` (draw the SVG blob into a 1080x1350 canvas, `toBlob('image/png')`), "Share" via `navigator.share({files:[png], text})` with `wa.me/?text=` fallback, "Print QR", "Copy link", owner secret in `sessionStorage` with "Withdraw card".
- [ ] **Step 3: Verify in the browser** (sample mode): Thandi with WhatsApp on → public page shows the button and masked number; Sipho empty state; Lerato blocked; scan the QR with `BarcodeDetector` if available; 360 px; customer page with JavaScript disabled still shows the check form.
- [ ] **Step 4: Commit** `feat(card): worker flow page, share and download`.

### Task 7: Docs and testing log

**Files:**
- Modify: `README.md`, `presentation/integration-notes.md`, `presentation/demo-script.md`, `docs/testing-log.md`

- [ ] **Step 1: Write** the YoCard README section, the verification ladder (L0 to L6 with real/simulated), the Yoma endpoints the token adapter uses, what a real integration needs, the second demo script, and the testing scenarios with results and open issues.
- [ ] **Step 2: Run** `npm test` one last time and record the counts.
- [ ] **Step 3: Commit** `docs(card): ladder, integration notes, demo script, testing log`.
