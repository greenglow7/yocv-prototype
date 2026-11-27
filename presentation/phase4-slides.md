# Phase 4 (Workforce, YoCV): draft slide text

Draft text for Nathan's slides in the final GenU deck. It goes into Charisse's master template when that exists. Lines marked **To confirm** wait on the team or on GenU. Figures come from `handover/cost-estimate.md`, which is generated from the code. Names, ids and the story follow the team's shared mock data (2026-11-25): Halima Yusuf, 20, in Kaduna.

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

**In the story:** Halima builds a CV from her verified credentials and her self-declared phone repair work, makes a QR check, and applies to the Solar Installation Assistant (Trainee) job at Sunrise Solar Ltd that she saved in Phase 1.

**What arrives from Phase 3 (SkillLens):** the **Skill Credential** `cred-002`, "Solar PV Basics: practical challenge passed". Step 1 and the Passport tab show it tagged "Skill Credential, from SkillLens", and the CV lists it under **Confirmed from Yoma**.

**What Phase 4 hands on:** the **Job Application** `app-001` to `opp-job-001`, the Saved Opportunity from Phase 1. Step 4 ends with **Apply to Solar Installation Assistant (Trainee)**, which sends the CV and its check link (a mock-up: nothing is sent). The listing and the handoff names sit in one file, `data/journey.json`.

**YoID thread:** the CV check and the Job Application are recorded on Halima's YoID, `yoid-ng-7f3a0123`. Step 4 shows this as an **On your Yo-ID** list, a mocked write labelled "Designed, not written to Yoma". She can already withdraw a check: the employer's scan then says it was withdrawn.

**Built for the phone, with Liquid Thought in mind:** an informal employer rarely gets a printed CV, so **Show it on my phone** puts the QR full screen on Halima's phone and the employer scans it with theirs. A real phone scan passed over Wi-Fi. Each YoCV piece maps onto a YoID mobile wallet: the CV check becomes a shared credential, and withdrawing it becomes revoking the share. **To confirm:** the Liquid Thought prototype link and its share format.

## Slide 2: Cost & Handover

### Cost estimate

- **One run** is one CV: three model calls, one per piece of work. The QR check, the skill labels and the line checks make no model call.
- **Per call:** about 760 input tokens and 150 visible output tokens. Thinking at effort `low` adds an assumed 0 to 1,000 output tokens.
- **Cost per CV:**
  - Claude Opus 5.5: $0.02 to $0.08
  - Claude Sonnet 5.5: about $0.01 to $0.04
  - Claude Haiku 5.5: about $0.0005 to $0.002
  - A locally hosted open model: no token cost
- **Monthly, at 10,000 CVs:**
  - Opus 5.5: about $780
  - Sonnet 5.5: about $390
  - Haiku 5.5: about $20

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

Nathan owns this slide. The examples come from the team's shared mock data, so every idea shows the same people and ids. Each owner still replaces the one-sentence idea and the cost of not having it with the text from their own slides.

| Idea | For | The idea in one sentence | Today, without it | Owner |
| --- | --- | --- | --- | --- |
| AI review of submitted proof | GenU operations | A confidence score on photos, locations and certificates submitted as proof, flagging duplicates and AI-made images. Example: four proofs for the Community Tree Planting Day; Halima's passes (0.93), and a reused photo, an AI-looking image and a mismatched certificate go to a reviewer. | Every proof is checked by hand. **To confirm:** Charisse's figure. | Charisse |
| AI co-author in the partner portal | Partners | Drafts a full opportunity listing from a short description. Example: Arewa Tech Hub's one-line note becomes the full listing for the Kaduna Youth Green Jobs Fair. | Partners write each listing by hand. **To confirm:** Jongmin's figure. | Jongmin |
| Talent Finder | Partners and employers | Partners search an anonymised pool of verified young people and notify the ones who match; the young person decides whether to share their CV. Example: "young women 18 to 24, digital skills, Kaduna" gives 214 matches; Halima is A12. | Partners source candidates by hand, outside Yoma. See `docs/new-ideas/talent-finder-brief.md`. | Nathan |
| RoleMap, employer role definition | Employers | Helps an employer set out the real skills and tasks a role needs, then matches talent to it. Example: Sunrise Solar's description becomes a list of tasks and 38 matches, against 9 before the diploma requirement was dropped; Halima is A12. | Generic job descriptions that match poorly. **To confirm:** Anagha's figure. | Anagha |

**The thread:** all four ideas read from or write to the same YoID record, Halima's `yoid-ng-7f3a0123`. That record is what the four prototypes build up across the journey, through the four handoffs: Saved Opportunity, Learning Plan, Skill Credential and Job Application.
