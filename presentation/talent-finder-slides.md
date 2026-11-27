# Talent Finder: slide text (draft)

Two slides for the New Ideas section. Source: `docs/new-ideas/talent-finder-brief.md`. Screens: `mockups/talent-finder/`, online at https://greenglow7.github.io/yocv-prototype/mockups/talent-finder/. Every screen carries the band "Mock-up. Not a working build. Fictional sample data." Keep it visible in any screenshot. Names, ids and numbers come from the team's shared mock data (BBS x GenU).

---

## Slide 1. Problem & Concept

**Title:** Talent Finder: let partners find verified young people

**Who it is for**
- Partners who list work and placements on Yoma
- Young people with Yoma learning, credentials or vouches who want to be found

**How it is done today**
- Post a role, wait, screen unverified CVs by hand
- Partners cannot search Yoma's verified records
- A young person who fits but misses the post is never found

**The time and cost of not having it**
- About 2,400 partner hours a year, about USD 24,000
- Worked as: 6 hours saved per role × 10 roles × 40 partners × USD 10 an hour
- Small print on the slide: "Assumption, to confirm with GenU. Not a measurement."
- Not counted: missed placements and GenU staff time spent brokering introductions

**The idea in one sentence**
Partners search an anonymised, opt-in pool of verified young people and send a notice about a real Yoma opportunity; the young person decides whether to share their CV.

---

## Slide 2. Mock-up Walkthrough

**Title:** From search to a shared CV, without exposing anyone

**The example:** Sunrise Solar Ltd searches for "young women 18 to 24, digital skills, Kaduna" and gets 214 matches. Halima is A12.

**Screen A: `mockups/talent-finder/results.html`** (partner, desktop)
1. 214 anonymised cards. A12 reads "Phone repair and sales, Kaduna State". No name, photo, town or contact
2. Every skill carries its evidence: Confirmed from Yoma, Vouched (confirmed by them, not by Yoma), Self-declared
3. Tick profiles to notify; references change with every search
4. Fewer than 5 matches: no list, no number

**Screen B: `mockups/talent-finder/young-person.html`** (young person, Yo-ID on a phone)
1. The notice names the partner, the live Yoma listing and why they matched: Solar Installation Assistant (Trainee), Sunrise Solar Ltd, Kaduna, ₦85,000 a month, made with RoleMap; Digital Literacy (Confirmed from Yoma) matched
2. "Share my CV" hands over Halima's YoCV CV check link, the same one behind the CV's QR code. Applying sends the Job Application
3. "Not interested" tells the partner only "no reply"
4. "Let partners find me" can be turned off at any time

**Yoma and Yo-ID data it uses**
Skills (Lightcast), completions, wallet credentials, YoVouch tier (no counts), state or region, gender and age band as set in Yo-ID, availability, an opt-in flag, the partner's listing id, the YoCV CV check.

**What it would take to build**
Search index on Yoma's backend · consent and availability fields in Yo-ID · in-app notice plus SMS or WhatsApp nudge · partner role checks, rate limits and audit log. Rough effort: 12 to 16 developer-weeks (assumption, to confirm with Yoma).
