# YoCV in the connected journey, design (2026-11-28)

The four BBS prototypes now run as one journey for Halima: Ziqi (Phase 1) → PathFinder (Phase 2) → SkillLens (Phase 3) → YoCV (Phase 4) → back to the Ziqi listing. The teams agreed one "journey contract v1": the same link params, the same handoff card and the same YoID thread in all four apps. This spec is YoCV's part. It follows the contract word for word.

## 1. Port

YoCV's default port moves from 4173 to 4174, because PathFinder uses 4173. `PORT` still overrides it. `YOCV_URL` in the team's start script defaults to `http://localhost:4174`.

## 2. The link in

SkillLens opens YoCV with:

`/?as=halima&journey=demo&from=skilllens&yoid=yoid-ng-7f3a0123&listing=opp-job-001&goal=job&plan=plan-001&course=opp-course-001&credential=cred-002&return=<the Ziqi listing, encoded>`

- `?as=` signs Halima in, as before.
- With `journey=demo`, YoCV reads the nine contract params (`journey`, `from`, `yoid`, `listing`, `goal`, `plan`, `course`, `credential`, `return`). Each value is trimmed; an empty one, or one over 64 characters (2048 for `return`), is dropped.
- The params leave the address, as `?as=` does, and stay in `sessionStorage` under `yocv.journey` for the tab. Hash routes and a reload keep them. A new tab without them has no journey.
- Arriving on no route opens `#/cv`, so the first screen is the arriving card.
- With `listing=opp-job-001`, the journey's job, Step 1 picks the target role it maps to, **Solar installation assistant** (`role` on the listing in `data/journey.json`), instead of the role for her trade (Market seller). She can still change it. Another listing, or no journey, keeps the role for her trade.
- Without `journey=demo` nothing changes: no card, no thread, no extra key.

## 3. The arriving card

At the top of Step 1, only in journey mode and online:

- eyebrow `From SkillLens · Phase 3`
- title **Skill Credential**, then `Solar PV Installation Basics: practical challenge passed`
- `✓ Recorded on your YoID (mock-up)`

`cred-002` in Step 1 and the Passport tab keeps its tag **Skill Credential, from SkillLens**.

The persona's own credential title in `server/card/personas.json` is the contract's title too, "Solar PV Installation Basics: practical challenge passed", the same as SkillLens. It was "Solar PV Basics: practical challenge passed" until the end-to-end test of 2026-11-28 found the mismatch.

## 4. The YoID thread

Above every CV step, in journey mode: the label `YoID · yoid-ng-7f3a0123 · mock-up` and four steps, Saved Opportunity, Learning Plan, Skill Credential, Job Application. For Phase 4 the first three are `recorded` (green tick); Job Application is `in progress` until Apply, then `recorded`. The state comes from the phase and this page's own Apply. There is no shared store.

## 5. The leaving card

After Apply records `app-001`, under the mock-up notice:

- eyebrow `Back to Ziqi · Phase 1`
- title **Job Application**, then `Application to Solar Installation Assistant (Trainee)`
- button **Back to the listing**, linking to `<return>?journey=demo&from=yocv&yoid=<yoid>&application=app-001` (with `&` when `return` already has a query, before any `#fragment`), in the same tab
- `✓ Recorded on your YoID (mock-up)`

Only an absolute `http:` or `https:` return is followed. Anything else hides the button; the card stays.

## 6. Look

White card, purple heading `#41204b`, green recorded text `#387f6a`, blue button `#4cade9`, Nunito headings, Open Sans body, 12 px radius. The blue joins the tokens as `--blue`. The button text is ink, not white, because white on that blue reads at 2.6:1.

## 7. Data and copy

- `data/journey.json` gains a `connected` block: the phase, the thread names and the two cards' items. The existing keys are unchanged.
- The card and thread strings are in `cv-copy.js`, word for word from the contract.
