# YoCV integration and prototype status

## Repository reference

The intended repository is [Devin-Fitzpatrick06/yoma](https://github.com/Devin-Fitzpatrick06/yoma), a fork of didx-xyz/yoma. Inspected through the connected GitHub account on October 31, 2026. GitHub reported pull and push access to the fork. No branch, commit, pull request or file was created in that repository during this task.

The [Yo-ID dashboard](https://github.com/Devin-Fitzpatrick06/yoma/blob/master/src/web/src/pages/yoid/index.tsx#L201-L214) contains a static CV placeholder. Its original CV card entered the recorded history on [July 29, 2024](https://github.com/Devin-Fitzpatrick06/yoma/commit/71b83eb1b4b0b6e58a66ebbaa52e50de3807e5be). The [August 1, 2024 update](https://github.com/Devin-Fitzpatrick06/yoma/commit/233f765d78fdf4b2425daf982db1554d0561215d) introduced the current “Coming soon...” wording. This history establishes a reserved UI area, not current development status or a committed roadmap.

## What works in this prototype

| Area | Implemented behavior |
| --- | --- |
| Role | Three illustrative entry-level roles; role affects suggested skill prioritisation |
| Inputs | Editable profile, informal responsibilities, optional dates, synthetic credential, optional file metadata and user statement |
| Suggestions | Local text cleanup and source-linked skill rules. No invented metrics, dates or employers |
| Review | Individual accept/edit/reject; unresolved review blocks export; all-rejected draft blocks an empty CV |
| Evidence | Self-reported, awaiting-verification and synthetic issuer-achievement categories; source and original wording retained |
| Edits | Edited wording becomes self-reported. Edits to issuer-based wording clear the displayed source date while preserving it as related-source metadata |
| Output | Reviewed CV preview, print/Save as PDF, plain-text CV, HTML evidence record and JSON evidence record |
| Privacy | In-memory session, explicit downloads and reset; no CV content or selected files sent to an external service |
| Accessibility | Labelled controls, keyboard focus, status messages, native dialogs, non-colour category labels and reduced-motion styling |

## Simulated and future elements

The local template generator is not a live language model. The current runtime has no supplied model credential or built-in model connection. No live-model adapter has been shipped or tested. The product must continue displaying “Sample mode” until a real model is connected and validated. This remains the principal gap against a deliverable requiring real AI inference.

All issuer credentials are synthetic fixtures. The document picker does not upload or read content. There is no production sign-in, real Yoma data retrieval, cryptographic validation, document authenticity check, opportunity application or recruiter-sharing endpoint. The app is an independent student concept and implies no UNICEF or Yoma endorsement.

## Verified code interfaces in the intended fork

- The [frontend package](https://github.com/Devin-Fitzpatrick06/yoma/blob/master/src/web/package.json) specifies Next.js 16.2.6. This standalone app uses buildless HTML/CSS/JavaScript for portability; eventual integration would follow Yoma’s existing frontend conventions.
- The [user service](https://github.com/Devin-Fitzpatrick06/yoma/blob/master/src/web/src/api/services/user.ts) retrieves the profile with `GET /user` and skills with `GET /user/skills`. This fork’s client call does not take the newer upstream verified-skill filter. Confirm the backend response and classification before treating any skill as verified.
- The [credential service](https://github.com/Devin-Fitzpatrick06/yoma/blob/master/src/web/src/api/services/credentials.ts) uses `POST /ssi/wallet/user/search` and `POST /ssi/wallet/user/{id}`. Read credential details rather than assuming a title establishes a skill. Existing comments and mocks in that file are not evidence that live credentials were tested here.
- The [credential model](https://github.com/Devin-Fitzpatrick06/yoma/blob/master/src/web/src/api/models/credential.ts) includes issuer, issue date and detail attributes. Preserve the signed achievement separately from rewritten CV prose.

## Proposed implementation inside Yoma

1. Replace or link the existing CV placeholder with a YoCV route. Offer a second entry from a selected opportunity when the product team approves that journey.
2. Reuse Yoma’s existing session and authorisation. Ask the user which profile details, achievements and skills they want to use.
3. Build a backend generation endpoint. Keep provider keys server-side. Send role requirements and selected experience rather than contact details. Set a retention policy, validate structured results and preserve input when a request fails. The actual provider remains a product-team decision.
4. Store each source separately from each proposed claim. Suggested fields: source ID/type, source text, issuer/date, scope and verification status; original and final claim text; source links; review decision; generation mode/version; and review timestamps. Revisions must invalidate old approvals.
5. Treat issuer verification as a property of the original achievement. User approval is a separate property of CV wording. Rewritten or expanded claims do not inherit cryptographic verification.
6. Create an evidence-access policy before sharing. A public CV should not automatically expose uploaded files or private profile data. The prototype’s downloadable local evidence record is not a production sharing scheme.
7. Pilot with synthetic data first. Measure statement accuracy, evidence-category comprehension, task completion and usefulness. Do not report these as improvements until measured.

## Verification performed

Ten core behavioral tests pass, including two regressions found in independent review. Browser checks cover the full desktop and 390px mobile journeys, review gating, edits, rejection, downloads, PDF printing, reset, empty input, stale-source blocking and regeneration. All five mobile screens had no horizontal overflow at both 390px and 360px. Testing used synthetic data and did not sign in to Yoma.
