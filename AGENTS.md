# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot and others) working in this repository. Humans: see `CONTRIBUTING.md`.

## What this is

A student prototype for [Yoma](https://yoma.world), not a Yoma or UNICEF project. Three pieces share one Node server:

- **YoCV** (`index.html`, `app.js`, `core.js`, `cv-rules.js`, `cv-copy.js`, `server/cv/`): a reviewed first CV in four steps, built from what Yoma records (completions and wallet credentials) and the person's own words, with an evidence record.
- **YoCard** (`card.html`, `card.js`, `server/card/`): a shareable work card for informal work, built from a Yoma account and signed by YoCard.
- **YoVouch** (`server/card/vouch*.js`, `sms.js`, `wa.js`, `reply*.js`, `pages.js`, `copy.js`): rotating-code vouches from customers and other workers, organisation referrals, and a six-line "Reply by Voice" to job posts.

## Run and test

```sh
npm start            # node server.js on http://127.0.0.1:4173
npm test             # node --test tests/*.test.cjs
YOCV_LIVE_YOMA=0 npm test   # offline: skips the two live Yoma tests
```

`YOVOUCH_SIM=1` (in `.env` or the environment) mounts the SMS and WhatsApp simulators and the `/demo/*` pages. `node scripts/seed-demo.js` writes demo cards and prints their private links.

## Hard rules

1. **Node 20 built-ins only.** No npm packages, no vendored code, no build step. If you think you need a library, write the small part you need (see `server/qr.js`).
2. **Tests first.** Write the failing test, watch it fail, implement, watch it pass. Route tests boot the real server against a temp directory (`tests/helpers/`). The suite must stay green apart from the two credential-gated skips (four when offline with `YOCV_LIVE_YOMA=0`).
3. **Honesty strings are load-bearing.** Do not remove or reword: the sample or live mode label, `Who can see this: anyone with the link`, `Never pay before the work is done`, `Not operated by Yoma or UNICEF`, `signed by YoCard, not by Yoma`, and `confirmed by them, not by Yoma` on every vouch tier label. Tests in `tests/yovouch-copy.test.cjs`, `tests/helpers/honesty.cjs` and `tests/card-render.test.cjs` check them.
4. **Copy lives in the catalogue.** User-facing YoVouch strings go in `server/card/copy.js` (and `data/yovouch-copy.json` for translations), matched word for word against section 17 of `docs/superpowers/specs/2026-11-16-yovouch-design.md`. A string the spec does not list goes in `PLAN_ADDITIONS` or into the spec.
5. **Nothing a model wrote reaches a public page unconfirmed.** Every suggestion passes the grounding checks in `server/validate.js` and `server/cv/validate.js` and a read-back by the person before it is published.
6. **No public counts.** Vouch counts, request counts and the like appear only on the worker's private page or in `scripts/measure.js` output.
7. **Privacy.** Voucher and owner phone numbers are stored as keyed hashes and shown as the last three digits at most; the three exceptions are a worker's own WhatsApp number when they turn that button on, the verbatim text of a pasted job post, and the person's own number on their own CV, prefilled in the browser, never stored by the server or sent to a model. Names and numbers are never sent to a model. Never write a real person's name, number or email into code, tests, docs or commit messages.
8. **Simulated parts are labelled** on the page and in the README table "Real versus simulated". Never present a simulated gateway, account or organisation as real.
9. **Never commit** `.env`, `data/cards/`, keys or tokens. `reports/` and `research_notes/` are git-ignored working notes, not part of the repo.

## How work is organised

Larger changes follow `docs/superpowers/`: a design spec in `specs/`, a task-by-task plan in `plans/`, then implementation one task at a time with a fresh review after each. Read the spec section a task cites before changing code. Deviations from the plan are recorded in the commit body or the testing log.

Commit messages use the conventional style in the history: `feat(vouch): ...`, `fix(yocv): ...`, `docs: ...`. Keep prose in plain short sentences without em dashes.

## Where things are

- `server.js`: HTTP server, static allowlist, `/api/status` and `/api/yoma/opportunities`; mounts `server/cv/routes.js` and `server/card/routes.js`.
- `server/cv/`: the YoCV routes and sessions (`routes.js`), the Yoma record (`record.js`), the draft pipeline (`draft.js`), the CV checks (`validate.js`), the skill evidence levels (`skills.js`), the role menu (`menu.js`) and the copy access (`copy.js`).
- `cv-rules.js` and `cv-copy.js`: the lists the CV checks run against and the YoCV copy catalogue, each a plain object loaded by the browser and the server. `core.js` takes them as arguments and never reads them when it loads.
- `integration/yoma/`: the Yoma integration pack, written to Yoma's patterns and offered under GPL-3.0 (`LICENSE-NOTE.md`); `integration/rapidpro/`: the draft webhook flow skeleton.
- `server/providers/`: model adapters (Azure OpenAI, OpenAI-compatible, local templates). Keep model integration behind this layer.
- `server/yoma.js`: read-only Yoma public API client with a one-hour cache.
- `server/card/vouch-system.js`: wires the YoVouch modules; `vouch-routes.js` and `reply-routes.js` hold the routes.
- `docs/testing-log.md`: what was run by hand and what was not. Update it when a manual check changes.
- `presentation/`: demo script and Yoma integration notes.
