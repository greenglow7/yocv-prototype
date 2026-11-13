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
| 10 tests | 256 tests (151 after Phase 1), including route, provider, validator and Yoma client suites with injected fakes, the YoCard suites (qr, card-sign, card-store, card-account, card-draft, card-render, card-routes), two live Yoma tests that run on every connected run, and two live model smoke tests that run only with credentials |

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

# YoCard integration notes (Week 6, Phase 2)

## Why a card and not a CV

GenU's own framing: more than three quarters of young workers, and about 96 percent of employed 15 to 24 year olds in sub-Saharan Africa (ILO), work informally. They get customers through WhatsApp, referrals and trust. A CV is the wrong artifact for them; a checkable card backed by what Yoma already recorded is closer to how they already work.

## What Yoma can and cannot back today (verified in the didx-xyz/yoma source and live API on 2026-11-12)

- Yo-ID is the youth's Keycloak login plus a custodial wallet Yoma holds for them. Yoma issues one Yo-ID credential and one credential per verified opportunity completion, all signed by Yoma (per-organisation signing is future work).
- There is no third-party verification: the wallet endpoints `POST /ssi/wallet/user/search` and `POST /ssi/wallet/user/{id}` require the holder's own token; the wallet's "Verified" badge is documented as a display result, not a signature check; share links with QR exist only for opportunities (`ActionLinkEntityType = Opportunity`); the raw signed credential is never returned to clients.
- Production still runs the Aries provider (artifact types JWS and AnonCreds); stage and master run didx:me Wallet Lite with SD-JWT. didx:me supports presentation requests (`POST /me-creds/api/v1/presentations/request`, `GET /me-creds/api/v1/presentations/{id}` returning `isValid` and trust signals) but needs a verifier client issued manually by DIDx.
- `AccountVerificationMethods` and `phoneNumberConfirmed` are explicitly "not KYC, proof of identity or verification of the user's self-declared profile".

So the only honest "verification" this week is a consented read of the account, labelled as such, plus public cross-checks against live opportunity pages. The card's signature proves integrity of what the worker published, not that Yoma vouches for it.

## Endpoints YoCard uses

| Endpoint | Auth | Used for |
| --- | --- | --- |
| `GET /opportunity/{id}/info` | none | Organisation, verification method, evidence types, participant counts, yoma.world link for each completion (real, live, cached one hour) |
| `GET /user` | bearer (token mode) | Display name, Yo-ID flags, phone confirmed, counts, date of birth (age gate only, never stored) |
| `GET /user/skills` | bearer (token mode) | Skills with the organisations that awarded them (production has no verified/self-attested split yet) |
| `POST /myOpportunity/search` `{action:'Verification', verificationStatuses:['Completed']}` | bearer (token mode) | Completed opportunities with evidence types from `verifications[]` |

The organisation-name check on the self-declared block is not a Yoma call. It uses the organisation names already in the account snapshot (each completion's `organizationName` and each skill's `organizations[].name`; see `snapshotOrganisations` in `server/card/draft.js` and the publish check in `server/card/routes.js`), so an organisation the worker has no record with is not blocked.

## How YoCard maps onto Yoma's codebase

- Entry point: the Yo-ID dashboard (`src/web/src/pages/yoid/*` in didx-xyz/yoma), next to the credentials and skills views, is where a "work card" would live. Under a Keycloak session the connect step disappears: the token adapter in `server/card/account.js` (which today reads a copied bearer token or a sample persona) is replaced by direct calls to `GET /user`, `GET /user/skills` and `POST /myOpportunity/search` on the user's own session, and the sample personas go away.
- Portable server modules: `server/card/draft.js` (with `server/validate.js` and `server/providers/*`, both shared with YoCV) becomes the drafting and grounding step of a card service, with the model deployment Yoma controls; `server/card/sign.js` becomes a signing key Yoma holds, so the record is signed by Yoma rather than by a third-party host; `server/card/store.js` becomes a card entity in Yoma's API (consented fields, disclosure flags, withdrawal) instead of JSON files; `server/card/render.js` and `server/qr.js` become an anonymous public route that renders the page, the SVG and the signed record from that entity.
- The public page `/c/:id` becomes a yoma.world route served through the existing ActionLink and QR machinery (`ActionLinkEntityType` extended from Opportunity to a card or profile entity), which gives it Yoma's domain for WhatsApp previews and zero-rating and removes the lookalike-domain problem.

## What a real integration needs, in order

1. A Keycloak client in realm `yoma` on stage for YoCard (authorization code, scopes `openid profile email phone yoma-api offline_access`), issued by Yoma support; `yoma-web` is confidential and cannot be reused. Replaces the sample personas and the copied token.
2. A Yoma-side consented public card: extend `ActionLinkEntityType` to a card or profile entity so the existing link and QR machinery serves it, plus an anonymous endpoint returning only the fields the user consented to. This moves the signature and the "read from Yoma" claim into Yoma and removes the need for a third-party host or stored tokens.
3. Hosting under yoma.world so WhatsApp link previews carry Yoma's domain and Airtel zero-rating in Nigeria applies.
4. For L6: Yoma registered as a didx:me verifier, a presentation preset over the Opportunity credential restricted to Yoma's issuer DID, Yoma auto-answering on the custodial holder's behalf with consent, and production cutover from Aries to SD-JWT.
5. Governance: a consent record per card, POPIA (plus Kenya DPA and Nigeria NDPA) responsible-party decision since Yoma's policy cites GDPR/UK only, UNICEF child-safeguarding review (adults-only is a policy line based on self-declared date of birth, not a control), brand permission, a takedown owner, and Azure AI Content Safety on the self-declared text (classifier coverage of African languages is weak; documented, not built).

## Honest limits of this build

Sample personas are fictional; their completions reference real Yoma opportunities so the live cross-check is real, but no real youth data was read. Check now on a sample card re-reads the same persona and says `simulated: true`. The model draft path uses the same adapters as YoCV and was not exercised against a real key in this build; the template draft is what the demo shows unless a key is configured. The QR encoder was verified against an independent decoder and the browser's BarcodeDetector.
