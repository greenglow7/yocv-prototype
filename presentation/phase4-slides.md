# Phase 4 (Workforce, YoCV): draft slide text

Draft text for Nathan's slides in the final GenU deck. It goes into Charisse's master template when that exists. Lines marked **To confirm** wait on the team or on GenU. Figures come from `handover/cost-estimate.md`, which is generated from the code.

## Midterm recap: YoCV before and after

For Jongmin's "What We Changed" slide. Each row is tied to a feedback point. The feedback wording should be checked against GenU's consolidated feedback doc, which we have not seen yet.

| Feedback point | Before (midterm) | After (final) |
| --- | --- | --- |
| Start from what Yoma already knows | The person typed everything. A sample story with synthetic credentials. | Step 1 reads the Yoma record: completions, wallet credentials and skills. The person ticks what goes on the CV. |
| Use AI, but keep it honest | Local templates only, no model. | A model drafts each CV line from the person's own answers. Every line is re-checked in code and read back by the person. A refused line never reaches the CV. |
| Keep verified and self-declared apart | One list of claims, accepted one by one. | Every skill carries a label: Confirmed from Yoma, Vouched (confirmed by them, not by Yoma), From your own account, or Self-stated. |
| Let GenU choose and host the model | No model. | One setting picks Claude, Azure OpenAI or a locally hosted open model. |
| Show how it fits Yoma | A standalone page. | YoCV sits inside a Yo-ID dashboard, and a C# pack is laid out at the paths it would take in Yoma's code. |
| Let an employer check the CV | Nothing to check. | A QR code on the CV opens a signed employer check, grouped by who confirmed each line. |

**Time and cost of not having it** (the new rubric criterion): see the Cost & Handover slide below.

## Slide 1: Roadmap

**Phase 4 one-liner:** YoCV turns what a young person did on Yoma, and in their own words, into a first CV an employer can check by scanning a QR code.

**What arrives from Phase 3 (SkillLens):** a skill credential on the person's YoID. YoCV shows it as **Confirmed from Yoma**. **To confirm:** the handoff item's name, so it reads the same on Charisse's slide and this one.

**What Phase 4 hands on:** the CV and its QR check, used to apply to the listing found in Phase 1. Step 4 now ends with an **Apply to** card for that listing, which sends the CV and its check link (a mock-up: nothing is sent). **To confirm:** the shared listing from Jongmin's mock data, so the apply screen names the same listing. It is one file, `data/journey.json`.

**YoID thread:** the CV check and the application are recorded on the person's YoID. Step 4 shows this as an **On your Yo-ID** list, a mocked write labelled "Designed, not written to Yoma". The person can already withdraw a check: the employer's scan then says it was withdrawn.

## Slide 2: Cost & Handover

### Cost estimate

- **One run** is one CV: three model calls, one per piece of work. The QR check, the skill labels and the line checks make no model call.
- **Per call:** about 740 input tokens and 150 visible output tokens. Thinking at effort `low` adds an assumed 0 to 1,000 output tokens.
- **Cost per CV:**
  - Claude Opus 5.5: $0.02 to $0.08
  - Claude Sonnet 5.5: about $0.01 to $0.04
  - Claude Haiku 5.5: under $0.002
  - A locally hosted open model: no token cost
- **Monthly, at 10,000 CVs:**
  - Opus 5.5: about $780
  - Sonnet 5.5: about $390
  - Haiku 5.5: about $19

  **To confirm:** GenU's real monthly scale, and the cost method the team agrees on.

### Cost of not having it

The figures below are **assumptions, to confirm with GenU**:

- **Writing the CV.** A youth worker or career adviser helps a young person write a first CV. That takes about 45 minutes per CV. At 10,000 CVs a month, that is 7,500 staff hours a month. With YoCV, the person does it alone in about 10 minutes.
- **Checking the CV.** An informal employer cannot check a CV today. They phone a reference, about 15 minutes per candidate, or they hire on trust. With YoCV they scan the QR code in under a minute.
- **Young people without a CV.** Many young people never get a CV written at all. Those who do not get one miss out on the applications that ask for one. We have no figure for this.

### What is live, rule-based and mocked

- **Live:** Yoma's public API, and the model call when a key is set. The one live model run so far was on a local open model.
- **Rule-based:** everything that decides what is true. That covers the line checks, the masking, the skill labels, the signed QR check and its withdrawal, the CV paper and the Word file.
- **Mocked:** the Yoma accounts, which are fictional people; the vouches, sent through simulated SMS and WhatsApp; the application to the listing; and the YoID write.

### Handover

1. The Yoma API owner compiles and tests the C# pack in `integration/yoma/`.
2. Do one live run with GenU's chosen model, and log its real token count.
3. Sign the QR check with Yoma's key and write it to YoID.
4. Rebuild the four screens on the shared design kit, next to the Liquid Thought YoID sharing screen.

**Still missing:**
- the Yoma sign-in client and consent text
- a screen reader pass
- translation

Everything else is in `handover/README.md`.

## Closing slide: the four new ideas

Nathan owns this slide. The rows for the other three ideas are drafts from the brief. Each owner replaces theirs with the one-sentence idea and the cost of not having it from their own slides.

| Idea | For | The idea in one sentence | Today, without it | Owner |
| --- | --- | --- | --- | --- |
| AI review of submitted proof | GenU operations | A confidence score on photos, locations and certificates submitted as proof, flagging duplicates and AI-made images. | Every proof is checked by hand. **To confirm:** Charisse's figure. | Charisse |
| AI co-author in the partner portal | Partners | Drafts a full opportunity listing from a short description. | Partners write each listing by hand. **To confirm:** Jongmin's figure. | Jongmin |
| Talent Finder | Partners and employers | Partners search an anonymised pool of verified young people and notify the ones who match; the young person decides whether to share their CV. | Partners source candidates by hand, outside Yoma. See `docs/new-ideas/talent-finder-brief.md`. | Nathan |
| Employer role definition tool | Employers | Helps an employer set out the real skills and tasks a role needs, then matches talent to it. | Generic job descriptions that match poorly. **To confirm:** Anagha's figure. | Anagha |

**The thread:** all four ideas read from or write to the same YoID record. That record is what the four prototypes build up across the journey.
