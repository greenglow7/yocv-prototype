'use strict';
// The connected journey (spec docs/superpowers/specs/2026-11-28-yocv-connected-journey-design.md, journey contract v1):
// the link params SkillLens sends, the link back to the Ziqi listing after Apply, and the four-step YoID thread.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JOURNEY_KEYS,journeyParams,journeyReturn,journeyBackHref,journeyThread,journeyRole}=require('../core.js');
const copy=require('../cv-copy.js').en;
const JOURNEY=require('../data/journey.json');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const RETURN='http://localhost:3000/opportunities/c0a7e000-0000-4000-8000-000000000301';
// Link 3 of the contract, SkillLens -> YoCV, as SkillLens builds it.
const LINK='?as=halima&journey=demo&from=skilllens&yoid=yoid-ng-7f3a0123&listing=opp-job-001&goal=job&plan=plan-001'
  +'&course=opp-course-001&credential=cred-002&return='+encodeURIComponent(RETURN);

test('the contract params are the nine the contract lists, as=persona is not one of them',()=>{
  assert.deepEqual(JOURNEY_KEYS,['journey','from','yoid','listing','goal','plan','course','credential','return']);
});

test('journeyParams reads the SkillLens link, with or without the leading ?',()=>{
  const want={journey:'demo',from:'skilllens',yoid:'yoid-ng-7f3a0123',listing:'opp-job-001',goal:'job',plan:'plan-001',
    course:'opp-course-001',credential:'cred-002',return:RETURN};
  assert.deepEqual(journeyParams(LINK),want);
  assert.deepEqual(journeyParams(LINK.slice(1)),want);
});

test('without journey=demo there is no journey, whatever else the address holds',()=>{
  assert.equal(journeyParams(''),null);
  assert.equal(journeyParams('?as=halima'),null);
  assert.equal(journeyParams('?from=skilllens&credential=cred-002&return='+encodeURIComponent(RETURN)),null);
  assert.equal(journeyParams('?journey=live&from=skilllens'),null);
  assert.equal(journeyParams(null),null);
});

test('journeyParams keeps only the contract params it was given, trimmed, and drops empty or oversized ones',()=>{
  const p=journeyParams('?journey=demo&from=%20skilllens%20&yoid=&other=x&listing='+'a'.repeat(300));
  assert.deepEqual(p,{journey:'demo',from:'skilllens'});
  assert.equal(Object.keys(journeyParams('?journey=demo&return='+encodeURIComponent('http://x.test/'+'a'.repeat(1500)))).length,2,'a long return still fits');
});

test('only an http or https return is followed',()=>{
  assert.equal(journeyReturn(RETURN),RETURN);
  assert.equal(journeyReturn('https://ziqi.example/opportunities/1?tab=a'),'https://ziqi.example/opportunities/1?tab=a');
  for(const bad of ['javascript:alert(1)','data:text/html,hi','/opportunities/1','ftp://x.test/','//evil.test/x','http://','',null,undefined,'http://x.test/a b'])
    assert.equal(journeyReturn(bad),'',String(bad));
});

test('the link back to the listing adds the four contract params with ? or &, before any fragment',()=>{
  const p=journeyParams(LINK),tail='journey=demo&from=yocv&yoid=yoid-ng-7f3a0123&application=app-001';
  assert.equal(journeyBackHref(p,{application:'app-001'}),RETURN+'?'+tail);
  assert.equal(journeyBackHref({...p,return:'https://z.test/l?x=1'},{application:'app-001'}),'https://z.test/l?x=1&'+tail);
  assert.equal(journeyBackHref({...p,return:'https://z.test/l?'},{application:'app-001'}),'https://z.test/l?'+tail);
  assert.equal(journeyBackHref({...p,return:'https://z.test/l?x=1&'},{application:'app-001'}),'https://z.test/l?x=1&'+tail);
  assert.equal(journeyBackHref({...p,return:'https://z.test/l#top'},{application:'app-001'}),'https://z.test/l?'+tail+'#top');
});

test('the yoid comes from the link, else from the shared data, and is encoded',()=>{
  const p=journeyParams(LINK);
  const {yoid,...noYoid}=p;
  assert.ok(yoid);
  assert.equal(journeyBackHref(noYoid,{application:'app-001',yoid:'yoid-ng-7f3a0123'}),RETURN+'?journey=demo&from=yocv&yoid=yoid-ng-7f3a0123&application=app-001');
  assert.equal(journeyBackHref({...p,yoid:'a&b c'},{application:'app-001'}),RETURN+'?journey=demo&from=yocv&yoid=a%26b%20c&application=app-001');
});

test('no return, or one that is not http(s), gives no link, so the button is hidden',()=>{
  const p=journeyParams(LINK);
  const {return:_,...noReturn}=p;
  assert.equal(journeyBackHref(noReturn,{application:'app-001'}),'');
  assert.equal(journeyBackHref({...p,return:'javascript:alert(1)'},{application:'app-001'}),'');
  assert.equal(journeyBackHref(null,{application:'app-001'}),'');
});

test('the YoID thread for Phase 4: three recorded, the Job Application in progress until Apply, then recorded',()=>{
  const names=JOURNEY.connected.thread;
  assert.deepEqual(names,['Saved Opportunity','Learning Plan','Skill Credential','Job Application']);
  assert.deepEqual(journeyThread(names,4,false).map(s=>s.state),['recorded','recorded','recorded','in-progress']);
  assert.deepEqual(journeyThread(names,4,true).map(s=>s.state),['recorded','recorded','recorded','recorded']);
  assert.deepEqual(journeyThread(names,2,false).map(s=>s.state),['recorded','in-progress','next','next'],'the same rule for the other phases');
  assert.deepEqual(journeyThread(names,4,false).map(s=>s.name),names);
});

test('the shared data names the cards exactly as the contract does',()=>{
  const c=JOURNEY.connected;
  assert.equal(c.phase,4);
  assert.deepEqual(c.arriving,{from:'SkillLens',phase:3,name:'Skill Credential',id:'cred-002',title:'Solar PV Installation Basics: practical challenge passed'});
  assert.deepEqual(c.leaving,{to:'Ziqi',phase:1,name:'Job Application',id:'app-001',title:'Application to Solar Installation Assistant (Trainee)'});
  assert.equal(c.arriving.id,JOURNEY.incoming.id);assert.equal(c.leaving.id,JOURNEY.outgoing.id);
});

test('the card and thread copy is the contract wording',()=>{
  const fill=(t,v)=>t.replace(/\{(\w+)\}/g,(m,k)=>v[k]);
  assert.equal(fill(copy.journeyFrom,{app:'SkillLens',n:3}),'From SkillLens · Phase 3');
  assert.equal(fill(copy.journeyBack,{app:'Ziqi',n:1}),'Back to Ziqi · Phase 1');
  assert.equal(copy.journeyBackButton,'Back to the listing');
  assert.equal(copy.journeyRecorded,'✓ Recorded on your YoID (mock-up)');
  assert.equal(fill(copy.threadLabel,{yoid:'yoid-ng-7f3a0123'}),'YoID · yoid-ng-7f3a0123 · mock-up');
  assert.deepEqual([copy.threadRecorded,copy.threadInProgress,copy.threadNext],['recorded','in progress','next']);
});

test('the back link opens in the same tab and the cards use the Yoma colours',()=>{
  const app=read('app.js'),css=read('styles.css');
  assert.ok(app.includes('C.journeyBackHref(')&&app.includes('copy.journeyBackButton'),'Step 4 builds the link with the tested builder');
  const anchor=/<a class="journey-button"[^>]*>/.exec(app);
  assert.ok(anchor,'the button is a link');
  assert.ok(!/target=/.test(anchor[0]),'same tab: no target');
  for(const colour of ['#41204b','#387f6a','#4cade9'])assert.ok(css.toLowerCase().includes(colour),colour);
  assert.ok(/\.journey-card\{[^}]*border-radius:12px/.test(css),'12 px radius');
});

test('journeyParams also reads back the object the shell kept, and checks it again',()=>{
  const p=journeyParams(LINK);
  assert.deepEqual(journeyParams({...p}),p);
  assert.equal(journeyParams({from:'skilllens'}),null,'no journey=demo, no journey');
  assert.deepEqual(journeyParams({journey:'demo',from:{x:1},yoid:'yoid-ng-7f3a0123'}),{journey:'demo',yoid:'yoid-ng-7f3a0123'},'only strings');
});

test('the journey\'s job picks its target role, Solar installation assistant, from the listing param',()=>{
  const roles=Object.keys(require('../data/role-skills.json')).map(name=>({name}));
  assert.equal(JOURNEY.listing.role,'Solar installation assistant','the role opp-job-001 maps to');
  assert.ok(roles.some(r=>r.name===JOURNEY.listing.role),'the role is on the menu');
  assert.equal(journeyRole(journeyParams(LINK),JOURNEY,roles),'Solar installation assistant');
  assert.equal(journeyRole(null,JOURNEY,roles),'','no journey, no role');
  assert.equal(journeyRole(journeyParams('?journey=demo&listing=opp-job-999'),JOURNEY,roles),'','another listing, no role');
  assert.equal(journeyRole(journeyParams('?journey=demo&from=skilllens'),JOURNEY,roles),'','no listing param, no role');
  assert.equal(journeyRole(journeyParams(LINK),JOURNEY,[{name:'Market seller'}]),'','a role not on the menu is not picked');
});
