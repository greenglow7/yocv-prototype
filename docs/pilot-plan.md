# YoVouch pilot plan

A small pilot with real workers and their real past customers (spec section 15). It starts only after the consent text in `docs/pilot-consent.md` is signed off by the consultant's institution and the thresholds in `docs/measurement-plan.md` are filled in.

## Who

- Five to ten adult workers in informal work. None of them is a demo persona.
- Half of them women where possible.
- Each worker's self-reported gender is asked once at enrolment and kept on the study sheet only. It is never stored on a card or in any record. Voucher gender is not asked.
- Their customers are people they already worked for. Each customer reads the honesty text before anything is recorded.

## Before the first request

1. Get the institution's sign-off on the consent text.
2. Fill in every threshold in `docs/measurement-plan.md` and date it.
3. Set up the study sheet with these columns: worker code, self-reported gender, date approached, agreed (yes or no), date dropped out, reason, requests sent (from the next-day question), replies that led to contact, a job or a refusal, and the post date.
4. Run the prototype without `YOVOUCH_SIM` and without a gateway secret. Every real vouch then uses the demo fallback and carries `phoneConfirmedBy: "demo"`.

## During the pilot

- Each worker publishes a card and makes request links for past customers. YoVouch sends nothing. The worker forwards each link from their own phone.
- The day after a worker makes request links, send one WhatsApp question: "Did you send the request? To how many people?" Write the answer on the study sheet.
- Two weeks after each reply to a job post, ask the worker whether it led to contact, a job or a refusal. Write the answer and the post date on the study sheet. Never infer a hire from a reply.
- Review every `Parser refusals` row against its post, because a false refusal blocks a real job.

## Who took part

Keep a running count on the study sheet and report it in the write-up:

- workers approached;
- workers who agreed;
- every worker who dropped out, with the reason.

## At the end

1. Run `node scripts/measure.js data/cards --sent N`, with N the total from the study sheet. Keep the output.
2. Delete every clip: `node scripts/measure.js data/cards --delete-clips`. It prints `Deleted <n> clips`.
3. Run the counts again and keep this output too.
4. Keep the raw `events.jsonl` with the write-up. Delete it at the end of the prototype period.
5. Write up the counts with their denominators and the honest collection rules in `docs/measurement-plan.md`.
