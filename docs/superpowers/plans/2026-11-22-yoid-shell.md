# YoCV inside a Yo-ID shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app opens signed in to a Yoma-styled Yo-ID dashboard with Overview, Wallet, Passport, Opportunities, Skills and CV tabs, and the four CV steps run unchanged inside the CV tab.

**Architecture:** A new browser module `yoid.js` owns the shell: the signed-in person, the record, the hash route, the bar, the two drawers, the hero, the tab pages and the footer. `app.js` keeps the CV state and steps and is mounted by the shell into the CV tab's container with the record handed to it. `styles.css` carries the shell and the re-skinned CV components under `body.yocv-app`; the old header, band and rail rules move to `card.css` so YoCard is untouched. The server changes are one config field and one allowlist entry.

**Tech Stack:** Buildless HTML, CSS and vanilla JavaScript; Node 20 built-ins; `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-22-yoid-shell-design.md`, with the look reference `docs/research/2026-11-22-yoma-web-look.md`.

## Global Constraints

- Node 20 built-ins only; no npm packages; no image, font or icon files from Yoma's repository; no new image files at all (icons are inline SVG).
- Honesty strings, never removed or reworded: `Not operated by Yoma or UNICEF` in the footer and About dialog; `Independent student prototype` in the footer; `No UNICEF or Yoma endorsement is implied` in About; the mode labels `Live AI · {model}`, `Sample mode`, `Sample mode (offline)` in the footer; `Sample account: fictional, for demonstration` on the paper; never `verified by Yoma`.
- Sample mode footer adds `The people shown are fictional sample accounts.` The wordmark is plain text `yoma`. No Yoma logo, favicon, copyright line or legal links.
- Colours only from the token list in Task 2 Step 3; radii only `8px`, `12px`, `16px`, `18px`, `9999px`, `50%`, `0`; one shadow token `--shadow`; no `text-transform`, `letter-spacing`, `@import`; screen font sizes 14 px or more; no `→ ← ✓ × ↗ ◷ ○` glyphs in page files outside SVG; the focus-ring rules kept verbatim with `.hero :focus-visible` in place of `#page-band :focus-visible`.
- One h1 per page (the greeting); CV step titles are `h2.step-title`; the CV paper keeps heading level 2.
- Nav links to yoma.world carry `rel="noopener"`; nothing but the chosen person's id is written to `sessionStorage` (key `yoid.person`).
- Tab routes: `#/`, `#/wallet`, `#/passport`, `#/opportunities`, `#/skills`, `#/cv`, `#/cv/2`, `#/cv/3`, `#/cv/4`. Tab order and labels: Overview, Wallet, Passport, Opportunities, Skills, CV, with the emoji 💳 💸 🌐 🏆 ⚡ 📄 in front.
- Default person on a cold start with no stored person: the first persona in config (Thandi). `?as=<id>` signs in as that persona and is removed from the address with `history.replaceState`. Unknown ids fall back to the default.
- Commits: `feat(yoid): …` per task, nothing from `.env`, `reports/`, `research_notes/`, `data/cards/`.

## Review Focus

1. A person switch with a CV draft in progress must clear the draft only after the confirm dialog; cancelling keeps everything. Test in Task 2.
2. A reload on `#/cv/3` with no draft must land on CV step 1, not a blank review. Test in Task 2.
3. Sign out must leave no name on the bar, no record in the tabs and nothing in `sessionStorage`. Test in Task 2.
4. With no server at all, every tab must render without an exception and the CV tab must keep the typed-role path. Test in Task 2.
5. A persona with no completions (Sipho) must show Yoma's empty states on Passport, Opportunities and Skills and "0 completed" on Overview, with no undefined text. Test in Task 3.

---

### Task 1: Config field, copy keys and the static allowlist

**Files:**
- Modify: `server/cv/routes.js` (the `cvConfig` persona map), `server.js` (`STATIC`), `cv-copy.js`
- Test: `tests/cv-routes.test.cjs`, `tests/server.test.cjs`, `tests/yocv-copy.test.cjs`

**Interfaces:**
- Produces: `GET /api/cv/config` personas carry `firstName`; `GET /yoid.js` is served as JavaScript; `COPY.en` gains the keys below, read by `yoid.js` as `copy.<key>` and by `app.js`.

- [ ] **Step 1: Write the failing tests.** In `tests/cv-routes.test.cjs`, extend the config test: `assert.equal(c.accounts.personas[0].firstName,'Thandi')` and `for(const p of c.accounts.personas)assert.equal(typeof p.firstName,'string')`. In `tests/server.test.cjs`, add `'/yoid.js'` to the JavaScript file loop beside `/core.js` and `/app.js`. In `tests/yocv-copy.test.cjs`, add:

```js
test('the Yo-ID shell copy exists and matches the spec wording',()=>{
  const c=COPY.en;
  assert.deepEqual(c.tabs.map(t=>t.label),['Overview','Wallet','Passport','Opportunities','Skills','CV']);
  assert.deepEqual(c.tabs.map(t=>t.route),['#/','#/wallet','#/passport','#/opportunities','#/skills','#/cv']);
  assert.deepEqual(c.tabs.map(t=>t.emoji),['💳','💸','🌐','🏆','⚡','📄']);
  assert.equal(c.tabs[2].blurb,'Verified credentials for every opportunity you complete.');
  assert.equal(c.greetingMorning,'Good morning, {first}');assert.equal(c.greetingAfternoon,'Good afternoon, {first}');assert.equal(c.greetingEvening,'Good evening, {first}');
  assert.equal(c.greetingNoName,'Good morning');
  assert.equal(c.cvTileNote,'A CV built from your Yo-ID.');assert.equal(c.cvTileDraft,'Draft at step {n} of 4 · {k} lines accepted');assert.equal(c.cvTileReady,'Ready to print or download');
  assert.equal(c.walletSetup,'Wallet being set up');
  assert.equal(c.walletSetupBody,'Your wallet is still being set up. It usually takes less than 24 hours. Any ZLTO you earn in the meantime is safe and will show here once it is ready.');
  assert.equal(c.passportEmpty,'No credentials yet');assert.equal(c.passportEmptyBody,'Complete an opportunity to get a verified credential: proof of what you did.');
  assert.equal(c.oppsEmpty,'No opportunities yet');assert.equal(c.oppsEmptyBody,'Save one for later or complete one, and it shows up here.');
  assert.equal(c.skillsEmpty,'No skills yet');assert.equal(c.skillsEmptyBody,'Each opportunity you complete adds the skills it taught you.');
  assert.equal(c.signedOutTitle,'Welcome back!');assert.equal(c.signedOutBody,'This content is just a click away. Please log in to continue.');assert.equal(c.logIn,'Log in');assert.equal(c.signOut,'Sign out');
  assert.equal(c.switchAccount,'Switch account');assert.equal(c.switchTitle,'Switch account?');assert.equal(c.switchCopy,'Your CV draft will be cleared.');
  assert.equal(c.footerFictional,'The people shown are fictional sample accounts.');assert.equal(c.footerPrototype,'Independent student prototype. Not operated by Yoma or UNICEF.');
  assert.equal(c.whatIsYoid,'What is Yo-ID?');
  for(const k of ['openWallet','openPassport','openOpportunities','openSkills','openCv','continueCv','breadcrumbRoot','passportIntro','skillsIntro','oppsIntro','walletHow','walletHowBullets','statusIssued','viewCredential','viewOpportunity','issuedByPartner','selfAttested','skillIssuedBy','completedBadge','aboutPrototype','sourceLink','resetAction','menuHome','menuAbout','menuOpportunities','menuMarketplace','menuYoid','menuYocard','openMenu','closeMenu','languageOnly','drawerAccount'])assert.ok(k in c,k);
  assert.equal(c.breadcrumbRoot,'Yo-ID');assert.equal(c.statusIssued,'Issued');assert.equal(c.resetAction,'Reset');
  assert.ok(!/verified by Yoma/i.test(JSON.stringify(c)));
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/cv-routes.test.cjs tests/server.test.cjs tests/yocv-copy.test.cjs`: the three new assertions fail.

- [ ] **Step 3: Implement.** In `cvConfig`, map `firstName:p.firstName??null` (add `firstName` to `listPersonas()` in `server/card/account.js`). In `server.js` add `'/yoid.js':'yoid.js'` to `STATIC`. In `cv-copy.js` add the keys with these values: `tabs` as an array of `{label,route,emoji,blurb}` using the spec's blurbs (Overview "Your wallet, passport, skills and opportunities in one place.", Wallet "ZLTO you earn by completing opportunities. Spend it in the marketplace.", Opportunities "What you have completed, submitted, had declined or saved for later.", Skills "Skills you have earned by completing opportunities.", CV "A CV built from your Yo-ID."); the greeting and tile strings exactly as the test says; `openWallet:'Open Wallet'` and the three like it, `openCv:'Open CV'`, `continueCv:'Continue CV'`; `passportIntro:'Verified credentials for every opportunity you complete. A new credential can take up to 24 hours to appear.'`; `skillsIntro:'Skills you have earned by completing opportunities.'`; `oppsIntro:'Completed opportunities from your Yo-ID.'`; `walletHow:'How ZLTO works'` with `walletHowBullets` the spec's three bullets; `viewCredential:'View credential'`, `viewOpportunity:'View opportunity'`, `issuedByPartner:'Issued by {issuer}'`, `selfAttested:'Self-attested'`, `skillIssuedBy:'Skill issued by {n} partner'`, `completedBadge:'Completed'`, `aboutPrototype:'About this prototype'`, `sourceLink:'Source'`, `resetAction:'Reset'` (replacing `Reset demo`; `resetTitle` becomes `'Reset your CV draft?'`, `resetCopy` `'This clears your answers, your contact details and your review in this browser. You stay signed in.'`, `resetDone` `'Draft cleared.'`), menu labels `Home`, `About Us`, `Opportunities`, `Marketplace`, `Yo-ID`, `My work card (YoCard)`, `openMenu:'Open main menu'`, `closeMenu:'Close'`, `languageOnly:'English only'`, `drawerAccount:'Your account'`. Keep every existing key.

- [ ] **Step 4: Run the suite.** `npm test`: fail 0.

- [ ] **Step 5: Commit.** `feat(yoid): config first names, shell copy keys and the yoid.js allowlist entry`.

### Task 2: The shell, the routing and the CV tab mount

**Files:**
- Create: `yoid.js`
- Modify: `index.html`, `styles.css`, `card.css`, `app.js`
- Test: create `tests/yoid-shell.test.cjs`; rewrite `tests/restyle.test.cjs`; update `tests/yocv-copy.test.cjs` (footer and About regexes) and `tests/cv-app.test.cjs` (pinned literals)

**Interfaces:**
- Consumes: `window.YoCVCopy.en`, `window.YoCV` (core.js), `GET /api/cv/config`, `POST /api/cv/record`.
- Produces: `window.YoID = {signIn(id), signOut(), openTab(route), render(), person(), record()}`; `window.YoCVApp = {mount(container, api), useRecord(record, selector), clearDraft(), draftStatus() -> {step, accepted, ready}}` from app.js, where `api = {copy, cfg, confirm(title, text, label, fn), notify(text), onDraftChange()}`; a custom DOM event `yocv:draft` dispatched on `document` whenever the CV state changes, which the shell listens to for the Overview CV card and the hero line.

- [ ] **Step 1: Write the failing tests.** `tests/yoid-shell.test.cjs` reads files as text (no DOM):

```js
const html=read('index.html'),js=read('yoid.js'),css=read('styles.css'),app=read('app.js');
test('index.html is the Yo-ID shell',()=>{
  assert.match(html,/<header class="topbar"[^>]*>/);
  assert.ok(html.includes('class="wordmark"')&&/>yoma</.test(html),'plain-text wordmark');
  assert.ok(!/logo-light|logo-dark|\.webp|yoma-icon/.test(html),'no Yoma image files');
  for(const u of ['https://yoma.world/','https://yoma.world/about','https://yoma.world/opportunities','https://yoma.world/marketplace'])assert.ok(html.includes('href="'+u+'"')&&new RegExp('href="'+u.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')+'"[^>]*rel="noopener"').test(html),u);
  assert.ok(html.includes('<dialog id="menu-drawer"')&&html.includes('<dialog id="user-drawer"'),'drawers are dialogs');
  assert.match(html,/<section class="hero"[\s\S]*<h1 id="greeting" tabindex="-1">/);
  assert.match(html,/<nav id="tabs" aria-label="Yo-ID sections">/);
  assert.ok(html.includes('<main id="main" tabindex="-1">')&&html.includes('<div id="tab-view">')&&html.includes('<div id="view" hidden>'),'tab container and the CV container');
  assert.ok(!html.includes('id="page-band"')&&!html.includes('id="steps"')&&!html.includes('id="mode-pill"'),'old shell gone');
  assert.ok(html.includes('src="yoid.js"')&&html.indexOf('src="app.js"')<html.indexOf('src="yoid.js"'),'app.js loads before yoid.js');
  const foot=html.match(/<footer class="app-footer">[\s\S]*?<\/footer>/)[0];
  assert.ok(foot.includes('id="footer-notice"')&&foot.includes('id="footer-mode"')&&foot.includes('id="footer-fictional"'));
  assert.ok(foot.includes('Independent student prototype. Not operated by Yoma or UNICEF.'));
  assert.ok(!/©|All Rights Reserved|Terms of Service|Privacy Policy|help@yoma/.test(html));
  assert.ok(html.includes('A Yoma concept'),'the concept line survives in About');
});
test('yoid.js signs in on load, routes by hash and keeps one key in sessionStorage',()=>{
  assert.match(js,/sessionStorage\.getItem\('yoid\.person'\)/);assert.match(js,/sessionStorage\.setItem\('yoid\.person'/);assert.match(js,/sessionStorage\.removeItem\('yoid\.person'\)/);
  assert.equal((js.match(/sessionStorage\.setItem\(/g)||[]).length,1,'one key');
  assert.ok(js.includes("searchParams.get('as')")&&js.includes('history.replaceState'),'?as= handled and dropped');
  for(const r of ['#/','#/wallet','#/passport','#/opportunities','#/skills','#/cv'])assert.ok(js.includes("'"+r+"'"),r);
  assert.ok(js.includes("addEventListener('hashchange'"));
  assert.ok(js.includes('window.YoID=')&&/signIn\(|signOut\(|openTab\(/.test(js));
  assert.ok(js.includes('YoCVApp.mount(')&&js.includes('YoCVApp.useRecord(')&&js.includes('YoCVApp.clearDraft(')&&js.includes("addEventListener('yocv:draft'"));
  assert.ok(js.includes('copy.switchTitle')&&js.includes('copy.switchCopy'),'switch with a draft asks first');
  assert.ok(js.includes('copy.greetingNoName')&&js.includes('copy.recordOffline'),'the cold offline start has a person-less path');
  assert.ok(js.includes("getElementById('greeting')")&&js.includes('.focus('),'tab change focuses the greeting');
  assert.ok(!/verified by Yoma/i.test(js));
});
test('app.js is mounted by the shell and no longer owns the chooser or the band',()=>{
  assert.ok(app.includes('window.YoCVApp=')&&app.includes('function mount(')&&app.includes('function useRecord(')&&app.includes('function clearDraft(')&&app.includes('function draftStatus('));
  assert.ok(!app.includes('function setBand')&&!app.includes('#page-band')&&!app.includes('#mode-pill')&&!app.includes('personaHTML')&&!app.includes("'read-record'"));
  assert.match(app,/<h2 class="step-title" tabindex="-1">/);
  assert.match(app,/querySelector\('h2\.step-title'\)\?\.focus\(/);
  assert.ok(app.includes("dispatchEvent(new CustomEvent('yocv:draft'"));
  assert.ok(app.includes("'#/cv/'"),'step changes write the hash');
  assert.ok(!app.includes('start();'),'the shell starts the app');
});
test('the shell styles are scoped and YoCard keeps its rules',()=>{
  const card=read('card.css');
  assert.ok(/body\.yocv-app \.topbar\{[^}]*position:fixed[^}]*height:80px/.test(css),'fixed 80px bar');
  assert.ok(/\.hero\{[^}]*background:var\(--accent\)/.test(css));
  assert.ok(card.includes('.topbar{min-height:72px')&&card.includes('#page-band{background:var(--accent)')&&card.includes('.app-shell{display:grid'),'the old header, band and rail live in card.css');
  assert.ok(!css.includes('#page-band{')&&!css.includes('.sidebar{'),'and not in styles.css');
});
```

   Rewrite `tests/restyle.test.cjs`: keep the glyph test; the token test uses the new `TOKENS` list from Step 3 and allows `box-shadow:var(--shadow)` and the `--shadow:` declaration (assert no other `box-shadow` value); the focus-ring assertion becomes `.hero :focus-visible,.dialog-top :focus-visible{outline-color:var(--panel)}`; the font-link test expects both pages to carry `https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Open+Sans:wght@400;600;700&display=swap`, drops the page-band assertion for index.html (keeps it for card.html) and asserts `A Yoma concept` in card.html and in index.html; the band-focus test keeps `card.js` as is and for `app.js` asserts `querySelector('h2.step-title')?.focus(`; the header test applies to `card.css` (`.topbar{...min-height:72px`); the radii set becomes `['8px','12px','16px','18px','9999px','50%','0']`; the component test keeps the paper, print, toast, summary and dialog-top assertions, drops `.top-actions .phone-hide` and `#page-band` in print, and the print hide list allows the old selectors plus any `body.yocv-app ` prefixed selector. In `tests/yocv-copy.test.cjs` the footer regex stays `<footer class="app-footer">[\s\S]*?<\/footer>` (keep that exact opening tag) and the About regex stays. In `tests/cv-app.test.cjs` drop the `/api/cv/record` route assertion and the `copy.modeLive`, `copy.modeSample`, `copy.modeOffline` assertions from the app.js tests (the shell owns both) and assert them against `yoid.js` in the yoid-shell test; keep every other literal.

- [ ] **Step 2: Run the new and rewritten tests to see them fail.** `node --test tests/yoid-shell.test.cjs tests/restyle.test.cjs`.

- [ ] **Step 3: Implement `styles.css`.** Replace the token line with: `--ink:#020304;--muted:#545859;--line:#dce0e5;--page:#f3f6fa;--panel:#ffffff;--accent:#41204b;--accent-shade:#54365d;--accent-tint:#e7d4ed;--accent-soft:#c3a2cd;--green:#387f6a;--recorded:#2b6a57;--recorded-tint:#e6f5f3;--orange:#f9ab3e;--orange-tint:#fdeed8;--gold:#d48414;--awaiting:#8a5a00;--awaiting-tint:#fdeed8;--stated-tint:#f3f6fa;--blue-tint:#edf6fd;--blue-dark:#2487c5;--type-learning:#007cb4;--type-yoid:#a3195b;--type-default:#5a6675;--error:#b3261e;--error-tint:#ffe9ea;--shadow:0 2px 15px -3px rgba(0,0,0,.07),0 10px 20px -2px rgba(0,0,0,.04)`. Move the `.topbar`, `.brand`, `.concept-tag`, `.top-actions`, `.mode-label`, `#page-band`, `.hl`, `.app-shell`, `.sidebar*`, `#steps`, `.step-button`, `.step-number` rules and their two media-query fragments verbatim into `card.css` (after its first comment), and delete them from styles.css. Add the shell rules, all under `body.yocv-app`: the fixed 80 px bar (purple, wordmark Nunito 900 26 px white, centre links Nunito 600 white hidden under 640 px, the language control, the 44 px avatar with a 2 px white outline); `body.yocv-app{padding-top:80px}`; the drawers (`dialog.drawer` left and right, 20 rem and 22 rem, slide with a 200 ms transform, no motion under `prefers-reduced-motion`); `.hero` (purple, 16 px sides, 32 px top, 16 px bottom, two 6% white circles by `radial-gradient`, the h1 24 px / 30 px from 768 px semibold white with `.hero .first{color:var(--orange)}`, the sub-line `var(--accent-soft)` 14 px, the pill row scrolling sideways); `.pill` (round, 1 px `--line`, 12 px sides, 14 px semibold, min height 36 px, `.pill.current` and `:hover` green with white text); the page column (`.page{max-width:1280px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}`); `.card` (white, `--shadow`, 12 px radius, 16 px padding) and `.section-card` (white, 1 px `--line`, 18 px radius) with `.section-head`, `.icon-square` (40 px, 12 px radius, the tints `.gold .lilac .blue .mint .grey`), `.chevron` rotating when `[open]`; `.breadcrumb` Nunito 800; `.intro` (card with the green info icon); `.empty` (dashed `--line`, 12 px radius); the footer (white, 16 px padding, row from 768 px, `--muted` 14 px, green links); keep every existing CV component rule for now (Task 4 re-skins them) and update the print block: hide `body.yocv-app .topbar,body.yocv-app .hero,body.yocv-app #tabs,body.yocv-app .app-footer,body.yocv-app #tab-view` plus the old list minus `#page-band` and `.sidebar`.

- [ ] **Step 4: Implement `index.html`.** The head keeps the icon, the preconnects, the font link with `700;800;900`, styles.css, and the scripts in the order cv-copy.js, cv-rules.js, core.js, app.js, yoid.js. The body: the skip link; `<header class="topbar" id="topbar">` with the hamburger button (`id="menu-button"`, `aria-label` from copy), `<a class="wordmark" href="#/">yoma</a>`, `<nav class="top-links" aria-label="Yoma">` with the four external links (`rel="noopener"`), `<div class="top-actions">` with `<button class="language" disabled title="English only">English</button>` and `<button id="avatar-button" class="avatar" aria-haspopup="dialog">` (content set by JS) and `<button id="login-button" class="primary login" hidden>`; `<dialog id="menu-drawer" class="drawer left">` and `<dialog id="user-drawer" class="drawer right">` with empty bodies the JS fills; `<section class="hero"><div class="hero-inner"><h1 id="greeting" tabindex="-1"></h1><button id="yoid-info" class="info-button"></button><p id="hero-line"></p><nav id="tabs" aria-label="Yo-ID sections"></nav></div></section>`; `<main id="main" tabindex="-1"><div class="page"><div id="tab-view"></div><div id="view" hidden></div></div></main>`; `<footer class="app-footer">` with `<span id="footer-notice">Independent student prototype. Not operated by Yoma or UNICEF.</span> <span id="footer-mode"></span> <span id="footer-fictional"></span>` and the links `About this prototype` (`id="about-button"`), `Source` (the GitHub repository, `rel="noopener"`), `Reset` (`id="reset-button"`), then `<span class="wordmark dark">yoma</span>`; `#toast`; the About dialog with its first paragraph starting `YoCV is an independent student concept for Yoma. A Yoma concept, not a Yoma product.` and every existing honesty sentence kept; the confirm dialog unchanged; a new `<dialog id="yoid-dialog">` (What is Yo-ID) and `<dialog id="detail-dialog">` for credential details; `noscript` unchanged.

- [ ] **Step 5: Implement `yoid.js`** (an IIFE like app.js, after app.js). State: `{cfg, copy, person, record, selector, tab, offline, signedOut}`. `boot()`: fetch config (offline on failure, as app.js did), resolve the person (`?as=` → stored → first persona → none), call `YoCVApp.mount(document.querySelector('#view'), api)`, then `signIn(id)` which POSTs `/api/cv/record`, stores the person id, calls `YoCVApp.useRecord(record, selector)`, renders; `signOut()` clears person, record, storage, calls `YoCVApp.clearDraft()`, sets `signedOut`, renders the signed-out card on every tab with the Log in button opening the account list; `openTab(route)` sets the hash. `render()`: the avatar (initials, hue `hashHue(name)`), the greeting by local hour (`greetingMorning` before 12, `greetingAfternoon` before 18, else evening; `greetingNoName` with no person), the hero line (Overview: `cvTileNote` wording when no draft, the draft line when `draftStatus().step>0`; other tabs: the blurb), the pills with `aria-current="page"` on the current one, the tab view for the route (Task 3 fills the five tabs; this task renders the Overview grid with the CV card and the four section cards in their closed state with previews from the record), shows `#view` only on `#/cv*` and hands the step number to `YoCVApp` (`mount` returns `{showStep(n)}`), the footer: `#footer-mode` from `copy.modeOffline|modeLive|modeSample`, `#footer-fictional` from `copy.footerFictional` when `cfg.accounts.source==='sample'`. The drawers: `menu-drawer` rows per spec; `user-drawer` band with avatar, name, town, pills `Switch account` and `About this prototype`, then the four section cards, then `Sign out`; the account list inside the drawer. Switching with `draftStatus().step>0` or any entry text calls `api.confirm(copy.switchTitle, copy.switchCopy, copy.switchAccount, ...)`. `hashchange` → `render()` and focus `#greeting`. `yocv:draft` → re-render the Overview CV card and the hero line only. Token mode (`cfg.accounts.source==='token'`): `signIn()` posts `{}`, the account list holds the one account with no switch, nothing is stored and `?as=` is ignored; Sign out and Log in work as in sample mode. Cold offline start (config fetch failed): no person, `greetingNoName`, the generic avatar, each tab the page empty state with `copy.recordOffline`, the CV tab mounted as today's offline path; `#footer-mode` reads `modeOffline`.

- [ ] **Step 6: Implement the `app.js` changes.** Wrap the load-time lookups in `mount(container, api)`: `view = container`, `copy = api.copy`, `cfg = api.cfg`, `confirmAction` and `notify` delegate to `api`, the view listeners bind inside `mount`; remove `steps`, `pill`, `updatePill`, `renderSteps`, `setBand`, the brand and reset bindings, the `#about-button` binding and `start()` (the shell owns them; reset is `clearDraft()` called by the shell's Reset link with the confirm copy). `recordStep()` renders, in offline mode, exactly as today; otherwise `head(1, copy.labelYoma)` followed by `recordHTML(state.record)` and `roleHTML()` and the footer, with no chooser, no lead, no read button. `head()` emits `<h2 class="step-title" tabindex="-1">` and the step pills row `<ol class="step-pills" aria-label="Steps">` with `Step n of 4: title` items (`aria-current="step"` on the current, disabled above `maxStep`, clickable through `enter(n)`). `go(step)` also sets `location.hash` to `'#/cv'` for step 0 and `'#/cv/'+(step+1)` otherwise (guarding against re-entrancy), focuses `h2.step-title`, and dispatches `yocv:draft`. `useRecord(record, selector)` does what the success branch of `readRecord` did (ticks, contact prefill with the pinned literal, role auto-pick by `cfg.accounts.personas.find(p=>p.id===selector.persona)`, `loadMenu`). `clearDraft()` is the old reset body without the confirm. `draftStatus()` returns `{step:state.step, accepted:Object.values(state.decisions).filter(d=>d.decision==='accepted'||d.decision==='edited').length, ready:C.readyForCv(state)}`. `showStep(n)` renders step `n` when allowed (`n<=state.maxStep`), else step 0. Every `render()` dispatches `yocv:draft`. Export `window.YoCVApp={mount,useRecord,clearDraft,draftStatus}`.

- [ ] **Step 7: Run the suite.** `npm test`: fail 0. Open the page in the browser preview (`.claude/launch.json`, `yocv`) and check: the dashboard loads signed in as Thandi; the six pills switch tabs; the CV tab shows step 1 as "Confirmed from Yoma" with the ticks and the role; `#/cv/3` on a reload with no draft lands on step 1; Sign out shows the signed-out card and clears `sessionStorage`; Switch account with a typed answer asks first. Note results in the task report.

- [ ] **Step 8: Commit.** `feat(yoid): Yo-ID shell with sign-in state, hash tabs and the CV tab mount`.

### Task 3: The Overview bodies and the four read-only tab pages

**Files:**
- Modify: `yoid.js`, `styles.css`
- Test: `tests/yoid-tabs.test.cjs` (new)

**Interfaces:**
- Consumes: the record shape `{completions:[{evidenceId,title,organizationName,month,opportunityId,skills:[{name}]}], credentials:[{id,title,issuer,status,month,skills:[names],completionId}], selfAttested:[{id,name}], wallet}` and `window.YoID`.
- Produces: pure renderers exported on `window.YoID.views = {overview(record, draft), wallet(record), passport(record), opportunities(record), skills(record), skillsOf(record)}` returning HTML strings, so tests can run them in Node with a small `escapeHTML` from core.js.

- [ ] **Step 1: Write the failing tests.** `tests/yoid-tabs.test.cjs` loads `yoid.js` in a `vm` context with stubs for `window`, `document` (a minimal object whose `querySelector` returns `null` and `addEventListener` is a no-op), `sessionStorage`, `location`, `history`, `fetch` (never called), `window.YoCVCopy`, `window.YoCV` (require core.js) and `window.YoCVApp` (stub `mount` returning `{showStep(){}}`), then reads `window.YoID.views`. Fixture: the Thandi record from `tests/fixtures/cv-thandi.json` if it has one, else a hand-built record with three completions, three Issued credentials from Alison Learning and UNICEF Kenya, no self-attested skills, and `sipho` = `{completions:[],credentials:[],selfAttested:[],wallet:'sample'}`.

```js
test('overview previews come from the record and nothing is invented',()=>{
  const h=views.overview(thandi,{step:0,accepted:0,ready:false});
  assert.ok(h.includes('Wallet being set up')&&!/\d+ ZLTO|available ·/.test(h),'no ZLTO figure');
  assert.ok(h.includes('3 Learning')&&!h.includes('YoID Identity'));
  assert.ok(h.includes('3 completed · 0 pending · 0 declined · 0 saved'));
  assert.ok(h.includes('Cosmetics · Customer Service · Financial Management'));
  assert.ok(h.includes('A CV built from your Yo-ID.')&&h.includes('Open CV')&&h.includes('href="#/cv"'));
  const d=views.overview(thandi,{step:1,accepted:2,ready:false});
  assert.ok(d.includes('Draft at step 2 of 4 · 2 lines accepted')&&d.includes('Continue CV'));
  assert.ok(views.overview(thandi,{step:3,accepted:3,ready:true}).includes('Ready to print or download'));
  assert.ok(!/coming soon/i.test(h));
});
test('empty records show the Yoma empty states',()=>{
  const h=views.overview(sipho,{step:0,accepted:0,ready:false});
  assert.ok(h.includes('No credentials yet')&&h.includes('No opportunities yet')&&h.includes('No skills yet')&&h.includes('0 completed'));
  assert.ok(!/undefined|NaN|null/.test(h));
  for(const v of ['wallet','passport','opportunities','skills'])assert.ok(!/undefined|NaN/.test(views[v](sipho)),v);
  assert.ok(views.passport(sipho).includes('Complete an opportunity to get a verified credential: proof of what you did.'));
});
test('passport cards carry the record status, not Verified',()=>{
  const h=views.passport(thandi);
  assert.equal((h.match(/class="cred-card"/g)||[]).length,3);
  assert.ok(h.includes('>Issued<')&&!/>Verified</.test(h));
  assert.ok(h.includes('Alison Learning')&&h.includes('View credential'));
  assert.ok(h.includes('Yo-ID')&&h.includes('Passport'),'breadcrumb');
  assert.ok(!/verified by Yoma/i.test(h));
});
test('opportunity cards link to the live Yoma page only when the record holds an id',()=>{
  const h=views.opportunities(thandi);
  assert.ok(h.includes('https://yoma.world/opportunities/')&&h.includes('rel="noopener"'));
  const noId={...thandi,completions:[{...thandi.completions[0],opportunityId:null}]};
  assert.ok(!views.opportunities(noId).includes('View opportunity'));
  assert.ok(h.includes('Completed')&&h.includes('Skills developed'));
});
test('skills tiles de-duplicate by name and label self-attested ones',()=>{
  const rec={...thandi,selfAttested:[{evidenceId:'a1',id:'x',name:'Cosmetics'},{evidenceId:'a2',id:'y',name:'Braiding'}]};
  const names=views.skillsOf(rec).map(s=>s.name);
  assert.deepEqual(names,['Cosmetics','Customer Service','Financial Management','Braiding']);
  const h=views.skills(rec);
  assert.ok(h.includes('Skill issued by 1 partner')&&h.includes('Self-attested'));
});
test('no arrows or Yoma assets in the views',()=>{
  const all=['overview','wallet','passport','opportunities','skills'].map(v=>views[v](thandi)).join('');
  for(const g of ['→','←','✓','×'])assert.ok(!all.replace(/<svg[\s\S]*?<\/svg>/g,'').includes(g));
  assert.ok(!/\.webp|\.png|logo-/.test(all));
});
```

- [ ] **Step 2: Run them to see them fail.**

- [ ] **Step 3: Implement the views in `yoid.js`** as pure functions of the record and the draft status, built with the shell classes from Task 2 plus: `.grid-2` (two columns from 1024 px), `.circles` (the four opportunity circles with a conic ring drawn by `conic-gradient(var(--orange) 0 {pct}%, var(--green) 0)` and the 2 px orange border), `.chip` (green-light, green text, round, 13 px bold rendered at 14 px), `.cred-grid` (1, 2, 3, 4 columns at 600, 900, 1200 px), `.cred-card` with `.cred-band` tinted `color-mix(in srgb, var(--type-learning) 10%, white)` and the issuer's initial in a white circle, `.type-chip` (solid `--type-learning`, white, 4 px radius), `.status-pill` (`Issued` on `--stated-tint`), `.skill-tile`, the credential detail dialog (`#detail-dialog` filled with Status, Issuer, Date issued, Skills and the Yoma link when `opportunityId` exists). Opportunities uses `https://yoma.world/opportunities/{opportunityId}` with `rel="noopener"`. `skillsOf(record)` returns `[{name, source:'completion'|'self', issuer}]` de-duplicated by name in first-seen order, completions first. Overview counts: credentials length, completions length, `skillsOf` length. Wire the Overview section cards to open and close (a `details`-like toggle on the header button with `aria-expanded`), with the Wallet body the pending copy, the Passport body the type pills, the Opportunities body the circles, the Skills body up to eight chips, each followed by its `Open …` link to the tab route.

- [ ] **Step 4: Run the suite** and open each tab in the browser preview at 360 and 1280 px; note overflow (`scrollWidth === innerWidth`) in the report.

- [ ] **Step 5: Commit.** `feat(yoid): Overview cards and the Wallet, Passport, Opportunities and Skills tabs`.

### Task 4: The CV steps in the shell's components

**Files:**
- Modify: `styles.css`, `app.js` (class names only where a component changes), `tests/restyle.test.cjs`

**Interfaces:**
- Consumes: the CV step markup (`.form-section`, `.claim-card`, `.claim-actions`, `.tag`, `.primary`, `.secondary`, `.evidence-list`, `.cv-paper`, `.opportunities`).
- Produces: the re-skinned rules; the step pills; no change to any route, copy or check.

- [ ] **Step 1: Write the failing tests** in `tests/restyle.test.cjs` (component block): `.primary{background:var(--green)` with `:hover` `var(--recorded)`; `.secondary{...border:1px solid var(--green)` kept; `#view>.form-section,.claim-card{...box-shadow:var(--shadow)...border-radius:12px`; `.step-pills` present with `.step-pills .pill[aria-current="step"]` green; `.tag.recorded`, `.tag.awaiting`, `.tag.stated` kept; `.cv-paper{...border-radius:12px`; the print block unchanged in behaviour (`.cv-paper{border:0;border-radius:0;padding:0}`, `@page{margin:18mm}`), and the shell hidden in print by `body.yocv-app` selectors.

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement.** Cards: white, `--shadow`, 12 px radius, 16 px padding (24 px from 768 px); the primary button green with white text and the darker green hover; secondary white with a green border and green text; the step pills row above each step title; the review's Accept, Edit and Leave out as `.pill` buttons; `.tag` chips at 14 px with the existing tints; inputs with `--line` borders and 8 px radius; the opportunities block as `.card`s; the paper keeps its typography. Phone rules: the pills wrap, cards keep 16 px padding, the primary button full width in `.form-footer`.

- [ ] **Step 4: Run the suite** and walk the four steps in the browser preview at 360 and 1280 px, then measure print by applying the print rules by script as testing-log row 5 did.

- [ ] **Step 5: Commit.** `feat(yoid): CV steps in the shell's cards, pills and buttons`.

### Task 5: Documentation and the demo script

**Files:**
- Modify: `README.md`, `presentation/demo-script.md`, `integration/yoma/README.md`, `docs/testing-log.md`

- [ ] **Step 1: README.** The YoCV row of the component table describes the shell: opens signed in to a Yo-ID dashboard (sample person), six tabs, the CV under the CV tab; a new short section "The Yo-ID shell" after the development setup: what is Yoma's look and what is not Yoma (no logo, no login, the footer notice), the `?as=<id>` link, the avatar menu, and the sentence that the shell mirrors the integration pack's `/yoid/cv` page. The walkthrough (today's numbered list 1 to 4) starts "The app opens signed in as Thandi on the Overview. Open CV." The real-versus-simulated table gains a row "Yo-ID dashboard | Rendered from the same sample record; the Wallet shows no ZLTO because none is recorded; the look follows Yoma's web app, nothing is copied from it".
- [ ] **Step 2: Demo script.** The 0:00 beat becomes the dashboard: "This is Thandi's Yo-ID. Yoma's own dashboard promises a CV built from it; here it is." then Open CV; the rest unchanged; the avatar menu's Switch account replaces the chooser in the preparation.
- [ ] **Step 3: Integration pack README.** One paragraph in the web section: the standalone now renders the same YoID structure (greeting band, tabs, Overview cards, `/yoid/cv` as the CV tab) so the two can be compared side by side; the pack's page is unchanged.
- [ ] **Step 4: Testing log.** A new section "# Yo-ID shell, 2026-11-22" with rows for the suite, the six tabs at 360 and 1280 px, the drawers by keyboard, Switch account with a draft, Sign out and Log in, the four CV steps, the print measurement, the cold offline start and the offline-after-online path. Rows the implementer cannot run are marked for the controller.
- [ ] **Step 5: Commit.** `docs(yoid): README, demo script, pack note and testing-log rows for the shell`.
