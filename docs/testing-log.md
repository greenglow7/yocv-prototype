# Testing log — Week 6 (2026-11-12)

Environment: macOS, Node v25.8.1, server in sample mode (no model key available), Yoma production API reachable. Automated suite: `npm test` → 256 tests, 254 pass, 0 fail, 2 skipped (the two credential-gated live model tests); 151 was the Phase 1 count before YoCard.

Provider exercised live: **none**. The Azure OpenAI and OpenAI-compatible adapters are unit-tested with an injected `fetch` only. First action for the next sprint: run `npm test` with a real `.env`.

## Scenarios run

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Amina sample, full journey (sample mode, server running) | Pass. Two experience claims with quotes, one Yoma skill "Customer Service" with Lightcast link, sample credential and document claims appended; preview, evidence record and opportunities render. |
| 2 | Caregiving example through local rules | Pass. "I looked after my younger siblings after school." → "Cared for my younger siblings after school." with the original sentence as quote. |
| 3 | One-line input "I helped." | Pass. 400 `invalid_input` with the same wording as the midterm app; input kept. |
| 4 | Numbers-only input | Pass after fix. Initially echoed back as a claim in sample mode; now rejected as invalid input (needs three word-like tokens with letters). |
| 5 | Numbers in text with a date field | Pass. "Served about 40 customers…" kept; 40 is in the source. |
| 6 | Prompt-injection input ("Ignore all previous instructions… certified nurse… 10 years") | Pass. First sentence rejected `asserts_credential`, listed in the evidence record; second sentence became the only claim. Good demo input. |
| 7 | isiZulu text | Sample mode passes the sentences through unchanged (no translation). Live behaviour untested. |
| 8 | Exactly 4000 characters / 4001 characters | 200 with claims / 400 `invalid_input`. |
| 9 | Role name with trailing space or different case | 400 `invalid_input` "Choose one of the listed roles." |
| 10 | `mode: "live"` with no provider configured | 502 `provider_not_configured`, not retryable; UI shows "Continue in sample mode" only. |
| 11 | Simulated provider timeout (stubbed 502 `provider_timeout`) | Pass. Error block receives focus, shows Retry and Continue in sample mode; sample mode then produces five claims and the review aside says "Local sample generation". |
| 12 | Server unreachable mid-session (all fetches fail) | Pass. Toast "The YoCV server could not be reached. Continuing in your browser.", mode label → "Sample mode (offline)", browser-local claims, review aside "Sample generation (offline, in your browser)". |
| 13 | Opening `index.html` from disk | Not run in the browser pane (it cannot open file:// pages). The code path is the same as scenario 12 because `/api/status` fails on file://. Manual check recommended. |
| 14 | Static allowlist | `/server/config.js`, `/.env`, `/tests/core.test.cjs`, `/docs/x`, `/data/role-skills.json` → 404; `/data/sample-credential.json` → 200. |
| 15 | Opportunities per role | Retail assistant → "customer service" (4 items), Customer support assistant → "customer service" (4), Community outreach assistant → "community" (4). Cached responses labelled "From Yoma (cached)". |
| 16 | 360 px viewport on the preview step | No horizontal overflow (`scrollWidth === innerWidth`); opportunity rows stack; the mode label "Sample mode (offline)" fits on one line at 375 px and wraps to two lines at 360 px, fully readable, with the header link on one line. |
| 17 | Keyboard and screen reader | Error block is focusable and receives focus on failure; busy text sits in an `aria-live="polite"` region; the mode label is a `role="status"` live region; opportunity links have descriptive text. Not tested with VoiceOver. |
| 18 | Concurrency guard | Covered by `tests/server.test.cjs` (fifth concurrent generate → 503 busy). Not reproduced manually. |
| 19 | 375 px: header buttons keep a visible label and a 44 px target; muted text raised to 4.5:1; body text floor 11 px | Pass after fix. Previously the header label was hidden on phones, several greys sat below 4.5:1 and some text was 9 to 10 px. Checked in the browser pane at 375 px: `scrollWidth === 375`, header and footer buttons 44 px tall. |
| 20 | Stalled request (server accepts the connection but never answers) | Client-side 30 s deadline (`withDeadline` in `app.js`, `AbortController`) → "The server did not answer in time. You can retry." with Retry and Continue in sample mode; exercised by stubbing `fetch` to reject with an `AbortError`. |

## Open issues for the next sprint

1. **Live model path unverified.** Run the live smoke test with Azure credentials; check that `gpt-4.1-mini` on api-version `2024-10-21` accepts the strict schema with a 10 to 12 entry enum; record provider and model in the README table.
2. **Opportunity relevance is keyword-based.** "retail" surfaces banking and AI courses. Options: search several phrases and merge, filter by category, or rank by overlap between opportunity skills and the user's suggested skills.
3. **Skill menu is per role, not per story.** A caregiving story under "Retail assistant" gets no caregiving skill. Consider building the menu from the story (keywords → lookup) as well as the role.
4. **Cache labelling.** An in-TTL cache hit is reported as `source: "cache"`, so the second view within an hour shows "From Yoma (cached)" even when the data is minutes old. Decide whether that is the honest label or whether only stale-on-failure should say "cached".
5. **Non-English input.** No language detection; in live mode the prompt is English-only. Azure Translator could translate the self-reported text for the customer's language later.
6. **Node 20 compatibility** rests on the Node docs; the dev machine runs Node 25. `npm test` uses `node --test tests/*.test.cjs` because Node 21+ no longer expands a bare directory argument.
7. **Content filter and refusals** now show "The AI service declined to answer for this text. Rephrase your experience or continue in sample mode.", but the error code is still `provider_bad_output`; a distinct code would let the UI offer a rephrase action.
8. **Minor review notes** left as-is: unconsumed response body on Yoma non-2xx responses; `source: null` on the unavailable opportunities state. (The 405 `Allow` header now lists HEAD.)
9. **Browser scenarios are manual.** The browser-level checks in this log were run in a browser pane and recorded in prose; no headless script reproduces them from the repository.
10. **Sample mode drafts from the first three sentences** (`core.js` and the local provider). The experience step now says so, but extra sentences are not recorded as `over_limit` the way live mode records them.
11. **Accessibility not yet done:** no VoiceOver or TalkBack pass; the YoCV claim-action buttons are 36 px, below the 44 px target. Step-rail buttons now carry an `aria-label` with the step name, since the visible label is hidden under 640 px.

# YoCard (Phase 2) — 2026-11-12

Automated: `npm test` → 256 tests, 254 pass, 0 fail, 2 skipped (both live model tests; no key on this machine). Suites added: qr, card-sign, card-store, card-account, card-draft, card-render, card-routes.

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Thandi end to end in the browser (sample mode, template draft): connect, describe, review, WhatsApp on, consent, publish | Pass. Draft parsed "Braids R150–R400", hours "Monday to Saturday, 8am to 6pm", languages, notes. Card published with link, code and SVG. |
| 2 | QR scan | Pass. The SVG rendered to a 1080x1350 PNG in the browser and decoded with `BarcodeDetector` to the exact card URL. The implementer also decoded 96 generated codes (versions 1 to 10, all levels) with macOS Vision, and the reviewer with an independent decoder and OpenCV. |
| 3 | Public page strings | Pass. All fixed strings present; "verified by Yoma" absent; the full phone number appears only inside the `wa.me` link when WhatsApp is on; `og:image`, check form, yoma.world links present. Page 7.3 KB. |
| 4 | Signed record | Pass. `/c/<id>.json` returns a three-part ES256 JWT; the record contains no date of birth or email. |
| 5 | Check now | Pass. Nine signals all ok, `simulated: true` for a sample persona, timestamp returned. |
| 6 | Under-18 persona (Lerato) | Pass. 403 `under_18` at the account step with the fixed message. |
| 7 | Empty-state persona (Sipho) | Pass. Zero completions, age 19, masked phone; public page says "No completed opportunities shared on this card" and links to Yoma opportunities for the trade. |
| 8 | Path tricks (`/c/../.keys.json`, `/c/<id>.svg.json`, `/data/cards/<id>.json`, unknown id) | All 404. |
| 9 | Hours parsing bug found by review ("mobile money" read as hours) | Fixed; regression test added. |
| 10 | 360 px public page | No horizontal overflow. |
| 11 | Token account path | Unit-tested with injected fetch only. Not exercised against stage or production (no token). |
| 12 | Live model draft | Not exercised (no key). The template draft was used throughout. |
| 13 | YoCard server unreachable from the browser (connection dropped, 375 px) | Pass. With `fetch` stubbed to reject on the connect step: error block "The YoCard server could not be reached. Check your connection and try again." with a Retry button, mode label "Sample mode (offline)". Restoring the connection and pressing Retry reads the account, clears the error and returns the mode label to "Sample mode" (`card.js` `api()` maps a rejected fetch to `{code:'network', retryable:true}` and re-checks `/api/card/status` once the server answers again). |
| 14 | Model endpoint unreachable during draft (server started with `OPENAI_API_KEY=fake OPENAI_BASE_URL=http://127.0.0.1:9/v1 PORT=4196`; `POST /api/card/account {persona:'thandi'}` then `POST /api/card/draft`) | 502 `provider_error`, `retryable: true`, message "The AI service returned an error. You can retry or continue in sample mode." (connection refused maps to `provider_error`, not `provider_timeout`). Posting the same draft again with `mode: 'sample'` → 200, `generation.mode: 'sample'`, provider `local`, one service "Braids and cornrows" R150–R400, three confirms lines. |
| 15 | Yoma unreachable or token rejected during the account read | Covered by two route tests in `tests/card-routes.test.cjs`: a token source whose `read()` throws `YomaUnavailable` → 502 `yoma_unavailable`, `retryable: true`; a `yoma_auth` error → 502 `yoma_auth`, `retryable: false`, message echoed. Both pass; no route change was needed. |
| 16 | Non-English description through the template draft (sample mode, `runDraft` with `provider: null` against `server/card/draft.js`) | No crash, three confirms lines, no validator rejections. isiZulu "Ngenza izinwele eKhayelitsha, R150 kuya ku-R400. 8am kuya ku-6pm. Ngikhuluma isiZulu nesiNgisi." → languages `["isiZulu"]`, hours "8am kuya ku-6pm", but the price range splits: service 1 "Ngenza izinwele eKhayelitsha" with no price, service 2 named "Kuya ku-R400" with `priceFrom: 150`, `priceTo: null`, ZAR. Kiswahili "Nasuka nywele Kibera, KSh 300 hadi KSh 800. Jumatatu hadi Jumamosi. Ninazungumza Kiswahili na Kiingereza." → languages `["Kiswahili"]`, hours empty (the days land in notes), service 2 named "Hadi KSh 800" with `priceFrom: 300`, `priceTo: null`, KES. The worker can correct both in review. Live model behaviour untested. |
| 17 | Public page and SVG for a sample persona | Pass. Published Thandi on PORT=4196 (template draft): the page carries "Fictional sample account: this card was built from a sample persona, not a real Yoma user. The completions reference real Yoma opportunities." after the "Read from …" header, the SVG subtitle reads "Sample card · fictional persona" (not "A work card read from a Yoma account"), and "verified by Yoma" appears in neither. Page 7,338 bytes. Card withdrawn afterwards. |
| 18 | Rejected sentence in the self-declared block (375 px) | Pass. Message ending "I am a certified stylist from Alison Learning." → the review step lists the dropped line in plain words: "Notes: “Cornrows and relaxing. Come to your home. Certified stylist.” claims a certificate or qualification, which only the Yoma block can show." The whole Notes field is dropped (open issue 10). Disclosure checkboxes and Remove line buttons measure 44 px; no horizontal overflow. |
| 19 | Withdraw from a later session (375 px) | Pass. Publish, Start over → the connect step lists "Card P4JJVN22V5" with Withdraw this card; confirm → toast "Card withdrawn…", the entry disappears, and the public link returns 410 "Card withdrawn". |

Open issues for the next sprint:

1. Obtain a stage Keycloak client (or at least a stage bearer token) from Yoma and exercise the token path and Check now against real data.
2. Run the AI draft with a real key; confirm the confirms-lines schema with an evidence-id enum works on Azure strict mode.
3. The under-18 gate relies on a self-declared date of birth; needs a UNICEF safeguarding decision before any real user.
4. Content moderation of the self-declared block is only a banned-word and organisation-name check; add Azure Content Safety and decide how to handle non-English text.
5. Lookalike-domain risk: trust is domain trust until the card is hosted under yoma.world.
6. SVG footer overflow: fixed (the footer is centred at 18 px and a test checks it).
7. Minor: `check` endpoints are unauthenticated and write `lastCheck` to disk; add a per-card rate limit.
8. The template price parser only understands "-", "–" and "to" as range words, so "R150 kuya ku-R400" and "KSh 300 hadi KSh 800" split into two services (scenario 16); add per-language range words (kuya ku, hadi, à) or rely on the live model.
9. The server's provider error message says "continue in sample mode" while the YoCard button says "Continue with template draft"; align the wording.
10. **A rejected sentence drops its whole field.** The validator removes the entire self-declared field (for example all of Notes) when one sentence fails a check. The review step now lists the field, the dropped text and the reason in plain words; dropping only the offending sentence would keep the legitimate detail.
11. **Withdraw after leaving the page.** The connect step now lists cards published in this browser session with a withdraw button (owner secret from `sessionStorage`); a worker who closed the tab still needs the raw API with the secret they saved.

Final automated count after Phase 2: `npm test` → 256 tests, 254 pass, 0 fail, 2 skipped (the two live model tests in `tests/live.test.cjs`, skipped without a model key; the two live Yoma tests ran against api.yoma.world).

# Yoma family look — 2026-11-15

Environment: macOS, Node v25.8.1, server in sample mode on port 4174, browser pane with viewport emulation at 360, 375 and 1280 px. Design: `docs/superpowers/specs/2026-11-15-yoma-family-look-design.md`. Checks read computed styles and `scrollWidth` through the page's own DOM; screenshots were taken at each width.

## YoCV

| # | Scenario | Result |
| --- | --- | --- |
| 21 | 1280 px, steps 1 to 5 (Amina sample) | Pass. Band `#41204b` with white Nunito h1 (36 px) and "already done" in `#f9ab3e`; header 72 px white; step line reads "Step n of 5" inside the band; `document.fonts.check` true for Nunito 700 and Open Sans 400; every card white, 16 px radius, 24 px padding, no border or shadow; CV paper 32 px padding; pill buttons 44 px; `scrollWidth === innerWidth` on every step. |
| 22 | 375 px, steps 1 to 5 | Pass. Header wraps to two rows (108 px) with the mode pill left-aligned on row two and the About button keeping its 44 px target; step strip shows five 44 x 44 circles; h1 28 px; cards and CV paper 16 px / 24 px padding and 343 px wide; export buttons 320 px; no overflow on any step. |
| 23 | 360 px, steps 1 to 5 | Pass. Same layout as 375 px; cards 328 px wide; no overflow on any step. |
| 24 | Keyboard focus on purple grounds | Pass. Tab from the band h1 lands on step button 1 with the 3 px purple ring; Enter on it runs `go()`, which focuses the band h1 and shows the browser's white focus ring on purple; the About dialog's Close button is 44 px on the purple dialog top and its ring is white. |
| 25 | Google Fonts stylesheet absent (page rewritten without the `css2` link) | Pass. Zero font faces loaded, headings fall back to system-ui, header height, h1 height and button heights unchanged, no overflow. |
| 26 | Review-step card headings | Fixed during verification. Carding `.form-section` left the "Your details" heading 48 px inside its card and the CV name 56 px inside the paper (the old `main h2` margin); both now sit at the card padding, pinned by two assertions in `tests/restyle.test.cjs`. |
| 27 | Header label and toast on phones | Fixed during verification. The inline-flex About button swallowed the space before "this demo" (now `white-space:pre` on the hidden span), and the fixed toast shrank to half the screen and wrapped into a four-line blob (now `width:max-content; max-width:calc(100vw - 32px)`, two lines at 360 px). Both pre-dated this work. |
| 28 | Targets under 44 px | Known. Accept / Edit / Leave out on the review step are 36 px pills (spec-sized); the Yoma skill link tag is 29 px. Recorded in the README. |

## YoCard

| # | Scenario | Result |
| --- | --- | --- |
| 20 | 1280 px, steps 1 to 4 (Thandi, template draft, publish) | Pass. Same header, band and step strip as YoCV; "Need a CV?" is a 44 px green outline pill; account summary, tiers, consent box and link box are white 16 px cards with 24 px padding; confirmed tier has a 6 px `#387f6a` left border and a `#e6f5f3` head, stated tier a 6 px `#545859` border; trade chips 16 px radius with the purple tint when selected; result buttons 44 px pills; secret code 14 px; no overflow on any step. |
| 21 | Public card page at 1280 px | Pass. Body `#f3f6fa`, Nunito h1 28 px, Open Sans body, three white 16 px sections (stated section keeps its 6 px muted border), purple-tint safety notice, Check now as a 44 px green outline pill, smallest text 14 px, "Not operated by Yoma or UNICEF" present. Page 8,029 bytes plus the fonts stylesheet link; share image 11,306 bytes with the system font stack, 16 px corner radii and the current ink and muted values. |
| 22 | 375 px: public page, then steps 1 to 4 | Pass. Public page sections 343 px wide with 24 px padding, Check now 44 px; app header wraps to two rows (108 px) with the mode pill on row two; four 44 x 44 step circles; the connect step lists the card published in this session with Withdraw; trade grid two columns; tiers, consent box and link box 343 px with 16 px padding; share image 311 px; link and secret wrap inside their boxes; no overflow on any step. |
| 23 | 360 px: public page, then steps 1 to 4 | Pass. Public page widest element 360 px; app cards 328 px; `scrollWidth === innerWidth` on every step and after publishing. |
| 24 | Reviewer nits taken after approval | The share image now defaults to the system stack instead of Open Sans (it cannot load web fonts) and uses `#020304` / `#545859` / `#dce0e5` for text; `.tier` clips in one rule instead of a duplicated `.tier.confirmed`; two dead `border:0` declarations dropped from the public page CSS. Left as designed: tier headings stay ink on the tint (spec table amended), and the "Confirmed from Yoma" h3 keeps the Nunito face. |

Final automated count after the Yoma family look: `npm test` → 261 tests, 259 pass, 0 fail, 2 skipped (the two live model tests, no key on this machine).
