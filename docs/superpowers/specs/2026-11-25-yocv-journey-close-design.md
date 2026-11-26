# YoCV closes the journey, design (2026-11-25)

The GenU final brief asks three things of Phase 4 that the QR check alone does not do:

- "Phase 4 closes the loop by applying to the listing found in Phase 1."
- "Each handoff item is recorded on the user's YoID. Mocked or designed YoID writes are fine."
- From the QR spec's limitations: the person cannot withdraw a check before it expires.

This spec adds a withdraw route for the check, an apply step at the end of Step 4, and a mocked YoID record of both. It follows `2026-11-25-yocv-qr-verify-design.md`.

## 1. Withdrawing a check

- `POST /api/cv/verify` also returns `withdrawSecret`, 32 random hex characters. The server stores only its SHA-256 hash next to the signed check. The signed record does not change.
- `POST /api/cv/verify/<checkId>/withdraw` `{withdrawSecret}` marks the check withdrawn and returns `{checkId, withdrawnAt}`. It does not need the CV session, so it still works after the session expires.
  - 403 `forbidden` when the secret does not match, 404 for an unknown check, 410 `withdrawn` when it is already withdrawn.
- After a withdrawal, `GET /cv-check/<checkId>` answers 410 and says "The person withdrew this check on {date}. Do not rely on it." It shows no content. The JSON answers 410 with the code `withdrawn`.
- The browser keeps the secret in memory only, like the rest of the draft. If the page is closed, the check can no longer be withdrawn and still ends after 90 days. This is listed as a limitation.
- In Step 4 a **Withdraw this check** button sits under the QR. It asks first. After it, the QR leaves the CV paper and the make button comes back.

## 2. Applying to the listing

- The listing comes from `data/journey.json`, served in `GET /api/cv/config` as `journey.listing`: id, title, organisation, place and a short line on what it asks for. Until the shared mock data from Phase 1 arrives, it is a fictional sample listing and the page says so.
- Step 4 ends with an **Apply to {title}** card. It names the listing and says what would be sent: the CV and its check link. The button needs a live check; with none, it says to make the QR first.
- Pressing it sends nothing. It records the application in the page and says: "Mock-up: nothing was sent. In Yoma this would go to {organisation} with your CV and its check link."

## 3. The Yo-ID record

- Step 4 shows an **On your Yo-ID** list once there is something on it:
  - the CV check: its code, the date made, and "open until {date}", or "withdrawn on {date}";
  - the application: the listing, the organisation and the date.
- The list carries the line "Designed, not written to Yoma. Yoma has no YoID write for these yet." No call to Yoma is made.

## 4. Out of scope

- A real application to a Yoma opportunity, and a real YoID write.
- Keeping the withdraw secret after the page closes.
- The shared design kit and the shared mock data, which wait on the team.
