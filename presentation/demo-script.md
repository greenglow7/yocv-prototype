# YoCV — three-minute live demonstration

Before presenting, open the prototype on the role-selection screen. Keep the overview slide available. Use “Try Amina’s story” to load a fictional profile with five suggested claims. All credentials and documents in this route are synthetic.

## 0:00–0:25 — The problem

**Show:** the role-selection screen.

**Say:** “A young person may have real experience from a family business, volunteering or caregiving, but struggle to put it on a first CV. YoCV helps them describe those responsibilities and review how they appear. The proposed added value is making the source of each claim understandable.”

## 0:25–0:55 — The person and the role

**Do:** click **Try Amina’s story**, keep **Retail assistant**, then click **Build my CV**. Point to the responsibilities and editable profile. Click **Add supporting evidence**.

**Say:** “Amina is fictional. She helped customers in her aunt’s shop, packed orders and organised shelves. She chooses a retail role and describes real tasks in ordinary language. She can edit her name and contact details. The conversation focuses on responsibilities rather than requiring a formal job title.”

## 0:55–1:20 — The evidence categories

**Show:** the self-reported experience, synthetic course credential and synthetic reference letter.

**Say:** “The prototype separates three kinds of source. A self-report is Amina’s account. A document awaiting verification has been supplied but not checked. An issued credential would support specific facts, such as course completion. This credential is synthetic, and completion alone would not prove workplace proficiency.”

**Do:** click **Create my draft**.

## 1:20–2:10 — The distinguishing interaction

**Do:** accept the first experience claim. Edit the second to **“Packed customer orders and kept the shop shelves organised.”** Click **Save & accept**. Accept the suggested communication skill and the synthetic learning claim. Reject the community clean-up claim, explaining that it is not relevant to the CV being demonstrated. Scroll as needed.

**Say:** “Every suggestion needs a decision. Amina can accept, edit or reject it. The source remains visible alongside the wording. Approving a sentence does not independently verify it. If she edits a credential-based sentence, the new wording becomes self-reported and the original credential stays in the evidence record. Nothing unresolved can reach the final export.”

## 2:10–2:40 — The output

**Do:** click **Preview my CV**. Show the edited wording and the absence of the rejected clean-up claim. Open **View the demonstration evidence record**. If time permits, click **Download text CV** or **Download evidence record**.

**Say:** “The CV includes only accepted claims. The separate evidence record retains the original statements, sources, edits and decisions, including rejected claims. Amina can download a text CV or use the browser’s print dialog to save a PDF.”

## 2:40–3:00 — Feasibility and next test

**Say:** “Yoma’s Yo-ID already has a CV placeholder, which is a proposed entry point. This standalone app has working review and exports. Suggestions use local templates, not a live AI call, and all credentials are synthetic. Next steps are connecting the existing profile and credential services, adding a server-side model, and testing whether users and reviewers understand what each claim establishes.”

## Short answers for questions

- **Is this already integrated with Yoma?** No. It is a standalone prototype informed by Devin-Fitzpatrick06/yoma. The platform APIs and authentication would need to be connected and approved.
- **Is the generator live AI?** No. This delivered version uses local rules and templates. It demonstrates the proposed AI-assisted workflow. It should not be described as a live model. This is the main limitation relative to an AI proof of concept.
- **Does the file picker read a certificate?** No. It records the filename and the user’s supporting statement. It does not upload, extract, authenticate or verify a file.
- **Does “accepted” mean “verified”?** No. It means the user approved the wording.
- **How is this different from another CV writer?** The proposed additional value is the source-linked review workflow and the distinction between issuer evidence and user confirmation. No claim of superiority over Compass has been measured.
- **What should a pilot measure?** Accuracy against supplied facts, understanding of evidence categories, successful completion and perceived usefulness. These outcomes have not yet been measured.

If the network fails, use the local app folder. The app itself works without a network connection, with system fonts as the fallback. The supplied sample PDF and screenshots are backup presentation materials.
