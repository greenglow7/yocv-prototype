# Prompt: design YoVouch, an in-person vouching system for informal work

Paste everything below this line into an AI design assistant (or give it to Claude Code in this repo). It asks for a complete system design, not code.

---

## Your role

You are a senior product and systems designer working with a student consultant on a concept for Yoma (yoma.world), the youth opportunity platform backed by Generation Unlimited and UNICEF. Produce a complete, buildable system design for a new feature family called **YoVouch**. Write it as a design document a talented builder could plan from without coming back to us. Ground every design decision in the evidence and constraints below; where you go beyond them, say so and mark it as your call.

## What already exists (read it first)

The repository holds two buildless prototypes (vanilla HTML, CSS, JavaScript, Node 20 built-ins, no npm packages):

- **YoCV** (`index.html`, `app.js`, `server/generation.js`, `server/validate.js`): turns a plain description of informal experience into a reviewed CV. Its core safety rule is grounding: the server rejects any sentence, number or credential that is not supported by the user's own words. Keep this rule everywhere.
- **YoCard** (`card.html`, `card.js`, `server/card/*`): an informal-work trust card. The worker's Yoma account is read, the draft is split into two tiers, **Confirmed from Yoma** (rendered from account data only) and **Stated by you, not checked** (AI-drafted, edited by the worker), the worker chooses what to disclose, consents, and publishes. Output: a short link, a 6-character code, an SVG/PNG card with a QR code (`server/qr.js`, written in-repo), a public page under 8 KB that works without JavaScript, a signed JSON record (ES256, `/c/<id>.json`, `/.well-known/jwks.json`), a **Check now** button that re-reads the account, and one-tap withdraw with an owner secret.
- Trust levels already defined in `README.md`: L1 signed record (signed by YoCard, not Yoma), L3 Check now, L4 phone confirmed by Yoma, L6 cryptographic credential presentation (not built). Fit YoVouch into this ladder rather than inventing a parallel one.
- Honesty strings that must survive unchanged: "Never pay before the work is done", "Who can see this: anyone with the link", "Not operated by Yoma or UNICEF", "signed by YoCard, not by Yoma". The system must never say "verified by Yoma" about anything Yoma did not itself record.
- Design language: Yoma family look (purple `#41204b`, green `#387f6a`, orange `#f9ab3e`, Nunito headings, Open Sans body, pill buttons, 16 px white cards). See `docs/superpowers/specs/2026-11-15-yoma-family-look-design.md`.
- Existing specs to stay consistent with: `docs/superpowers/specs/2026-11-12-yocard-informal-work-card-design.md` and `2026-11-12-yocv-live-ai-yoma-data-design.md`.

## Who this is for

Adults and young adults in very informal work in South Africa, Kenya and Nigeria: home hairdressing, car washing, roadside piece jobs, domestic work, construction day labour, street vending, spaza shops, boda and taxi, cart transport. They own a cheap Android or a feature phone and use it mainly to call and text friends on WhatsApp. Facts to design against (sources in `docs/research/2026-11-16-informal-work-phone-habits.md` and `docs/research/2026-11-16-hiring-evidence.md`):

- About half of traders and manual workers, and under a fifth of adults with no schooling, own a smartphone (Afrobarometer 2025). Kenya still has roughly 30 million active feature phones; a third or more of Nigerian lines are 2G. South Africa is the one market where WhatsApp-first is safe.
- Among people online, WhatsApp is near universal, voice notes are the daily habit for low-literacy and non-English speakers, and jobs circulate as forwards in hundreds of WhatsApp job groups mixed with scams.
- Data is bought by the hour. Every interaction must cost a few kilobytes, and every flow must have an SMS or voice-call fallback.
- Work is found by word of mouth: friends, past customers, a current worker's say-so, standing at a roadside hiring site. Small employers can test hand skills at the door; what they cannot see is reliability.

## The evidence the design must act on

| Mechanism | Evidence | Source |
|---|---|---|
| One standardised reference letter attached to an application | Employer callbacks up 61%; women's employment up 13 points. Telling job seekers that references matter raised take-up where cash did not | Abel, Burger and Piraino, AEJ Applied 2020 |
| A skill certificate the employer can see | Employment 31% to 36%, earnings up 34%. The same result given only to the worker did nothing | Carranza, Garlick, Orkin and Rankin, AER 2022 |
| Soft-skills certificate shown to small employers | Managers updated beliefs; better matches and higher pay | Bassi and Nansamba, Economic Journal 2022 |
| One customer comment on a work platform | 13 times more requests; only 15% of workers ever got one | Biscate, Mozambique, World Bank 2021 |
| An institution refers a named worker to a named employer | Unemployment down 10 points, earnings up 37%; training alone did nothing | Atkin, Schoar and Wahnschafft, Nairobi 2021 |
| Lower application cost | Shifts who applies toward women and the inexperienced, who turn out to be good hires | Abebe, Caria and Ortiz-Ospina, AER 2021 |
| Open marketplaces with ratings | Newcomers with zero ratings never got a first job (Lynk v1); ratings polluted by people never served (Biscate); SweepSouth seeds new cleaners with free five-star ratings | Lynk, Biscate, SweepSouth case studies |

The lesson: a trusted third party must vouch for what the employer cannot see, the vouch must reach a specific employer at the moment of hiring, and newcomers need a way in that does not depend on already having ratings.

## The concept to design

YoVouch adds a **vouching layer** to YoCard, modelled on two things:

1. **In-person, time-bound authentication, in the style of DoorList's rotating QR codes.** DoorList (a US college event app) gives each guest a QR code tied to their phone number that changes on a timer, so a screenshot is already invalid by the time it is shared, and each listed guest corresponds to exactly one entry. Apply the same idea to vouching: a vouch is recorded by scanning the worker's **rotating code in person**, at the end of the job, so the vouch carries proof that the voucher and the worker's phone were together at that time. The code must also exist as a **short spoken or typed number** (a six-digit code that rotates, the way bank one-time codes do) for feature phones and for customers who will not scan.
2. **A social graph of vouches.** Customers vouch for workers; workers with a record vouch for other workers (the guarantor households and shops already ask for); organisations that verified a Yoma completion can refer a worker for a named job. Each vouch is a signed, dated, withdrawable record that links two identities, is shown on the public card in its own tier, and adds concrete experience lines to the worker's informal-work history (what work, when, how often, would hire again), so the card grows the way a profile does. Decide, and justify, how far toward "social media" this should go: feeds, follower counts and public rankings have known failure modes for this population (see Biscate and Lynk), so default to the least that produces hires.

The vouch is then **delivered at the moment of hiring** through **Reply by Voice**: the worker forwards a job post from a WhatsApp group, answers by voice note in their own language, and the employer receives a fixed, short structured reply (area and distance, the one relevant experience, confirmed card items, availability, gating document, "not stated" where the worker said nothing) with the card and the vouch clips attached. The vouch sitting on a card nobody forwards is the private certificate that did nothing; the reply is what puts it in front of the employer.

## Hard constraints

- **What the code proves and does not prove.** A scan proves co-presence with the worker's phone inside the code's validity window. It does not prove that work happened, that the scanner is a real customer, or anything about quality. Every label, tier name and sentence on the public page must say exactly this. Draft the exact strings.
- **Grounding.** Any text the AI produces about a person (the vouch line, the reply) must be traceable to that person's own words, confirmed by them verbatim before publication. No numbers, credentials or organisations the speaker did not name. Reuse `server/validate.js`.
- **Honesty about Yoma.** Nothing may read as a Yoma verification. Vouches are "said by a customer", "vouched by another worker", "referred by [organisation]", each "confirmed by them, not by Yoma". YoCard signs; Yoma does not.
- **Privacy.** Customer identity on the public page: first name and last three digits of the phone at most, with the customer's explicit yes and one-tap withdraw. No worker date of birth, email or address in any record. Adults only. The voucher's own number is never shown without their choice. No unsolicited messages: Yoma never messages a number that did not open a chat or forward an invitation; the worker forwards the request.
- **Anti-abuse.** Design against vouch rings, a worker's second SIM, a friend scanning as a "customer", coerced vouches, one number vouching for many, reciprocal vouches within a short window, and replayed or relayed codes. State each rule, what it costs an honest worker, and what the page shows when a rule fires.
- **Channels.** WhatsApp (Business API; note that it cannot join groups, so no group bots), SMS, a voice call-back for feature phones, and the public card page without JavaScript. Keep the page under 10 KB. Every flow must work for a worker on a feature phone and a customer with no data.
- **Newcomers.** A worker with no past customers and no fellow worker with a record must still get something: say what, and how the organisation-referral path and the first in-person vouch bootstrap it.
- **Gender.** Referral networks favour men (Beaman et al. 2018). Say how the design keeps a woman's record visible beyond her own network, and what the prototype will measure.
- **Cost of a mistake.** The failure that would embarrass Yoma or UNICEF is a confident falsehood about a person. Prefer "not stated" and "I could not read this" over a guess.

## What to produce

A single Markdown design document saved as `docs/superpowers/specs/2026-11-16-yovouch-design.md`, with these sections, in this order:

1. **Intent and the why**, in three sentences, including the one measurable outcome (the worker gets hired).
2. **Goals, non-goals, anti-goals.** Anti-goals must include: public rankings or scores of people, a reputation that locks newcomers out, anything readable as Yoma verification, unsolicited contact, spam in groups.
3. **Users and scenes.** Four walkthroughs of 100 to 150 words each, every one ending in a hire or a refusal: a home braider vouched by a customer at the door; a day labourer vouched by a fellow worker and forwarded to a neighbour; a worker with a Yoma completion referred by the organisation for a hardware-shop post; a contractor screening forty "I'm interested" replies and shortlisting from a six-line reply with a clip. Include the feature-phone path in at least one.
4. **Trust model.** Extend the README's L1 to L6 ladder. For each vouch type: what is proven, by whom, what the exact label says, what Check now re-checks. The rotating code: generation (secret per card, time step, code length, QR payload format, clock skew tolerance), validation, replay and relay defences, and a plain-language statement of its limits. State clearly why a rotating code is better than a static QR for this purpose and where it is not enough.
5. **The vouch graph.** Entities and edges (worker card, customer vouch, worker-to-worker vouch, organisation referral, job post, reply), what each edge records, eligibility rules (for example only cards with at least one confirmed item or one customer vouch may vouch for others), caps and rate limits, reciprocity flags, withdrawal and expiry, and how experience lines are derived from vouches on the card. Decide how much of the graph is public, and explain the social-platform features you deliberately leave out.
6. **Reply by Voice.** The six-line template, exactly; the listing parser (what it extracts, what it refuses, how it flags gating documents and fee requests); how the vouch clips and card link ride along; the translation label; what the employer sees inside WhatsApp; the SMS fallback.
7. **Channels and flows.** For every flow (worker asks for a vouch, customer scans and records, feature-phone spoken code, worker vouches worker, organisation referral, reply to a post, employer opens the card, withdraw), a numbered message-by-message script with the exact copy, in English with a note on which strings need isiZulu, isiXhosa, Kiswahili and Pidgin versions. Say what each step costs in kilobytes.
8. **AI role, kept small and checkable.** For each place the model is used (transcription, translation, extraction into fixed fields, the reply template), state the input, the output schema, the grounding check applied, the fallback when the model is unavailable (template mode, as YoCV and YoCard already have), and what is never delegated to the model (verdicts, labels, eligibility, signing).
9. **Data model and API.** JSON shapes for the vouch record, the code validation request, the reply record; new endpoints under `server/card/routes.js` in the existing style; what is signed; what is stored under `data/cards/`; retention and deletion.
10. **Public card page changes.** The new tier, its order and copy, how clips are played without JavaScript (a plain link to the audio), the size budget, and the print and share-image variants.
11. **Abuse and honesty review.** A table of attacks and failures with the defence and the user-visible result. Include the "friend scans as customer" case and say plainly that it is not fully solvable, and what limits its damage.
12. **Approaches considered.** At least two alternatives to the rotating code (a static QR plus phone confirmation; a customer-initiated request with no code; a Yoma-issued credential) and two to the vouch graph (customer vouch only; organisation referral only), what each trades off, and why the chosen design wins for this population.
13. **Prototype scope for a student, three to four weeks**, on this repo: what is built for real (rotating code, validation, signed vouch records, the new tier, the six-line reply behind the grounding checks, a simulated WhatsApp thread as a web page, browser microphone input with the configured model or typed fallback), what is faked and how it is labelled in the demo (WhatsApp delivery, SMS, call-back, OTP), and a task list in the order to build.
14. **Demo plan for a Yoma audience.** It must show the employer's side: a contractor's inbox with forty replies next to one six-line reply carrying a card with a 15-second clip; the grounding validator rejecting an embellished line live; the rotating code being scanned and a screenshot of an old code being refused; the feature-phone spoken-code path.
15. **What to measure in the prototype period.** At minimum: the reply rate when genuine vouch requests go to real past customers of five to ten workers, time to reply, the share of customers who confirmed the extracted line unchanged, and who gets vouched by gender. Say how the student collects these honestly even if the numbers are low.
16. **Open questions** that only Yoma can answer (organisation willingness to refer, WhatsApp Business API access, zero-rating, the phone-confirmation source).
17. **Exact copy appendix.** Every user-facing string introduced, including the honesty strings, in English.

Write plainly. Use the project's own words for tiers and labels. Prefer short sentences. Do not use em dashes. Where you make a call the brief leaves open, mark it "(our call)" so the consultant can check it.
