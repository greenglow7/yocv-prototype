'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const PAGES=['index.html','card.html','app.js','card.js'];
const SHEETS=['styles.css','card.css'];
const TOKENS=['--ink:#020304','--muted:#545859','--line:#dce0e5','--page:#f3f6fa','--panel:#ffffff','--accent:#41204b','--accent-shade:#54365d','--accent-tint:#e7d4ed','--green:#387f6a','--recorded:#2b6a57','--recorded-tint:#e6f5f3','--orange:#f9ab3e','--awaiting:#8a5a00','--awaiting-tint:#fdeed8','--stated-tint:#f3f6fa','--error:#b3261e','--error-tint:#ffe9ea'];
const FONT_LINK='https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Open+Sans:wght@400;600;700&display=swap';
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
 assert.ok(/\.evidence-record summary\{[^}]*min-height:44px;padding:10px 0\}/.test(css),'summary target by padding');
 assert.ok(!/\.evidence-record summary\{[^}]*line-height:44px/.test(css),'summary keeps the 1.5 line-height when it wraps');
 assert.ok(/\.form-section>summary\{[^}]*min-height:44px;padding:10px 0/.test(css),'form details summary target');
 assert.ok(/#view>\.form-section>h2\{margin-top:0\}/.test(css),'card heading flush with card padding');
 assert.ok(/\.cv-name\{[^}]*margin:0\}/.test(css),'CV name flush with paper padding');
 assert.ok(/\.top-actions \.phone-hide\{white-space:pre\}/.test(css),'About label keeps its space inside the flex button');
 assert.ok(/#toast\{[^}]*width:max-content;max-width:calc\(100vw - 32px\)/.test(css),'toast fills the phone width before wrapping');
 const print=css.match(/@media print\{[\s\S]*$/)[0];
 assert.ok(/#page-band/.test(print),'band hidden in print');
 assert.ok(/\.cv-paper\{border:0;border-radius:0;padding:0\}/.test(print),'flat CV in print');
});

test('YoCard components follow the same shapes',()=>{
 const css=read('card.css');
 const radii=new Set((css.match(/border-radius:([^;}]+)/g)||[]).map(r=>r.replace('border-radius:','').trim()));
 for(const r of radii)assert.ok(['8px','16px','9999px','50%','0'].includes(r),'radius '+r);
 assert.ok(/\.tier\{[^}]*border-radius:16px/.test(css));
 assert.ok(/\.tier\.confirmed\{border-left:6px solid var\(--green\)\}/.test(css));
 assert.ok(/\.tier\{[^}]*overflow:hidden/.test(css),"tiers clip the tinted head to the 16px corners");
 assert.ok(/\.secret-box code\{[^}]*font-size:14px/.test(css),"owner secret declares the 14px floor");
 assert.ok(/\.tier\.stated\{border-left:6px solid var\(--muted\)\}/.test(css));
 assert.ok(/\.trade\{[^}]*border-radius:16px/.test(css));
 assert.ok(!/border:1px solid var\(--line\)/.test(css.replace(/img\{[^}]*\}/g,'')),'no bordered boxes except logos');
});
