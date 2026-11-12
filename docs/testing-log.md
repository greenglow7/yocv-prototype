# Testing log — Week 6 (2026-11-12)

Environment: macOS, Node v25.8.1, server in sample mode (no model key available), Yoma production API reachable. Automated suite: `npm test` → 151 tests, 150 pass, 1 skipped (live model smoke test).

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
| 12 | Server unreachable mid-session (all fetches fail) | Pass. Toast "The YoCV server could not be reached. Continuing in your browser.", pill → "Sample mode (offline)", browser-local claims, review aside "Sample generation (offline, in your browser)". |
| 13 | Opening `index.html` from disk | Not run in the browser pane (it cannot open file:// pages). The code path is the same as scenario 12 because `/api/status` fails on file://. Manual check recommended. |
| 14 | Static allowlist | `/server/config.js`, `/.env`, `/tests/core.test.cjs`, `/docs/x`, `/data/role-skills.json` → 404; `/data/sample-credential.json` → 200. |
| 15 | Opportunities per role | Retail assistant → "customer service" (4 items), Customer support assistant → "customer service" (4), Community outreach assistant → "community" (4). Cached responses labelled "From Yoma (cached)". |
| 16 | 360 px viewport on the preview step | No horizontal overflow (`scrollWidth === innerWidth`); opportunity cards stack; pill truncates with ellipsis. |
| 17 | Keyboard and screen reader | Error block is focusable and receives focus on failure; busy text sits in an `aria-live="polite"` region; the mode pill carries an `aria-label`; opportunity links have descriptive text. Not tested with VoiceOver. |
| 18 | Concurrency guard | Covered by `tests/server.test.cjs` (fifth concurrent generate → 503 busy). Not reproduced manually. |

## Open issues for the next sprint

1. **Live model path unverified.** Run the live smoke test with Azure credentials; check that `gpt-4.1-mini` on api-version `2024-10-21` accepts the strict schema with a 10 to 12 entry enum; record provider and model in the README table.
2. **Opportunity relevance is keyword-based.** "retail" surfaces banking and AI courses. Options: search several phrases and merge, filter by category, or rank by overlap between opportunity skills and the user's suggested skills.
3. **Skill menu is per role, not per story.** A caregiving story under "Retail assistant" gets no caregiving skill. Consider building the menu from the story (keywords → lookup) as well as the role.
4. **Cache labelling.** An in-TTL cache hit is reported as `source: "cache"`, so the second view within an hour shows "From Yoma (cached)" even when the data is minutes old. Decide whether that is the honest label or whether only stale-on-failure should say "cached".
5. **Non-English input.** No language detection; in live mode the prompt is English-only. Azure Translator could translate the self-reported text for the customer's language later.
6. **Node 20 compatibility** rests on the Node docs; the dev machine runs Node 25. `npm test` uses `node --test tests/*.test.cjs` because Node 21+ no longer expands a bare directory argument.
7. **Content filter and refusals** are surfaced as a generic "could not be processed" error; the user gets no hint about what to change.
8. **Minor review notes** left as-is: unconsumed response body on Yoma non-2xx responses; `source: null` on the unavailable opportunities state; 405 `Allow` header omits HEAD.
