# Security

This is a prototype. It is not hardened for production and should not hold real people's data outside a consented pilot (see `docs/pilot-plan.md` and `docs/pilot-consent.md`).

## Reporting

Use GitHub's private vulnerability reporting (the repository's Security tab, "Report a vulnerability"). Do not open a public issue for a vulnerability. Say what you found without including live secrets, tokens or personal data.

## What the server stores

- Published YoCard records, vouch records, replies, job posts, request links, voucher files, organisation key hashes, the card-code and SMS-id indexes and the ES256 signing key, as JSON files under `data/cards/` (git-ignored). Voucher and owner phone numbers are stored only as keyed hashes (`data/cards/.hashkey.json`, mode 0600). Two exceptions: a worker who turns WhatsApp on publishes their full number in the signed card record and its wa.me link, and a pasted job post is kept verbatim, contact number included, for 60 days.
- Audio clips as the browser recorded them, under the same directory, deleted by the hourly retention sweep at withdrawal or after 12 months, and all at once by `scripts/measure.js --delete-clips` at the end of a pilot.
- `events.jsonl` with ids, event type, channel, method and timestamps; no numbers or names.

YoCV stores nothing.

## What never leaves the server

Model keys, the signing key, phone hashes and the hash key. Owner secrets and card tokens are given once to the worker at publish and stored only as hashes. Live AI mode sends a YoCV user's role, dates and experience text to the configured model, never their name, email, city or phone. YoVouch sends voice clips to the transcription endpoint when one is configured, and the job post and the worker's answer to the model with phone numbers masked and names replaced by `[name]` for translation. Yoma is called over public, read-only endpoints with no user data, plus the holder endpoints with the bearer token only when `YOMA_ACCESS_TOKEN` is set.

## Known gaps

- Single host, file store, no database, no rate limiting beyond the YoVouch sender and code caps.
- The gateway webhooks authenticate with one shared secret header.
- No Yoma sign-in; a `YOMA_ACCESS_TOKEN` in `.env` is a bearer token copied by hand and must be treated as a password.
