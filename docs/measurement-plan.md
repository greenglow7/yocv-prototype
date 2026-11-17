# YoVouch pilot measurement plan

Pre-registered before the first real request (spec section 15). Fill in every threshold below before any real worker sends a request. Do not change a threshold after the first request is sent. If one must change, add a dated row under "Changes after registration" and say why.

Registered on: ____________ by: ____________

## What is measured

| Measure | Definition | How it is collected | Row printed by `scripts/measure.js` | Threshold (fill in before the first request) |
|---|---|---|---|---|
| Reply rate | Confirmed request vouches divided by the requests the workers say they sent | `request_created` and `vouch_confirmed` with `method: request` in `events.jsonl`. "Sent" is each worker's answer to the next-day WhatsApp question, added up on the study sheet and entered with `--sent N` | `Reply rate: <n> of <sent>` | |
| Time to reply | `vouch_confirmed.at` minus `request_created.at` for the same `requestId`, in hours, median and each value | Events | `Time to reply (hours): median <x>; each <a, b, ...>` | |
| Unchanged share | Vouches with an empty `editedFields`, and replies with no `edits`, out of the confirmed ones, and per field | The vouch and reply files | `Unchanged vouches: <a> of <b>`, `Unchanged replies: <a> of <b>`, `Edited <field>: <n>` | |
| Who gets vouched, by gender | Confirmed vouches per worker, grouped by the worker's self-reported gender at enrolment | The study sheet only. Gender is never stored on a card. Voucher gender is not asked | `Hires and gender: from the study sheet, not in any record` | |
| Hires | Replies the worker reports led to contact, a job or a refusal, with the post date | The next-day question and the two-week follow-up, on the study sheet | The same row | |
| Channel split | How each vouch was made: QR scan, typed code, on the worker's phone, SMS, call, request link | `vouch_confirmed` events | `Channel <qr, code, worker_phone, sms, ivr, request>: <n>` | |
| Code refusals | `code_refused` by reason | Events | `Code refusals <reason>: <n>` | |
| Flags fired | Stored flags by name (`reciprocal`, `ring`, `held`) | The vouch files, because the page recomputes flags and the record keeps what fired at confirm | `Flags fired <flag>: <n>` | |
| Parser refusals | `parser_refused` by reason. The student reviews each one against the post, because a false refusal blocks a real job | Events and the study sheet | `Parser refusals <reason>: <n>` | |
| Transcription failures | `transcription_failed` by language | Events | `Transcription failures <lang>: <n>` | |
| Reply forward rate | Confirmed replies with `forwardedAt` set (the worker tapped Forward) out of confirmed replies | The reply files | `Reply forward rate: <forwarded> of <confirmed>` | |

The script also prints `Demo events: <n>` and `Referrals accepted: <n>`. Organisation referrals use a demo key in the pilot, so they are not part of the reply rate or the channel split.

## How to run it

During the pilot, from the project folder:

```
node scripts/measure.js data/cards --sent 14
```

Replace 14 with the total from the study sheet. Without `--sent` the reply-rate row says how many request links were created and that the sent count was not entered. Copy the whole output into the write-up, with the date it was run.

## Honest collection rules

- Report every count with its denominator, for example "6 of 14". Never give a percentage while the denominator is under 30. The script prints no percentage at all.
- Report every zero. The script prints a zero row for every measure, including empty groups.
- Keep the raw `events.jsonl` with the write-up. It holds ids, channels and timestamps only, no numbers or names.
- Demo-persona events carry `demo: true`. The script leaves them out of every row and counts them only in `Demo events`. Vouch and reply files on a sample card are left out the same way.
- State how many workers were approached, how many agreed, and every worker who dropped out, with the reason.
- State that the customers were known to the workers and may be friendlier than strangers.
- State that the SMS and call paths were simulated, unless a gateway was obtained.
- State that no number was confirmed by SMS and that no customer texted first, because there was no shortcode. Every pilot vouch is a demo-fallback vouch, stored with `phoneConfirmedBy: "demo"` and labelled `Number typed by the voucher, not confirmed (demo)`.
- State that no Yoma approval existed, and that the consultant's institution's sign-off was the only one.
- Never infer a hire from a reply. A hire is only what the worker reports.

## The sent count

YoVouch sends nothing and cannot see a forward. The day after a worker makes request links, the student asks one WhatsApp question: "Did you send the request? To how many people?" The answer goes on the study sheet. The sum of those answers is the `--sent` number.

## End of the pilot

On the last day of the pilot period, delete every clip:

```
node scripts/measure.js data/cards --delete-clips
```

It prints `Deleted <n> clips`. Every file in `vouches/clips/` and `replies/clips/` is removed, and each record's clip becomes `{expired: true}`, so its line shows `clip expired`. Run the counts once more after this step and keep both outputs.

## Changes after registration

| Date | Change | Reason |
|---|---|---|
| | | |
