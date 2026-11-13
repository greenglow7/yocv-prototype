# Restrained Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the template-looking styling and copy of the YoCV and YoCard pages with one small token sheet, civic-utility components and task-stating copy, without changing flows, honesty strings, accessibility or server behaviour.

**Architecture:** `styles.css` becomes the single token sheet plus every shared component; `card.css` keeps only YoCard-specific components and defines no tokens. The two HTML shells and the two template files (`app.js`, `card.js`) are rewritten against a fixed class vocabulary (below) so CSS and templates can be built in parallel. `server/card/render.js` adopts the same token values in its inline CSS and SVG. A new grep-style test pins the spec's "done when" rules so they cannot regress.

**Tech Stack:** Vanilla HTML/CSS/JS, no build step, Node 20+ built-ins, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-12-restrained-restyle-design.md`

## Global Constraints

- Buildless, dependency-free. No font files, no icon library, no `@import`. Font stack everywhere: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Colour custom properties, exactly twelve, defined once in `styles.css` `:root`: `--ink:#1f1a22`, `--muted:#5d5566`, `--line:#d9d5dc`, `--page:#f6f5f3`, `--panel:#ffffff`, `--accent:#41204b`, `--recorded:#387f6a`, `--recorded-tint:#e6f5f3`, `--awaiting:#8a5a00`, `--awaiting-tint:#fff2d6`, `--stated-tint:#f1f0f2`, `--error:#b3261e`. The only other hex in `styles.css`/`card.css` is the primary hover `#2f1537`. Dialog backdrop `rgba(31,26,34,.5)`, no blur.
- Type: weights 400, 600, 700 only; `letter-spacing` and `text-transform` nowhere; sizes 14/16/18/24/32 px (h1 28 px under 640 px); nothing under 14 px outside `@media print`.
- Radii: 4 px (inputs, buttons, tags, cards), 8 px (dialog), 50% (step numbers). Borders 1 px `--line`; inputs 2 px `--ink`. No `box-shadow`. Spacing values only from 4, 8, 12, 16, 24, 32, 48.
- Fixed strings keep their exact wording: everything in `server/card/render.js` `STRINGS` and its mirror in `card.js`; `C.labels` in `core.js` (untouched); mode labels "Live AI · <model>", "Sample mode", "Sample mode (offline)"; `generationLabel`, `generationSummary`, `privacyNote`, `cvFootnote`, the credential disclaimer, the consent list including "It never says verified by Yoma", the "What this card proves, and what it does not" list, the empty-card nudge.
- Token names never appear on screen. Green YoCV tag text stays `C.labels.verified`; YoCard green tier stays "Confirmed from Yoma".
- Copy rules: no `↗ → ← ✓ × ◷ ○` in text (SVG path data and the SVG card excepted); no uppercase labels; no "STEP 0N /"; no "Let's"; one sentence-case `h1` per screen, no full stop, no `<br>`, at most 65 characters; buttons are verb + object; interpunct only between two values.
- Accessibility kept: skip link, `aria-pressed`, `aria-current="step"`, `role="progressbar"`, `role="status"` on `#mode-pill`, live regions, h1 `tabindex="-1"` and focus on step change, focus snapshot/restore, 44 px targets, 16 px inputs on phones, visible 3 px focus ring, `prefers-reduced-motion`, print stylesheet, noscript notice.
- No horizontal overflow at 360 px and 375 px.

## Review Focus

1. **Narrow header at 360 px with "Sample mode (offline)" and the About link.** Expected: label fully readable, link tappable, no horizontal scroll. Pinned by the browser checks in Task 8 (scrollWidth assertion) and the `.phone-hide` rule in Task 2.
2. **A long unbroken token (a URL) in a claim, source quote, CV bullet or opportunity title.** Expected: wraps inside its box. Pinned by the `overflow-wrap:anywhere` assertion in Task 1 and the rule in Task 2.
3. **Thirteen trades at 360 px.** Expected: two columns, each row at least 44 px, label wraps rather than clips. Pinned by Task 8's Thandi check at 375 px (describe step height and overflow).
4. **Focus ring on an accent-coloured primary button.** Expected: visible ring separated from the button. Pinned by Task 1's `outline-offset:2px` assertion.
5. **Print of the CV.** Expected: header, rail, footer, buttons and opportunities hidden; the paper prints without border. Pinned by Task 1's `@media print` assertion and Task 8's print-media check.

---

## File structure and class vocabulary

Files changed: `styles.css` (rewrite), `card.css` (rewrite), `index.html`, `card.html`, `app.js` (templates and copy only), `card.js` (templates and copy only), `server/card/render.js` (CSS and SVG values only), `tests/restyle.test.cjs` (new), `tests/card-render.test.cjs` (four assertions added), `presentation/demo-script.md`, `README.md`, `docs/testing-log.md`.

Templates and stylesheets are built in separate tasks, so both sides use exactly these class names. Classes not listed here that exist today may be dropped; a template must not invent one that is not in this list.

Shared (defined in `styles.css`):

| Class | Element and purpose |
| --- | --- |
| `.skip-link` | unchanged |
| `.topbar`, `.brand`, `.concept-tag`, `.top-actions`, `.mode-label` (`#mode-pill`, modifiers `.live .sample .offline` with no visual difference), `.text-button`, `.phone-hide` | header |
| `.app-shell`, `.sidebar`, `.sidebar-title`, `#steps`, `.step-button` (`.active`, `.completed`), `.step-number`, `.sidebar-note` | rail |
| `main`, `.step-line` (the "Step 2 of 5" line), `h1`, `.lead` (one-sentence muted paragraph) | content |
| `.primary`, `.secondary`, `.text-button` (tertiary, underlined), `.small` (36 px button modifier), `.back-link` (underlined "Back" button) | buttons |
| `.action-row`, `.form-footer`, `.form-section`, `.field-label`, `.optional`, `.field-help`, `.fields-grid`, `.edit-area`, `.checkbox-label` | forms |
| `.tag` with `.recorded`, `.awaiting`, `.stated`, `.neutral` | GOV.UK-style tags (`.stated` and `.neutral` look the same: `--stated-tint` on `--muted`) |
| `.choice-list`, `.choice` (`.selected`), `.choice-text`, `.radio` | choice rows (roles, personas) |
| `.chip-row` | row of secondary buttons (example chips) |
| `.notice`, `.error-message`, `.error-actions`, `.busy-note` | notices |
| `.claim-card` (`.accepted`, `.rejected`), `.claim-top`, `.claim-kind`, `.claim-text`, `.claim-tags`, `.source-quote` (a `blockquote`), `.claim-reason`, `.claim-actions`, `.review-heading`, `.review-count`, `.review-progress`, `.review-instruction` | claim review |
| `.evidence-list`, `.evidence-item`, `.row-head`, `.drop-zone`, `.file-field` | evidence step |
| `.cv-paper`, `.cv-name`, `.cv-role`, `.cv-contact`, `.cv-section-title`, `.cv-entry`, `.cv-context`, `.cv-dates`, `.cv-bullet`, `.cv-skill`, `.cv-footnote` | CV paper |
| `.sample-preview`, `.preview-head` | landing preview wrapper |
| `.export-actions` | stacked download buttons under the paper |
| `.evidence-record`, `.record-row`, `.rejected-row`, `.rejected-list` | evidence record |
| `.opportunities`, `.opp-head`, `.opp-intro`, `.opp-note`, `.opp-list`, `.opp-item`, `.opp-logo` (`.placeholder`), `.opp-body`, `.opp-meta`, `.opp-skills`, `.opp-link` | opportunities |
| `.app-footer`, `#toast`, `dialog`, `.dialog-top`, `.dialog-actions`, `.fine-print`, `.source-link`, `.yoma-tag`, `.print-hide` | misc |

YoCard only (defined in `card.css`): `.trade-grid`, `.trade` (`.selected`), `.account-summary`, `.summary-list` (a `dl`), `.tier` (`.confirmed`, `.stated`), `.tier-head`, `.tier-note`, `.evidence-row`, `.evidence-body`, `.confirm-line`, `.rejected-note`, `.field-row`, `.service-row`, `.toggle-list`, `.consent-box`, `.result-grid`, `.card-preview`, `.ladder`, `.link-box`, `.link-list` (a `dl`), `.big-code`, `.secret-box`.

---

### Task 1: Pin the "done when" rules in a test

**Files:**
- Create: `tests/restyle.test.cjs`

**Interfaces:**
- Produces: a test file that fails now and passes when Tasks 2 to 6 are done. Later tasks run it.

- [ ] **Step 1: Write the failing tests**

```js
'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const PAGES=['index.html','card.html','app.js','card.js'];
const SHEETS=['styles.css','card.css'];
const TOKENS=['--ink:#1f1a22','--muted:#5d5566','--line:#d9d5dc','--page:#f6f5f3','--panel:#ffffff','--accent:#41204b','--recorded:#387f6a','--recorded-tint:#e6f5f3','--awaiting:#8a5a00','--awaiting-tint:#fff2d6','--stated-tint:#f1f0f2','--error:#b3261e'];
const stripSvg=s=>s.replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/<path[^>]*>/g,'').replace(/d="[^"]*"/g,'');
const stripPrint=css=>css.replace(/@media print\{[\s\S]*?\}\s*\}/g,'');

test('page files carry no decorative glyphs, eyebrows or step zero-padding',()=>{
 for(const f of PAGES){
  const s=stripSvg(read(f));
  for(const g of ['↗','→','←','✓','×','◷','○'])assert.ok(!s.includes(g),f+' contains '+g);
  assert.ok(!/STEP 0\d/.test(s),f+' has a STEP 0N eyebrow');
  assert.ok(!/padStart\(2,'0'\)/.test(s),f+' zero-pads step numbers');
  assert.ok(!/Let[’']s/.test(s),f+' says Let’s');
  assert.ok(!/<h1[^>]*>[^<]*<br>/.test(s),f+' has a line break in an h1');
 }
});

test('stylesheets use the twelve tokens, the system stack and no template effects',()=>{
 const css=SHEETS.map(read).join('\n');
 for(const t of TOKENS)assert.ok(css.includes(t),'missing token '+t);
 assert.ok(!css.includes('@import'));
 assert.ok(!/text-transform/.test(css));
 assert.ok(!/letter-spacing/.test(css));
 assert.ok(!/box-shadow\s*:\s*(?!none)/.test(css));
 assert.ok(!/DM Sans|Manrope|Nunito|Open Sans/.test(css));
 const hexes=new Set((css.match(/#[0-9a-f]{3,8}\b/gi)||[]).map(h=>h.toLowerCase()));
 const allowed=new Set(TOKENS.map(t=>t.split(':')[1]).concat(['#2f1537']));
 for(const h of hexes)assert.ok(allowed.has(h),'untokenised colour '+h);
 const radii=new Set((css.match(/border-radius:([^;}]+)/g)||[]).map(r=>r.replace('border-radius:','').trim()));
 assert.ok(radii.size<=3,'radii used: '+[...radii].join(', '));
 for(const r of radii)assert.ok(['4px','8px','50%'].includes(r),'radius '+r);
 const screen=stripPrint(css);
 for(const m of screen.match(/font-size:\s*(\d+)px/g)||[])assert.ok(Number(m.match(/\d+/)[0])>=14,'font size under 14px: '+m);
 assert.ok(/outline:3px solid var\(--accent\);outline-offset:2px/.test(css),'focus ring');
 assert.ok(/overflow-wrap:anywhere/.test(css),'long tokens wrap');
 assert.ok(/@media print\{/.test(css),'print stylesheet kept');
 assert.ok(/prefers-reduced-motion/.test(css));
 assert.ok(!read('card.css').includes(':root'),'card.css defines no tokens');
});

test('the public card page and SVG use the accent and no uppercase labels',()=>{
 const src=read('server/card/render.js');
 assert.ok(src.includes('--accent:#41204b'));
 assert.ok(!src.includes('#5b2a86'));
 assert.ok(!/text-transform/.test(src));
 assert.ok(!src.includes('CONFIRMED FROM YOMA'));
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/restyle.test.cjs`
Expected: all three tests FAIL (glyphs found, `@import` present, `#5b2a86` present).

- [ ] **Step 3: Commit**

```bash
git add tests/restyle.test.cjs
git commit -m "test: pin the restrained-restyle rules (failing until the restyle lands)"
```

---

### Task 2: Rewrite `styles.css` as the token sheet and shared components

**Files:**
- Modify: `styles.css` (full rewrite; the current file is reference only)

**Interfaces:**
- Consumes: the class vocabulary table above.
- Produces: every shared class styled; `card.css` (Task 3) extends it without redefining tokens.

- [ ] **Step 1: Write the sheet, in this order**

1. `:root` with the twelve tokens, `font-family` system stack, `font-size:16px`, `line-height:1.5`, `color:var(--ink)`, `background:var(--page)`.
2. Resets: `*{box-sizing:border-box}`, margins off headings and `p`, `button,input,textarea{font:inherit}`, `a{color:var(--accent)}`, `svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.6}` (only the dialog and QR need it, keep for safety), focus ring `button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}`, `main:focus{outline:none}`.
3. Type scale: `h1{font-size:32px;line-height:1.25;font-weight:700}`, `h2{font-size:24px}`, `h3{font-size:18px}`, `.step-line,.lead{...}` (`.step-line` 14 px muted, `.lead` 16 px muted, margin-top 8 px), `small,.field-help,.tag,.claim-reason,.cv-contact,.cv-dates,.cv-footnote,.opp-meta,.app-footer{font-size:14px}`.
4. Header: `.topbar{height:64px;background:var(--panel);border-bottom:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;padding:0 24px;gap:16px}`, `.brand{font-size:20px;font-weight:700;color:var(--accent);text-decoration:none;display:flex;align-items:baseline;gap:12px}`, `.concept-tag{font-size:14px;font-weight:400;color:var(--muted)}`, `.top-actions{display:flex;align-items:center;gap:16px;min-width:0}`, `.mode-label{font-size:14px;color:var(--muted)}`, `.text-button{background:none;border:0;padding:0;color:var(--accent);text-decoration:underline;font-size:16px;cursor:pointer;min-height:44px;display:inline-flex;align-items:center}`.
5. Rail: `.app-shell{display:grid;grid-template-columns:232px minmax(0,1fr);max-width:1200px;margin:auto;min-height:calc(100vh - 128px)}`, `.sidebar{background:var(--panel);border-right:1px solid var(--line);padding:32px 16px;display:flex;flex-direction:column}`, `.sidebar-title{font-size:14px;font-weight:600;margin:0 8px 16px}`, `#steps{display:flex;flex-direction:column;gap:4px}`, `.step-button{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:8px;border:0;background:none;text-align:left;color:var(--muted);font-size:16px;cursor:pointer}`, `.step-button.active{color:var(--accent);font-weight:700}`, `.step-number{width:24px;height:24px;border-radius:50%;border:1px solid var(--line);display:grid;place-items:center;font-size:14px;flex-shrink:0}`, `.active .step-number{border-color:var(--accent);color:var(--accent)}`, `.completed .step-number{background:var(--accent);border-color:var(--accent);color:#ffffff}`, `.sidebar-note{margin-top:auto;padding-top:24px;font-size:14px;color:var(--muted)}`.
6. Content: `main{min-width:0;padding:32px 24px 48px;max-width:728px}` (680 px content plus padding), `.action-row{display:flex;gap:16px;flex-wrap:wrap;margin-top:24px;align-items:center}`, `.form-footer{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-top:32px;padding-top:16px;border-top:1px solid var(--line)}`, `.back-link{background:none;border:0;padding:0;min-height:44px;color:var(--accent);text-decoration:underline;font-size:16px;cursor:pointer}`.
7. Buttons: `.primary,.secondary{min-height:44px;padding:8px 16px;border-radius:4px;font-size:16px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}`, `.primary{background:var(--accent);color:#ffffff;border:1px solid var(--accent)}`, `.primary:hover{background:#2f1537;border-color:#2f1537}`, `.secondary{background:var(--panel);color:var(--ink);border:1px solid var(--ink)}`, `.small{min-height:36px;padding:4px 12px}`, `button:disabled{cursor:not-allowed;opacity:.5}`.
8. Forms: `.form-section{margin-top:24px}`, `.field-label{display:block;font-weight:600;margin-bottom:8px}`, `.optional{font-weight:400;color:var(--muted)}`, `input,textarea{width:100%;border:2px solid var(--ink);border-radius:4px;background:var(--panel);padding:8px 12px;font-size:16px;color:var(--ink)}`, `textarea{min-height:160px;resize:vertical}`, `.field-help{margin-top:8px;color:var(--muted)}`, `.fields-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}`, `.checkbox-label{display:flex;gap:12px;align-items:flex-start;margin-top:16px;min-height:44px}`, `.checkbox-label input{width:24px;height:24px;margin:0;accent-color:var(--accent);flex-shrink:0}`, `.chip-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}`.
9. Tags: `.tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:14px;font-weight:400;line-height:1.5;text-decoration:none}`, `.tag.recorded{background:var(--recorded-tint);color:var(--recorded)}`, `.tag.awaiting{background:var(--awaiting-tint);color:var(--awaiting)}`, `.tag.stated,.tag.neutral{background:var(--stated-tint);color:var(--muted)}`, `a.tag:hover{text-decoration:underline}`.
10. Choice rows: `.choice-list{display:grid;margin-top:16px;border-top:1px solid var(--line)}`, `.choice{display:flex;gap:12px;align-items:center;width:100%;min-height:44px;padding:12px 8px;border:0;border-bottom:1px solid var(--line);border-left:2px solid transparent;background:none;text-align:left;cursor:pointer;color:var(--ink)}`, `.choice.selected{border-left-color:var(--accent)}`, `.radio{width:20px;height:20px;border-radius:50%;border:2px solid var(--ink);flex-shrink:0}`, `.selected .radio{border:6px solid var(--accent)}`, `.choice-text strong{display:block;font-weight:600}`, `.choice-text small{display:block;color:var(--muted)}`.
11. Notices: `.notice{border-left:4px solid var(--accent);background:var(--panel);padding:12px 16px;margin-top:24px}`, `.error-message{border-left:4px solid var(--error);background:var(--panel);color:var(--error);padding:12px 16px;margin-top:16px}`, `.error-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}`, `.busy-note{margin-top:12px;color:var(--accent)}`, `.busy-note:empty{display:none}`.
12. Claim cards: `.claim-card{background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:16px;margin-top:16px}`, `.claim-card.rejected .claim-text{color:var(--muted);text-decoration:line-through}`, `.claim-top{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center}`, `.claim-kind{font-weight:600}`, `.claim-text{font-size:18px;font-weight:600;margin:12px 0}`, `.claim-tags{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}`, `.source-quote{margin:0 0 12px;padding:4px 0 4px 12px;border-left:2px solid var(--line);color:var(--muted)}`, `.source-quote strong{display:block;color:var(--ink);font-weight:600}`, `.claim-reason{color:var(--muted);margin-bottom:12px}`, `.claim-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding-top:12px;border-top:1px solid var(--line)}`, `.review-heading{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;flex-wrap:wrap}`, `.review-count{color:var(--muted)}`, `.review-progress{height:4px;background:var(--line);margin:16px 0}`, `.review-progress>div{height:100%;background:var(--accent)}`, `.review-instruction{color:var(--muted);flex:1}`. Add `.claim-text,.source-quote,.cv-bullet,.record-row p,.opp-item h4{overflow-wrap:anywhere}`.
13. Evidence step: `.evidence-list{list-style:none;margin:16px 0 0;padding:0;border-top:1px solid var(--line)}`, `.evidence-item{padding:16px 0;border-bottom:1px solid var(--line)}`, `.row-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center}`, `.drop-zone{display:block;margin-top:12px;padding:16px;border:1px dashed var(--ink);border-radius:4px;cursor:pointer}`, `.drop-zone strong{display:block;font-weight:600}`, `.drop-zone small{display:block;color:var(--muted);margin-top:4px}`, `.drop-zone input{max-width:100%;border:0;padding:4px 0}`.
14. CV paper: `.cv-paper{background:var(--panel);border:1px solid var(--line);padding:32px;margin-top:24px}`, `.cv-name{font-size:24px}`, `.cv-role{color:var(--muted);margin-top:4px}`, `.cv-contact{color:var(--muted);margin-top:8px;overflow-wrap:anywhere}`, `.cv-section-title{font-size:18px;font-weight:700;margin:24px 0 12px;padding-top:16px;border-top:1px solid var(--line)}`, `.cv-entry{margin-bottom:12px}`, `.cv-context{font-weight:600}`, `.cv-dates{color:var(--muted)}`, `.cv-skill{display:inline-block;margin:0 8px 8px 0}`, `.cv-skill small{color:var(--muted)}`, `.cv-footnote{margin-top:24px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted)}`, `.sample-preview{margin-top:32px}`, `.preview-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}`, `.export-actions{display:grid;gap:8px;margin-top:24px;max-width:320px}`.
15. Evidence record and opportunities: `.evidence-record{margin-top:32px;border-top:1px solid var(--line);padding-top:24px}`, `.evidence-record summary{color:var(--accent);text-decoration:underline;cursor:pointer}`, `.record-row{border:1px solid var(--line);border-radius:4px;padding:12px;margin-top:12px}`, `.record-row .tag{margin:0 4px 4px 0}`, `.rejected-list{margin:8px 0 0;padding-left:24px}`, `.opportunities{margin-top:32px;border-top:1px solid var(--line);padding-top:24px}`, `.opp-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}`, `.opp-intro,.opp-note{color:var(--muted);margin-top:8px}`, `.opp-list{list-style:none;margin:16px 0 0;padding:0;border-top:1px solid var(--line)}`, `.opp-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}`, `.opp-logo{width:32px;height:32px;border:1px solid var(--line);border-radius:4px;object-fit:contain;flex-shrink:0;background:var(--panel)}`, `.opp-body{min-width:0;flex:1}`, `.opp-item h4{font-size:16px;font-weight:600;margin:0}`, `.opp-meta{color:var(--muted);margin-top:4px}`, `.opp-skills{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}`, `.opp-link{display:inline-block;margin-top:8px}`.
16. Footer, toast, dialog: `.app-footer{max-width:1200px;margin:auto;border-top:1px solid var(--line);padding:16px 24px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;color:var(--muted)}`, `.app-footer button{margin-left:auto}`, `#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--ink);color:#ffffff;padding:12px 16px;border-radius:4px;max-width:90vw;opacity:0;pointer-events:none;transition:opacity .2s;z-index:100}`, `#toast.visible{opacity:1}`, `dialog{border:1px solid var(--line);border-radius:8px;padding:32px;max-width:680px;width:calc(100% - 32px);color:var(--ink)}`, `dialog::backdrop{background:rgba(31,26,34,.5)}`, `.dialog-top{display:flex;justify-content:space-between;align-items:center;gap:16px}`, `dialog h2{margin-top:16px}`, `dialog h3{margin-top:24px}`, `dialog p,dialog ul{margin-top:12px}`, `dialog ul{padding-left:24px}`, `.fine-print{color:var(--muted);font-size:14px}`, `.source-link{display:inline-block;margin-top:12px}`, `.dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}`, `.skip-link{position:fixed;left:16px;top:-100px;z-index:100;background:var(--accent);color:#ffffff;padding:12px}`, `.skip-link:focus{top:16px}`.
17. Media queries, in order: `@media(max-width:960px)` (rail becomes a horizontal row: `.app-shell{display:block}`, `.sidebar{border-right:0;border-bottom:1px solid var(--line);padding:12px 16px;flex-direction:row}`, `.sidebar-title,.sidebar-note{display:none}`, `#steps{flex-direction:row;justify-content:space-between;width:100%}`, `.step-button{flex-direction:column;width:auto;padding:4px;gap:4px;font-size:14px;text-align:center}`, `.step-number{width:28px;height:28px}`, `.concept-tag{display:none}` moves to the 640 query), `@media(max-width:640px)` (`h1{font-size:28px}`, `main{padding:24px 16px 32px}`, `.topbar{padding:0 16px}`, `.concept-tag,.phone-hide{display:none}`, `.fields-grid{grid-template-columns:1fr}`, `.form-footer .primary{width:100%}`, `.step-button span:last-child{display:none}` so only digits show under 640 px, `.mode-label{white-space:normal;line-height:1.2}`), `@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}`, `@media print{...}` keeping the current hide list (replace `.eyebrow,.progress-caption,.preview-layout>aside,.success-banner` with `.step-line,.lead,.export-actions,.sample-preview`) and `.cv-paper{border:0;padding:0}` with font sizes unchanged from today's print block.

- [ ] **Step 2: Run the sheet test**

Run: `node --test tests/restyle.test.cjs`
Expected: the stylesheet test still FAILS only on `card.css` (Task 3); the glyph and render tests still fail. Confirm no failure message names `styles.css` content (no untokenised colour, no radius, no font size).

- [ ] **Step 3: Commit**

```bash
git add styles.css
git commit -m "style: replace the stylesheet with the restrained token sheet"
```

---

### Task 3: Rewrite `card.css` for YoCard components

**Files:**
- Modify: `card.css` (full rewrite)

**Interfaces:**
- Consumes: tokens and shared classes from Task 2.
- Produces: the YoCard-only classes listed in the vocabulary.

- [ ] **Step 1: Write the sheet**

Header comment `/* YoCard worker flow. Extends styles.css; defines no tokens. */`, then:
`.trade-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px;margin-top:16px;border-top:1px solid var(--line)}`, `.trade{min-height:44px;padding:8px;border:0;border-bottom:1px solid var(--line);border-left:2px solid transparent;background:none;text-align:left;font-size:16px;color:var(--ink);cursor:pointer}`, `.trade.selected{border-left-color:var(--accent);font-weight:600;color:var(--accent)}`,
`.account-summary{margin-top:24px;border:1px solid var(--line);border-radius:4px;padding:16px;background:var(--panel)}`, `.summary-list{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:12px 0 0}`, `.summary-list dt{font-weight:600}`, `.summary-list dd{margin:0;color:var(--muted)}`,
`.tier{margin-top:24px;padding:16px;border:1px solid var(--line);border-radius:4px;background:var(--panel)}`, `.tier.confirmed{border-left:4px solid var(--recorded)}`, `.tier.confirmed .tier-head{background:var(--recorded-tint);margin:-16px -16px 12px;padding:12px 16px}`, `.tier.stated{border-left:4px solid var(--line)}`, `.tier-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}`, `.tier-note{color:var(--muted);margin-top:8px}`, `.tier h4{font-size:16px;font-weight:600;margin-top:16px}`,
`.evidence-row{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line)}`, `.evidence-row img{width:32px;height:32px;border:1px solid var(--line);border-radius:4px;object-fit:contain;flex-shrink:0}`, `.evidence-body{flex:1;min-width:0}`, `.evidence-body strong{display:block;font-weight:600}`, `.evidence-body small{display:block;color:var(--muted);margin-top:4px}`, `.evidence-row .checkbox-label{margin:0;min-height:0;flex-shrink:0}`,
`.confirm-line{padding:12px 0;border-top:1px solid var(--line)}`, `.confirm-line small{display:block;color:var(--muted);margin-top:4px}`, `.confirm-line .text-button{min-height:36px}`, `.rejected-note{margin-top:12px;color:var(--muted)}`,
`.field-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}`, `.service-row{display:grid;grid-template-columns:minmax(0,2fr) 1fr 1fr 72px auto;gap:8px;align-items:center;margin-top:8px}`, `.toggle-list{display:grid;gap:8px;margin-top:12px}`, `.toggle-list .checkbox-label{margin:0}`, `.toggle-list small{display:block;font-weight:400;color:var(--muted);margin-top:4px}`,
`.consent-box{margin-top:24px;border:1px solid var(--line);border-radius:4px;padding:16px}`, `.consent-box ul{margin:8px 0 0;padding-left:24px}`,
`.result-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:24px;align-items:start;margin-top:24px}`, `.card-preview{border:1px solid var(--line);padding:8px;background:var(--panel)}`, `.card-preview img{width:100%;height:auto;display:block}`, `.ladder{margin-top:24px;border-top:1px solid var(--line);padding-top:16px}`, `.ladder ol{padding-left:24px;margin:8px 0 0}`, `.link-box{border:1px solid var(--line);border-radius:4px;padding:16px;background:var(--panel)}`, `.link-list{margin:0}`, `.link-list dt{font-weight:600;margin-top:12px}`, `.link-list dd{margin:4px 0 0}`, `.link-list code{display:block;overflow-wrap:anywhere;font-size:14px}`, `.big-code{font-size:24px;font-weight:700;color:var(--accent)}`, `.link-box .primary,.link-box .secondary{width:100%;margin-top:8px}`, `.secret-box{margin-top:16px;border-top:1px solid var(--line);padding-top:12px;color:var(--muted)}`, `.secret-box code{display:block;border:1px solid var(--line);padding:8px;margin:8px 0;overflow-wrap:anywhere;color:var(--ink)}`,
`@media(max-width:960px){.result-grid{grid-template-columns:1fr}.field-row{grid-template-columns:1fr}}`, `@media(max-width:640px){.service-row{grid-template-columns:1fr 1fr;gap:8px}.service-row input:first-child{grid-column:1/-1}.summary-list{grid-template-columns:1fr}.summary-list dd{margin-bottom:4px}}`.

- [ ] **Step 2: Run the sheet test**

Run: `node --test tests/restyle.test.cjs`
Expected: the stylesheet test PASSES; the other two still fail.

- [ ] **Step 3: Commit**

```bash
git add card.css
git commit -m "style: restrained YoCard components"
```

---

### Task 4: YoCV shell and templates (`index.html`, `app.js`)

**Files:**
- Modify: `index.html`
- Modify: `app.js` (lines 5 to 7, 17, 29 to 30, 51 to 52, 58, 64 to 96, 101, and the `sample`/`example` toasts at 101 and 180; no change to fetch, state, event wiring beyond button labels)

**Interfaces:**
- Consumes: classes from the vocabulary; `C.localExperienceClaims`, `C.evidenceClaims`, `C.reviewClaim` from `core.js` (unchanged).
- Produces: `cvPaperHTML({profile,role,claims,generation,id})` returning the `.cv-paper` article; `samplePreviewHTML()`; `stepLine(n)` returning `<p class="step-line">Step n of 5</p>`; `badge(category)` unchanged signature; `decisionTag(c)`.

- [ ] **Step 1: Rewrite `index.html`**

- `<title>YoCV: a first CV from real experience</title>`; favicon `data:image/svg+xml` with `<rect width='48' height='48' fill='%2341204b'/><text x='24' y='33' font-size='28' font-weight='700' font-family='system-ui,sans-serif' fill='white' text-anchor='middle'>Y</text>`.
- Header: `<a class="brand" href="#" aria-label="YoCV home">YoCV<span class="concept-tag">A Yoma concept</span></a><div class="top-actions"><span class="mode-label offline" id="mode-pill" role="status">Sample mode (offline)</span><button class="text-button" id="about-button">About<span class="phone-hide"> this demo</span></button></div>`.
- Rail: `<div class="sidebar-title">Steps</div><nav id="steps" aria-label="CV steps"></nav><p class="sidebar-note">Your draft stays in this session.</p>`.
- Footer: `<footer class="app-footer"><span>Independent student prototype. Sample data where labelled.</span><button class="text-button" id="reset-button">Reset demo</button></footer>`.
- About dialog: `<div class="dialog-top"><h2 id="about-title">About this demo</h2><button class="text-button close-dialog">Close</button></div><p>YoCV is an independent student concept for Yoma. It helps young people review how their experience appears in a CV.</p><h3>What works now</h3><ul><li>Role selection and a reviewed CV draft.</li><li>Live AI suggestions when a model is configured, otherwise local templates, always labelled.</li><li>Server-side grounding checks that reject sentences not supported by your own words.</li><li>Skills matched to Yoma's public skill taxonomy and learning opportunities from Yoma's public API.</li><li>Individual claim review, source records, CV preview and downloads.</li></ul><h3>What is sample data</h3><ul><li>The credential is a representative sample based on Yoma's wallet credential model, not an issued credential.</li><li>Selected files stay on your device. This prototype records their names and your descriptions only.</li><li>There is no Yoma sign-in, so nothing here is your own Yoma data.</li></ul><h3>Proposed Yoma integration</h3><p>` + the current integration paragraph verbatim + `</p><p class="fine-print">` + the current fine print verbatim + `</p><a class="source-link" href="https://github.com/didx-xyz/yoma" target="_blank" rel="noopener noreferrer">Platform reference: didx-xyz/yoma</a>`.
- Confirm dialog: drop the eyebrow; `<div class="dialog-top"><h2 id="confirm-title">Start a fresh review?</h2><button class="text-button close-dialog">Close</button></div>`; actions unchanged.
- Noscript unchanged.

- [ ] **Step 2: Rewrite the templates in `app.js`**

- Delete `icons`, `svg()`, `previewMini()`, `intro()`. Remove `icon` from `roles`.
- `badge(category)` returns `<span class="tag ${category==='verified'?'recorded':category==='document'?'awaiting':'stated'}">${E(C.labels[category])}</span>` (no glyph prefix).
- `renderSteps()`: same button markup with `<span class="step-number">${i+1}</span><span>${name}</span>`; no tick, no padStart.
- `stepLine(n)`: `<p class="step-line">Step ${n} of 5</p>`.
- `cvPaperHTML({profile,role,claims,generation,id='cv-paper'})`: today's `cvHTML` body with parameters instead of `state`, section titles "Experience", "Skills", "Learning and achievements", contact joined by `' · '`, footnote from `cvFootnote(generation)` (change `cvFootnote` to take `generation`). `cvHTML()` becomes `cvPaperHTML({profile:state.profile,role:state.role,claims:state.claims.filter(c=>c.decision==='accepted'),generation:state.generation})`.
- `samplePreviewHTML()`: builds claims once per render from `C.localExperienceClaims({experience:examples.shop.experience,context:examples.shop.context,dates:'School holidays, 2025–2026',role:'Retail assistant'}).concat(C.evidenceClaims({credential:true})).map(c=>C.reviewClaim(c,'accepted'))`, then returns `<section class="sample-preview" aria-label="Example of the result"><div class="preview-head"><h3>Example of the result</h3><span class="tag neutral">Sample</span></div><p class="lead">Amina's sample story, Retail assistant</p>${cvPaperHTML({profile:{name:'Amina Ndlovu',city:'Cape Town, South Africa',email:'',phone:''},role:'Retail assistant',claims,generation:null,id:'sample-cv'})}</section>`. Wrap the claim build in try/catch returning `''` on error.
- `landing()`: `${stepLine(1)}<h1 tabindex="-1">Build a first CV from work you have already done</h1><p class="lead">Helping at home, in a shop or in your community is a place to start.</p><h2>Which role are you working towards?</h2><div class="choice-list" role="group" aria-label="Choose a target role">` + roles as `<button class="choice ${sel?'selected':''}" data-role="${i}" aria-pressed="${sel}"><span class="radio" aria-hidden="true"></span><span class="choice-text"><strong>${r.name}</strong><small>${r.description}</small></span></button>` + `</div><div class="action-row"><button class="primary" data-action="start">Continue to your experience</button><button class="text-button" data-action="sample">Load Amina's sample story</button></div><p class="field-help">No formal work history needed. You choose what goes in.</p><p class="field-help">Looking for customers rather than a job? <a href="card.html">Make a work card instead</a></p>${samplePreviewHTML()}`.
- `experience()`: `${stepLine(2)}<h1 tabindex="-1">Describe one thing you did</h1><p class="lead">Think of a time you helped someone, took responsibility or made something happen. Target role: ${E(state.role)}.</p>` then the same fields; example chips as `<div class="chip-row"><button class="secondary small" data-example="shop">Family business</button>…</div>`; the "THE DETAILS ON YOUR CV" kicker becomes `<h2>Your details</h2>`; replace the aside with `<details class="form-section"><summary>Why this matters</summary><p>Who did you help? What did you do? How did you do it? You do not need impressive titles. Start with real responsibilities.</p></details><div class="notice">${privacyNote()}</div>`; footer `<div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="to-evidence">Continue to evidence</button></div>`.
- `credentialCard()` and `evidence()`: `${stepLine(3)}<h1 tabindex="-1">Add supporting evidence</h1><p class="lead">Optional. You can build the CV from your own description alone.</p><ul class="evidence-list">` with three `<li class="evidence-item">`: (1) `<div class="row-head"><h3>Your own experience</h3><span class="tag stated">Self-reported</span></div><p class="field-help">${E(state.context||'The responsibilities you described')}</p><blockquote class="source-quote">${E(state.experience)}</blockquote>`; (2) `<div class="row-head"><h3>${E(c.title)}</h3>${badge('verified')}</div><p class="field-help">${E(c.sourceLabel||c.issuer)}${c.dates?' · '+E(c.dates):''}</p><p>${detail}</p>` + the checkbox verbatim; (3) `<div class="row-head"><h3>A supporting document</h3>${badge('document')}</div><p class="field-help">A letter, certificate or reference you want to mention.</p>` + drop zone (no icon) + `<div class="action-row"><button class="text-button" data-action="sample-document">Use a synthetic reference letter</button>…` + the statement textarea block unchanged. Then `<div class="notice">${generationNotice()}</div>${errorHTML()}<div class="busy-note" id="busy-status" aria-live="polite">…</div><div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="generate" ${busy}>${state.busy?E(state.busyText):'Write the draft'}</button></div>`.
- `kindLabel(c,i)` returns `${base} ${i+1}` only; `generatedTag(c)` returns `<span class="tag neutral">AI-suggested</span>` / `Template suggestion` / `''`.
- `claimHTML`: `<div class="claim-top"><span class="claim-kind">${E(kindLabel(c,i))}</span><span class="claim-tags">${badge(c.category)}${generatedTag(c)}${yomaTag(c)}</span></div>`; `yomaTag` text `Yoma skill: ${name}` without arrow; `sourceQuoteHTML` renders `<blockquote class="source-quote"><strong>${label}${c.edited?' (original source retained)':''}</strong>Based on: “…”</blockquote>`; actions: editing → `<button class="primary small" data-decision="save">Save and accept</button><button class="secondary small" data-decision="cancel">Cancel</button>`; pending → `<button class="primary small" data-decision="accepted">Accept</button><button class="secondary small" data-decision="edit">Edit</button><button class="text-button" data-decision="rejected">Leave out</button>`; decided → `${decisionTag(c)}<button class="text-button" data-decision="pending">Review again</button>` where `decisionTag` returns `<span class="tag recorded">Accepted</span>` / `Edited and accepted` / `<span class="tag neutral">Not on your CV</span>`.
- `review()`: `${stepLine(4)}<div class="review-heading"><div><h1 tabindex="-1">Check each sentence before it goes on your CV</h1><p class="lead">Keep what is accurate, change the wording or leave it out. Your approval confirms the wording, not its verification.</p></div><span class="review-count">…</span></div>` + progressbar unchanged + stale message with `<button class="text-button" data-action="back-to-evidence">Go to evidence</button>` + `${errorHTML()}<section aria-label="Claims to review">…</section><p class="notice">${E(generationLabel())}. ${E(generationSummary())}</p><div class="form-footer"><button class="back-link" data-action="back">Back</button><p class="review-instruction">…</p><button class="primary" data-action="preview" …>Preview the CV</button></div>`. Instruction strings: "Review each claim to unlock your CV." / "You left out every claim. Review again or add another experience." / "Your reviewed claims are ready for a final look."
- `preview()`: `${stepLine(5)}<h1 tabindex="-1">Your CV is ready to save</h1><p class="lead">${n} accepted claims. Sources are kept in a separate evidence record.</p>${cvHTML()}<div class="export-actions"><button class="primary" data-action="print">Print or save as PDF</button><button class="secondary" data-action="download-cv">Download text CV</button><button class="secondary" data-action="download-evidence">Download evidence record</button><button class="text-button" data-action="download-json">Download evidence as JSON</button></div><p class="notice">User-approved wording and issuer verification are different. The sample credential demonstrates course completion only.</p>${opportunitiesHTML()}${evidenceHTML()}<div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="text-button" data-action="about">How this could fit into Yoma</button></div>`.
- `opportunitiesHTML()`: heading "Learning opportunities on Yoma for this role"; tag classes `recorded`/`neutral`; items as `<ul class="opp-list">` of `<li class="opp-item">…<a class="opp-link" …>Open on Yoma (yoma.world)</a></li>`; skills `<a class="tag recorded" …>`.
- `evidenceHTML()`: `yomaTag` without arrow; tag classes updated; otherwise verbatim.
- Toasts: `sample()` → "Amina's sample story is loaded. Choose a role, then continue."; example → "Example loaded. Change it to match what you did."; confirm copy for `sample` action: title "Load Amina's sample story?", label "Load sample".

- [ ] **Step 3: Run the glyph test and the suite**

Run: `node --test tests/restyle.test.cjs`
Expected: glyph test still fails on `card.html`/`card.js` only (no failure names `index.html` or `app.js`).
Run: `npm test`
Expected: 253 tests, 0 fail (core and server tests do not read the templates).

- [ ] **Step 4: Smoke in the browser**

Open `http://127.0.0.1:4173/` (server already running). Click "Load Amina's sample story", "Continue to your experience", "Continue to evidence", "Write the draft", accept every claim, "Preview the CV". Expected: no console errors; the landing shows the sample paper with heading "Example of the result".

- [ ] **Step 5: Commit**

```bash
git add index.html app.js
git commit -m "feat(yocv): restrained shell, templates and copy"
```

---

### Task 5: YoCard shell and templates (`card.html`, `card.js`)

**Files:**
- Modify: `card.html`
- Modify: `card.js` (lines 32 to 35, 39 to 52, 56 to 87; keep `STRINGS`, fetch, state, event wiring)

**Interfaces:**
- Consumes: vocabulary classes; `card.css` classes from Task 3.
- Produces: `stepLine(n)` (`Step n of 4`), templates with the new copy.

- [ ] **Step 1: Rewrite `card.html`**

Same shell as Task 4 with: title `YoCard: a work card customers can check`; favicon letter "Y" as in Task 4; brand `YoCard` + `<span class="concept-tag">A Yoma concept</span>`; top action `<a class="text-button" href="index.html">Need a CV?</a>`; rail title "Steps", note "Nothing is public until you publish."; footer `<span>Student prototype. Not operated by Yoma or UNICEF.</span><span>Sample accounts are fictional. Cards are signed by YoCard, not by Yoma.</span><button class="text-button" id="reset-button">Start over</button>`; confirm dialog as in Task 4 with title "Start over?"; noscript unchanged.

- [ ] **Step 2: Rewrite the templates in `card.js`**

- Delete `arrow()` and `intro()`. `renderSteps()` as in Task 4 (digits, no tick). `stepLine(n)` → `<p class="step-line">Step ${n} of 4</p>`. `updatePill()` sets `pill.className='mode-label '+…` and `pill.textContent=text`.
- `connect()` offline: `${stepLine(1)}<h1 tabindex="-1">Start the YoCard server</h1><p class="lead">This page needs the local server to read an account, draft a card and publish it.</p><div class="notice">Run <code>npm start</code> in the project folder and reload this page. Published cards are served by the same server.</div>${errorHTML()}`. Online: `${stepLine(1)}<h1 tabindex="-1">Read your Yoma account</h1><p class="lead">${sample?'These are fictional sample accounts. A real account needs a Yoma-issued sign-in client, which this prototype does not have.':'This server is configured with a Yoma access token. It reads the account behind that token.'}</p>` + (sample) `<h2>Choose a sample account</h2><div class="choice-list" role="group" aria-label="Sample accounts">` with `<button class="choice …" data-persona…><span class="radio" aria-hidden="true"></span><span class="choice-text"><strong>${name}</strong><small>${trade}${city?' · '+city:''}</small></span></button>` + `${errorHTML()}<div class="busy-note" aria-live="polite">…</div><div class="action-row"><button class="${state.snapshot?'secondary':'primary'}" data-action="read-account" …>${sample?'Read this account':'Read my Yoma account'}</button></div><p class="field-help">YoCard is for adults. Accounts whose Yoma date of birth shows under 18 are refused.</p>${state.snapshot?accountSummary():''}`.
- `accountSummary()`: `<div class="account-summary"><h3>${name}</h3><p class="field-help">${readFrom…}${sample?' (fictional sample account)':''}</p><dl class="summary-list"><dt>Yo-ID</dt><dd>${u.yoIDOnboarded?'Active'+(u.dateYoIDOnboarded?' since '+monthYear(...):''):'Not yet. Yo-ID is needed to publish'}</dd><dt>Phone</dt><dd>${u.phoneNumberConfirmed?E(u.phoneNumber)+' · '+E(STRINGS.phoneConfirmed):'Not confirmed. Customers cannot message you through the card'}</dd><dt>Completions</dt><dd>${n} verified completion${s}${n?', recorded by Yoma partners':'. The card still works and will suggest opportunities'}</dd><dt>Skills</dt><dd>${k} skill${s}${k?', awarded through completions':' recorded'}</dd></dl><div class="action-row"><button class="primary" data-action="to-describe">Continue to describe your work</button></div></div>`.
- `describe()`: `${stepLine(2)}<h1 tabindex="-1">Describe your work in one message</h1><p class="lead">One message, like you would send on WhatsApp. What you do, where, what you charge, when you are free.</p><h2>Your trade</h2><div class="trade-grid" role="group" aria-label="Choose a trade">` with `<button class="trade ${sel}" data-trade… aria-pressed>${label}</button>` + the textarea section unchanged + notice unchanged + `<div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="draft" …>${busy?…:'Write the draft'}</button></div>`.
- `completionRow`/`skillRow`: `<li class="evidence-row">` with the logo `img` or no avatar (drop the `persona-avatar` span entirely); link text "Open on Yoma (yoma.world)" / "Lightcast skill entry"; wrap the lists in `<ul class="evidence-list">` (list-style none comes from `styles.css`).
- `serviceRows()`: remove button becomes `<button class="text-button" data-action="remove-service" data-index="${i}">Remove</button>` (aria-label kept).
- `review()`: `${stepLine(3)}<h1 tabindex="-1">What Yoma recorded, and what you added yourself</h1><p class="lead">The first block is what Yoma recorded, with a link to each record. The second is what you say about yourself, which nobody has checked.</p>` + confirmed tier: `<div class="tier confirmed"><div class="tier-head"><h3>Confirmed from Yoma</h3><span class="tag recorded">Rendered from your Yoma record</span></div><p class="tier-note">…</p>` + completions `<ul class="evidence-list">` + `<h4>Skills</h4>` + skills list + `<h4>What Yoma confirms, in plain words</h4>` + confirm lines `<div class="confirm-line">${text}<small>Cites ${ids}. ${mode text}</small><button class="text-button" data-action="remove-confirm" data-index="${i}">Remove line</button></div>` + rejected note + `</div>`; stated tier head `<span class="tag stated">Your own words</span>`; "Add a service" as `<button class="text-button" data-action="add-service">Add a service</button>`; third block `<div class="tier"><div class="tier-head"><h3>What customers can do</h3></div>` unchanged inside; footer `<div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="to-publish">Continue to publish</button></div>`.
- `publishStep()`: `${stepLine(4)}<h1 tabindex="-1">Choose what the card shows, then publish</h1><p class="lead">Your card becomes a page anyone with the link can open. Nothing else about you is published.</p>` + consent box with the list verbatim and `<p class="field-help">` for the tiny note (no inline style) + footer `<button class="back-link" data-action="back">Back</button><button class="primary" data-action="publish" …>${busy?…:'Publish the card'}</button>`.
- `published()`: `${stepLine(4)}<h1 tabindex="-1">Your card is public</h1><p class="lead">Share the link, print the code, or show the image.</p><div class="result-grid"><section><div class="card-preview" id="card-preview">…</div><div class="ladder"><h3>What this card proves, and what it does not</h3><ol>` (five items verbatim) `</ol></div></section><aside><div class="link-box"><dl class="link-list"><dt>Your link</dt><dd><code id="card-link">${url}</code></dd><dt>Card code</dt><dd class="big-code">${code}</dd></dl><button class="primary" data-action="share">Share on WhatsApp</button><button class="secondary" data-action="copy-link">Copy link</button><button class="secondary" data-action="download-png">Download image (PNG)</button><a class="secondary" href="${url}" target="_blank" rel="noopener noreferrer">Open the public page</a><button class="secondary" data-action="print">Print the QR code</button><div class="secret-box">Owner secret. Keep it: it is the only way to withdraw this card.<code id="owner-secret">${secret}</code><button class="text-button" data-action="withdraw">Withdraw this card</button></div></div></aside></div>`.
- Toasts in `readAccount`/`publishCard`: "Account read. Nothing is public yet." and "Your card is published." (check the existing strings at those call sites and replace only the user-facing sentence).

- [ ] **Step 3: Run the tests**

Run: `node --test tests/restyle.test.cjs`
Expected: the glyph test PASSES; only the render test still fails.
Run: `npm test`
Expected: 0 fail.

- [ ] **Step 4: Smoke in the browser**

Open `http://127.0.0.1:4173/card.html`. Choose Thandi Mokoena, "Read this account", "Continue to describe your work", keep Hairdresser, paste the demo message, "Write the draft", "Continue to publish", tick consent, "Publish the card". Expected: no console errors; the result screen shows the image, link and code.

- [ ] **Step 5: Commit**

```bash
git add card.html card.js
git commit -m "feat(yocard): restrained shell, templates and copy"
```

---

### Task 6: Public card page and SVG adopt the tokens (`server/card/render.js`)

**Files:**
- Modify: `server/card/render.js` (the `CSS` array, lines 111 to 129; `cardSvg`, lines 292 to 370)
- Modify: `tests/card-render.test.cjs` (add assertions to the existing publicPage and cardSvg tests)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: unchanged exports and markup.

- [ ] **Step 1: Add the assertions**

In the test `publicPage contains every fixed string…` add:
```js
 assert.ok(html.includes('--accent:#41204b'));
 assert.ok(!html.includes('text-transform'));
 assert.ok(!html.includes('border-radius:999px'));
```
In the first `cardSvg` test add:
```js
 assert.ok(svg.includes('fill="#41204b"'));
 assert.ok(svg.includes('Confirmed from Yoma'));
 assert.ok(!svg.includes('CONFIRMED FROM YOMA'));
 assert.ok(svg.includes('rx="8"'));
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/card-render.test.cjs`
Expected: both tests FAIL on the new assertions.

- [ ] **Step 3: Change the CSS values**

`:root{--ink:#1f1a22;--muted:#5d5566;--line:#d9d5dc;--ok:#387f6a;--bad:#b3261e;--grey:#5d5566;--bg:#f6f5f3;--card:#fff;--accent:#41204b;--stated:#f1f0f2}`; `button,.btn{…border-radius:4px;padding:8px 16px;font-weight:600…}`; `section{…border-radius:4px…}`; `h2{font-size:18px;font-weight:700;margin:0 0 8px;color:var(--ink)}` (no transform, no tracking); `.stated h2{color:var(--grey)}` stays; `.small.sample{…border:1px solid var(--line);border-left:4px solid var(--accent);border-radius:4px…}`; `.chip{display:inline-block;background:var(--stated);border:0;border-radius:4px;padding:2px 6px;margin:4px 4px 0 0;font-size:14px}`; `.wa{display:block;text-align:center;background:var(--accent);border-color:var(--accent);margin-top:8px}`; `.check li::before` removed, `.check li{font-size:14px}`; `.notice{background:var(--card);border-left:4px solid var(--accent)}`. Keep the `FONT` constant.

- [ ] **Step 4: Change the SVG values**

Header band `fill="#41204b"`; subtitle fill `#d9d5dc`; confirmed rect `rx="8" fill="#e6f5f3"`; label `svgText(90,y,STRINGS.confirmedTitle,{size:24,weight:700,fill:'#387f6a'})`; stated rect `rx="8" fill="#f1f0f2"`; stated label fill `#5d5566`; code line fill `#41204b`; default `svgText` fill `#1f1a22`; withdrawn/footer greys `#5d5566`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: 0 fail; `tests/restyle.test.cjs` now fully PASSES.

- [ ] **Step 6: Commit**

```bash
git add server/card/render.js tests/card-render.test.cjs
git commit -m "style(card): public page and SVG adopt the restrained tokens"
```

---

### Task 7: Docs follow the renamed labels

**Files:**
- Modify: `presentation/demo-script.md`, `README.md` (lines 60 to 63, 137, 140), `docs/testing-log.md` (rows 16, 17, 22 and the YoCard rows naming buttons)

- [ ] **Step 1: Replace every renamed label**

| Old | New |
| --- | --- |
| Try Amina's story | Load Amina's sample story |
| Build my CV | Continue to your experience |
| Add supporting evidence (button) | Continue to evidence |
| Create my draft | Write the draft |
| Preview my CV | Preview the CV |
| Back to evidence | Back |
| Strengthen this CV on Yoma | Learning opportunities on Yoma for this role |
| header pill / mode pill / the pill | header mode label / mode label |
| Describe my work | Continue to describe your work |
| Draft my card | Write the draft |
| Choose how to publish | Continue to publish |
| Publish my card | Publish the card |
| Share to WhatsApp | Share on WhatsApp |
| green **Confirmed from Yoma** block / grey **Stated by…** block | the first block, **Confirmed from Yoma** (green left border) / the second block, **Stated by Thandi, not checked** |
| "Green is rendered from data… Grey is her own words." | "The first block is rendered from data; the model never touches it. … The second block is her own words." |

Testing-log row 16: "pill truncates with ellipsis" becomes "mode label wraps to two lines, fully readable". Row 17 and README line 137: "mode pill" becomes "mode label". Keep every count and result.

- [ ] **Step 2: Grep for leftovers**

Run: `grep -n "Build my CV\|Try Amina\|Create my draft\|Preview my CV\|Draft my card\|Publish my card\|Choose how to publish\|Share to WhatsApp\|Strengthen this CV\|header pill" README.md presentation/demo-script.md docs/testing-log.md`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add README.md presentation/demo-script.md docs/testing-log.md
git commit -m "docs: rename buttons and blocks after the restyle"
```

---

### Task 8: Verify the journeys and the re-audit

**Files:** none changed unless a check fails (then fix in the owning file and re-run).

- [ ] **Step 1: Suite**

Run: `npm test`
Expected: 254 tests (253 plus the new file counts three), 0 fail, 2 skipped.

- [ ] **Step 2: Amina journey at 1280 px and 375 px**

In the browser pane on `http://127.0.0.1:4173/`, at each width: load the sample story, continue through all five steps accepting every claim, then run `document.documentElement.scrollWidth<=window.innerWidth` on every step. Expected: `true` each time; the header label reads "Sample mode" (server running) in full; console has no errors.

- [ ] **Step 3: Thandi journey at 1280 px and 375 px**

On `card.html`: read Thandi's account, describe (check the trade grid is two columns and `document.querySelector('.trade-grid').getBoundingClientRect().height<=360` at 375 px), draft, publish, open the public page and the SVG. Same overflow assertion on every step and on the public page. Expected: `true`; "Message on WhatsApp" button in accent purple when enabled.

- [ ] **Step 4: Offline label**

With the server stopped (or `fetch` stubbed to reject before load), reload both pages at 375 px. Expected: "Sample mode (offline)" fully visible beside "About"/"Need a CV?" with no overflow. Restart the server afterwards.

- [ ] **Step 5: Print media**

On the CV preview step run `matchMedia` emulation (or the pane's print preview) and confirm the rail, header, footer, export buttons and opportunities are hidden and `.cv-paper` has no border.

- [ ] **Step 6: Fresh re-audit of the ten tells**

Dispatch a fresh reviewer with the spec's list of ten tells and the four page files plus both sheets. Expected: fewer than four remain. Fix anything reported in the owning file, re-run `npm test`, and record the count in the final report.

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: restyle verification follow-ups"
```
