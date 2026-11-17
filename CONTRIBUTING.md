# Contributing

This is a student prototype for [Yoma](https://yoma.world), not a Yoma or UNICEF project. Contributions are welcome if they keep the prototype honest about what is real and what is simulated.

## Setup

Node 20 or newer. There is nothing to install.

```sh
git clone https://github.com/greenglow7/yocv-prototype.git
cd yocv-prototype
npm start
```

Copy `.env.example` to `.env` for live AI mode or the YoVouch simulator (`YOVOUCH_SIM=1`). Never commit `.env`.

## Tests

```sh
npm test
```

The suite is `node --test tests/*.test.cjs`. Two model smoke tests skip without a key. Two tests call Yoma's public API and need internet; `YOCV_LIVE_YOMA=0 npm test` skips them.

Every change ships with a test. Write the failing test first, make it pass, then commit. Route tests boot the real server on a free port against a temp directory; see `tests/helpers/`.

## Rules the code keeps

- **Node built-ins only.** No npm packages, no vendored code. `fetch`, `node:crypto`, `node:test` and friends are enough.
- **Buildless.** The frontend is plain HTML, CSS and JavaScript served as-is.
- **Honesty strings never drop.** YoCard and YoVouch pages carry "Who can see this: anyone with the link" and "Not operated by Yoma or UNICEF" and say the record is signed by YoCard, not by Yoma. YoCV and the worker flow show the sample or live mode label. Every vouch tier label contains "confirmed by them, not by Yoma". Tests check them.
- **No public counts.** Vouch counts appear only on the worker's private page.
- **Nothing a model wrote is published unconfirmed.** Every AI suggestion is checked against the person's own words and shown to them before it reaches a public page.
- **Keys and numbers stay on the server.** Voucher and owner phone numbers are stored as keyed hashes; the card shows at most the last three digits, unless the worker turns on the WhatsApp button, which links to their full number.
- **Simulated parts are labelled** on the page and listed in the README table "Real versus simulated".

## Design, plan, build

Larger work follows the written design and plan under `docs/superpowers/`: a spec in `specs/`, a task-by-task plan in `plans/`, then implementation task by task with a review after each. Small fixes go straight to a branch with a test.

## Commits

Conventional style, as in the history: `feat(vouch): ...`, `fix(yocv): ...`, `docs: ...`. Short subject, plain sentences in the body, no trailing periods in the subject.

## Pull requests

Fill in the template. CI runs the suite on Node 20 and 22 offline, then the live Yoma tests as a non-blocking job.
