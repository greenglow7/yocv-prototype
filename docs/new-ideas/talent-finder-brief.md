# Talent Finder: design brief

Date: 2026-11-25. Status: new idea, mock-ups only. Mock-ups: `mockups/talent-finder/`, online at https://greenglow7.github.io/yocv-prototype/mockups/talent-finder/ (or open `index.html` from disk). Slide text: `presentation/talent-finder-slides.md`.

This is a student proposal for GenU, not a Yoma feature. Nothing here is built. The people, partner and listing in the mock-ups come from the team's shared mock data (BBS x GenU) and are fictional. GenU's AI use-case map has not been seen yet; check this brief against it before it goes further.

## Who it is for

- **Partners on Yoma**: employers and opportunity providers who list work, placements or learning, and want to reach young people who already have the skills.
- **Young people on Yoma** who have finished learning, hold credentials or vouches, and want to be found for work without posting their details publicly.
- **GenU and Yoma operations**, who today broker many of these introductions by hand.

## How it is done today

As we understand it (to confirm with GenU):

- A partner posts an opportunity on Yoma and waits for applications, or asks a GenU or country team to pass it around.
- Partners also source through their own networks, WhatsApp groups and job boards. They screen CVs that carry no verified evidence.
- A partner cannot search Yoma's records of completed learning, credentials or skills. A young person whose record fits never hears about a role they did not see.

## The time and cost of not having it

No measured figures exist yet. The estimate below is worked from stated assumptions. **Assumption, to confirm with GenU.**

| Item | Value | Basis |
|---|---|---|
| Partner staff hours to source one entry-level role today | 8 h | Assumption: posting, chasing, screening about 30 unverified applications, and phoning referees |
| Partner hours with Talent Finder | 2 h | Assumption: one search, one notice, read the shared CV checks |
| Hours saved per role | 6 h | 8 minus 2 |
| Staff cost per hour | USD 10 | Assumption: a coordinator in South Africa or Kenya, fully loaded |
| Partners using it in year one | 40 | Assumption |
| Roles each partner fills a year through Yoma | 10 | Assumption |
| **Partner time lost each year without it** | **2,400 h** | 6 h × 40 × 10 |
| **Partner cost lost each year without it** | **about USD 24,000** | 2,400 h × USD 10 |

Costs we cannot put a number on yet:

- **Young people not found.** Every verified young person who fits a role but does not see the post is a missed placement. GenU's data on completions versus placements would size this.
- **Wasted evidence.** Credentials and vouches earned on Yoma do no work in hiring if partners cannot see them.
- **Operations time.** GenU and Yoma staff who forward roles and introduce candidates by hand. Ask GenU for hours per month.

Swap any assumption for GenU's real figure and the totals change in proportion.

## The idea in one sentence

Partners search an anonymised pool of verified young people who opted in, by skills and evidence, and send a notice about a real Yoma opportunity; the young person decides whether to share their YoCV CV check.

## The example in the mock-ups

The screens follow the team's shared mock data, so GenU sees the same person and job as in the four prototypes.

- **Partner:** Sunrise Solar Ltd, a fictional employer on Yoma.
- **Search:** young women 18 to 24, digital skills (the Yoma skill Digital Literacy), Kaduna State, Nigeria. **214 matches.**
- **A12:** Halima, 20, the team's shared person. On partner screens she is only "A12, phone repair and sales, Kaduna State". Her profile shows five credentials confirmed from Yoma (Digital Literacy Essentials, Working Safely at Height and Customer Service Basics from Passport to Earning; Community Tree Planting Day from Kaduna Green Youth Network; and the **Skill Credential** from SkillLens, Solar PV Basics: practical challenge passed). Nothing is vouched. Her phone repair and sales work, 2 years, is self-declared with a reference letter.
- **Notice:** about `opp-job-001`, **Solar Installation Assistant (Trainee)** at Sunrise Solar Ltd, Kaduna, ₦85,000 a month, Monday to Saturday. Sunrise Solar made the listing with RoleMap.
- **Halima's reply:** Share my CV sends her YoCV CV check link. Apply sends the **Job Application** (`app-001`), the same handoff YoCV makes in Phase 4.
- The other codes on the results screen (A07, A19, A31, A44, A58) are made-up sample profiles for the same search.

In the shared data Halima is A12 here and in RoleMap. In a real build the code would change with every search, so the two would not match.

## The flow

1. **Search** (`search.html`): the partner filters by gender and age band (as the young person set it in Yo-ID), Yoma skill names, evidence level, learning completed on Yoma, state and availability. The sample search gives 214 matches.
2. **Results** (`results.html`): 214 anonymised cards, such as "Phone repair and sales, Kaduna State" for A12, with an evidence label on every skill. Fewer than 5 matches shows no list and no number.
3. **Anonymised profile** (`profile.html`): A12's lines grouped as the YoCV employer check groups them: Confirmed from Yoma, Vouched for by other people (confirmed by them, not by Yoma), Self-declared. An empty group says so.
4. **Notify** (`notify.html`): Sunrise Solar Ltd picks its Solar Installation Assistant (Trainee) listing and a short message for A12 and two others, and sees a preview of what each young person gets.
5. **The notice in Yo-ID** (`young-person.html`, phone): Halima sees the notice. Share my CV sends her YoCV CV check link. Apply sends a Job Application. Not interested shows the partner only "no reply".

## The Yoma and Yo-ID data it would use

- **Skills from the Yoma record**: the user's skills list (Lightcast Open Skills ids and names) and the organisations that taught each one.
- **Completions**: opportunity title, organisation, completion month, opportunity type and the skills attached (`myOpportunity` records with verification status completed).
- **Wallet credentials**: issued learning credentials, issuer, issue month and the skills attribute (`Opportunity_Skills`).
- **YoVouch tiers**: for each skill, whether its best live vouch is from a customer, another worker or an organisation referral. The tier only. Never the count, never who vouched.
- **Self-attested skills and self-declared experience**: the trade and a rounded length of informal work, labelled as the person's own words.
- **Region**: country and state, province or region from the Yoma profile. Never the town or street.
- **Gender and age band**: as the young person set it in Yo-ID. Shown as a band, such as 18 to 24, never a date of birth. Under-18s stay out of the pool, since they need guardian consent.
- **Availability**: a new Yo-ID field the young person sets (Available now, Part-time, Weekends, From next month).
- **Opt-in flag**: a new Yo-ID consent field, "Let partners find me", off by default, with a date and a version of the wording agreed to.
- **Partner listing**: the opportunity id of a live listing owned by the partner's organisation.
- **YoCV CV check**: the signed, 90-day check link from YoCV's QR feature, handed over only when the young person shares.

## Privacy and consent rules

- **Opt-in pool only.** Nobody is searchable until they turn on "Let partners find me". Turning it off removes them from the next search.
- **No contact until they share.** The partner never sees name, photo, town, phone or email. Sharing hands over the CV check, which shows the name but no phone, email or town. Further contact runs through Yo-ID until the young person adds a number.
- **Minimum group of 5.** Fewer than 5 matches returns no list and no exact count.
- **No vouch counts, no voucher names.** Only the tier label, with "confirmed by them, not by Yoma".
- **No export.** No download, copy-all or API access to the pool. References change with each search, so a profile cannot be tracked across searches.
- **Rate limits.** At most 3 partner notices per young person a month. Notices must point to a live listing.
- **Audit.** Every search and notice is logged against the partner account, so GenU can review misuse.
- **Region only.** Filters stop at state, province or region level.

## What it would take to build

Rough effort, assuming a small team that already knows the Yoma codebase. Assumption, to confirm with Yoma's developers.

| Piece | What | Rough effort |
|---|---|---|
| Search index | A Yoma backend index over opted-in users: skills, evidence level, completions, region, availability. Group-size guard in the query layer | 3 to 4 developer-weeks |
| Consent field | "Let partners find me" and availability on Yo-ID, with settings screen and audit of consent | 1 to 2 developer-weeks |
| Notification channel | In-app notice in Yo-ID, an SMS or WhatsApp nudge with no partner details, reply states | 2 to 3 developer-weeks |
| Partner role checks | A Talent Finder permission on partner organisations, listing ownership check, rate limits, search log | 2 developer-weeks |
| Partner screens | Search, results, profile, notify in the partner portal | 2 to 3 developer-weeks |
| Privacy review and testing | Data protection impact assessment, re-identification tests, accessibility | 2 weeks, plus legal time |
| **Total** | | **about 12 to 16 developer-weeks** |

YoCV's evidence levels and CV check already exist in the prototype, so the profile grouping and the share step reuse work that is done.

## Risks

- **Re-identification** in small places or rare trades, even without names. The group-size guard and region-only filters reduce it; they do not remove it.
- **Spam or misuse** by partners. Needs vetting of partner organisations, rate limits and the audit log.
- **Low opt-in.** If few young people turn it on, partners find nothing and stop searching.
- **Unequal visibility.** Young people with fewer Yoma completions rank lower. Results should not be sorted by volume of evidence.
- **Vouch quality.** Vouches are confirmed by the people who gave them, not by Yoma. Partners must not read them as verified.
- **Consent across countries.** POPIA in South Africa, the Data Protection Act in Kenya and the NDPA in Nigeria each set rules for profiling and consent.

## Open questions for GenU

1. Does this fit GenU's AI use-case map, and under which use case? It uses no AI as designed. Is that a problem or a strength?
2. Which partners would pilot it, and how many hours do they spend sourcing a role today?
3. Is 5 the right minimum group size, or should it be higher in rural regions?
4. Should partners pay for Talent Finder, or is it part of being a Yoma partner?
5. Who vets partner organisations before they get the Talent Finder permission?
6. Should sharing also offer the young person's phone number, or keep all contact inside Yo-ID?
7. Can Yoma send SMS or WhatsApp nudges today, and at what cost per message?
