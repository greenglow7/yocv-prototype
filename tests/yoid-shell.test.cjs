'use strict';
// The Yo-ID shell (plan 2026-11-22 Task 2): index.html is the shell, yoid.js owns the person, the route and the
// tabs, app.js is mounted into the CV tab, and the shell styles are scoped so YoCard keeps its rules.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

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
  for(const k of ['copy.modeLive','copy.modeSample','copy.modeOffline'])assert.ok(js.includes(k),k+' moves to the footer');
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
