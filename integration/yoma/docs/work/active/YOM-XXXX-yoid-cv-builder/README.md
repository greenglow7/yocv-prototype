# Epic: YOM-XXXX, YoID CV builder

## Meta

- **Epic**: YOM-XXXX (a placeholder until the team issues the Linear id)
- **Owners**: the API owner (api) · the web owner (web)
- **Areas**: both
- **Status**: planning
- **Started**: 2026-11-19
- **Branch**: none yet. The work so far is a contribution pack written outside this repository.

## Why This Epic Exists

The YoID dashboard has a CV tile that says a CV is coming soon. A young person's Yoma record already holds completed opportunities, credentials and skills. Many young people also have informal work that no record holds. This epic builds a CV from both, in four steps: Your Yoma record, Your work, Review and Your CV. Every sentence on the CV comes from the person's own answers or from Yoma, and nothing reaches the CV until the person accepts it.

## Child Features

| Folder | Ticket | Area | Status |
| --- | --- | --- | --- |
| [`YOM-YYYY-cv-draft-service/`](./YOM-YYYY-cv-draft-service/feature.md) | YOM-YYYY | both | planning |

Tickets with no folder yet. Add one when work starts:

| Ticket | Area | Note |
| --- | --- | --- |
| to come | web | The dashboard tile links to the CV page. Small enough to stay a task in the feature doc. |
| to come | api | A check endpoint for the person's own edit in Review. |

## Shared Contract

- `GET api/v3/cv` returns `CVEvidenceRecord`: the learning items, the skills with the label and sources of each, and the wallet state.
- `POST api/v3/cv/draft` takes `CVDraftRequest` (the role and up to three interview entries) and returns `CVDraft`: the bullets, the refused suggestions, the skills and the generation mode. Nothing is saved.
- The request never holds a name, a phone number, an email, a town or the place the person named. The client keeps those for the CV only.
- Skill levels, strongest first: `RecordedOnYoma`, `Vouched`, `ShownInWork`, `SelfStated`. Only a Yoma record or a vouch moves a skill up. Volume never does.
- The C# models are in the pack under `src/api/src/domain/Yoma.Core.Domain/CV/Models/`. The web types are in `src/web/src/api/models/cv.ts`. Checked by hand against each other, not by a compile.

## Out of Scope (whole epic)

- Saving a CV on Yoma. The CV is built in the browser and printed or downloaded.
- Hosting YoCard vouches inside Yoma. Until then `Vouched` has no source here.
- A DOCX export.

## Blockers

| Blocker | Severity | Note |
| --- | --- | --- |
| Linear ids | Low | `YOM-XXXX` and `YOM-YYYY` are placeholders. Rename the folders when the ids are issued. |
| Model provider and key | High | Needs a provider choice and a sops secret per environment. See the feature doc. |
| Edit check endpoint | Med | Until it exists the web page offers Accept and Leave out only. |

## Cross-Area Notes

- The web client aborts most calls at 45 seconds. A draft makes one model call per entry, so `draftCV` sets its own longer timeout.
- The CV page and the dashboard tile read `NEXT_PUBLIC_CV_ENABLED` as a string from `process.env` in `getServerSideProps`, as both pages read the passport flag today. The flag is also declared in `src/web/src/env.mjs` beside `NEXT_PUBLIC_PASSPORT_ENABLED`.
- A rename of the API models, such as the `<Thing>Provider` naming the API owner may choose, changes no field on the wire.
