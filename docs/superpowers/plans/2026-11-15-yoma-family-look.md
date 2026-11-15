# Yoma Family Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle YoCV, YoCard and the public card page in Yoma's design language (purple and green, Nunito and Open Sans, pills, borderless 16 px cards, purple page band) without changing any flow, label or fixed string.

**Architecture:** Buildless vanilla HTML/CSS/JS. `styles.css` owns the tokens and shared components, `card.css` extends it, `server/card/render.js` inlines the same values for the public page. The step heading moves into a new viewport-wide `#page-band` by DOM move after each render, so the view templates stay untouched. `tests/restyle.test.cjs` pins the new system.

**Tech Stack:** HTML, CSS custom properties, ES2020, Node 20 `node:test`. Google Fonts via `<link>` with a system fallback.

**Spec:** `docs/superpowers/specs/2026-11-15-yoma-family-look-design.md` (read it first; the token table and the Design section are the contract).

## Global Constraints

- Tokens, exactly: `--ink:#020304`, `--muted:#545859`, `--line:#dce0e5`, `--page:#f3f6fa`, `--panel:#ffffff`, `--accent:#41204b`, `--accent-shade:#54365d`, `--accent-tint:#e7d4ed`, `--green:#387f6a`, `--recorded:#2b6a57`, `--recorded-tint:#e6f5f3`, `--orange:#f9ab3e`, `--awaiting:#8a5a00`, `--awaiting-tint:#fdeed8`, `--stated-tint:#f3f6fa`, `--error:#b3261e`, `--error-tint:#ffe9ea`. No other hex literal in `styles.css` or `card.css` (token values themselves may appear only inside `:root`, except `#ffffff` which may be written where white text is needed, and `rgba(2,3,4,.5)` for the dialog backdrop).
- Radii in the sheets: only `8px`, `16px`, `9999px`, `50%`.
- No `@import`, `text-transform`, `letter-spacing`, or `box-shadow` other than `none`. No `font-size` under 14 px outside `@media print`.
- Focus: `button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}` stays verbatim; add `#page-band :focus-visible,.dialog-top :focus-visible{outline-color:var(--panel)}`.
- Fonts: both HTML pages carry `<link rel="preconnect" href="https://fonts.googleapis.com">`, `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` and `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Open+Sans:wght@400;600;700&display=swap">`. Headings `font-family:"Nunito",system-ui,sans-serif`; body `font-family:"Open Sans",system-ui,sans-serif`.
- No copy changes except `<span class="hl">already done</span>` inside the YoCV landing h1. All `STRINGS` in `render.js`, the `card.js` mirror and every label in `app.js`/`card.js` unchanged. `core.js` untouched.
- 44 px targets, 14 px floor, 360 px and 375 px without horizontal overflow, every text pair at 4.5:1 or better (the token table was checked; do not introduce new pairs).
- Page files (`index.html`, `card.html`, `app.js`, `card.js`) stay free of the glyphs `↗ → ← ✓ × ◷ ○`, of `STEP 0N` eyebrows and of `Let’s`.
- Commit after each task with a conventional message ending `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Offline or open-from-disk: the Google Fonts request fails; pages must render in the system stack with identical layout (test: `styles.css` font stacks end in `system-ui,sans-serif`; manual check with the stylesheet link blocked).
2. 360 px header with "Sample mode (offline)" and "About this demo" / "Need a CV?": no horizontal overflow (header wraps to two rows under 640 px; Task 1 test asserts the `@media(max-width:640px)` rule sets `.topbar{flex-wrap:wrap}`).
3. Keyboard focus inside the purple band and the dialog header: ring must be white there (Task 1 test asserts the scoped rule).
4. Public page without JavaScript: the Check now form and the stated tier remain visually distinct after `--stated` stops tinting (Task 4 test asserts `.stated{border-left:6px solid var(--grey)` and no `background:var(--stated)` on `.stated`).
5. Print: the band, header and pills must not print and the CV paper must lose its radius and ground (Task 2 test asserts `#page-band` is in the print `display:none` list and `.cv-paper{border:0;border-radius:0;padding:0}` in print).

---

### Task 1: Tokens, fonts, header, page band and step card

**Files:**
- Modify: `styles.css` (`:root`, resets, type scale, header, rail sections; add `#page-band`)
- Modify: `index.html`, `card.html` (font links, `#page-band` element, `.topbar` unchanged otherwise)
- Modify: `app.js` (`go()` line 24, `render()` line 108, landing h1 line 56), `card.js` (`go()` line 35, `render()` line 93)
- Test: `tests/restyle.test.cjs` (rewrite)

**Interfaces:**
- Produces: `#page-band` (a `<div id="page-band" class="page-band">` placed directly after `</header>` in both pages, before `.app-shell`); `setBand()` in both scripts: moves `.step-line` and `h1` out of `#view` into `#page-band` after each render; the class `.hl` on the landing h1 phrase.

- [ ] **Step 1: Rewrite the failing test**

Replace `tests/restyle.test.cjs` with these tests (keep the `read`, `stripSvg`, `stripPrint` helpers and the glyph test unchanged):

```js
const TOKENS=['--ink:#020304','--muted:#545859','--line:#dce0e5','--page:#f3f6fa','--panel:#ffffff','--accent:#41204b','--accent-shade:#54365d','--accent-tint:#e7d4ed','--green:#387f6a','--recorded:#2b6a57','--recorded-tint:#e6f5f3','--orange:#f9ab3e','--awaiting:#8a5a00','--awaiting-tint:#fdeed8','--stated-tint:#f3f6fa','--error:#b3261e','--error-tint:#ffe9ea'];
const FONT_LINK='https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Open+Sans:wght@400;600;700&display=swap';

test('stylesheets use the seventeen Yoma tokens, the two Yoma faces and no template effects',()=>{
 const css=SHEETS.map(read).join('\n');
 for(const t of TOKENS)assert.ok(css.includes(t),'missing token '+t);
 assert.equal((read('styles.css').match(/:root\{/g)||[]).length,1);
 assert.ok(!css.includes('@import'));
 assert.ok(!/text-transform/.test(css));
 assert.ok(!/letter-spacing/.test(css));
 assert.ok(!/box-shadow\s*:\s*(?!none)/.test(css));
 assert.ok(/font-family:"Nunito",system-ui,sans-serif/.test(css),'Nunito stack with system fallback');
 assert.ok(/font-family:"Open Sans",system-ui,sans-serif/.test(css),'Open Sans stack with system fallback');
 assert.ok(!/DM Sans|Manrope|IBM Plex/.test(css));
 const hexes=new Set((css.match(/#[0-9a-f]{3,8}\b/gi)||[]).map(h=>h.toLowerCase()));
 const allowed=new Set(TOKENS.map(t=>t.split(':')[1]));
 for(const h of hexes)assert.ok(allowed.has(h),'untokenised colour '+h);
 const screen=stripPrint(css);
 for(const m of screen.match(/font-size:\s*(\d+)px/g)||[])assert.ok(Number(m.match(/\d+/)[0])>=14,'font size under 14px: '+m);
 assert.ok(css.includes('button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}'),'focus ring');
 assert.ok(css.includes('#page-band :focus-visible,.dialog-top :focus-visible{outline-color:var(--panel)}'),'white focus ring on purple');
 assert.ok(/overflow-wrap:anywhere/.test(css));
 assert.ok(/@media print\{/.test(css));
 assert.ok(/prefers-reduced-motion/.test(css));
 assert.ok(!read('card.css').includes(':root'),'card.css defines no tokens');
});

test('both pages load the Yoma faces once and carry the page band',()=>{
 for(const f of ['index.html','card.html']){
  const s=read(f);
  assert.equal((s.match(/fonts\.googleapis\.com\/css2/g)||[]).length,1,f+' font link count');
  assert.ok(s.includes(FONT_LINK),f+' font link');
  assert.ok(s.includes('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'),f+' preconnect');
  assert.ok(/<\/header>\s*<div id="page-band" class="page-band">/.test(s),f+' page band after header');
  assert.ok(s.includes('A Yoma concept'),f+' concept line');
 }
 assert.ok(read('card.html').includes('Not operated by Yoma or UNICEF'));
});

test('the step heading moves into the band and receives focus there',()=>{
 for(const f of ['app.js','card.js']){
  const s=read(f);
  assert.ok(/function setBand\(\)/.test(s),f+' setBand');
  assert.ok(s.includes("document.querySelector('#page-band h1')?.focus("),f+' focuses the band h1');
  assert.ok(!s.includes("view.querySelector('h1')?.focus("),f+' no longer focuses the view h1');
 }
 assert.ok(read('app.js').includes('work you have <span class="hl">already done</span>'),'landing highlight');
 assert.ok(!read('card.js').includes('class="hl"'),'no highlight in YoCard');
});

test('the header wraps on phones instead of overflowing',()=>{
 const css=read('styles.css');
 assert.ok(/@media\(max-width:640px\)\{[^}]*\.topbar\{[^}]*flex-wrap:wrap/.test(css)||/\.topbar\{[^}]*flex-wrap:wrap/.test(css),'topbar wraps');
 assert.ok(/\.topbar\{[^}]*min-height:72px/.test(css),'72px min-height, not fixed height');
 assert.ok(!/\.topbar\{[^}]*;height:64px/.test(css));
});
```

Keep the existing `'the public card page and SVG use the accent and no uppercase labels'` test as is.

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/restyle.test.cjs`
Expected: FAIL on missing tokens, font stacks, page band, setBand.

- [ ] **Step 3: Implement**

`styles.css`:
- `:root` gets the seventeen tokens; `font-family:"Open Sans",system-ui,sans-serif;font-size:16px;line-height:1.5;color:var(--ink);background:var(--page)`.
- Headings: `h1,h2,h3,.brand,.cv-name{font-family:"Nunito",system-ui,sans-serif}`; `h1{font-size:32px;line-height:1.2;font-weight:800}` (36 px from `@media(min-width:1024px)`), `h2{font-size:22px;font-weight:700}`, `h3{font-size:18px;font-weight:700}`.
- `.topbar{min-height:72px;background:var(--panel);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;padding:12px 24px;gap:12px 16px}` (no border). `.brand{font-size:26px;font-weight:800;...}`. `.mode-label` becomes a pill tag: `display:inline-flex;align-items:center;min-height:32px;padding:4px 12px;border-radius:9999px;font-size:14px;font-weight:600;background:var(--stated-tint);color:var(--muted)`; `.mode-label.live{background:var(--accent-tint);color:var(--accent)}`. `.top-actions .text-button` and the header `<a class="text-button">` get the secondary-pill look through a new rule `.top-actions .text-button{min-height:44px;padding:0 20px;border-radius:9999px;border:1px solid var(--green);color:var(--recorded);background:var(--panel);text-decoration:none;font-weight:600}` (keep `white-space:nowrap`).
- `#page-band{background:var(--accent);color:#ffffff;padding:32px 24px}` with an inner max-width of 1024 px via `#page-band>*{max-width:1024px;margin-left:auto;margin-right:auto}`; `#page-band .step-line{color:#ffffff;margin-bottom:8px}`; `#page-band h1{color:#ffffff}`; `.hl{color:var(--orange)}`; `#page-band:empty{display:none}`.
- Step card: `.app-shell{display:grid;grid-template-columns:240px minmax(0,1fr);gap:24px;max-width:1024px;margin:24px auto;padding:0 24px}`; `.sidebar{background:var(--panel);border:0;border-radius:16px;padding:24px 16px;align-self:start}`; `.step-number{width:32px;height:32px;border:2px solid var(--muted);border-radius:50%;font-weight:600}`; `.active .step-number{background:var(--accent);border-color:var(--accent);color:#ffffff}`; `.completed .step-number{background:var(--green);border-color:var(--green);color:#ffffff}`; `.step-button{font-weight:600;color:var(--muted)}`, `.step-button.active{color:var(--accent)}`.
- `main{padding:0 0 48px;max-width:none}`; `.lead{margin-top:0;margin-bottom:16px}` (the lead now opens the view).
- Phone rule: under 640 px `.topbar{padding:12px 16px}`; the mode label keeps its pill and may take the second row (`order:3;flex-basis:100%` on `#mode-pill`).
- Replace `#2f1537` with `var(--accent-shade)`.
- Add the scoped focus rule from Global Constraints.

`index.html`, `card.html`: add the three font `<link>` tags after the icon link; insert `<div id="page-band" class="page-band"></div>` directly after `</header>`.

`app.js`: add `function setBand(){const band=document.querySelector('#page-band');if(!band)return;band.innerHTML='';const line=view.querySelector('.step-line'),h=view.querySelector('h1');if(line)band.appendChild(line);if(h)band.appendChild(h);}`; call `setBand()` in `render()` right after `view.innerHTML=...`; in `go()` replace `view.querySelector('h1')?.focus(` with `document.querySelector('#page-band h1')?.focus(`; in `landing()` change the h1 text to `Build a first CV from work you have <span class="hl">already done</span>`. `card.js`: the same `setBand()` and the same two edits (no highlight).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: `tests/restyle.test.cjs` passes except assertions that belong to Task 2 (there are none in this file about radii yet); all other suites pass.

- [ ] **Step 5: Commit**

```bash
git add styles.css index.html card.html app.js card.js tests/restyle.test.cjs
git commit -m "feat(look): Yoma tokens, faces, page band and header"
```

### Task 2: Shared components in styles.css

**Files:**
- Modify: `styles.css` (Content, Buttons, Forms, Tags, Choice rows, Notices, Claim cards, Evidence step, CV paper, Evidence record and opportunities, Footer/toast/dialog, media queries)
- Test: `tests/restyle.test.cjs` (add one test)

**Interfaces:**
- Consumes: tokens from Task 1.
- Produces: class rules used unchanged by `app.js` and `card.js` templates: `.primary`, `.secondary`, `.small`, `.text-button`, `.back-link`, `.tag.recorded|awaiting|stated|neutral|ai`, `.choice`, `.notice`, `.error-message`, `.claim-card`, `.evidence-list`, `.drop-zone`, `.cv-paper`, `.record-row`, `.opp-item`, `.app-footer`, `dialog`, `.dialog-top`.

- [ ] **Step 1: Write the failing test**

```js
test('components follow the Yoma shapes',()=>{
 const css=read('styles.css');
 const radii=new Set((css.match(/border-radius:([^;}]+)/g)||[]).map(r=>r.replace('border-radius:','').trim()));
 for(const r of radii)assert.ok(['8px','16px','9999px','50%','0'].includes(r),'radius '+r);
 assert.ok(/\.primary,\.secondary\{[^}]*border-radius:9999px/.test(css),'pill buttons');
 assert.ok(/\.primary:hover\{background:var\(--accent-shade\)/.test(css));
 assert.ok(/\.secondary\{[^}]*border:1px solid var\(--green\)/.test(css));
 assert.ok(/input,textarea\{[^}]*border:1px solid var\(--muted\)/.test(css),'input border');
 assert.ok(/\.tag\{[^}]*border-radius:9999px/.test(css),'tag pills');
 assert.ok(/\.tag\.ai\{background:var\(--accent-tint\);color:var\(--accent\)\}/.test(css));
 assert.ok(/\.claim-card\{[^}]*border-radius:16px/.test(css));
 assert.ok(!/\.claim-card\{[^}]*border:1px/.test(css),'no card borders');
 assert.ok(/\.cv-paper\{[^}]*border-radius:16px/.test(css));
 assert.ok(/\.dialog-top\{[^}]*background:var\(--accent\)/.test(css),'dialog header band');
 assert.ok(/\.notice\{[^}]*background:var\(--accent-tint\)/.test(css));
 assert.ok(/\.error-message\{[^}]*background:var\(--error-tint\)/.test(css));
 const print=css.match(/@media print\{[\s\S]*$/)[0];
 assert.ok(/#page-band/.test(print),'band hidden in print');
 assert.ok(/\.cv-paper\{border:0;border-radius:0;padding:0\}/.test(print),'flat CV in print');
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node --test tests/restyle.test.cjs`

- [ ] **Step 3: Implement the component rules in `styles.css`**

Follow the spec's Design section. Decisions the regexes above fix: `.primary,.secondary{min-height:44px;padding:8px 24px;border-radius:9999px;font-size:16px;font-weight:600;...}`; `.primary{background:var(--accent);color:#ffffff;border:1px solid var(--accent)}.primary:hover{background:var(--accent-shade);border-color:var(--accent-shade)}`; `.secondary{background:var(--panel);color:var(--recorded);border:1px solid var(--green)}.secondary:hover{background:var(--recorded-tint)}`; `.small{min-height:36px;padding:4px 16px}`; `input,textarea{width:100%;border:1px solid var(--muted);border-radius:8px;background:var(--panel);padding:12px 16px;min-height:48px;...}`; `.tag{display:inline-block;padding:4px 12px;border-radius:9999px;font-size:14px;font-weight:600;line-height:1.5}` with `.tag.recorded`, `.tag.awaiting`, `.tag.stated,.tag.neutral{background:var(--stated-tint);color:var(--muted)}`, `.tag.ai{background:var(--accent-tint);color:var(--accent)}`; choice list `.choice-list{display:grid;gap:12px;margin-top:16px}.choice{background:var(--panel);border:2px solid transparent;border-radius:16px;padding:16px;...}.choice.selected{border-color:var(--accent);background:var(--accent-tint)}.radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--muted)}.selected .radio{border:6px solid var(--accent)}`; `.notice{background:var(--accent-tint);border:0;border-radius:16px;padding:16px 24px}`; `.error-message{background:var(--error-tint);border:0;border-radius:16px;color:var(--error);padding:16px 24px}`; `.claim-card{background:var(--panel);border-radius:16px;padding:24px;margin-top:16px}`; `.form-section,.evidence-list,.sample-preview,.evidence-record,.opportunities` as white 16 px cards (24 px padding, 16 px under 640 px) with rules between rows; `.drop-zone{border:1px dashed var(--muted);border-radius:8px}`; `.cv-paper{background:var(--panel);border-radius:16px;padding:32px}`; `.cv-name{font-size:28px;font-weight:800}`; `.opp-logo{width:40px;height:40px;border:1px solid var(--line);border-radius:50%}`; `#toast{border-radius:9999px}`; `dialog{border:0;border-radius:16px;padding:0 0 24px;max-width:680px}dialog::backdrop{background:rgba(2,3,4,.5)}.dialog-top{background:var(--accent);color:#ffffff;min-height:64px;padding:12px 24px;border-radius:16px 16px 0 0}` (note: `16px 16px 0 0` is not in the allowed radii list, so instead keep `dialog{overflow:hidden}` and give `.dialog-top` no radius), `.dialog-top h2{color:#ffffff;margin:0}`, `.dialog-top .text-button{color:#ffffff;border:1px solid #ffffff;border-radius:9999px;padding:0 16px;text-decoration:none}`, `dialog>:not(.dialog-top){margin-left:24px;margin-right:24px}`; `.form-footer{border-top:0;margin-top:24px}`; `.back-link` unchanged; `.app-footer{border-top:0}`.
- Map AI tags: in `app.js` line 75 `generatedTag` returns `tag neutral` for "AI-suggested" and `card.js` has the equivalent; change those two class strings to `tag ai` (words unchanged). `updatePill()` already sets `mode-label live`.
- Media queries: keep the 960 px rail collapse (strip becomes a white 16 px card with circles in a row), the 640 px phone rules, reduced motion, print (add `#page-band` to the hidden list and `.cv-paper{border:0;border-radius:0;padding:0}`).

- [ ] **Step 4: Run the tests**

Run: `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add styles.css app.js card.js tests/restyle.test.cjs
git commit -m "feat(look): pills, cards, tags and dialog in Yoma shapes"
```

### Task 3: YoCard components in card.css

**Files:**
- Modify: `card.css`
- Test: `tests/restyle.test.cjs` (add one test)

- [ ] **Step 1: Write the failing test**

```js
test('YoCard components follow the same shapes',()=>{
 const css=read('card.css');
 const radii=new Set((css.match(/border-radius:([^;}]+)/g)||[]).map(r=>r.replace('border-radius:','').trim()));
 for(const r of radii)assert.ok(['8px','16px','9999px','50%','0'].includes(r),'radius '+r);
 assert.ok(/\.tier\{[^}]*border-radius:16px/.test(css));
 assert.ok(/\.tier\.confirmed\{border-left:6px solid var\(--green\)\}/.test(css));
 assert.ok(/\.tier\.stated\{border-left:6px solid var\(--muted\)\}/.test(css));
 assert.ok(/\.trade\{[^}]*border-radius:16px/.test(css));
 assert.ok(!/border:1px solid var\(--line\)/.test(css.replace(/img\{[^}]*\}/g,'')),'no bordered boxes except logos');
});
```

- [ ] **Step 2: Run it to confirm it fails**, then **Step 3: Implement**

`.trade-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.trade{min-height:44px;padding:12px 16px;border:2px solid transparent;border-radius:16px;background:var(--panel);text-align:left;font-size:16px;color:var(--ink)}.trade.selected{border-color:var(--accent);background:var(--accent-tint);font-weight:600;color:var(--accent)}`; `.account-summary,.consent-box,.link-box,.card-preview{background:var(--panel);border:0;border-radius:16px;padding:24px}`; `.tier{margin-top:24px;padding:24px;border:0;border-radius:16px;background:var(--panel)}.tier.confirmed{border-left:6px solid var(--green)}.tier.confirmed .tier-head{background:var(--recorded-tint);margin:-24px -24px 12px;padding:12px 24px}.tier.stated{border-left:6px solid var(--muted)}`; `.evidence-row img{width:40px;height:40px;border:1px solid var(--line);border-radius:50%}`; `.secret-box code{border:0;background:var(--stated-tint);border-radius:8px;padding:12px}`; `.ladder{border-top:0;background:var(--panel);border-radius:16px;padding:24px}`; keep the 960 px and 640 px rules.

- [ ] **Step 4: `npm test`** → all pass. **Step 5: Commit** `feat(look): YoCard tiers, trades and boxes`.

### Task 4: Public card page and share image

**Files:**
- Modify: `server/card/render.js` (`FONT`, `CSS`, `shell()`, SVG rects at lines 336 and 353)
- Test: `tests/card-render.test.cjs` lines 81–83 and 159–162

- [ ] **Step 1: Update the failing tests**

In `tests/card-render.test.cjs`: keep `--accent:#41204b` and `!text-transform`; replace the `border-radius:999px` assertion with `assert.ok(html.includes('border-radius:9999px'))`; add `assert.ok(html.includes('--bg:#f3f6fa'))`, `assert.ok(html.includes('fonts.googleapis.com/css2?family=Nunito'))`, `assert.ok(html.includes('.stated{border-left:6px solid var(--grey)'))`, `assert.ok(!html.includes('.stated{background'))`; change `rx="8"` to `rx="16"`.

- [ ] **Step 2: Run** `node --test tests/card-render.test.cjs` → fails.

- [ ] **Step 3: Implement in `render.js`**

`const FONT='"Open Sans",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif'` and `const HEAD_FONT='"Nunito",system-ui,sans-serif'`. `shell()` adds, before `<style>`, the same two preconnect links and the font stylesheet link used by the app pages. `CSS[0]`: `:root{--ink:#020304;--muted:#545859;--line:#dce0e5;--ok:#2b6a57;--bad:#b3261e;--grey:#545859;--bg:#f3f6fa;--card:#fff;--accent:#41204b;--tint:#e7d4ed;--stated:#f3f6fa}`. Buttons: `button,.btn{...border-radius:9999px;padding:8px 24px;...}`; the check form button becomes green outline: `.check-btn{background:var(--card);color:var(--ok);border-color:#387f6a}` only if the markup already carries a class on that button, otherwise leave it purple (do not change markup). `section{background:var(--card);border:0;border-radius:16px;padding:24px;margin:16px 0}`; `h1{font-family:'+HEAD_FONT+';font-size:28px;font-weight:800}h2{font-family:'+HEAD_FONT+';font-size:18px;font-weight:700}`; `.chip{display:inline-block;background:var(--stated);border-radius:9999px;padding:4px 12px;font-weight:600}`; `.stated{border-left:6px solid var(--grey)}.stated h2{color:var(--grey)}`; `.safety{background:var(--tint);border:0;border-radius:16px;padding:16px 24px}`; `.small.sample{border:0;border-left:6px solid var(--accent);border-radius:0;background:var(--stated)}`; `.notice{background:var(--tint);border:0;border-radius:16px;padding:16px 24px}`. SVG: both tint rects `rx="16"`; the second rect fill `#f3f6fa`; nothing else.

- [ ] **Step 4: `npm test`** → all pass (restyle test's render.js assertions included). **Step 5: Commit** `feat(look): public card page and share image in Yoma shapes`.

### Task 5: Browser verification and documentation

**Files:**
- Modify: `README.md` (line 143–145 area), `docs/testing-log.md` (append rows after YoCV 20 and YoCard 19; renumber nothing), `docs/superpowers/specs/2026-11-12-restrained-restyle-design.md` (one-line note at the top), `presentation/demo-script.md` only if a label it names changed (none should).

- [ ] **Step 1: Start the server and check in the browser pane** at 360, 375 and 1280 px on YoCV steps 1, 2, 4 and 5 and YoCard steps 1, 3 and 4, plus one public card page: `document.documentElement.scrollWidth === window.innerWidth`, header and band render, focus ring visible on the band's h1 and the dialog Close, fonts resolved (`document.fonts.check('700 16px Nunito')`), and the same pages with the Google Fonts link blocked.
- [ ] **Step 2: Record** each check as a testing-log row (what was observed, including anything that failed and was fixed).
- [ ] **Step 3: README**: replace the system-font sentence with the Yoma design-language note from the spec's Documentation section; keep the 14 px floor and 44 px lines; the public page sentence says it loads the two faces from Google Fonts with a system fallback and gives the new byte size.
- [ ] **Step 4: Spec note** at the top of the 12 November spec: "Visual sections superseded on 2026-11-15 by `2026-11-15-yoma-family-look-design.md`; copy and accessibility rules still apply."
- [ ] **Step 5: `npm test`**, then commit `docs: Yoma family look verification and notes`.
