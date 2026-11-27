# YoCV on the phone, with the Liquid Thought YoID prototype in mind, design (2026-11-27)

GenU's brief for YoCV says:

- "Build with the YoID mobile prototype (Liquid Thought, on GenU's tech roadmap) in mind, and look at combining the two."
- "Show an informal employer scanning a QR code to verify the CV."

An informal employer, such as a solar installer hiring a trainee in Kaduna, rarely gets a printed CV. The young person has a smartphone. So the check has to work from one phone to another: Halima shows the QR on her screen and the employer scans it with their phone camera. This spec adds that screen. It also sets out how YoCV's pieces would sit in a YoID mobile wallet, so the two prototypes can be combined.

We have not seen the Liquid Thought prototype. Section 3 says what we assume and what we need from them.

## 1. Show it on my phone

- Under the QR in Step 4 there is a **Show it on my phone** button, next to **Open the employer view** and **Withdraw this check**.
- It opens a full-screen dialog titled **Show this to the employer**. The dialog shows:
  - the QR, as wide as the phone allows, up to 320 px, on a white square so a camera can read it in sunlight;
  - the check code, in large print, which the employer can type if the camera fails;
  - "Ask the employer to point their phone camera at this code. They see which lines Yoma confirmed and which are your own words.";
  - "Who can see this: anyone with the link. It never shows your phone, email or town.";
  - the end date of the check.
- **Close** goes back to Step 4. The dialog makes no call and changes nothing.
- A withdrawn or out-of-date check has no QR, so the button is not shown.

## 2. Phone widths

- Step 4 and the employer check page must work at 375 px with no sideways scroll. The employer page has no script, so it opens in any phone browser that a camera app hands the link to.
- The real phone scan passed on 2026-11-25 (testing log, QR section, row 4).

## 3. Combining with the Liquid Thought YoID prototype

Today YoCV sits inside a Yo-ID web dashboard (`index.html`). In a YoID mobile wallet, its pieces would map like this:

| YoCV piece | In a YoID mobile wallet |
| --- | --- |
| Step 1, the Yoma record: completions, wallet credentials, self-attested skills | The wallet's credential list. YoCV reads it and does not change it. |
| The Skill Credential `cred-002` from SkillLens | A credential that arrives in the wallet, tagged with where it came from. |
| Steps 2 and 3, the interview and the review | A "Build my CV" flow started from the wallet, one question per screen (already the phone layout). |
| The skill labels: Confirmed from Yoma, Vouched, From your own account, Self-stated | Claim metadata on each CV line, so the wallet shows the same label. |
| The CV check behind the QR, signed, with an end date | A shared presentation of the CV: a link the wallet makes and signs with Yoma's key. |
| **Show it on my phone** | The wallet's own "share by QR" screen. |
| **Withdraw this check** | Revoking that share in the wallet. |
| The Job Application `app-001` | A record of the application, written to YoID. |

What we assume about Liquid Thought, to confirm:

- It shows YoID credentials on a phone and can share one by QR or link.
- It can hold a credential that Yoma did not issue, labelled as such.

What we need from them:

- the link to the prototype and its share screen;
- the format it uses for a credential and for a shared presentation;
- whether a share can be revoked, and how the person sees that.

Until then, YoCV keeps its own share screen and its own withdraw, built so either can be swapped for the wallet's.

## 4. Out of scope

- A native app, and a wake lock or screen-brightness change while the QR is shown.
- A real YoID write or Yoma-signed check (`handover/README.md`, section "How it would come into GenU's systems").
