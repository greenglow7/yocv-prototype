# YoCard Phase 2: a Yoma-backed work card for informal workers

Date: 2026-11-12
Status: approved design (brainstormed 2026-11-11, option A "worker seeking customers")
Builds on: Phase 1 YoCV (`docs/superpowers/specs/2026-11-12-yocv-live-ai-yoma-data-design.md`)

## 1. Goal and success criteria

Most young Africans earn informally (ILO: about 96 percent of employed 15 to 24 year olds in sub-Saharan Africa). They get customers through WhatsApp, word of mouth and trust, not CVs. YoCard turns what a worker already has on Yoma (a Yo-ID, an OTP-confirmed phone, verified opportunity completions, skills) plus their own description of their work into one shareable card a customer can open from WhatsApp with no app and check against Yoma.

The card never claims more than it can show. Yoma has no third-party credential verification endpoint today, so every "confirmed" line is a consented read of the worker's Yoma account, labelled as such, with a cryptographic presentation documented as the next step rather than faked.

Done means:

- A worker (sample persona or a real Yoma account via a token) completes the flow: connect, describe work, review the AI draft, consent, publish, share. The card page opens from a short link with no JavaScript required.
- The card shows two visually separate tiers: "Confirmed from Yoma" (identity, phone, completions, skills, rendered from data only) and "Stated by the worker, not checked" (services, area, prices, hours, written by the model and edited by the worker).
- Each "What Yoma confirms" line cites evidence ids; uncited lines are dropped and counted.
- "Check now" re-reads the account and turns each confirmed signal green or red with a timestamp.
- The WhatsApp button exists only when the account's phone is OTP-confirmed and the worker turned it on, and it targets that number only.
- A QR of the card link renders on the card and scans with a phone camera.
- Adults only: a persona or account with date of birth under 18 cannot publish.
- An empty-state card (Yo-ID and phone only, no completions) still looks complete and nudges to real completable opportunities for the trade.
- The verification ladder (L0 to L6) is stated in the docs with what each level proves and whether it is real or simulated this week.
- Tests cover the account adapters, the draft pipeline, signing, the QR encoder, the routes and the public page. The YoCV suite keeps passing.

## 2. Constraints

- Same stack rules as Phase 1: Node 20+ built-ins only, buildless frontend, no npm runtime dependencies, no code copied from Yoma's GPL repository. External libraries may not be vendored; the QR encoder is written in-repo.
- The model receives only the worker's own description, trade, area, and the evidence list (titles, organisations, dates, evidence types, skill names). Never name, phone, email, photo URL or date of birth.
- The confirmed tier is rendered from data only. The model writes the self-declared tier and the plain-language "confirms" lines, and the latter must cite evidence ids.
- Public card copy never says "verified by Yoma" or "ID verified". Fixed strings: "Read from <name>'s Yoma account on <date> at <time>", "Phone confirmed by Yoma (not an ID check)", "Stated by <name>, not checked", "Never pay before the work is done", "Who can see this: anyone with the link".
- Phone number shown masked (last three digits) on the card; the full number lives only inside the `wa.me` link, and only when the toggle is on.
- Cards persist as JSON files under `data/cards/` (git-ignored). No database.
- Yoma API limits from Phase 1 apply (3 to 50 character queries, pagination, user agent).

## 3. Architecture

```
card.html, card.js                       worker flow (buildless), shares styles.css + card.css
server/card/account.js                   account sources: sample personas, bearer token
server/card/personas.json                four fictional adults with real Yoma opportunity ids
server/card/draft.js                     AI draft: self-declared fields + confirms lines, validators, local fallback
server/card/store.js                     card records on disk, owner secrets, withdraw
server/card/sign.js                      ES256 key, sign/verify snapshot, JWKS
server/card/render.js                    public card HTML (no JS), SVG image with QR
server/card/routes.js                    /api/card/* and /c/* routes, mounted by server.js
server/qr.js                             QR encoder (byte mode, versions 1-10, level M) -> module matrix, SVG
server/yoma.js                           + opportunityInfo(id) (anonymous GET /opportunity/{id}/info, cached)
tests/qr.test.cjs, tests/card-*.test.cjs
docs/, presentation/                     ladder, demo script, integration notes, testing log additions
```

### 3.1 Account snapshot (the one shape everything renders from)

```json
{
  "source": "sample" | "token",
  "readAt": "ISO",
  "apiBase": "https://api.yoma.world/api/v3",
  "user": { "id", "displayName", "firstName", "photoURL", "country", "city", "dateOfBirth", "dateCreated",
            "yoIDOnboarded", "dateYoIDOnboarded", "phoneNumberConfirmed", "phoneNumber", "emailConfirmed",
            "opportunityCountCompleted", "opportunityCountPending", "opportunityCountRejected" },
  "completions": [ { "evidenceId": "c1", "myOpportunityId", "opportunityId", "title", "organizationName", "organizationLogoURL",
                     "dateCompleted", "verificationStatus": "Completed", "opportunityType", "skills": [{"id","name","infoURL"}],
                     "evidenceTypes": ["FileUpload"], "live": { "verificationMethod", "verificationTypes": [{"type","displayName","description"}],
                     "participantCountCompleted", "yomaInfoURL", "published" } | null } ],
  "skills": [ { "evidenceId": "s1", "id", "name", "infoURL", "organizations": [{"id","name","logoURL"}] } ]
}
```

`completions[].live` comes from the anonymous production endpoint `GET /opportunity/{opportunityId}/info` at read time (real for both sources); `null` when the opportunity is unpublished or Yoma is unreachable. Evidence ids `c1..`, `s1..` are assigned in order and are what the model must cite.

### 3.2 Account sources (`server/card/account.js`)

`createAccountSource({ config, yoma, fetch }) -> { kind, listPersonas(), read(selector) }`

- **sample** (default): `personas.json` holds four adults. Each persona stores user fields and completions as `{opportunityId, dateCompleted, myOpportunityId, skills}`; organisation name, logo, verification method and evidence types are fetched live from the info endpoint and fall back to the persona's stored copy when Yoma is unreachable (snapshot marks `completions[].live = null`). Personas:
  - Thandi Mokoena, 24, hairdresser, Khayelitsha, Cape Town. Completions: `019e6f89-b66b-798e-a380-cbf33d634de5` (Hair Styling, Alison), `019e6f11-51ae-7a56-bbdd-9ee548b58cda` (Customer Care Skills, Alison), `019a1062-2518-756d-bc33-1b68b8f67d96` (Financial Literacy for Gig Workers, UNICEF Kenya, manual file upload). Phone confirmed.
  - Brian Otieno, 26, boda boda rider, Kisumu. Completions: `019e6fa0-1b36-7cba-a344-44f23ab7619d` (Driving Safety and Laws), `019e6fb9-bfc4-7dd7-ac9d-c09a384c5160` (Basic First Aid), `019a1062-2518-756d-bc33-1b68b8f67d96`. Phone confirmed.
  - Amara Okafor, 22, tailor, Enugu. Completions: `019e6f0f-b3d6-7b5f-b2fa-08709752d809` (Basics of Sewing), `1a1637fe-dd44-4845-b544-6908516836e3` (FUCAP 1.0 LevelUp, UNICEF Nigeria, manual), `98b4dc3d-24a0-455d-981b-08da8fc2edc0` (Customer Care and Complaint Management, Atingi, manual). Phone confirmed.
  - Sipho Dlamini, 19, cleaner and general labourer, Durban. Yo-ID onboarded, phone confirmed, zero completions (empty state).
  - Plus one under-18 persona, Lerato, 17, used only to test the age gate.
- **token**: when `YOMA_ACCESS_TOKEN` is set, `read()` calls `GET /user`, `GET /user/skills`, `POST /myOpportunity/search {action:'Verification', verificationStatuses:['Completed'], pageNumber:1, pageSize:50}` with `Authorization: Bearer`, maps them to the snapshot. A 401 maps to `{code:'yoma_auth'}`. How to obtain a token (self-register on stage.yoma.world, copy the bearer from the browser's network tab) is documented; this path is implemented and unit-tested with injected fetch, and marked as not exercised live unless the testing log says otherwise.

### 3.3 Draft pipeline (`server/card/draft.js`)

`runDraft({ snapshot, trade, description, provider, core, now }) -> { selfDeclared, confirms, generation }`

- **Call 1, self-declared extraction** (strict schema, no `maxItems`): input = trade, description (max 1000 chars), country. Output `{ headline (<=80), services: [{name, priceFrom, priceTo, currency}], area, hours, languages: [string], notes }` where `priceFrom/priceTo` are numbers or `null`, `currency` a 3-letter code or `""`. Server truncation: 6 services, 4 languages. Validators: every number in any field must appear in the description (`noInventedNumbers` from Phase 1, applied to prices as digit strings), `noBannedClaims` on headline/services/notes, length limits. Organisation names from the live organisation list must not appear in the self-declared text (dropped field, recorded).
- **Call 2, confirms lines** (strict schema): input = the evidence list (`evidenceId, kind, title, organizationName, dateCompleted, evidenceTypes, verificationMethod, skills`) and the trade. Output `{ lines: [{ text (<=120), evidenceIds: [string] }] }`. Server: truncate to 4; drop any line with an evidenceId not in the snapshot or with zero ids; drop a line that names an organisation not attached to its cited evidence; record drops as `rejected` with reasons `uncited_evidence`, `unknown_evidence`, `wrong_organisation`, `length`.
- **Local fallback** (sample mode or model failure): self-declared fields from simple rules (first sentence as headline, lines containing a currency symbol or "R"/"KSh"/"₦" plus digits as services with prices parsed, the rest as notes) and one confirms line per completion built from data: "Completed <title> with <org> on <month year>; <org> checked <evidence type>." These are template lines and are labelled so.
- The model never receives `user.*`.

### 3.4 Routes (`server/card/routes.js`, mounted under `server.js`)

| Route | Purpose |
|---|---|
| `GET /api/card/status` | `{ accountSource: 'sample'|'token', model: {mode, provider, model}, personas: [{id, displayName, trade}] (sample only), adultsOnly: true }` |
| `POST /api/card/account` `{persona?}` | Reads the snapshot (persona id in sample mode; token in token mode). 403 `{code:'under_18'}` when age under 18 from `dateOfBirth`. 502 `yoma_auth` or `yoma_unavailable` for the token path. Returns the snapshot with `user.phoneNumber` masked to last three digits plus a `phoneMaskedOnly: true` flag; the server keeps the full number in a short-lived session map keyed by a `draftToken` it returns. |
| `POST /api/card/draft` `{draftToken, trade, description}` | Runs the draft pipeline on the stored snapshot. Returns `{selfDeclared, confirms, generation}`. Provider errors as in Phase 1 (502 codes) with sample fallback allowed. |
| `POST /api/card/publish` `{draftToken, trade, selfDeclared, confirms, disclose: {completions: [evidenceId], skills: [evidenceId], photo: bool, whatsapp: bool}, consent: true}` | Validates (consent must be `true`, disclosed ids must exist, self-declared re-validated), builds the public record, signs it, stores it, returns `{cardId, url, ownerSecret, svgUrl, code}`. `code` is a 6-character uppercase code shown on the image. |
| `GET /c/:cardId` | Public HTML page (no JS required), 404 page for unknown ids, "withdrawn" page when withdrawn. |
| `GET /c/:cardId.svg` | 1080x1350 SVG card: photo (if disclosed, as an `<image>` link), name, trade, area, confirmed strip (member since, phone confirmed, N completions with up to 3 org names, M skills), stated block (up to 3 services), QR of the card URL, link text, the 6-char code, "This image is not proof, open the link". |
| `GET /c/:cardId.json` | The signed record `{record, jwt}` for anyone to verify against `/.well-known/jwks.json`. |
| `GET /.well-known/jwks.json` | The server's ES256 public key (generated on first start, stored in `data/cards/.keys.json`). |
| `POST /api/card/:cardId/check` | Re-reads the account (same source and selector as at publish) and returns `{checkedAt, signals: [{key, label, ok, detail}]}` where keys are `account_exists`, `yoid_onboarded`, `phone_confirmed`, and one per disclosed completion (`completion:<evidenceId>`, ok when still Completed) and skill. In sample mode the re-read is the persona again, labelled `simulated: true`. |
| `POST /api/card/:cardId/withdraw` `{ownerSecret}` | Marks withdrawn; the public page shows "This card was withdrawn by its owner on <date>" and no WhatsApp button. 403 on a wrong secret. |

Concurrency guard and body limits as in Phase 1. Static allowlist gains `/card.html`, `/card.js`, `/card.css`.

### 3.5 Signing and storage

- `sign.js`: `loadOrCreateKey(dir)` (P-256 via `crypto.generateKeyPairSync('ec', {namedCurve:'P-256'})`, stored PEM in `data/cards/.keys.json`), `signRecord(record) -> jwt` (compact JWS, `alg ES256`, `kid`, payload = `{ sub: cardId, iat, iss: 'yocard-prototype', record }`), `verifyJwt(jwt) -> payload|null`, `jwks()`.
- `store.js`: `createCardStore(dir)` with `create(record) -> {cardId, ownerSecret}` (cardId 10 chars from `crypto.randomBytes`, base32-ish, unguessable; ownerSecret 32 hex), `get(cardId)`, `withdraw(cardId, ownerSecret) -> boolean`, `touchCheck(cardId, result)`. Files `data/cards/<cardId>.json`. Owner secret stored hashed (SHA-256).
- The public record contains: `cardId, code, publishedAt, trade, selfDeclared, confirms, disclosed: {completions, skills}, user: {displayName, firstName, photoURL|null, country, city, dateYoIDOnboarded, dateCreated, phoneNumberConfirmed, phoneLast3, opportunityCountCompleted}, whatsapp: {enabled, number}` (number present only when enabled), `accountSource, snapshotReadAt, generation`. Date of birth and email are never stored in the record.

### 3.6 Public page (`render.js`)

Server-rendered HTML under 40 KB, system fonts, inline CSS, one lazy image (photo) at most. Sections in order: header with "Read from <first name>'s Yoma account on <date> at <time>" and a "Check now" form (plain `<form method=post>` to `/c/:id/check` works without JS; with JS it fetches and updates in place); identity block (photo if disclosed, display name, trade, area, "Yo-ID since <month year> · On Yoma since <year> · <N> verified completions"); "Confirmed from Yoma" block with each disclosed completion as "<title> · <org> · completed <month year> · <org> checked: <evidence types or 'automatically'>" linking to `yomaInfoURL`, and each skill chip with "awarded by <org>" and the Lightcast link; the plain-language "What Yoma confirms" lines; grey "Stated by <first name>, not checked" block with services, prices, area, hours, languages, notes; "Message on WhatsApp" button (only when enabled) to `https://wa.me/<E.164>?text=<encoded "Hi <first name>, I saw your YoCard <code>">`; safety line "Never pay before the work is done"; footer "Student prototype. Not operated by Yoma or UNICEF. Record signed by YoCard, not by Yoma." plus the link to `/c/:id.json`. OpenGraph tags: `og:title "<name> · <trade> · YoCard"`, `og:description` first confirms line, `og:image` the SVG URL.

### 3.7 Worker flow (`card.html`, `card.js`)

Steps: (1) Connect: in sample mode pick a persona ("These are fictional sample accounts; a real account needs a Yoma sign-in client"); in token mode "Read my Yoma account". Shows the snapshot summary and the age gate message when blocked. (2) Describe: pick trade from a grid (hair, nails, boda or taxi, tailor, mechanic, electrician, plumber, cleaner, cook or food, market seller, mobile money, labourer, other) and type one WhatsApp-style message; "Draft my card" calls the draft route; busy and error handling as YoCV (Retry when retryable, "Continue with template draft"). (3) Review: self-declared fields editable; confirms lines each showing its cited evidence with a toggle; disclosure toggles per completion and skill (default on), photo (default on when present), WhatsApp (default off) with the text "Who can see this: anyone with the link"; the under-18 persona never reaches here. (4) Publish: consent checkbox listing exactly what becomes public; on publish show the link, the 6-char code, the SVG card with "Download image" (client-side SVG to PNG through a canvas, no library) and "Share" (Web Share API with the PNG when supported, else `wa.me/?text=` with the link), "Print QR", "Copy link", and the owner secret with "Withdraw card" (kept in `sessionStorage` only). Entry point: a line on the YoCV landing page: "Looking for customers rather than a job? Make a work card" linking to `card.html`, and a link back.

### 3.8 QR encoder (`server/qr.js`)

`encodeQr(text, {level:'M'}) -> { size, modules: boolean[][] }` for byte-mode text up to version 10 (level M capacity 213 bytes), Reed-Solomon over GF(256), all eight masks with penalty scoring, format info with BCH, version info for versions 7 to 10. `qrSvg(text, {cellSize, margin}) -> string`. Tests: finder patterns at three corners, timing patterns alternate, format bits match the table value for level M mask 0, version 1 encodes "HELLO" style input with known capacity boundaries (version chosen is the smallest that fits), and a snapshot test that `encodeQr('https://example.org/c/ABCDEFGHIJ')` is deterministic. Scan verification is manual in the browser (`BarcodeDetector` when available) and recorded in the testing log.

## 4. Configuration

Adds to `.env.example`:

```
# YoCard: read a real Yoma account instead of the sample personas (stage or production bearer token)
YOMA_ACCESS_TOKEN=
# Public base URL used in card links, QR and share text (default http://HOST:PORT)
YOCARD_PUBLIC_URL=
```

## 5. Error handling

| Situation | Behaviour |
|---|---|
| Under-18 account | 403 `under_18`, message "YoCard is for adults. This account's date of birth is self-declared on Yoma and shows under 18." |
| Token missing or expired | 502 `yoma_auth`, message tells the operator to refresh `YOMA_ACCESS_TOKEN`; sample mode still works |
| Yoma unreachable during read | Sample: snapshot uses stored copies, `live: null`, page says "Opportunity details could not be checked with Yoma"; token: 502 `yoma_unavailable` |
| Model failure in draft | Same codes as Phase 1; "Continue with template draft" runs the local fallback |
| Uncited or invented confirms lines | Dropped and counted; the review step shows how many were dropped |
| Unknown card id | 404 page "No card with this code" |
| Withdrawn card | 410 page, no WhatsApp button, image route returns the withdrawn image |
| Check now when Yoma unreachable | `{checkedAt, unavailable: true}`; page shows grey "Could not check with Yoma right now", never a stale green |
| Wrong owner secret | 403 |

## 6. Tests

- `tests/qr.test.cjs`, `tests/card-sign.test.cjs` (sign, verify, tamper detection, JWKS shape), `tests/card-store.test.cjs` (temp dir, create, get, withdraw, wrong secret, hashed secret on disk), `tests/card-account.test.cjs` (sample personas resolve, live enrichment with injected fake yoma, fallback when yoma fails, token adapter mapping with injected fetch, 401 mapping, age computation), `tests/card-draft.test.cjs` (fake provider: good, uncited line, unknown evidence id, invented price, organisation in self-declared text, over-limit; local fallback output; model input never contains user fields), `tests/card-routes.test.cjs` (status, account for each persona, under-18 403, draft, publish validation and success, public page contains the fixed strings and no phone number when WhatsApp is off, `.svg` and `.json` routes, check returns signals, withdraw then 410, unknown id 404, static allowlist still blocks `data/cards`).
- Manual browser pass recorded in `docs/testing-log.md`: Thandi end to end with WhatsApp on, Sipho empty state, Lerato blocked, scan the QR with `BarcodeDetector` or a phone, 360 px, customer page with JavaScript disabled.

## 7. Documentation

- README: YoCard section (what it is, how to run, sample versus token, what leaves the device, real versus simulated).
- `presentation/integration-notes.md`: the verification ladder with real/simulated per level, Yoma endpoints used (including the holder-only ones the token adapter calls), what a real integration needs (Keycloak client, a Yoma-side consented public card endpoint or an `ActionLinkEntityType` for cards, hosting under yoma.world, didx:me verifier onboarding, POPIA consent and under-18 rules).
- `presentation/demo-script.md`: a second 3-minute script for YoCard.
- `docs/testing-log.md`: scenarios and open issues.

## 8. Real versus simulated (as it will be stated)

| Element | Status |
|---|---|
| Yoma account data | Sample personas (fictional adults) by default; real account via `YOMA_ACCESS_TOKEN` (implemented, exercised only if a token was available, stated in the testing log) |
| Opportunity details on the card (organisation, verification method, evidence types, participant counts, Yoma page link) | Real, live from Yoma's anonymous opportunity endpoint for the real opportunity ids the personas completed |
| Organisation list | Real, live |
| "Confirmed from Yoma" tier | A consented read of account data, labelled "Read from <name>'s Yoma account"; not a cryptographic verification |
| Card signature | Real, ES256 by this prototype's key; proves the page is what the worker published, not that Yoma signed it |
| Check now | Real re-read for token accounts; simulated (same persona) for sample accounts, labelled |
| Phone binding | Real field from the account; "Phone confirmed by Yoma (not an ID check)" |
| AI calls | Real when a model is configured (same adapters as YoCV); template fallback otherwise, labelled |
| QR and image | Real, generated in-repo |
| Cryptographic presentation of a Yoma credential | Not built; documented as L6 with the didx:me endpoints it needs |
| Content moderation | Not built beyond banned-word and organisation-name checks; Azure Content Safety documented as next step |

## 9. Out of scope

Yoma sign-in (OIDC), customer ratings or references, payments, booking, maps, SMS or USSD, WhatsApp Business API, photo upload (only the Yoma profile photo URL), translation, per-organisation signing, under-18 flows, any change to Yoma's repository.
