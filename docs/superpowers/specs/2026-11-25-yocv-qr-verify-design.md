# YoCV QR verification, design (2026-11-25)

GenU's priority 3 ask for YoCV: "Show an informal employer scanning a QR code to verify the CV." This spec adds a QR to the finished CV that opens a public check page. The page tells the employer which lines Yoma confirmed and which are the person's own words.

## 1. What the person does

1. In Step 4 the person presses **Make a QR code for employers**. The button is hidden offline.
2. The server builds a CV check from its own session, signs it and stores it. The page shows the QR, a check code and an **Open the employer view** link.
3. The QR and the check code print at the foot of the CV paper and appear in the text download.
4. If the person changes the CV after that, the QR is dropped and the button comes back. A stale QR never prints.

## 2. What the employer sees

`GET /cv-check/<checkId>` is a small server-rendered page. It works without JavaScript, uses system fonts and fits a phone.

- The name as printed on the CV, the date the check was made and the check code, so the employer can match it to the paper.
- **Confirmed from Yoma**: learning credentials and completions the person ticked, each with the issuer or organisation and the month, and skills at level S1.
- **Vouched**: skills whose best source is a vouch or a referral, with their existing "confirmed by them, not by Yoma" label.
- **Self-declared**: experience bullets and S3 and S4 skills. The page says these are the person's own words, that YoCV checked the wording against their answers, and that nobody else has confirmed them.
- The footer honesty strings, `Who can see this: anyone with the link`, and the sample line when the account is a sample.
- A link to the signed record as JSON and the signing key, for a developer.

Never on the page: phone, email, town, the place of each piece of work (often the same as the town), date of birth, ID number, state of origin, photo, the profile line.

## 3. Trust rules

- **The server decides the labels.** Learning lines come from the session's Yoma record and the ticks stored at review. A skill name the session never returned is refused. The browser's labels are never used.
- **Bullets pass the checks again.** Each CV entry is matched by title to one session entry, used once, and every bullet must pass `checkBullet` against that entry's answers (AGENTS rule 5). A bullet that fails is refused with 400. At most five bullets per entry, none repeated.
- **Dates and name.** The months printed come from the matched session entry, not the browser. A name holding a phone number or an email is refused.
- **Limits.** Five checks per session; the sixth answers 429.
- **Signed.** The check is signed as a compact JWS with the server's YoCard key, `sub` set to the check id. The page verifies the signature on every load. A record that fails says "This record could not be checked. Do not rely on it."
- **Expiry.** A check lasts 90 days. After that the page says it has expired and shows no content, and the JSON answers 410.
- **Unguessable.** The check id is 16 random hex characters. The check code is its first 8, upper case, in two groups of four.

## 4. Routes

- `POST /api/cv/verify` `{sessionId, cv}` returns `{checkId, code, url, qrSvg, expiresAt}`. 410 for an expired session, 400 for a refused bullet or skill, 409 before a review.
- `GET /cv-check/<checkId>` the employer page. 404 page for an unknown id.
- `GET /cv-check/<checkId>.json` `{jwt, jwksUrl}`, only while the page would show the check: 404 when missing or changed, 410 when expired.

Stored under `data/cards/cv-checks/` (git-ignored). The URL base is `YOCARD_PUBLIC_URL`, else the server's host and port. A phone can only scan it when that base is reachable from the phone, see the README.

## 5. Out of scope, listed as limitations

- Withdrawing a check before it expires.
- The QR in the Word file.
- A live re-check against Yoma when the employer scans. The page shows what Yoma said when the check was made.
- A YoID write of the check. That belongs to the shared journey work.
