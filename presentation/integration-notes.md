# YoCV integration notes (Week 6)

## What changed since the midterm

| Midterm | Week 6 |
| --- | --- |
| Generation used local rules in the browser; no AI call | A Node server calls a configured model (Azure OpenAI or OpenAI-compatible) with a strict JSON schema; local rules remain as the labelled sample mode |
| No grounding beyond templates | Server-side validators reject suggestions whose quote is not in the user's text, that contain invented numbers, that assert credentials, or that duplicate others; rejections are shown in the evidence record |
| Skills were free text from rules | Skills are resolved against Yoma's live skill taxonomy and carry the Yoma skill id and Lightcast link |
| No Yoma data | Live learning opportunities per role from Yoma's public API on the CV page |
| Synthetic "Demo Learning Partner" credential | Representative sample based on Yoma's wallet credential model |
| "Sample mode" pill, static | Mode pill reflects the server's real state: Live AI, Sample mode, or Sample mode (offline) |
| 10 tests | 151 tests, including route, provider, validator and Yoma client suites with injected fakes, plus a live smoke test that runs only with credentials |

## Yoma data sources used

All calls go from the YoCV server to `https://api.yoma.world/api/v3`, the same public API the yoma.world site uses. They are unauthenticated, read-only, and no API client or approval has been requested. Checked on 2026-11-12.

| Endpoint | Used for | Notes |
| --- | --- | --- |
| `GET /lookup/skill?nameContains=<name>&pageNumber=1&pageSize=20` | Resolve each role's skill names to `{id, name, infoURL}` | Substring match, alphabetical; the client keeps only the exact (case-insensitive) name. `nameContains` must be 3 to 50 characters; pagination is mandatory. |
| `GET /opportunity/type` | Find the "Learning" type id | Production types on 2026-11-12: Event, Job, Learning, Task, Other. |
| `POST /opportunity/search` `{pageNumber, pageSize, valueContains, types:[learningId]}` | Learning opportunities for a role | `valueContains` is a phrase match, 3 to 50 characters. Items carry `title, organizationName, organizationLogoURL, summary, yomaInfoURL, commitmentIntervalDescription, difficulty, skills[{id,name,infoURL}], zltoReward, isCompletable`. |

Observed limits: requests need a non-default user agent (Python's default was refused with HTTP 403; Node's `fetch` and curl are accepted). Verified counts for Learning-type searches: "customer service" 45, "customer" 72, "community" 30, "retail" 22, "volunteer" 1, "customer support" 1, "community outreach" 0, "retail customer service" 0. Query phrases per role live in `data/role-skills.json`.

Every skill name in `data/role-skills.json` was confirmed to exist in the taxonomy on 2026-11-12 (for example "Customer Service" is `448bb36e-6e5a-4c5a-9150-78703666c37a`). Names such as "Communication", "Attention To Detail", "Volunteering" and "Sales" do not exist as plain entries and are not used. Menu entries containing "certif", "licens", "diploma" or "degree" are filtered out so the model cannot attach a certification-style skill to self-reported text.

## Credential sample

`data/sample-credential.json` follows the shape of Yoma's credential model (`src/web/src/api/models/credential.ts` in didx-xyz/yoma, read 2026-11-12: `id, artifactType, schemaType, issuer, issuerLogoURL, title, dateIssued, attributes[]`). The issuing organisation named is a real Yoma partner (Atingi) but the credential was not issued by Yoma. Reading a user's actual credentials needs the holder's own session: `POST /ssi/wallet/user/search` and `POST /ssi/wallet/user/{id}` are authorised to the logged-in user only.

## How the feature maps onto Yoma's codebase

- Entry point: the Yo-ID dashboard's "CV, coming soon" placeholder (`src/web/src/pages/yoid/index.tsx`) is the natural home. YoCV's buildless frontend would be re-implemented in Yoma's Next.js app following its conventions; the server logic (`server/generation.js`, `server/validate.js`, `server/providers/*`) is framework-independent and could move into a Yoma API service.
- Profile and skills: replace the self-typed profile with `GET /user` and the sample credential with `POST /ssi/wallet/user/search`, both under the user's Keycloak session. On stage and master `GET /user/skills?type=Verified` separates verified from self-attested skills; production does not yet expose the `type` field, so a production integration must treat all `/user/skills` as "earned on Yoma" until it ships.
- Skill taxonomy: Yoma already stores Lightcast skills; a server-side integration would read them from the database rather than the public lookup.
- Evidence record: store each source separately from each proposed claim (source id and type, source text, issuer and date, original and final wording, review decision, generation mode and model, validator rejections, timestamps). Edits must invalidate earlier approvals. Rewritten wording never inherits a credential's verification.

## What a live GenU integration still needs

1. A Keycloak client in realm `yoma` (stage first) for the YoCV service, scopes `openid profile email yoma-api`, issued by Yoma support. `yoma-web` is confidential and cannot be reused.
2. A consent step listing exactly which profile fields, skills and credentials are used, matching the Terms' "full profile never visible unless you consent".
3. A model deployment Yoma controls (Azure OpenAI in a region acceptable under Yoma's data terms), with the same strict schema and grounding checks; only the experience text is sent, never contact details.
4. A decision on where the evidence record lives and who can read it. A public CV must not expose uploaded files or private profile data.
5. A pilot with synthetic data first, measuring statement accuracy, comprehension of evidence categories, completion and usefulness.

## Not done and not claimed

No Yoma sign-in, no reading of the user's real credentials, no document reading or verification, no cryptographic checks, no job application or recruiter sharing. The live model path is implemented and unit-tested but was not exercised with real credentials in this build. This prototype implies no UNICEF or Yoma endorsement.
