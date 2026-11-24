'use strict';
// The Yo-ID tab pages (plan 2026-11-22 Task 3): yoid.js runs in a vm context with stubbed browser globals, and the
// pure renderers on window.YoID.views are checked against Thandi's sample record and an empty one (Sipho).
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {readCvRecord}=require('../server/cv/record.js');
const {createAccountSource}=require('../server/card/account.js');
const {loadConfig}=require('../server/config.js');
const {NOW,fakeYoma}=require('./helpers/vouch-boot.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function loadViews(){
  const noop=()=>{};
  const ctx={
    document:{querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,addEventListener:noop},
    sessionStorage:{getItem:()=>null,setItem:noop,removeItem:noop},
    location:{href:'http://127.0.0.1:4173/',hash:'',pathname:'/',search:''},
    history:{replaceState:noop},
    // boot() asks for the config; the promise never settles, so nothing after it runs in the stub.
    fetch:()=>new Promise(noop),
    setTimeout,clearTimeout,URL,AbortController,console
  };
  ctx.window=ctx;ctx.addEventListener=noop;
  ctx.YoCVCopy=require('../cv-copy.js');
  ctx.YoCVRules=require('../cv-rules.js');
  ctx.YoCV=require('../core.js');
  ctx.YoCVApp={mount:()=>({showStep(){},goOffline(){}}),useRecord:noop,clearDraft:noop,draftStatus:()=>({step:0,accepted:0,ready:false})};
  vm.createContext(ctx);
  vm.runInContext(read('yoid.js'),ctx,{filename:'yoid.js'});
  return ctx.YoID.views;
}
const views=loadViews();
let thandi;
const sipho={completions:[],credentials:[],selfAttested:[],wallet:'sample'};
test.before(async()=>{
  const config={...loadConfig({env:{},cwd:fs.mkdtempSync(path.join(os.tmpdir(),'yoid-tabs-'))}),yomaAccessToken:''};
  thandi=await readCvRecord({accountSource:createAccountSource({config,yoma:fakeYoma(),now:()=>NOW}),selector:{persona:'thandi'}});
  assert.equal(thandi.completions.length,3);assert.equal(thandi.credentials.length,3);
});

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
test('overview bodies: type pills, the four circles with a ring and up to eight chips',()=>{
  const h=views.overview(thandi,{step:0,accepted:0,ready:false});
  assert.ok(h.includes('class="type-pill"'),'passport type pill');
  assert.equal((h.match(/class="circle"/g)||[]).length,4,'four opportunity circles');
  assert.ok(h.includes('conic-gradient(var(--orange) 0 100%,var(--green) 0)'),'completed ring at its share');
  assert.equal((h.match(/class="skill-chip"/g)||[]).length,3);
  const many={...thandi,selfAttested:Array.from({length:10},(_,i)=>({id:'s'+i,name:'Skill '+i}))};
  assert.equal((views.overview(many,{step:0,accepted:0,ready:false}).match(/class="skill-chip"/g)||[]).length,8,'at most eight chips');
  for(const l of ['Open Wallet','Open Passport','Open Opportunities','Open Skills'])assert.ok(h.includes(l),l);
  assert.ok(/aria-expanded="false"/.test(h),'closed by default');
});
test('empty records show the Yoma empty states',()=>{
  const h=views.overview(sipho,{step:0,accepted:0,ready:false});
  assert.ok(h.includes('No credentials yet')&&h.includes('No opportunities yet')&&h.includes('No skills yet')&&h.includes('0 completed'));
  assert.ok(!/undefined|NaN|null/.test(h));
  for(const v of ['wallet','passport','opportunities','skills'])assert.ok(!/undefined|NaN/.test(views[v](sipho)),v);
  assert.ok(views.passport(sipho).includes('Complete an opportunity to get a verified credential: proof of what you did.'));
  assert.ok(views.opportunities(sipho).includes('No opportunities yet')&&views.skills(sipho).includes('No skills yet'));
});
test('wallet tab shows the pending wallet and how ZLTO works, with no figure',()=>{
  const h=views.wallet(thandi);
  assert.ok(h.includes('My Wallet')&&h.includes('How ZLTO works')&&h.includes('Your wallet is still being set up.'));
  assert.ok(!/\d+ ZLTO|My Products</.test(h));
});
test('passport cards carry the record status, not Verified',()=>{
  const h=views.passport(thandi);
  assert.equal((h.match(/class="cred-card"/g)||[]).length,3);
  assert.ok(h.includes('>Issued<')&&!/>Verified</.test(h));
  assert.ok(h.includes('Alison Learning')&&h.includes('View credential'));
  assert.ok(h.includes('Yo-ID')&&h.includes('Passport'),'breadcrumb');
  assert.ok(h.includes('All 3')&&h.includes('Learning 3'),'filter pills');
  assert.ok(h.includes('class="cred-band"')&&h.includes('class="type-chip"'));
  assert.ok(h.includes('Issued October 2025'));
  assert.ok(!/verified by Yoma/i.test(h));
});
test('the credential detail lists status, issuer, date and skills, with a Yoma link only for a known opportunity',()=>{
  const c=thandi.credentials[1],h=views.credentialDetail(thandi,c.id);
  for(const s of ['Status','Issued','Issuer','Alison Learning','Date issued','October 2025','Skills','Customer Service'])assert.ok(h.includes(s),s);
  const opp=thandi.completions.find(x=>x.evidenceId===c.completionId).opportunityId;
  assert.ok(h.includes('href="https://yoma.world/opportunities/'+opp+'"')&&h.includes('rel="noopener"'));
  const unlinked={...thandi,credentials:[{...c,completionId:null}]};
  assert.ok(!views.credentialDetail(unlinked,c.id).includes('yoma.world'));
  assert.equal(views.credentialDetail(thandi,'nope'),'');
});
test('opportunity cards link to the live Yoma page only when the record holds an id',()=>{
  const h=views.opportunities(thandi);
  assert.ok(h.includes('https://yoma.world/opportunities/')&&h.includes('rel="noopener"'));
  const noId={...thandi,completions:[{...thandi.completions[0],opportunityId:null}]};
  assert.ok(!views.opportunities(noId).includes('View opportunity'));
  assert.ok(h.includes('Completed')&&h.includes('Skills developed'));
  assert.ok(h.includes('Pending 0')&&h.includes('Declined 0')&&h.includes('Saved 0'),'sub-tab pills');
  const p=views.opportunities(thandi,'pending');
  assert.ok(p.includes('No opportunities yet')&&!p.includes('Skills developed'),'the other sub-tabs show the empty card');
});
test('skills tiles de-duplicate by name and label self-attested ones',()=>{
  const rec={...thandi,selfAttested:[{evidenceId:'a1',id:'x',name:'Cosmetics'},{evidenceId:'a2',id:'y',name:'Braiding'}]};
  const names=[...views.skillsOf(rec)].map(s=>s.name); // spread: the vm realm has its own Array
  assert.deepEqual(names,['Cosmetics','Customer Service','Financial Management','Braiding']);
  const h=views.skills(rec);
  assert.ok(h.includes('Skill issued by 1 partner')&&h.includes('Self-attested'));
  const two={...thandi,completions:[...thandi.completions,{...thandi.completions[0],evidenceId:'c9',organizationName:'Sample Skills Trust'}]};
  assert.ok(views.skills(two).includes('Skill issued by 2 partners'),'partners counted across completions');
});
test('no arrows or Yoma assets in the views',()=>{
  const all=['overview','wallet','passport','opportunities','skills'].map(v=>views[v](thandi,{step:0,accepted:0,ready:false})).join('');
  for(const g of ['→','←','✓','×'])assert.ok(!all.replace(/<svg[\s\S]*?<\/svg>/g,'').includes(g));
  assert.ok(!/\.webp|\.png|logo-/.test(all));
});
test('the tab styles are in styles.css within the restyle rules',()=>{
  const css=read('styles.css');
  for(const sel of ['.circles{','.circle{','.chip{','.cred-band{','.type-chip{','.skill-tile{','.issuer-dot{'])assert.ok(css.includes(sel),sel);
  assert.ok(/\.type-chip\{[^}]*background:var\(--type-learning\)/.test(css));
  assert.ok(/\.cred-band\{[^}]*color-mix\(in srgb,var\(--type-learning\) 10%,var\(--panel\)\)/.test(css));
});
