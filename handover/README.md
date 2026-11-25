# YoCV handover package

For GenU's team. This folder is the place to start. It says what you are getting, how to run it, what is real and what is not, and what it would take to bring YoCV into Yoma. The main [README](../README.md) has the full detail behind each section.

YoCV is Phase 4 (Workforce) of the four-phase journey. It turns what a young person has on Yoma, plus their own words, into a first CV. Every line on the CV carries a label that says who confirmed it. An informal employer can scan a QR code on the CV to check those labels.

This is a student prototype. It is not a Yoma or UNICEF product, and it is not production code.

## What is in this folder

| File | What it is |
| --- | --- |
| [prompts/](prompts/) | Every prompt the repo sends to a model, with a sample input and the output schema. `yocv-cv-bullets.md` is the YoCV one; the others are YoCard and YoVouch. |
| [rubrics/cv-line-checks.md](rubrics/cv-line-checks.md) | When a suggested CV line is refused, the skill evidence levels S1 to S4, and what the checks do not catch. |
| [test-cases/cv-lines.json](test-cases/cv-lines.json) | One CV line per rule, with the outcome the checks must give. `npm test` runs them. |
| [cost-estimate.md](cost-estimate.md) | Tokens per call, cost per CV for three Claude models and a local model, and the assumptions to confirm. |

The prompts and the cost estimate are generated from the code by `npm run handover`. If you change a prompt in the code, run the script. `npm test` fails while a file is out of date.

## Run it

You need Node 20 or newer. There are no packages to install and no build step.

```sh
git clone https://github.com/greenglow7/yocv-prototype.git
cd yocv-prototype
npm start
```

Open `http://127.0.0.1:4173`. It opens signed in as Thandi, a fictional sample person. With no keys it runs in sample mode: CV lines come from templates, and Yoma data is still read live from Yoma's public API.

- **Live AI.** Copy `.env.example` to `.env` and set `MODEL_PROVIDER` with its key. Claude, Azure OpenAI and any OpenAI-compatible endpoint work, a locally hosted model through Ollama included. The [main README](../README.md), section Development Setup, has the three configurations side by side.
- **The demo pages.** Run `npm run seed:demo`, then start with `YOVOUCH_SIM=1`. The script is [presentation/demo-script.md](../presentation/demo-script.md).
- **Scan the QR from a phone.** Start with `HOST=0.0.0.0` and `YOCARD_PUBLIC_URL=http://<your LAN IP>:4173`, then make the QR.
- **Tests.** `npm test`. Two model tests are skipped without a key. `YOCV_LIVE_YOMA=0 npm test` also skips the two Yoma tests when you are offline.

No keys or secrets are in the repo. `.env` and `data/cards/` (the signing key and stored cards) are git-ignored.

## What is live, what is rule-based, what is mocked

| | YoCV part |
| --- | --- |
| **Live** | Yoma's public API: skill names (Lightcast), opportunity details on each completion, and learning opportunities for the role. The model call for CV lines, when a key is set. Claude and Azure are unit-tested against a fake API only; the one live model run was a local Ollama model on 2026-11-19. |
| **Rule-based** | Everything that decides what is true. The checks on every CV line (`rubrics/cv-line-checks.md`), the name and contact masking before a model call, the skill levels S1 to S4, the template lines, the CV paper, the Word file, the evidence record, and the signed QR check with its 90-day expiry. All of it runs in this repo with no model. |
| **Mocked** | The Yoma account: six fictional people with sample completions and credentials, unless `YOMA_ACCESS_TOKEN` is set (implemented, not run live). The vouches, seeded through simulated SMS and WhatsApp. The Yo-ID shell around YoCV, which follows Yoma's look but is not Yoma's code. No write to YoID happens. |

The full table, YoCard and YoVouch included, is in the main README under [Real versus simulated](../README.md#real-versus-simulated).

## Known limitations

- **Model runs.** No live run of Claude or Azure yet. A model that reasons before it answers can miss the 20-second deadline on a laptop.
- **First person.** The prompt asks for no first person, but no check enforces it.
- **Names.** Lowercase names of other people are not masked before the model call.
- **Language.** English only.
- **The QR check.** It cannot be withdrawn early, is not in the Word file, does not re-read Yoma when scanned, and is not written to YoID.
- **No real sign-in.** There is no Yoma sign-in flow. A real account needs a Yoma-issued client and the person's consent.
- **Storage.** Single host, JSON files, no database.
- **Accessibility.** Some buttons are below the 44 px touch target. No screen reader pass yet.

## How it would come into GenU's systems

1. **The CV service in Yoma's API.** [integration/yoma/](../integration/yoma/README.md) is a C# pack laid out at the paths it would take in Yoma's repository. It has the model client behind an interface, the CV service with the checks ported, a controller and tests. It reads only from Yoma's existing services and adds no table. It has not been compiled. Next: the Yoma API owner compiles it, runs the tests and reviews the role skill menus.
2. **The screens in Yo-ID.** The four steps are plain HTML and JavaScript. They would be rebuilt in Yoma's web app on the team's shared design kit, and combined with the Liquid Thought YoID mobile sharing prototype. The CV and its QR would sit beside the public share link.
3. **The QR check.** Today it is signed with YoCard's key. In Yoma it would be signed with Yoma's key and written to the person's YoID, so the person can see and withdraw it.
4. **WhatsApp.** `POST /api/cv/draft` and [integration/rapidpro/yocv-draft-flow.json](../integration/rapidpro/yocv-draft-flow.json) let a RapidPro flow draft CV lines in a chat. The flow is untested against a RapidPro instance.

**Still missing before a pilot:**
- one logged live model run, with its real token count
- the Yoma sign-in client and consent text
- YoID writes for the CV check and its withdrawal
- the shared design kit
- a screen reader pass
- a translation of the copy

The [pilot plan](../docs/pilot-plan.md) and [measurement plan](../docs/measurement-plan.md) say how a first pilot would be run and judged.

**Suggested order:** compile and test the C# pack, do one live run with GenU's chosen model, add the YoID write for the QR check, then move the screens onto the shared kit.
