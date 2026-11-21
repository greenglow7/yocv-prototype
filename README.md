# 🌟 YoCV prototype

[![CI](https://github.com/greenglow7/yocv-prototype/actions/workflows/ci.yml/badge.svg)](https://github.com/greenglow7/yocv-prototype/actions/workflows/ci.yml)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An independent student concept for [Yoma](https://yoma.world), the youth opportunity platform backed by Generation Unlimited and UNICEF. Three small prototypes share one server and ask the same question: how can AI help a young person with real but informal experience get hired, without ever claiming more than it can prove?

- **YoCV** turns everyday responsibilities (helping at a family shop, caregiving, volunteering) into a reviewed first CV, with a separate evidence record that says where every claim came from and what it proves.
- **YoCard** turns what an informal worker already has on Yoma into one shareable, signed work card a customer can open from WhatsApp and check against Yoma.
- **YoVouch** adds vouches from customers and other workers, confirmed with a rotating code that changes every 90 seconds or through a request link, and a six-line reply a worker can send to a job post.

The app says on screen whether it is in live or sample mode. Every YoCard and YoVouch page says who can see it and that it is not operated by Yoma or UNICEF.

The three share one server, the grounding checks and the Yoma client. YoCard is the Week 6 core feature after the pivot to informal work; YoCV is the earlier CV prototype, kept and refined alongside it rather than replaced; YoVouch was designed and built on top of YoCard after Week 6.

## 📚 Project Components

| Component | Entry point | What it does |
| --- | --- | --- |
| YoCV | `index.html`, `app.js`, `core.js`, `server/cv/` | Four steps to a reviewed first CV. **Your Yoma record**: read the person's completions and wallet credentials (fictional sample accounts unless `YOMA_ACCESS_TOKEN` is set), tick what goes on the CV and choose a role. **Your work**: six short questions per piece of work, answered in the person's own words, and the contact line. **Review**: a model, or the local template, suggests one or two lines per piece of work; every line is checked against the person's own words before it is shown, every skill shows its evidence, and nothing goes on the CV without an Accept. **Your CV**: a printable page, a text download, a separate evidence record and live learning opportunities from Yoma's public API. |
| YoCard | `card.html`, `card.js`, `server/card/` | Connect a Yoma account, describe your work, review a draft split into **Confirmed from Yoma** and **Stated by <first name>, not checked**, publish a short link, a QR card and a public page with **Check now**. Records are signed ES256 by YoCard, not by Yoma. |
| YoVouch | `server/card/vouch*.js`, `sms.js`, `wa.js`, `reply*.js` | Rotating-code vouches (scan, typed, SMS, call-back), worker-to-worker vouches, organisation referrals, request links, and **Reply by Voice**: a six-line reply to a job post built from the card, confirmed by the worker, translated with back-translation. SMS, WhatsApp and the call-back are simulated in this build. |
| Server | `server.js`, `server/` | Node 20 built-ins only. Model adapters (Azure OpenAI, Anthropic Messages API, OpenAI-compatible, local templates), grounding validators, the Yoma public API client, signing, the file store and the server-rendered flow pages. |

Design specs and plans live in `docs/superpowers/`. Research briefs that shaped YoVouch are in `docs/research/`.

## 🤖 AI-Assisted Development

This repo follows the [AGENTS.md](AGENTS.md) convention for AI coding agents (Claude Code, Codex, Cursor, Copilot and others). `CLAUDE.md` points at it. Larger changes go design spec, then task-by-task plan, then implementation with a review after each task; the specs and plans are committed under `docs/superpowers/`.

## 👥 Who it is for

- **A young person with a first CV to write**: YoCV, in the browser, on a fictional sample account unless a Yoma access token is set.
- **An informal worker** (hairdresser, labourer, trader): YoCard and YoVouch, from a phone, with the card and the code page working on any browser and the SMS and call-back paths designed for feature phones.
- **A customer or a fellow worker** who vouches: a scan or a typed code, four taps, a few words, a text from their own phone, a read-back, done. No app, no account.
- **An employer or contractor** reading a reply: six plain lines, each one labelled with where it came from, and a card link they can check.

## 🛠️ Development Setup

Requires Node 20 or newer (built-in `fetch` and `node:test`). There are no npm packages to install and no build step.

```sh
git clone https://github.com/greenglow7/yocv-prototype.git
cd yocv-prototype
npm start
```

Then open `http://127.0.0.1:4173`. Without credentials the server runs in **sample mode**: the generator uses local templates, Yoma data is still live.

To enable **live AI mode**, copy `.env.example` to `.env` and pick the provider with `MODEL_PROVIDER`. Set to `azure`, `anthropic`, `openai` or `local`, it wins, and the server refuses to start without that provider's values. Left empty, the order is Azure if its three values are set, else Anthropic (Claude) if `ANTHROPIC_API_KEY` is set, else the OpenAI-compatible endpoint if `OPENAI_API_KEY` is set, else the local templates (sample mode). So a leftover `OPENAI_API_KEY=ollama` never beats a Claude key. So switching from Azure to a model on the laptop is a one-line change, and the Azure block can stay filled in.

The three configurations side by side (`.env.example` holds all three; the local block is commented out):

| | Azure OpenAI | Claude (Anthropic) | A local model (Ollama) |
| --- | --- | --- | --- |
| Selector | `MODEL_PROVIDER=azure` | `MODEL_PROVIDER=anthropic` | `MODEL_PROVIDER=openai` |
| Endpoint | `AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com` | `ANTHROPIC_BASE_URL=https://api.anthropic.com` (the default, may be left out) | `OPENAI_BASE_URL=http://localhost:11434/v1` |
| Key | `AZURE_OPENAI_API_KEY=<key>` | `ANTHROPIC_API_KEY=<key>` | `OPENAI_API_KEY=ollama` (any value) |
| Model | `AZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini` | `ANTHROPIC_MODEL=claude-opus-5-5` (`claude-haiku-5-5` for a cheap demo) | `OPENAI_MODEL=<a small instruct model>` (`.env.example` names `qwen2.5:3b-instruct`) |
| Output | `AZURE_OPENAI_API_VERSION=2024-10-21` (or `v1` for the newer `/openai/v1` path) | Structured output is built in (`json_schema`), effort `low` | `OPENAI_STRUCTURED_OUTPUT=json_object` |

Without an Azure key, the Claude configuration (with a key) or the Ollama run, plus the unit-tested Azure adapter, are what is shown. A refusal on `claude-haiku-5-5` is final, because that model has no server-side fallback. On `claude-opus-5-5` a declined request is re-run on Anthropic's default fallback model, and the banner then still names the configured model.

The Ollama run on 2026-11-19 used `qwen3.5:9b`, the model already on the laptop. With the shipped 20-second client deadline it did not answer in time: the model reasons before it answers. With the deadline raised in a test harness and its reasoning turned off, both lines passed every check. Details are in the [testing log](docs/testing-log.md). For the demo, use an instruct model that answers without a reasoning pass.

`OPENAI_STRUCTURED_OUTPUT=json_object` puts the schema in the prompt, asks for a JSON object and checks the reply against the same schema, for a local server without `json_schema` support. It applies to every call through that adapter, so YoCard drafts and transcription work against a local endpoint too. The startup banner prints the mode, the provider and the model. Keys stay on the server and are never sent to the browser or logged.

### ⚙️ Configuration

Every variable the code reads (`server/config.js` reads `.env` from the working directory, then the process environment; a process variable wins):

| Variable | Default | Used for |
| --- | --- | --- |
| `PORT` | `4173` | Port the server listens on |
| `HOST` | `127.0.0.1` | Address the server binds to |
| `YOMA_API_BASE` | `https://api.yoma.world/api/v3` | Yoma public API base for skill lookups, opportunity searches and opportunity details; also the API a `YOMA_ACCESS_TOKEN` is sent to |
| `YOMA_ACCESS_TOKEN` | empty | YoCard and YoCV: a bearer token switches the account source from sample personas to a real Yoma account. YoCV then also searches that account's wallet for its credentials |
| `YOCARD_PUBLIC_URL` | `http://HOST:PORT` | Base URL embedded in card links, share text and the QR code (must start with `http://` or `https://`) |
| `YOCV_LIVE_YOMA` | unset | Tests only, shell environment not `.env`: `YOCV_LIVE_YOMA=0 npm test` skips the two live Yoma tests in `tests/live.test.cjs` |
| `MODEL_PROVIDER` | empty | `azure`, `anthropic`, `openai` or `local`. Set, it picks the provider, and the server refuses to start without that provider's values. Empty: Azure if its three values are set, else Anthropic if `ANTHROPIC_API_KEY` is set, else OpenAI-compatible if `OPENAI_API_KEY` is set, else local templates |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` | empty | All three together select the Azure OpenAI provider (live AI mode) when `MODEL_PROVIDER` is empty or `azure` |
| `AZURE_OPENAI_API_VERSION` | `2024-10-21` | Azure API version; `v1` selects the newer `/openai/v1` path |
| `ANTHROPIC_API_KEY` | empty | Selects the Anthropic (Claude) provider when Azure is not configured, or with `MODEL_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Claude model name; `claude-haiku-5-5` is the cheap option for a demo |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Base URL of the Messages API; the adapter sends `POST <base>/v1/messages` |
| `OPENAI_API_KEY` | empty | Selects the OpenAI-compatible provider when neither Azure nor Anthropic is configured, or with `MODEL_PROVIDER=openai`. Any value for a local server, such as `ollama` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | Base URL of that endpoint |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Model name sent to that endpoint |
| `OPENAI_STRUCTURED_OUTPUT` | `json_schema` | `json_schema` asks that endpoint for strict structured output. `json_object` puts the schema in the prompt, asks for a JSON object and checks the reply against the same schema |
| `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT` | empty | YoVouch voice notes: an Azure transcription deployment on the Azure endpoint and key above (no chat deployment needed) |
| `TRANSCRIBE_MODEL` | empty | YoVouch voice notes: a transcription model on the OpenAI-compatible endpoint when Azure is not configured. With neither set, answers are typed only |
| `YOVOUCH_SIM` | unset | `1` mounts the simulated gateways `POST /api/sim/sms` and `POST /api/sim/wa` and the demo pages `/demo/phone`, `/demo/ivr`, `/demo/inbox`, `/demo/beat3` and `/demo/cv-rejected`. Demo only. Ignored when `YOVOUCH_GATEWAY_SECRET` is set |
| `YOVOUCH_GATEWAY_SECRET` | empty | Mounts `POST /api/sms/webhook` and `POST /api/wa/webhook` for a real gateway; each answers 403 unless the header `x-yovouch-gateway-secret` matches (constant-time compare). With it set, the sim and demo routes are not mounted. With neither this nor `YOVOUCH_SIM`, the demo one-time code route `POST /api/vouch/:vouchToken/otp` is mounted instead |
| `YOVOUCH_SHORTCODE` | `12345` | SMS shortcode printed on the worker's code page and in the SMS instructions |
| `YOVOUCH_CALLBACK_NUMBER` | `0800 000 000` | Toll-free call-back number printed on the worker's code page |
| `YOVOUCH_SMS_COUNTRY` | `South Africa` | Market of the shortcode: reads a local-format sender number (`0825550131`) that arrives with no card context |
| `YOVOUCH_ORG_KEY_<NAME>` | none (`.env.example` sets `YOVOUCH_ORG_KEY_SAMPLE_SKILLS_TRUST`) | One demo organisation key per variable for the referral page. `<NAME>` is the organisation's name in capitals with `_` for spaces, so `SAMPLE_SKILLS_TRUST` is `Sample Skills Trust`. Every page and line made with it says `Demo organisation key. A real key needs Yoma.` |
| `YOCV_SERVICE_SECRET` | empty | Mounts `POST /api/cv/draft`, the YoCV draft webhook for a RapidPro flow. It answers 403 unless the header `x-yocv-service-secret` matches (constant-time compare). Empty: the route is not mounted |

To open a card from a phone on the same Wi-Fi, set `HOST=0.0.0.0` and `YOCARD_PUBLIC_URL=http://<your LAN IP>:4173` so the link and QR point at an address the phone can reach.

You can also open `index.html` straight from disk. The app then runs in **sample mode (offline)** on the browser copies of the rules (`cv-rules.js`), the copy (`cv-copy.js`) and the checks (`core.js`). Step 1 needs the server, because the Yoma record, the sample accounts and the role menus come from it. Offline, Step 1 shows `Your Yoma record needs the YoCV server. You can still describe your work and build a CV.` and a plain role field. Steps 2 to 4 run in the browser: Review builds each line from the template and runs the same checks, and proposes no skills. The same fallback applies when the server goes away after the page loaded.

### 🧪 Tests

```sh
npm test
```

`tests/live.test.cjs` holds two credential-gated model smoke tests (a YoCV CV line for Thandi's braiding and the YoCard draft) that run against whichever provider is configured (Azure OpenAI, Anthropic or OpenAI-compatible), print the provider and model, and are skipped without a model key (`AZURE_OPENAI_*`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`). It also holds two Yoma tests that call `YOMA_API_BASE` on every run and need internet; the first has a subtest that resolves every role menu name and chip skill name in the live taxonomy. `YOCV_LIVE_YOMA=0 npm test` skips those two when offline (POSIX shells; on Windows set the variable first).

### 🎬 Demonstrate it

YoCV, Thandi's four steps. Run `npm run seed:demo` first, so her card carries three customer vouches. The full six-minute script is in `presentation/demo-script.md`.

1. **Your Yoma record.** Choose **Thandi Mokoena**, a fictional sample account, and click **Read this account**. Tick two completions, **Hair Styling: Blow-Dry, Cut, and Colour Like a Pro** and **Customer Care Skills and Telephone Etiquette**, and their two credentials. Choose **Hairdresser** and click **Continue to your work**.
2. **Your work.** Answer the six questions for **Braiding at home** in Khayelitsha. What she did: *I braid hair at home for women in my street, mostly box braids and cornrows.* For whom: **customers**. How often: **a few times a week**, since March 2025. The number: **about 40 customers a week**. What was better: *Most of them come back every month.* Who could confirm it: **a vouch on my YoCard**. Check the contact line, which the account prefills, and click **Continue to review**.
3. **Review.** Each suggested line sits next to her words, with her number highlighted. Accept, edit or leave out every line and every skill; an edit runs the same checks. Customer Service carries **Confirmed from Yoma**, and the hairdressing skill carries **Vouched by a customer, confirmed by them, not by Yoma**. Accept the profile line and click **Continue to your CV**.
4. **Your CV.** Click **Print or save as PDF**, then **Download evidence record (HTML)**. The record keeps her answers, `stated by Thandi, not checked` after each number she typed, every suggestion and refusal, and the provider and model. Below the CV, **Learning opportunities on Yoma for this role** lists opportunities fetched live for the role.

The refused suggestion: with `YOVOUCH_SIM=1`, `/demo/cv-rejected` runs a prepared suggestion that tried "over 50" customers a week through the real checks. It is refused as `invented_number`, and the template wording is shown instead. The page says `Prepared example. Not a live call.`, because a live model will not produce an error on cue.

The draft webhook: with `YOCV_SERVICE_SECRET` set, `POST /api/cv/draft` takes the role and the interview answers, with no account, and returns checked lines, skills at S3 only and the notice `Draft. Nothing is saved until the person confirms it.` `integration/rapidpro/yocv-draft-flow.json` is a RapidPro flow skeleton that calls it, reads each line back and asks the person to reply 1 to accept or 2 to change. The flow is untested against a RapidPro instance.

YoVouch: run `npm run seed:demo`, then `YOVOUCH_SIM=1 npm start`, and open the printed `/my/<id>/<token>` links on a phone-sized window. The full six-beat script is in `presentation/demo-script.md`.

## 🔌 Integrations: real versus simulated

### What leaves the device

- YoCV, live mode: the role, the interview answers of each entry with names masked, and the titles of the ticked completions and credentials go from the server to the configured model. The person's name, phone, email and town never go, and neither do the names in the answers. Before the call, capitalised words that are not sentence-initial, not the role and not on the verb list are replaced by numbered placeholders (`[name1]`) and restored after; so are the person's own first name and surname in any case, their town and the place they typed. A phone number or an email typed into an answer is masked as well, and a line that holds one is refused.
- Lowercase names of other people are not detected. "I braid for mama joy" sends `mama joy` to the model as typed.
- YoCV, the phone number: `POST /api/cv/record` returns the account's full number to the browser only to prefill the contact line. The server's session keeps the record without it, and it is never sent to a model.
- YoCV, sample mode: nothing leaves the server except the Yoma lookups below.
- Yoma: the server calls public, unauthenticated, read-only endpoints of `api.yoma.world` for skill names, opportunity lists and opportunity details, and, only when `YOMA_ACCESS_TOKEN` is set, the holder endpoints `/user`, `/user/skills` and `/myOpportunity/search` and, for YoCV, the wallet search and credential reads under `/ssi/wallet/user`, with that bearer token. No user data is sent to Yoma. No API client or approval has been requested from Yoma for this prototype.
- YoVouch: when a transcription deployment is configured, voice clips go to the `/audio/transcriptions` endpoint. In live mode the pasted job post and the worker's spoken answer go to the model for extraction and drafting, with phone numbers masked, and the reply lines go out for translation with names replaced by `[name]`.
- Sample mode: nothing leaves the server except the Yoma lookups above.

### Real versus simulated

| Element | Status |
| --- | --- |
| CV line suggestions | Real model call when configured (Azure OpenAI, Anthropic's Claude, or any OpenAI-compatible endpoint, a local Ollama server included). The local template otherwise. The mode label, `Live AI · <model>`, `Sample mode` or `Sample mode (offline)`, is in the header and in the evidence record. |
| Provider actually tested live | Ollama on the build laptop, `qwen3.5:9b` through the OpenAI-compatible adapter, on 2026-11-19. With the shipped 20-second client deadline it timed out (`provider_timeout`) with `json_object` and with `json_schema`, because the model reasons before it answers. In a test harness with the deadline raised to 120 seconds and the reasoning turned off, it answered in 14 to 28 seconds across runs in both modes, and both of its lines for Thandi passed every check. Azure OpenAI: not run, no key. Anthropic (Claude): not run live, no key set. All three adapters (Azure, OpenAI-compatible and Anthropic) are unit-tested with an injected `fetch` (success, retry on 429/5xx and Anthropic's 529, timeout, auth errors, content filter, refusal, truncated and malformed output). The smoke test prints the provider and model it used. |
| Grounding checks | Real, server-side in `server/cv/validate.js`, and the same core checks run in the browser offline. A CV line is refused when it holds a number the person did not give (digits or words) or drops their hedge, a name or place they did not give, a phone number or an email, an inflation word or a role upgrade, a weak opening, a quote that is not in their answers, fewer than 40 or more than 180 characters, more than one sentence or an exclamation mark, or when it repeats another line. Refusals and their reasons are listed in the evidence record. When every line for an entry is refused, the template version is shown, labelled `template wording`. The person's own edit runs the same checks. |
| Skill evidence (S1 to S4) | Real methodology, in-repo. Each skill carries its sources and the strongest one's label: `Confirmed from Yoma` (a ticked completion or credential), `Vouched by a customer, confirmed by them, not by Yoma` (a live, shown YoVouch line on the person's card), `From your own account` (shown in an interview answer), `Self-stated`. A skill is never shown as confirmed on the strength of the person's own words. |
| Templates and the provider switch | Real, in-repo: the template wording, the CV paper, the text download, the evidence record and `MODEL_PROVIDER` |
| Word download | Real, in-repo: `POST /api/cv/docx` turns the CV on the page into a `.docx` with a store-only zip writer (`server/zip.js`, `server/cv/docx.js`). Nothing is stored. The button shows only while the server answers, and the photo and the optional details (date of birth, ID number, state of origin) stay in the browser and out of the file, as the page says. |
| Skill taxonomy | Real, live Yoma production API (Lightcast Open Skills). The role menu offered to the model is a checked per-role subset (`data/role-skills.json`), and the chip skills are a checked list (`data/chip-skills.json`). Neither is a Yoma role-to-skill mapping. |
| Opportunity data on completions | Real, live from `GET /opportunity/{id}/info` for the real opportunity ids the sample completions point at: the organisation on each learning line |
| Learning opportunities | Real, live Yoma production API. Relevance is a keyword phrase search by role, not Yoma's recommendation and not based on the user's profile. |
| Caching | Yoma data may be up to one hour old; responses and the UI label say "cached" when so. |
| YoCV account and its credentials | Sample. Fictional personas (`server/card/personas.json`) with sample credentials on Yoma's wallet model, unless `YOMA_ACCESS_TOKEN` is set. The CV paper carries `Sample account: fictional, for demonstration`. |
| Wallet read with a token | Implemented and unit-tested, not run live: `POST /ssi/wallet/user/search`, then each credential's detail, `Issued` ones only. When the wallet cannot be read, Step 1 shows `Wallet not available`. |
| Vouches read for skills | Real read of the YoCard card store and the YoVouch vouch store, fresh on every review and skills call. The vouches themselves are seeded for the demo with sample numbers through the simulators (`npm run seed:demo`). |
| Prepared refused suggestion | A prepared fixture (`tests/fixtures/cv-rejected.json`) run through the real checks at `/demo/cv-rejected`, only with `YOVOUCH_SIM=1`. Label: `Prepared example. Not a live call.` |
| Draft webhook and RapidPro flow | `POST /api/cv/draft` is implemented and route-tested, mounted only with `YOCV_SERVICE_SECRET`. The flow skeleton `integration/rapidpro/yocv-draft-flow.json` is untested against a RapidPro instance. |
| Azure run | Not run. No key. |
| Yoma integration pack | `integration/yoma/`: files written to Yoma's patterns, at the paths they would take in Yoma's repository. Not compiled and not run against Yoma. |
| User identity and Yoma profile | Not connected. Needs a Yoma-issued Keycloak client and user consent. |
| Verification of anything | None. Accepting a line confirms its wording, not its truth. |
| YoCard account data | Fictional sample personas by default; a real account via `YOMA_ACCESS_TOKEN` (implemented, not exercised live in this build) |
| YoCard card details from Yoma | Real, live from `GET /opportunity/{id}/info`: organisation, verification method, the opportunity's configured verification types, participant counts and page links for the real opportunity ids the personas completed. The evidence type recorded against each completion is the account's own record, not live: `server/card/personas.json` for samples, `myOpportunity` `verifications[]` in token mode |
| YoCard signature and QR | Real, generated in-repo; the signature is YoCard's, not Yoma's |
| YoVouch rotating code, validation, signed vouch records, flags, Check now re-checks, card tier, six-line reply | Real, in-repo, unit-tested with a fake clock and temp dirs |
| WhatsApp Business delivery | Simulated. Messages render in `thread.html`; nothing leaves the server. Label: `Simulated WhatsApp. No message was sent.` |
| SMS gateway | Simulated. The phone-simulator page `/demo/phone` posts to `/api/sim/sms` (only with `YOVOUCH_SIM=1`) and shows the reply. Label: `Simulated SMS. No message was sent.` |
| Voice call-back and IVR | Simulated. `/demo/ivr` shows the IVR script with keypad buttons; audio is uploaded from the browser. Label: `Simulated call-back` |
| Phone binding on the web path | Simulated. With the simulator the presenter texts `YES <session code>` from the phone-simulator page and the record stores `sms_bind`. Without it, the demo fallback shows a one-time code next to a number field and the record stores `phoneConfirmedBy: "demo"`. Nothing is ever sent. Labels: `Simulated SMS. No message was sent.` on the simulator; `Demo: no SMS gateway. In production you would text first; nothing is sent to this number.` on the fallback form; `Number typed by the voucher, not confirmed (demo)` on the line |
| Organisation key and organisation | One demo key for one fictional organisation, `Sample Skills Trust`, in `.env.example`; no real organisation's name appears on a demo referral. Label: `Demo organisation key. A real key needs Yoma.` |
| Voucher numbers | Sample numbers typed by the presenter. Label: `Sample number` |
| Voucher's account re-read (L1w Check now) | Sample-only unless the voucher is the token account. Label: the existing `simulated` |
| YoVouch extraction and reply drafting model | Template mode when no key is present. Label: `Sample mode: template extraction, no model call` |
| Transcription | Real `/audio/transcriptions` call when configured; not exercised live in this build (no key). Typed answers otherwise |

## 🪪 YoCard: a work card for informal work

Most young people on Yoma earn informally and find customers through WhatsApp and word of mouth, not CVs. YoCard (`card.html`, same server) turns what a worker already has on Yoma into one shareable card a customer can open from WhatsApp, with no app, and check against Yoma.

Flow: connect a Yoma account, describe your work in one message, review a draft split into **Confirmed from Yoma** (rendered from account data only) and **Stated by you, not checked** (AI-drafted, edited by you), choose what to disclose, consent, publish. The result is a short link, a 6-character code, an SVG/PNG card with a QR code, and a public page that works without JavaScript and has a **Check now** button that re-reads the account.

Accounts: by default YoCard uses five fictional sample personas (`server/card/personas.json`) whose completions point at real Yoma opportunities, so the organisation name, verification method, the opportunity's configured verification types, participant counts and page links on the card come live from Yoma's public API (`GET /opportunity/{id}/info`). The evidence type recorded against each completion is the account's own record: `personas.json` for the samples, the `myOpportunity` item's `verifications[]` in token mode (see the comment in `server/card/account.js`). Set `YOMA_ACCESS_TOKEN` (a bearer token, obtainable by signing in on stage.yoma.world and copying it from the browser's network tab) to read a real account instead; this path is implemented and unit-tested but was not exercised live in this build. A token only works against the API it was issued for: a token copied from stage.yoma.world needs `YOMA_API_BASE` set to the stage API base (the `https://…/api/v3` origin that stage.yoma.world's requests go to in the same network tab); the default base is production.

What the card proves, level by level:

| Level | Signal | Proves | Status |
| --- | --- | --- | --- |
| L0 | The image | Nothing. It says so and carries the card code. | Real |
| L1 | Signed record (`/c/<id>.json`, `/.well-known/jwks.json`) | The page is what the worker published, unedited since. Signed by YoCard, not by Yoma. | Real (ES256, in-repo) |
| L1c (new) | Customer vouch record `/v/<id>.json`, signed by YoCard | A person holding a phone number confirmed these exact choices and words at this time. The number label says how the number was taken. With "code matched": that person also entered the worker's rotating code within three minutes of it appearing (about four minutes on the SMS and call paths). With "code texted from their phone": a phone other than the worker's texted the session code to the shortcode, during a session opened on the worker's phone. With "by request": that person opened a link the worker sent. | Real (ES256, in-repo, `sub` is the vouch id); the phone binding is simulated or the demo fallback in this build, labelled |
| L1w (new) | Worker-to-worker vouch record, signed by YoCard | The holder of another live YoCard whose card met the eligibility rule confirmed these choices and words, with the same code or request condition. | Real; the re-read of the voucher's Yoma account is sample-only unless the voucher is the token account, labelled `simulated` |
| L1o (new) | Organisation referral record, signed by YoCard | The holder of the organisation's YoVouch key stated that this worker is referred for this named post, resting on a Yoma completion that organisation verified, and the worker accepted the sentence. | Real record; the organisation (`Sample Skills Trust`) and its key are demo, labelled |
| L2 | "Read from <name>'s Yoma account on <date>" | What Yoma's account data said at that time, with the worker's consent. Not a cryptographic verification. | Real for token accounts; sample personas otherwise |
| L3 | Check now | The account still exists, Yo-ID is still onboarded, completions are still Completed. | Real for token accounts; simulated for samples, labelled |
| L4 | WhatsApp button | The button targets only the phone Yoma confirmed by OTP. "Phone confirmed by Yoma (not an ID check)". | Real field; off by default |
| L5 | Links to yoma.world opportunity pages, live organisation data | The programme and the issuing organisation exist on Yoma, and what evidence Yoma required. | Real, live |
| L6 | Cryptographic presentation of the Yoma-issued credential | Yoma's signature, revocation status, trusted issuer | Not built; needs a didx:me verifier client and Yoma's production cutover to SD-JWT (see integration notes) |

The three YoVouch rows rest on L1 (signed by YoCard) and borrow L3 and L5 checks where they apply. Nothing new sits at L2, L4 or L6, because those levels belong to what Yoma recorded. No vouch row claims presence: a matched code proves possession of the code inside the window, and the label says so. What each new row does not prove, and what Check now re-checks:

| Level | Does not prove | Check now re-checks |
| --- | --- | --- |
| L1c | That work happened, that the person is a real customer, quality, that the two phones were in the same place | Signature, not withdrawn, not hidden, card still live, flags recomputed |
| L1w | That they worked together, that the voucher is honest | As L1c, plus the voucher's card is still live. The re-read of the voucher's Yoma account (phone still confirmed) is real only for the one account a `YOMA_ACCESS_TOKEN` can read; for every other voucher the signal is sample-only and carries the existing `simulated` label |
| L1o | That Yoma endorses the referral, that the worker will be hired | The completion is still Completed on the worker's account (L3), the opportunity is still published on Yoma (L5), referral not withdrawn and not expired |

Every vouch tier label contains `confirmed by them, not by Yoma`. Design: `docs/superpowers/specs/2026-11-16-yovouch-design.md`; plan: `docs/superpowers/plans/2026-11-16-yovouch.md`.

YoVouch notes:

- Clips are stored exactly as the browser recorded them, with no transcoding: WebM/Opus on Android Chrome, MP4/AAC on Safari and iOS. iOS clips are AAC and larger, about 60 KB for 15 seconds against about 30 KB on Android. Each clip link on the card shows its size.
- WhatsApp shows a text-only link preview (the title and description) for a card link, because `og:image` points at the SVG share image and WhatsApp does not render SVG previews. A PNG render needs a rasteriser the repo does not have.
- Prepare the demo with `node scripts/seed-demo.js` (and `--old-code` five minutes before beat 2); count the pilot with `node scripts/measure.js data/cards`. See `presentation/demo-script.md`, `docs/measurement-plan.md`, `docs/pilot-plan.md` and `docs/pilot-consent.md`.

Safety rules built in: adults only (self-declared date of birth under 18 is refused), phone shown as last three digits, WhatsApp off by default, no date of birth or email in any record, "Never pay before the work is done" on the card page and in the YoCard flow, "Who can see this: anyone with the link" on every YoCard and YoVouch page, one-tap withdraw with an owner secret.

## 📐 Source layout

- `index.html`, `styles.css`, `app.js`: buildless frontend; the four steps (Yoma record, work interview and contact, review, CV), downloads, the Yoma learning opportunities, mode states and the offline start
- `core.js`: masking and restoring names, the CV line checks, the template line, the profile line, the CV paper, the text download and the evidence record, review decisions and the offline review (shared by browser and server; it never reads `cv-rules.js` or `cv-copy.js` when it loads)
- `cv-rules.js`: the lists the checks run against, each once: the opening verbs, the inflation words and the role upgrades (loaded by the browser and by `server/cv/validate.js`)
- `cv-copy.js`: the YoCV copy catalogue, English only, a plain object a translation can extend (loaded by the browser and by `server/cv/copy.js`)
- `server.js`: HTTP server, static allowlist, routes `GET /api/status` and `GET /api/yoma/opportunities`; mounts `server/cv/routes.js` and `server/card/routes.js`
- `server/cv/`: the YoCV server side. `routes.js`: `GET /api/cv/config|menu`, `POST /api/cv/record|review|check|skills|docx`, `POST /api/cv/draft` (only with `YOCV_SERVICE_SECRET`) and `/demo/cv-rejected` (only with `YOVOUCH_SIM=1`); in-memory sessions, 30 minutes from their last use. `record.js`: the Yoma record (completions, wallet credentials, self-added skills). `draft.js`: mask, provider call, restore, check, template fallback. `validate.js`: the CV line and profile checks. `skills.js`: the evidence levels S1 to S4 and the vouch read. `menu.js`: the role menu checked against Yoma's taxonomy. `copy.js`: server access to the catalogue
- `server/config.js`, `server/env.js`: configuration from `.env` and the environment
- `server/providers/`: model adapters (`azure-openai.js`, `anthropic.js`, `openai-compatible.js`, `local.js`), strict JSON schema and prompt (`schema.js`)
- `server/validate.js`: the shared grounding validators (YoCard, YoVouch and the CV checks reuse them unchanged)
- `server/yoma.js`: Yoma public API client with a TTL cache
- `data/role-skills.json`: Yoma skill names and opportunity queries per role (checked 2026-11-12)
- `data/chip-skills.json`: the Yoma skill names each YoVouch chip supports, per trade, for the vouch source of a skill
- `integration/yoma/`: the Yoma integration pack (API side and web side, and the work epic), files at the paths they would take in Yoma's repository; start at `integration/yoma/README.md`. `integration/rapidpro/yocv-draft-flow.json`: the RapidPro flow skeleton for the draft webhook
- `card.html`, `card.js`, `card.css`: YoCard worker flow (connect, describe, review, publish, share)
- `server/card/`: account sources and personas, draft pipeline, signing, store, public page renderer, routes (`routes.js`, mounted by `server.js`): `GET /api/card/status`, `POST /api/card/account|draft|publish`, `POST /api/card/:id/check|withdraw`, `GET /c/:id[.svg|.json]`, `POST /c/:id/check`, `GET /.well-known/jwks.json`
- `server/card/` YoVouch modules, wired by `buildVouchSystem` in `vouch-system.js` and delegated from `routes.js`:
  - `vouchcode.js`: rotating code (90-second step, HOTP over HMAC-SHA256, QR tag), window checks, single use, the spoken lock and the per-sender cap
  - `vouchers.js`: phone normalisation to E.164, keyed hashes and voucher files (caps, binds, wrong codes)
  - `vouches.js`: vouch store, `.hashkey.json`, held words and clip, withdraw now and quiet, hide and show
  - `vouch-lines.js`: lines and labels built by code from chips and released words
  - `vouch-sessions.js`, `vouch-service.js`: vouch sessions and the one open step that consumes a code
  - `flags.js`: reciprocal, ring and burst flags, recomputed on confirm and Check now
  - `orgs.js`, `requests.js`: demo organisation keys (hash only) and single-use request links
  - `reply.js`: listing parser with the two-grade fee detector, extraction, the six-line reply, translation with back-translation
  - `transcribe.js`: `/audio/transcriptions` adapter with the derived confidence; typed text in template mode
  - `sms.js`, `wa.js`, `outbox.js`: SMS and WhatsApp handlers and the outbox that only answers a number that wrote first
  - `pages.js`, `copy.js`: server-rendered flow pages and the copy catalogue (`data/yovouch-copy.json`, `data/vouch-chips.json`)
  - `vouch-routes.js`, `reply-routes.js`: `/my/`, `/s/`, `/v/`, `/a/`, `/o/`, `/r/`, `/api/vouch/`, `/api/request/`, `/api/reply/`, `/api/refer/`, `/api/sms/`, `/api/wa/`, `/api/sim/`, `/demo/` and `/qr-browser.js`
  - `events.js`, `sweep.js`: `events.jsonl` (ids, event type, channel and method, and timestamps; no numbers or names, and `log()` refuses phone-like values and the keys `phone`, `from` and `name`) and the hourly retention sweep
- `thread.html`, `thread.js`: the simulated WhatsApp thread (works only against `/api/sim/wa`)
- `scripts/seed-demo.js`: prepared demo cards, vouches, ring, referral, inbox reply and beat 3 extraction; `scripts/measure.js`: the pilot counts and the end-of-pilot clip deletion
- `server/qr.js`: QR encoder (ISO 18004 byte mode, versions 1 to 10) with SVG output, written in-repo
- `data/cards/`: published cards and the signing key (git-ignored)
- `tests/`: `node --test` suites; `tests/fixtures/` holds the Thandi entry and the prepared refused suggestion; `tests/live.test.cjs` holds two model smoke tests (skipped without a model key) and two Yoma tests that call `YOMA_API_BASE` on every run (`YOCV_LIVE_YOMA=0` skips them offline)
- `docs/`: design specs, implementation plans, testing log, YoVouch measurement plan, pilot plan and pilot consent text
- `presentation/`: demo script and Yoma integration notes

## ♿ Accessibility, mobile and connectivity

Built in:

- Both pages set `lang="en"` and a viewport meta, start with a skip link to `#main`, announce toasts and busy text in an `aria-live="polite"` region, and expose the mode label as a `role="status"` live region; the error block is focusable and takes focus when a request fails.
- `:focus-visible` outlines on controls; animations respect `prefers-reduced-motion`.
- 44 px minimum targets on primary, secondary, header, step and disclosure controls; 14 px minimum text size on screen (print keeps smaller sizes); every text and background pair at 4.76:1 contrast or better; no horizontal overflow at 360 px (checked at 360 px, 375 px and 1280 px on 15 November 2026).
- Look: both apps and the public card page use Yoma's design language as measured on yoma.world on 15 November 2026 (purple `#41204b`, green `#387f6a`, orange `#f9ab3e`, page grey `#f3f6fa`, Nunito headings, Open Sans body, pill buttons, 16 px white cards without borders or shadows, a purple page band holding the step line and heading). The fonts come from Google Fonts through one stylesheet link; without it the pages render in the system font with the same layout. No Yoma logo is used; the "A Yoma concept" tag stays on both apps and the "Not operated by Yoma or UNICEF" label stays on YoCard, YoVouch and the public card page. Design and plan: `docs/superpowers/specs/2026-11-15-yoma-family-look-design.md`.
- Connectivity: YoCV keeps working in the browser when the server is unreachable (sample mode, offline, labelled). The Yoma record in Step 1 needs the server; offline, the app says so and asks for the role in a plain field. YoCard shows a retryable "The YoCard server could not be reached" error and sets the mode label to offline. Every YoCard draft and publish request, and every YoCV request to the server (record, review, check, skills, Word file), has a 30 s client-side deadline that ends in a retryable "did not answer in time" error; on the YoCV review step a Retry button follows it. A YoCV review the page has moved on from (Back, or a changed answer) is cancelled, and the server keeps only the newest review of a session.
- The public card page is server-rendered, about 8 KB plus one Google Fonts stylesheet (system fonts without it), and works without JavaScript (the Check now form posts to `/c/:id/check`; the inline script only enhances it).

Not yet done: no VoiceOver or TalkBack pass; the Accept, Edit and Leave out buttons on the YoCV review step and the question buttons in Step 2 are 36 px and the tags are 29 px, all below the 44 px target; no translation (English only).

## ⚠️ Known limitations

- The live model path was exercised only against Ollama on the build laptop, and only in a test harness with a longer deadline (see the table above). No Azure run.
- A model that reasons before it answers does not fit the 20-second client deadline on a laptop. The deadline is not configurable in this build.
- Opportunity matches are keyword searches; "retail" alone surfaces loosely related courses, so the retail role searches "customer service" first.
- Skills the model proposes are limited to the per-role menu; an answer about cooking for a retail role will not get a cooking skill.
- Lowercase names of other people in an answer are not masked before the model call.
- Generation is English-only. Text in another language passes through the local rules unchanged and, in live mode, depends on the model.
- Azure's content filter and refusals are surfaced as a non-retryable error, not explained in detail to the user.
- No analytics. YoCV keeps no data. YoCard stores published cards and the ES256 signing key as JSON files under `data/cards/` (git-ignored, single host, no database); accounts are fictional sample personas unless `YOMA_ACCESS_TOKEN` is set, and there is no Yoma sign-in flow.

## 📖 Other documentation

- [Contributing](CONTRIBUTING.md), [Security](SECURITY.md), [AGENTS.md](AGENTS.md)
- [Testing log](docs/testing-log.md): what was run by hand, and what was not
- [YoVouch design](docs/superpowers/specs/2026-11-16-yovouch-design.md) and [plan](docs/superpowers/plans/2026-11-16-yovouch.md)
- [YoCV credential CV design](docs/superpowers/specs/2026-11-19-yocv-credential-cv-design.md) and [plan](docs/superpowers/plans/2026-11-19-yocv-credential-cv.md); the [Yoma integration pack](integration/yoma/README.md)
- [YoCard design](docs/superpowers/specs/2026-11-12-yocard-informal-work-card-design.md), [YoCV live AI and Yoma data design](docs/superpowers/specs/2026-11-12-yocv-live-ai-yoma-data-design.md), [Yoma family look](docs/superpowers/specs/2026-11-15-yoma-family-look-design.md)
- [Measurement plan](docs/measurement-plan.md), [pilot plan](docs/pilot-plan.md), [pilot consent text](docs/pilot-consent.md)
- [Demo script](presentation/demo-script.md) and [Yoma integration notes](presentation/integration-notes.md)
- Research briefs: [hiring evidence](docs/research/2026-11-16-hiring-evidence.md), [phone habits in informal work](docs/research/2026-11-16-informal-work-phone-habits.md)

## 📄 License

[MIT](LICENSE). This prototype is not endorsed by UNICEF or Yoma. Platform reference: [didx-xyz/yoma](https://github.com/didx-xyz/yoma) (GPL-3.0; no code copied, public API called only).
