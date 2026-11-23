# YoCV inside a Yo-ID shell: the CV as a feature of Yoma's own dashboard

Date: 2026-11-22. Status: draft for the owner's approval after a builder check. Supersedes the family-look spec of 2026-11-15 where the two disagree (section 3 says where).

Marks: **(owner's call)** was decided by the owner in the chat on 2026-11-22; **(our call)** is a decision made here that the owner can overturn while reading.

## 1. Intent and the why

The owner wants YoCV to stop reading as a demo with its own look and to read as a feature built for Yoma that functions inside it: the person arrives signed in, finds the CV where Yoma's own dashboard promises it ("A CV built from your Yo-ID — coming soon"), and everything around it looks like Yoma's site. The sample accounts stay, because reading a real Yoma account needs a sign-in client only Yoma issues, but they stop being the first thing on screen.

This matches what the integration pack already drafts for Yoma's repository: a `/yoid/cv` page inside the YoID layout with no persona chooser, because the user is already signed in. The standalone app becomes the same page, running here, with a Yo-ID dashboard around it built from the same record.

## 2. Goals, non-goals, anti-goals

Goals:

1. The app opens straight into a Yo-ID dashboard, signed in as one person **(owner's call)**, with an avatar menu to switch person or sign out.
2. Yoma's shell: the fixed purple top bar, the left drawer, the user-menu drawer, the purple hero band with the greeting and the tab pills, the pale page, the white cards, the footer, built from the look reference `docs/research/2026-11-22-yoma-web-look.md`.
3. The Yo-ID tabs Overview, Wallet, Passport, Opportunities and Skills as read-only views of the same record **(owner's call)**, and CV as the sixth tab, which the Overview's CV card opens.
4. The four CV steps as they are, under the CV tab, in the shell's components, with step 1 reduced to "Confirmed from Yoma" (the ticks and the role) because the record is already read.
5. The sample and ownership notices in the footer and the About dialog only **(owner's call)**: nothing inside the flow says sample or demo.
6. Every check, route, download and the evidence record unchanged in behaviour.

Non-goals: YoCard and YoVouch inside the shell (they keep their pages; the left drawer links to YoCard); Yoma's marketplace, opportunity discovery, referrals, Zlto cash-out, profile and settings pages (their links go to the real yoma.world pages, section 5); a real Yoma login; Yoma's logo, favicon, mascot or any image file from Yoma's repository; the integration pack's TypeScript page (pinned by a test, untouched); languages other than English; the sticky pill bar that appears on scroll in Yoma.

Anti-goals: a page that claims to be operated by Yoma or UNICEF; a number, balance or credential invented for the dashboard that the record does not hold; a fictional person presented as real anywhere a reader could miss the notice; removing the mode label or the "Not operated by Yoma or UNICEF" line (AGENTS.md rule 3); a CV line that bypasses a check.

## 3. Constraints

- Buildless HTML, CSS and JavaScript; Node 20 built-ins only; no npm packages; no image files copied from Yoma (the GPL repository is read-only, nothing copied). Tests first; the suite stays green.
- Honesty strings. The footer keeps "Independent student prototype. Not operated by Yoma or UNICEF." and adds "The people shown are fictional sample accounts." in sample mode; the About dialog keeps "No UNICEF or Yoma endorsement is implied" and says the same. The mode label (`Live AI · {model}`, `Sample mode`, `Sample mode (offline)`) moves from the header pill to the footer line and the About dialog, and stays in the evidence record and the CV paper's sample footer line **(owner's call, overturning the family-look spec's "Sample mode stays visible in the header". AGENTS.md rule 3 forbids removing or rewording the label and is untouched: the label keeps its words and moves. Rule 8, simulated parts labelled on the page, is met by the footer line on every page.)**. The phrase "verified by Yoma" never appears.
- The wordmark is plain text, "yoma", in Nunito at 900 weight, lowercase, white on the purple bar and dark on white surfaces **(our call; the family-look spec allowed a plain-text wordmark and forbade the logo image, which stays forbidden)**. "A Yoma concept" leaves the header and goes into the About dialog's first line and the footer.
- The favicon stays the repo's own purple square with a white Y. Fonts stay Google Fonts (Nunito and Open Sans), as today.
- Restyle rules (tests/restyle.test.cjs) are revised, not dropped: hex colours only from the token list, which gains the shadow, the type colours and the tints the look needs; radii 8, 12, 16, 18 px, fully round or 50%; one box-shadow token allowed; no `text-transform`, no `letter-spacing`, no `@import`; 14 px floor on screen; no arrow glyphs (arrows are inline SVG); focus rings as today.
- Accessibility: the drawers are `dialog` elements; tabs are links in a `nav` with `aria-current`; the hero h1 receives focus on tab change as the band h1 does today; 4.5:1 contrast on every text, which rules out Yoma's 12 px white-on-orange and keeps gray-dark on white.
- Privacy and data: nothing new leaves the device. The Opportunities tab's "View opportunity" links go to the live yoma.world opportunity page by id, as YoCard's links do. The chosen person is kept in `sessionStorage` so a reload keeps them; nothing else is stored.

## 4. Approaches considered

1. **A Yo-ID shell in this app, the CV as its sixth tab (picked).** index.html becomes the shell; a new `yoid.js` renders the bar, drawers, hero, tabs and the five read-only tabs from the record; app.js keeps the four CV steps and renders them inside the CV tab. The pack's TypeScript page and this page end up with the same structure. Cost: a rewrite of index.html, styles.css and the top of app.js, a new module, and the restyle tests revised.
2. **Restyle the four-step app only.** Yoma's colours, type and components on the existing layout. Fast, but the owner said it would still look like a separate tool, and it keeps the chooser as the first screen. Rejected **(owner's call)**.
3. **Build the feature in a fork of Yoma's repository.** The truest "inside Yoma", but it cannot run here without Yoma's .NET and Next.js stack and their identity provider, and nothing demonstrable would exist until Yoma merges it. Rejected for now; the integration pack keeps that door open.

## 5. The shell

**Top bar.** Fixed, 80 px, purple. Left: a hamburger button ("Open main menu") and the wordmark linking to the Overview. Centre, from 640 px: Home, About Us, Opportunities, Marketplace, each an external link to the matching yoma.world page, opening in the same tab, with `rel="noopener"`; "Refer a friend" is left out **(our call: the real pages exist and are honest to link; a dead link would be a fake)**. Right: a language control showing "English" that opens nothing **(our call: one language; the control is disabled with a title "English only")**, then the avatar: 44 px, white outline, the person's initials on a colour hashed from the name as Yoma does. Signed out, a round green "Login" button with a login icon replaces the avatar.

**Left drawer** (a `dialog` sliding from the left): white, 20 rem, rounded right corners; header with the dark wordmark and a close button; rows: Home, About Us, Opportunities, Marketplace (external), then a hairline, then "Yo-ID" (the Overview, current), "My work card (YoCard)" (card.html), then a hairline, a full-width round "Sign out" button when signed in, and the small footer (the ownership line and About).

**User-menu drawer** (a `dialog` sliding from the right): a purple band with the 80 px initials avatar, the display name, the town in the soft lilac, and two white pills "Switch account" and "About this prototype"; below, on gray-light, the same section cards as the Overview (Wallet, Passport, Opportunities, Skills) in their closed state, then a small round "Sign out" button. "Switch account" opens the account list inside the drawer: the six people as rows with initials avatars, names and trades, the current one marked. Choosing one with a CV draft in progress asks through the existing confirm dialog ("Switch account? Your CV draft will be cleared.") and then resets the state and reads the new record. In token mode the list holds the one account and no switch; offline, the one account read before going offline.

**Signed out.** "Sign out" clears the state and the stored person and shows Yoma's unauthenticated card on every tab: a life-ring icon, "Welcome back!", "This content is just a click away. Please log in to continue." and a round green "Log in" button that opens the account list in a dialog. Landing with no stored person **(our call)** does not show this card: the app signs in as the first sample person, Thandi, so the first impression is the dashboard. A link with `?as=<id>` signs in as that person and then drops the parameter from the address.

**Hero band.** Purple, the world map replaced by a faint pattern drawn in CSS (two large circles at 6% white) **(our call: no Yoma image files)**. The h1: an orange time-of-day icon (sun, sun-low, moon by local hour), "Good morning, {firstName}" with the first name in orange, no exclamation mark; beside it the 20 px info button "What is Yo-ID?" which opens a dialog with Yoma's framing in our words: what a Yo-ID holds, and that the CV is built from it. Under it one lilac line chosen by tab and record: on Overview "Open CV to build a CV from your Yo-ID" when no draft exists, "Your CV draft is at step {n} of 4" when one does; on the other tabs the tab's blurb. Then the pills: Overview, Wallet, Passport, Opportunities, Skills, CV, in that order, each with its emoji as the live site shows them, the current one green. The hero scrolls away with the page.

**Footer.** White, a row from 768 px. Left, gray-dark: "Independent student prototype. Not operated by Yoma or UNICEF. {mode label}." and, in sample mode, "The people shown are fictional sample accounts."; then green links "About this prototype" (the About dialog), "Source" (the GitHub repository) and "Reset" (today's reset, renamed from "Reset demo"). Right: the dark wordmark. No copyright line, no Yoma legal links, no social icons **(our call: those would claim to be Yoma)**.

**Page.** Gray-light, a 1280 px column, 16 px padding, 16 px gaps.

## 6. The tabs

Routing is by hash so the server allowlist is untouched: `#/`, `#/wallet`, `#/passport`, `#/opportunities`, `#/skills`, `#/cv`; the CV steps keep their in-memory step and add `#/cv/2` to `#/cv/4` so Back works. Tab change focuses the hero h1 and sets `aria-current`.

**Overview.** The two-column grid of disclosure cards, closed by default, opening on click with the chevron turning:

- Wallet, gold icon. The record holds no ZLTO figures and none are invented. Preview "Wallet being set up"; body: the pending-wallet copy ("Your wallet is still being set up. It usually takes less than 24 hours. Any ZLTO you earn in the meantime is safe and will show here once it is ready.") and "Open Wallet" **(our call)**.
- Passport, lilac icon, " · {n}" where n is the credentials count. Preview "{n} Learning"; body: a white pill per type with its dot (Learning blue, YoID Identity magenta when the record is from a token and Yoma lists one; sample records show Learning only **(our call: no identity credential is invented)**), then "Open Passport". Empty: Yoma's empty copy.
- Opportunities, blue icon. Preview "{n} completed · 0 pending · 0 declined · 0 saved"; body: the four circles with the ring, counts from the record (completed = completions; the others 0), then "Open Opportunities". Empty: Yoma's empty copy.
- Skills, green icon, " · {n}" over the skills from completions plus self-attested, de-duplicated by name. Preview: first three names; body: up to eight chips, then "Open Skills".
- CV, spanning both columns, gray icon turning purple once a draft exists. Title "CV". Note "A CV built from your Yo-ID." with "Open CV"; with a draft, "Draft at step {n} of 4 · {k} lines accepted" and "Continue CV"; with a finished CV in the session, "Ready to print or download" and "Open CV".

**Wallet.** Breadcrumb "Yo-ID › Wallet"; the two-column grid: "My Wallet" (the pending-wallet card) and "How ZLTO works" with the three bullets; no "My Products" **(our call: nothing to list, nothing invented)**.

**Passport.** Breadcrumb with the count; the intro card; filter pills "All {n}" and "Learning {n}"; the credential grid: each card with the Learning band, the issuer's initial in the white circle (no logos in the record), the type chip, a status pill reading the record's status ("Issued" on gray-light, never "Verified" unless the record says so), the title, the issuer, "Issued {month year}", and "View credential" opening a dialog with Status, Issuer, Date issued, Skills, and, when the record holds an opportunity id, a link "Open on Yoma". Credentials the record left out are not shown.

**Opportunities.** Breadcrumb; intro "Completed opportunities from your Yo-ID."; sub-tab pills Completed {n}, Pending 0, Declined 0, Saved 0 (the last three show the empty card); completed cards with the Learning band, "Completed" badge, title, organisation, month, "Skills developed" chips, and "View opportunity" to the live yoma.world page when the record holds an opportunity id, else no button.

**Skills.** Breadcrumb with the count; intro; the tile grid with the name and "Skill issued by 1 partner" with the organisation's initial in a 24 px circle, or "Self-attested" for the person's own.

**CV.** Breadcrumb "Yo-ID › CV"; the step list as pills "Step n of 4: {title}" with the same enable rule as today's rail; step 1 is "Confirmed from Yoma": the tick lists and the role picker as today, headed by the card title the pack uses, without the chooser, the lead line or "Read this account"; steps 2 to 4 as today, re-skinned: white cards with the custom shadow and 12 px radius, round green primary buttons, round outline secondary buttons, the review's Accept/Edit/Leave out as pills, the evidence labels as chips in their tints, the CV paper unchanged. The mode pill in the review aside is removed; the review aside keeps "Local sample generation" wording unchanged where it exists. Print hides the shell (`body.yocv-app` selectors) and prints the paper as today.

## 7. State and data

- `yoid.js` owns the shell: the person (`id`, display name, first name, town, initials, hue), the record, the current tab, the open drawers, and the greeting. It exposes `window.YoID` with `signIn(id)`, `signOut()`, `openTab(name)`, `render()`.
- app.js keeps the CV state and its functions. Its load-time lookups move behind a `mount()` that `yoid.js` calls with the CV tab's container, and `readRecord` is replaced by `useRecord(record, selector)` which fills the ticks, the contact prefill and the role as today. Reset becomes "clear the CV draft and stay signed in".
- The config call `GET /api/cv/config` gains, per persona, `firstName` and `trade` label (both exist in personas.json); `POST /api/cv/record` is unchanged. The record gains nothing: logos are not in it and initials are used; credential `status` is already there.
- Sessions: the selector is stored with the person, so an expired session re-opens as today.
- Offline: the shell renders from the last record in memory; the CV steps keep their offline behaviour; the footer label reads "Sample mode (offline)".

## 8. Copy

New keys in `cv-copy.js` (`COPY.en`), all plain English, second person: the tab names and blurbs, the greeting words, the hero lines, the card previews and empty states, the drawer labels, the signed-out card, the switch-account confirm, the footer and About lines. The CV step copy is untouched except `recordLead*`, `chooseAccount`, `readSample`, `readToken` and `reading`, which are no longer shown but kept in the catalogue (a test says every spec string is in it). Yoma's own sentences are reused where this spec quotes them; nothing says "verified by Yoma".

## 9. Tests

- A new `tests/yoid-shell.test.cjs` reads index.html, yoid.js and styles.css as text: the bar, the drawers as dialogs, the six tabs in order, the hash routes, the signed-in-on-load path, the `?as=` handling, the footer and About strings, no Yoma image file names, no "verified by Yoma", external links with `rel="noopener"`.
- `tests/restyle.test.cjs` revised to the new rules in section 3 and the new structure (the band assertions go; the topbar is 80 px; print hides by `body.yocv-app`).
- `tests/yocv-copy.test.cjs` footer and About assertions updated to the new markup; the honesty strings stay asserted.
- `tests/cv-app.test.cjs`: the pinned literals that survive stay; the ones about the chooser go; new ones for `mount(`, `useRecord(` and the CV hash routes.
- Browser checks in `docs/testing-log.md`: the six tabs at 360 and 1280 px with no overflow, the drawers with the keyboard, the switch with a draft in progress, sign out and log in, the four CV steps and a print measurement, the offline path.

## 10. What is left to the builder

Exact CSS values inside the ranges above; the SVG icons (drawn inline, simple strokes, no Yoma assets); the hashing of the avatar colour; the file split inside `yoid.js`; the order of tasks.

## 11. Calls made after the builder check **(our call, each)**

1. **YoCard keeps its current look.** The new shell rules in styles.css are scoped to `body.yocv-app`; the old header, band and rail rules that card.html still needs move into card.css unchanged, so card.html renders as today. The YoCard half of the restyle tests keeps its assertions against card.css. The Google Fonts link on both pages adds Nunito 900 and stays identical on both, as the test requires. The left drawer's "My work card (YoCard)" link is the only join.
2. **A cold start with no server.** With no config, no personas and no record, the shell renders person-less: the greeting reads "Good morning" with no name, the avatar is the generic person icon, the Overview, Wallet, Passport, Opportunities and Skills tabs show the page empty state with the existing `recordOffline` wording ("The YoCV server could not be reached"), and the CV tab keeps its typed-role path as today. The footer label reads "Sample mode (offline)". No signed-out card: there is no one to log in as.
3. **Token mode.** The bar shows the token account's display name and initials; "Switch account" lists that one account and no other; "Sign out" shows the signed-out card and "Log in" reads the token account again; nothing is written to `sessionStorage` (the selector is null) and `?as=` is ignored.
4. **Headings and focus.** The page has one h1, the greeting. Inside the CV tab each step's title is an `h2.step-title` at the top of the tab's content; a step change focuses that h2, a tab change focuses the hero h1. The CV paper keeps its name at heading level 2. `setBand()` and `#page-band` go; the pinned assertions in cv-app and restyle tests are rewritten to the h2.

## 12. Open questions for the owner

None blocking. Two calls above are worth a glance: the Wallet card shows "being set up" rather than any figure, and sample Passports show no YoID Identity credential.
