'use strict';
// The app shell and the four steps (plan Tasks 15a and 15b): the review payload, the decisions, the offline review,
// and the routes and copy app.js runs on.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {newCvState,reviewPayload,decide,readyForCv,profileInput,offlineReview,profileLine,buildCv}=require('../core.js');
const {RULES}=require('../cv-rules.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const {entry}=JSON.parse(read('tests/fixtures/cv-thandi.json'));
test('reviewPayload never carries the name, contacts, the place or the optional fields outside knownWords',()=>{
  const s={...newCvState(),sessionId:'a'.repeat(24),role:'Hairdresser',entries:[entry],contact:{name:'Thandi Mokoena',phone:'+27735550147',email:'t@example.org',town:'Khayelitsha',education:'Matric'},optional:{photo:'data:image/png;base64,xx',dateOfBirth:'2002-03-15',idNumber:'0203150000000',stateOfOrigin:''}};
  const {knownWords,...rest}=reviewPayload(s);
  const p=JSON.stringify(rest);
  assert.deepEqual(knownWords,['Khayelitsha','Thandi','Mokoena']);
  assert.ok(!/Thandi|Mokoena|\+27|example\.org|Khayelitsha|Matric|data:image|2002-03-15|0203150000000|"place"/.test(p));
});
// The record read and the mode label belong to the shell (tests/yoid-shell.test.cjs).
test('app.js runs Steps 1 and 2 on the new routes and copy, not the old flow',()=>{
  const s=read('app.js');
  for(const route of ['/api/cv/config','/api/cv/menu'])assert.ok(s.includes(route),route);
  assert.ok(!s.includes('/api/generate')&&!s.includes('sample-credential')&&!s.includes('Amina'));
  for(const k of ['copy.stepRecord','copy.stepWork','copy.stepReview','copy.stepCv','copy.recordOffline','copy.roleOffline'])assert.ok(s.includes(k),k);
  assert.ok(/wallet\s*===\s*'unavailable'/.test(s)&&s.includes('copy.walletUnavailable'),'Wallet not available is shown');
  assert.ok(s.includes('window.YoCVCopy')&&s.includes('window.YoCVRules'),'the offline start reads the browser files');
  assert.ok(!s.includes('Start the YoCV server with npm start'));
  assert.ok(!/marital|religion/i.test(s),'never collected (spec 10)');
  assert.ok(s.includes('copy.labelYoma'),'Step 1 heading Confirmed from Yoma');
  assert.ok(s.includes('credential.skills')||s.includes('.skills.map'),'spec 6 rule 6: each credential lists its skills');
});
test('index.html loads the catalogue and the rules before core.js and app.js, and the server serves them',()=>{
  const html=read('index.html');
  const at=f=>html.indexOf('src="'+f+'"');
  assert.ok(at('cv-copy.js')>0&&at('cv-copy.js')<at('cv-rules.js')&&at('cv-rules.js')<at('core.js')&&at('core.js')<at('app.js'));
  assert.ok(/<body class="yocv-app"/.test(html));
  const server=read('server.js');
  for(const f of ["'/cv-copy.js'","'/cv-rules.js'"])assert.ok(server.includes(f),f);
});

const copy=require('../cv-copy.js').en;
// One EntryDraft with two proposals, skills Hairstyling (S2) and Cosmetics (S1), and a profile proposal.
function withReview(s){
  const P=text=>({text,origin:'template',templateWording:false,sourceQuote:'braid hair at home',sourceFields:['what','number','months'],usedNumbers:['40','2025'],highlight:null,checks:['numbers','names','overstatement','opening','length','quote']});
  return {...s,step:2,sessionId:'a'.repeat(24),role:'Hairdresser',entries:[entry],
    record:{source:'sample',fictional:true,user:{id:'u1',firstName:'Thandi',displayName:'Thandi Mokoena',city:'Khayelitsha, Cape Town',phoneNumber:''},completions:[],credentials:[],selfAttested:[],wallet:'sample'},
    review:{entries:[{index:0,proposals:[P('Braided hair at home for about 40 customers a week since March 2025.'),P('Braided box braids and cornrows at home for about 40 customers a week.')],rejected:[],skills:[],needsDetail:false}]},
    generation:{mode:'sample',provider:'local',model:null,durationMs:1},
    skills:[{name:'Hairstyling',yomaSkill:null,level:'S2',label:copy.labelCustomer,sources:[{level:'S2',kind:'customer',ref:'V1',label:copy.labelCustomer}]},
      {name:'Cosmetics',yomaSkill:null,level:'S1',label:copy.labelYoma,sources:[{level:'S1',kind:'completion',ref:'c1',label:copy.labelYoma}]}],
    profile:{text:'Hairdresser with hairstyling and 9 months of braiding at home.',months:9},
    decisions:{}};
}
test('nothing reaches the CV without an Accept, and the profile line uses accepted material only',()=>{
  let s=withReview(newCvState());
  assert.equal(readyForCv(s),false);
  s=decide(s,'0:0','accepted'); s=decide(s,'0:1','left_out'); s=decide(s,'skill:Hairstyling','accepted'); s=decide(s,'skill:Cosmetics','left_out');
  const input=profileInput(s);
  assert.deepEqual(input.skills.map(k=>k.name),['Hairstyling'],'a left-out skill never reaches the profile line');
  assert.ok(!/cosmetics/i.test(profileLine({...input,nowIso:'2025-11-19T10:00:00Z'}).text));
  assert.equal(readyForCv(s),false,'profile still pending');
  s=decide(s,'profile','accepted');
  assert.equal(readyForCv(s),true);
  assert.deepEqual(buildCv(s,copy).skills.map(k=>k.name),['Hairstyling']);
  s=decide(s,'profile','edited','Hairdresser with hairstyling and 9 months of braiding at home for women.'); assert.equal(buildCv(s,copy).profile,'Hairdresser with hairstyling and 9 months of braiding at home for women.');
});
test('offlineReview uses the template and the core checks and labels the mode',()=>{
  const r=offlineReview({...newCvState(),role:'Hairdresser',entries:[entry]},RULES,'2025-11-19T10:00:00Z');
  assert.equal(r.generation.mode,'sample-offline'); assert.equal(r.entries[0].proposals[0].origin,'template'); assert.deepEqual(r.skills,[]);
});
test('offlineReview runs from the browser files alone, with no server and no /api/cv/config',()=>{
  // What index.html opened from disk has: cv-copy.js, cv-rules.js and core.js, nothing from the server.
  const vm=require('node:vm'),ctx={};vm.createContext(ctx);
  for(const f of ['cv-copy.js','cv-rules.js','core.js'])vm.runInContext(read(f),ctx,{filename:f});
  assert.ok(ctx.YoCVCopy&&ctx.YoCVRules&&ctx.YoCV);
  const r=ctx.YoCV.offlineReview({...ctx.YoCV.newCvState(),role:'Hairdresser',entries:[entry]},ctx.YoCVRules.RULES,'2025-11-19T10:00:00Z');
  assert.equal(r.generation.mode,'sample-offline');
  assert.ok(ctx.YoCV.checkCvText(r.entries[0].proposals[0].text,{fields:entry,role:'Hairdresser',kind:'bullet'},ctx.YoCVRules.RULES).ok);
});
test('app.js runs Steps 3 and 4 on the new routes',()=>{
  const s=read('app.js');
  for(const route of ['/api/cv/review','/api/cv/check','/api/cv/skills','/api/yoma/opportunities'])assert.ok(s.includes(route),route);
  assert.ok(s.includes('window.print()')&&s.includes('offlineReview')&&s.includes('profileInput'));
  assert.ok(/renderCvHtml\([^;\n]*headingLevel:\s*2/.test(s),'the on-page paper keeps one h1');
  for(const k of ['copy.printCv','copy.downloadText','copy.downloadRecordHtml','copy.downloadRecordJson'])assert.ok(s.includes(k),k);
  for(const k of ['copy.accept','copy.edit','copy.leaveOut','copy.templateWording'])assert.ok(s.includes(k),k);
  assert.ok(s.includes('session_expired')&&s.includes('skillNames'),'an expired session re-opens the record; the profile check sends the skill names');
});
test('final review 7 and 8: every server request has a 30 s deadline with Retry, and a superseded review is aborted and changes nothing',()=>{
  const s=read('app.js');
  assert.ok(s.includes('AbortController')&&s.includes('30000')&&s.includes('copy.errTimeout')&&s.includes('copy.retry')&&s.includes('retry-review'),'a deadline, its copy and a Retry button');
  assert.ok(s.includes('reviewAbort')&&s.includes('e.cancelled'),'one AbortController per review, aborted by a newer review or Back');
  assert.ok(/if\(e\.cancelled\|\|ui\.reviewed!==key\)return;/.test(s),'the staleness check runs before any error is shown');
  for(const k of ['errTimeout','retry'])assert.equal(typeof copy[k],'string',k);
});
test('final review 9: the Word download sends no optional detail, and the page says so',()=>{
  const s=read('app.js');
  assert.ok(/optional:\{photo:'',dateOfBirth:'',idNumber:'',stateOfOrigin:''\}/.test(s.slice(s.indexOf('async function downloadDocx'))),'the four optional fields are blanked before the POST');
  assert.ok(s.includes('copy.downloadDocxHelp')&&typeof copy.downloadDocxHelp==='string');
  assert.ok(copy.optionalHelp.includes('They stay in this browser.')&&read('index.html').includes('A photo and the other optional details stay in this browser.'),'the promise stays and is now true');
});
test('final review 10: the offline notice names what built the lines on the page',()=>{
  const s=read('app.js');
  assert.ok(/generation\?\.mode==='sample-offline'/.test(s)&&s.includes('copy.checkOffline')&&typeof copy.checkOffline==='string');
  assert.ok(!/ui\.error=e\.network\?copy\.reviewOffline/.test(s),'addSkill no longer relabels the server lines');
});
test('final review 16: a Yoma profile without a name, phone or town prefills empty strings and Continue still checks',()=>{
  const s=read('app.js');
  assert.ok(/name:u\.displayName\?\?'',phone:u\.phoneNumber\?\?'',town:u\.city\?\?''/.test(s));
  assert.ok(!s.includes('state.contact.name.trim()')&&/String\(state\.contact\.name\?\?''\)\.trim\(\)/.test(s));
});
