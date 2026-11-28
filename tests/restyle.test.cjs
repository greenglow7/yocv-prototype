'use strict';
// The look rules (family-look spec 2026-11-15, revised by the Yo-ID shell spec 2026-11-22 section 3): tokens, faces,
// radii, the shadow token, the 14 px floor, the focus rings, the print block, and YoCard's unchanged header and rail.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const PAGES=['index.html','card.html','app.js','card.js','yoid.js'];
const SHEETS=['styles.css','card.css'];
const TOKENS=['--ink:#020304','--muted:#545859','--line:#dce0e5','--page:#f3f6fa','--panel:#ffffff','--accent:#41204b','--accent-shade:#54365d','--accent-tint:#e7d4ed','--accent-soft:#c3a2cd','--green:#387f6a','--recorded:#2b6a57','--recorded-tint:#e6f5f3','--orange:#f9ab3e','--orange-tint:#fdeed8','--gold:#d48414','--awaiting:#8a5a00','--awaiting-tint:#fdeed8','--stated-tint:#f3f6fa','--blue-tint:#edf6fd','--blue:#4cade9','--blue-dark:#2487c5','--type-learning:#007cb4','--type-yoid:#a3195b','--type-default:#5a6675','--error:#b3261e','--error-tint:#ffe9ea'];
const SHADOW='--shadow:0 2px 15px -3px rgba(0,0,0,.07),0 10px 20px -2px rgba(0,0,0,.04)';
const RADII=['8px','12px','16px','18px','9999px','50%','0'];
const FONT_LINK='https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Open+Sans:wght@400;600;700&display=swap';
const stripSvg=s=>s.replace(/<svg[\s\S]*?<\/svg>/g,'').replace(/<path[^>]*>/g,'').replace(/d="[^"]*"/g,'').replace(/'<(?:path|circle|rect)[^']*'/g,'');
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

test('stylesheets use the Yoma tokens, the one shadow, the two Yoma faces and no template effects',()=>{
 const css=SHEETS.map(read).join('\n');
 for(const t of TOKENS)assert.ok(css.includes(t),'missing token '+t);
 assert.equal((read('styles.css').match(/:root\{/g)||[]).length,1);
 assert.ok(read('styles.css').includes(SHADOW),'the shadow token');
 assert.equal((css.match(/--shadow:/g)||[]).length,1,'declared once');
 for(const m of css.match(/box-shadow:[^;}]+/g)||[])assert.equal(m,'box-shadow:var(--shadow)','only the token: '+m);
 assert.ok(!css.includes('@import'));
 assert.ok(!/text-transform/.test(css));
 assert.ok(!/letter-spacing/.test(css));
 assert.ok(/font-family:"Nunito",system-ui,sans-serif/.test(css),'Nunito stack with system fallback');
 assert.ok(/font-family:"Open Sans",system-ui,sans-serif/.test(css),'Open Sans stack with system fallback');
 assert.ok(!/DM Sans|Manrope|IBM Plex/.test(css));
 const hexes=new Set((css.match(/#[0-9a-f]{3,8}\b/gi)||[]).map(h=>h.toLowerCase()));
 const allowed=new Set(TOKENS.map(t=>t.split(':')[1]));
 for(const h of hexes)assert.ok(allowed.has(h),'untokenised colour '+h);
 const screen=stripPrint(css);
 for(const m of screen.match(/font-size:\s*(\d+)px/g)||[])assert.ok(Number(m.match(/\d+/)[0])>=14,'font size under 14px: '+m);
 assert.ok(css.includes('button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:2px}'),'focus ring');
 assert.ok(css.includes('.hero :focus-visible,.dialog-top :focus-visible{outline-color:var(--panel)}'),'white focus ring on purple');
 assert.ok(/overflow-wrap:anywhere/.test(css));
 assert.ok(/@media print\{/.test(css));
 assert.ok(/prefers-reduced-motion/.test(css));
 assert.ok(!read('card.css').includes(':root'),'card.css defines no tokens');
});

test('both pages load the Yoma faces once; YoCard keeps the page band',()=>{
 for(const f of ['index.html','card.html']){
  const s=read(f);
  assert.equal((s.match(/fonts\.googleapis\.com\/css2/g)||[]).length,1,f+' font link count');
  assert.ok(s.includes(FONT_LINK),f+' font link');
  assert.ok(s.includes('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'),f+' preconnect');
  assert.ok(s.includes('A Yoma concept'),f+' concept line');
 }
 assert.ok(/<\/header>\s*<div id="page-band" class="page-band">/.test(read('card.html')),'card.html page band after header');
 assert.ok(read('card.html').includes('Not operated by Yoma or UNICEF'));
});

test('YoCard keeps the band heading; the CV steps head with an h2 that receives focus',()=>{
 const card=read('card.js');
 assert.ok(/function setBand\(\)/.test(card),'card.js setBand');
 assert.ok(card.includes("document.querySelector('#page-band h1')?.focus("),'card.js focuses the band h1');
 assert.ok(!card.includes("view.querySelector('h1')?.focus("),'card.js no longer focuses the view h1');
 const app=read('app.js');
 assert.ok(app.includes("querySelector('h2.step-title')?.focus("),'app.js focuses the step h2');
 assert.ok(!app.includes("view.querySelector('h1')?.focus(")&&!app.includes('#page-band'),'app.js has no band');
 assert.ok(!app.includes('class="hl"'));
 assert.ok(!card.includes('class="hl"'),'no highlight in YoCard');
});

test('the YoCard header wraps on phones instead of overflowing',()=>{
 const css=read('card.css');
 assert.ok(/@media\(max-width:640px\)\{[^}]*\.topbar\{[^}]*flex-wrap:wrap/.test(css)||/\.topbar\{[^}]*flex-wrap:wrap/.test(css),'topbar wraps');
 assert.ok(/\.topbar\{[^}]*min-height:72px/.test(css),'72px min-height, not fixed height');
 assert.ok(!/\.topbar\{[^}]*;height:64px/.test(css));
});

test('the public card page and SVG use the accent and no uppercase labels',()=>{
 const src=read('server/card/render.js');
 assert.ok(src.includes('--accent:#41204b'));
 assert.ok(!src.includes('#5b2a86'));
 assert.ok(!/text-transform/.test(src));
 assert.ok(!src.includes('CONFIRMED FROM YOMA'));
});

test('components follow the Yoma shapes',()=>{
 const css=read('styles.css');
 const radii=new Set((css.match(/border-radius:([^;}]+)/g)||[]).map(r=>r.replace('border-radius:','').trim()));
 for(const r of radii)assert.ok(RADII.includes(r),'radius '+r);
 assert.ok(/\.primary,\.secondary\{[^}]*border-radius:9999px/.test(css),'pill buttons');
 assert.ok(/\.secondary\{[^}]*border:1px solid var\(--green\)/.test(css));
 assert.ok(/input,textarea\{[^}]*border:1px solid var\(--muted\)/.test(css),'input border');
 assert.ok(/select\{[^}]*border:1px solid var\(--muted\)/.test(css),'select border');
 // No shell rule may lighten the field border to the --line hairline: 1.33:1 on white is under the 3:1 floor for a control boundary (WCAG 1.4.11).
 assert.ok(!/(input|textarea|select)[^{]*\{[^}]*border(-color)?:[^;}]*var\(--line\)/.test(css),'no --line field border');
 assert.ok(/\.tag\{[^}]*border-radius:9999px/.test(css),'tag pills');
 assert.ok(/\.tag\.ai\{background:var\(--accent-tint\);color:var\(--accent\)\}/.test(css));
 assert.ok(!/\.claim-card\{[^}]*border:1px/.test(css),'no card borders');
 assert.ok(/\.dialog-top\{[^}]*background:var\(--accent\)/.test(css),'dialog header band');
 assert.ok(/\.notice\{[^}]*background:var\(--accent-tint\)/.test(css));
 assert.ok(/\.error-message\{[^}]*background:var\(--error-tint\)/.test(css));
 assert.ok(/\.evidence-record summary\{[^}]*min-height:44px;padding:10px 0\}/.test(css),'summary target by padding');
 assert.ok(!/\.evidence-record summary\{[^}]*line-height:44px/.test(css),'summary keeps the 1.5 line-height when it wraps');
 assert.ok(/\.form-section>summary\{[^}]*min-height:44px;padding:10px 0/.test(css),'form details summary target');
 assert.ok(/#view>\.form-section>h2\{margin-top:0\}/.test(css),'card heading flush with card padding');
 assert.ok(/\.cv-name\{[^}]*margin:0\}/.test(css),'CV name flush with paper padding');
 assert.ok(/#toast\{[^}]*width:max-content;max-width:calc\(100vw - 32px\)/.test(css),'toast fills the phone width before wrapping');
 const print=css.match(/@media print\{[\s\S]*$/)[0];
 assert.ok(/\.cv-paper\{border:0;border-radius:0;padding:0\}/.test(print),'flat CV in print');
 assert.ok(/\.cv-paper\{[^}]*font-family:Arial,Helvetica,"Liberation Sans",sans-serif/.test(css));
 assert.ok(/\.cv-paper\{[^}]*font-size:11pt;line-height:1\.3/.test(css));
 assert.ok(/@page\{margin:18mm\}/.test(css)&&!css.includes('@page{size:A4;margin:15mm}'));
 assert.ok(!/@media print\{[^\n]*\.cv-bullet\{font-size:12px\}/.test(css)); // the print block is one line, which holds an @page rule
 // YoCard print is unchanged: its own @page rule, loaded after styles.css, and no new unscoped hide selector.
 assert.ok(read('card.css').includes('@media print{@page{size:A4;margin:15mm}}'));
 const OLD_HIDE='.topbar,#page-band,.sidebar,.app-footer,.form-footer,.evidence-record,#toast,dialog,.skip-link,.review-heading,.print-hide,.step-line,.lead,.export-actions,.sample-preview,.opportunities,.action-row,.primary,.secondary,.text-button,.back-link';
 const hide=css.match(/@media print\{[\s\S]*?\{display:none!important\}/)[0].match(/\}([^{}]*)\{display:none!important\}$/)[1].split(',');
 for(const sel of hide)assert.ok(OLD_HIDE.split(',').includes(sel)||sel.startsWith('body.yocv-app '),sel);
 for(const sel of ['body.yocv-app .topbar','body.yocv-app .hero','body.yocv-app #tabs','body.yocv-app .app-footer','body.yocv-app #tab-view'])assert.ok(hide.includes(sel),'print hides '+sel);
});

test('YoCard components follow the same shapes',()=>{
 const css=read('card.css');
 const radii=new Set((css.match(/border-radius:([^;}]+)/g)||[]).map(r=>r.replace('border-radius:','').trim()));
 for(const r of radii)assert.ok(RADII.includes(r),'radius '+r);
 assert.ok(/\.tier\{[^}]*border-radius:16px/.test(css));
 assert.ok(/\.tier\.confirmed\{border-left:6px solid var\(--green\)\}/.test(css));
 assert.ok(/\.tier\{[^}]*overflow:hidden/.test(css),"tiers clip the tinted head to the 16px corners");
 assert.ok(/\.secret-box code\{[^}]*font-size:14px/.test(css),"owner secret declares the 14px floor");
 assert.ok(/\.tier\.stated\{border-left:6px solid var\(--muted\)\}/.test(css));
 assert.ok(/\.trade\{[^}]*border-radius:16px/.test(css));
 assert.ok(!/border:1px solid var\(--line\)/.test(css.replace(/img\{[^}]*\}/g,'')),'no bordered boxes except logos');
});

test('the CV steps wear the shell cards, pills and buttons (shell spec section 6, plan Task 4)',()=>{
 const css=read('styles.css'),app=read('app.js');
 const screen=stripPrint(css);
 // Buttons: round green primary with the darker green hover; white secondary with the green border. Scoped to the
 // shell so YoCard's purple primary is untouched.
 assert.ok(/body\.yocv-app \.primary\{background:var\(--green\)[^}]*color:#ffffff/.test(screen),'green primary');
 assert.ok(/body\.yocv-app \.primary:hover\{background:var\(--recorded\)/.test(screen),'darker green hover');
 assert.ok(/\.secondary\{[^}]*border:1px solid var\(--green\)/.test(css),'secondary keeps the green border');
 assert.ok(/\.primary\{background:var\(--accent\)/.test(css),'YoCard keeps the purple primary');
 // Cards: white, the shadow token, 12 px radius, 16 px padding, 24 px from 768 px.
 assert.ok(/#view>\.form-section,\.claim-card\{[^}]*background:var\(--panel\)[^}]*box-shadow:var\(--shadow\)[^}]*border-radius:12px[^}]*padding:16px/.test(screen),'cards');
 assert.ok(/@media\(min-width:768px\)\{[^\n]*#view>\.form-section,\.claim-card\{padding:24px\}/.test(screen),'24px from 768px');
 assert.ok(/body\.yocv-app #view>\.evidence-list\{[^}]*box-shadow:var\(--shadow\)[^}]*border-radius:12px/.test(screen),'evidence list card');
 assert.ok(/\.evidence-record\{[^}]*box-shadow:var\(--shadow\)[^}]*border-radius:12px/.test(screen),'evidence record card');
 // Step pills above the step title, the current one green; they wrap on phones.
 assert.ok(/\.step-pills\{[^}]*flex-wrap:wrap/.test(css),'pills wrap');
 assert.ok(/\.step-pills \.pill\[aria-current="step"\]\{background:var\(--green\)/.test(css),'current step green');
 assert.ok(app.indexOf('stepPills()+`<h2 class="step-title"')>0,'pills before the step title');
 // The review's Accept, Edit and Leave out are pills, the pressed one green.
 const decide=app.match(/function decisionButtons[\s\S]*?\n\}/)[0];
 assert.ok(decide.includes('class="pill"')&&!/'primary':'secondary'/.test(decide),'decision buttons are pills');
 assert.ok(/\.claim-actions \.pill\[aria-pressed="true"\]\{background:var\(--green\)/.test(css),'pressed pill green');
 // Evidence chips keep their tints at 14 px.
 assert.ok(/\.tag\{[^}]*font-size:14px/.test(css));
 for(const t of ['recorded','awaiting','stated'])assert.ok(new RegExp('\\.tag\\.'+t+'[,{]').test(css),'tag '+t);
 // Inputs: the --muted border (the final review measured the --line hairline at 1.33:1, under WCAG 1.4.11's 3:1) and
 // the 8 px radius; the interview chips are pills, not skill chips.
 assert.ok(!/body\.yocv-app :is\(input,textarea,select\)\{border-color:var\(--line\)\}/.test(screen),'no hairline inputs');
 assert.ok(/input,textarea\{[^}]*border-radius:8px/.test(css));
 assert.ok(/\.chips \.chip,\.entry-tabs \.chip\{[^}]*min-height:44px[^}]*border:1px solid var\(--line\)[^}]*cursor:pointer/.test(css)&&/\.chips \.chip\.selected,\.entry-tabs \.chip\.selected\{background:var\(--green\)/.test(css),'interview chips and step 2 entry tabs');
 // The opportunities block is a list of cards.
 assert.ok(/body\.yocv-app \.opp-item\{[^}]*box-shadow:var\(--shadow\)[^}]*border-radius:12px/.test(screen),'opportunity cards');
 // The paper keeps its typography with the card radius; print flattens it and hides the shell.
 assert.ok(/\.cv-paper\{[^}]*border-radius:12px/.test(screen),'paper radius');
 const print=css.match(/@media print\{[\s\S]*$/)[0];
 assert.ok(/\.cv-paper\{border:0;border-radius:0;padding:0\}/.test(print)&&/@page\{margin:18mm\}/.test(print));
 assert.ok(!/body\.yocv-app[^{},]*\.cv-paper/.test(css),'no shell rule outranks the flat print paper');
 // Phones: cards keep 16 px padding and the primary fills the form footer.
 assert.ok(/@media\(max-width:640px\)\{[^\n]*\.form-footer \.primary\{width:100%\}/.test(css));
});
