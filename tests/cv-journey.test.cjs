'use strict';
// The close of the journey in the page (spec docs/superpowers/specs/2026-11-25-yocv-journey-close-design.md):
// withdrawing a check in the page state, the apply step and the mocked Yo-ID list.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildCv,cvFingerprint,newCvState,yoidItems,withdrawnCheck,canApply,applied}=require('../core.js');
const {sampleState}=require('./helpers/cv-state.cjs');
const {qrSvg}=require('../server/qr.js');
const copy=require('../cv-copy.js').en;
const JOURNEY=require('../data/journey.json'),LISTING=JOURNEY.listing;
const ID='0123456789abcdef',URL_='https://yocard.example/cv-check/'+ID;
const day=iso=>iso.slice(0,10);
const made=(state,id=ID)=>{
  const v={checkId:id,code:id.slice(0,4).toUpperCase()+'-'+id.slice(4,8).toUpperCase(),url:'https://yocard.example/cv-check/'+id,qrSvg:qrSvg(URL_),
    madeAt:'2026-11-25T10:00:00.000Z',expiresAt:'2027-02-23T10:00:00.000Z',withdrawSecret:'f'.repeat(32),fp:cvFingerprint(buildCv(state,copy))};
  state.verify=v;state.checks=[...(state.checks||[]),{...v}];return state;
};

test('a fresh state has no checks and no application',()=>{
  const s=newCvState();
  assert.deepEqual(s.checks,[]); assert.equal(s.application,null);
  assert.deepEqual(yoidItems(s,copy,day),[]);
});

test('the Yo-ID list names each check made on this page, open until its end date',()=>{
  const s=made(sampleState());
  const items=yoidItems(s,copy,day);
  assert.equal(items.length,1);
  assert.equal(items[0].kind,'check'); assert.equal(items[0].checkId,ID); assert.equal(items[0].live,true);
  assert.equal(items[0].text,copy.yoidCheck.replace('{code}','0123-4567').replace('{made}','2026-11-25').replace('{until}','2027-02-23'));
});

test('withdrawing the check on the paper takes the QR off the CV and marks it withdrawn in the list',()=>{
  const s=withdrawnCheck(made(sampleState()),ID,'2026-11-26T09:00:00.000Z');
  assert.equal(s.verify,null); assert.equal(buildCv(s,copy).verify,null);
  const [item]=yoidItems(s,copy,day);
  assert.equal(item.live,false);
  assert.equal(item.text,copy.yoidCheckWithdrawn.replace('{code}','0123-4567').replace('{made}','2026-11-25').replace('{date}','2026-11-26'));
});

test('withdrawing an older check leaves the current QR on the paper',()=>{
  let s=made(sampleState(),'aaaaaaaaaaaaaaaa');
  s=made(s,ID);
  s=withdrawnCheck(s,'aaaaaaaaaaaaaaaa','2026-11-26T09:00:00.000Z');
  assert.equal(s.verify.checkId,ID); assert.ok(buildCv(s,copy).verify);
  assert.deepEqual(yoidItems(s,copy,day).map(i=>i.live),[false,true]);
});

test('applying needs a QR for this CV, and is recorded once with the check it sent',()=>{
  const s=sampleState();
  assert.equal(canApply(s,copy),false,'no QR yet');
  made(s);
  assert.equal(canApply(s,copy),true);
  const a=applied(s,JOURNEY,'2026-11-25T11:00:00.000Z');
  assert.deepEqual(a.application,{id:'app-001',name:'Job Application',listingId:'opp-job-001',title:LISTING.title,organisation:LISTING.organisation,sentAt:'2026-11-25T11:00:00.000Z',code:'0123-4567'});
  assert.equal(canApply(a,copy),false,'once only');
  const items=yoidItems(a,copy,day);
  assert.equal(items[1].kind,'application');
  assert.equal(items[1].text,copy.yoidApplication.replace('{name}','Job Application').replace('{title}',LISTING.title).replace('{organisation}',LISTING.organisation).replace('{date}','2026-11-25'));
  s.contact.name+=' K';
  assert.equal(canApply(s,copy),false,'a stale QR is not enough');
});

test('the withdraw secret never reaches the CV, the text file or the evidence record',()=>{
  const {buildCvText,buildCvRecord,renderCvHtml}=require('../core.js');
  const s=made(sampleState()),cv=buildCv(s,copy);
  for(const out of [JSON.stringify(cv),renderCvHtml(cv,copy),buildCvText(cv,copy),JSON.stringify(buildCvRecord(s,copy))])
    assert.ok(!out.includes('f'.repeat(32)));
});

test('the Yo-ID note and the mock-up line say nothing is written to Yoma or sent',()=>{
  assert.match(copy.yoidNote,/not written to Yoma/);
  assert.match(copy.applySent,/^Mock-up: nothing was sent\./);
});

test('a live check gets a withdraw button in the list unless its QR is on the paper, a stale one included',()=>{
  const s=made(sampleState());
  assert.deepEqual(yoidItems(s,copy,day).map(i=>i.button),[false],'its button sits under the QR');
  s.contact.name+=' K';
  assert.equal(buildCv(s,copy).verify,null,'the CV changed');
  assert.deepEqual(yoidItems(s,copy,day).map(i=>i.button),[true],'still live on the server, so withdrawable from the list');
  const w=withdrawnCheck(s,ID,'2026-11-26T09:00:00.000Z');
  assert.deepEqual(yoidItems(w,copy,day).map(i=>i.button),[false],'nothing left to withdraw');
});

test('the handoff from SkillLens is named the same way as on the slides',()=>{
  const {handoffOf}=require('../core.js');
  const s=sampleState();
  assert.equal(handoffOf({walletId:'cred-002'},JOURNEY,copy),'Skill Credential, from SkillLens');
  assert.equal(handoffOf({walletId:'cred-001'},JOURNEY,copy),'');
  assert.equal(handoffOf({walletId:'cred-002'},null,copy),'','no journey, no tag');
  assert.ok(s);
});
