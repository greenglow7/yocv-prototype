const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {COPY,t}=require('../server/cv/copy.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const SPEC=read('docs/superpowers/specs/2026-11-19-yocv-credential-cv-design.md');
const section=n=>SPEC.split('\n## '+n+'.')[1].split('\n## ')[0];
const values=Object.values(COPY.en).flat().map(v=>v.replace(/\{[^}]+\}/g,'§'));
test('every backticked string in spec section 12 is in the catalogue, verbatim',()=>{
  const wanted=[...section(12).matchAll(/`([^`]+)`/g)].map(m=>m[1]).filter(s=>s!=='data/yocv-copy.json').map(s=>s.replace(/<[^>]+>/g,'§'));
  for(const s of wanted)assert.ok(values.includes(s),'missing: '+s);
});
test('the section 12 keys hold their spec values',()=>{
  const want={stepRecord:'Your Yoma record',stepWork:'Your work',stepReview:'Review',stepCv:'Your CV',labelYoma:'Confirmed from Yoma',labelCustomer:'Vouched by a customer, confirmed by them, not by Yoma',labelWorker:'Vouched by another worker, confirmed by them, not by Yoma',labelReferral:'Referred by {organisation}, confirmed by them, not by Yoma',labelOwn:'From your own account',labelSelf:'Self-stated',templateWording:'template wording',statedBy:'stated by {first}, not checked',preparedExample:'Prepared example. Not a live call.',draftNotice:'Draft. Nothing is saved until the person confirms it.',accept:'Accept',edit:'Edit',leaveOut:'Leave out',learningHeading:'Learning recorded on Yoma',cvSampleFooter:'Sample account: fictional, for demonstration',notOperated:'Not operated by Yoma or UNICEF.'};
  for(const [k,v] of Object.entries(want))assert.equal(COPY.en[k],v,k);
});
test('the six questions and the section 5 chips are in the catalogue',()=>{
  for(const q of ['What did you do?','For whom, or where?','How often, and for how long?','A number you can stand behind','What was better because of you?','Who could confirm this?'])assert.ok(values.includes(q),q);
  assert.deepEqual(COPY.en.forWhomChips,['customers','a family business','a household','a community group','an employer']);
  assert.deepEqual(COPY.en.frequencyChips,['daily','a few times a week','weekly','now and then']);
  assert.deepEqual(COPY.en.hedgeChips,['exactly','about','at least']);
  assert.deepEqual(COPY.en.confirmChips,['no one','a person I can name','a Yoma completion','a vouch on my YoCard']);
});
test('the mode labels, the record lines and the unit chips are catalogue keys',()=>{
  const want={modeLive:'Live AI · {model}',modeSample:'Sample mode',modeOffline:'Sample mode (offline)',recordNotice:'Not operated by Yoma or UNICEF. Accepting a sentence confirms its wording, not its truth.',learningCredential:'{title}. Credential issued by {issuer}, {month}.',learningCompletion:'{title}. Learning opportunity completed with {organisation}, {month}.',issuerNotStated:'issuer not stated'};
  for(const [k,v] of Object.entries(want))assert.equal(COPY.en[k],v,k);
  assert.equal(t('modeLive',{model:'gpt-4.1-mini'}),'Live AI · gpt-4.1-mini');
  assert.deepEqual(COPY.en.unitChips,['customers a day','customers a week','items','people','trips','rand a week','shillings a week']);
});
test('t fills slots and refuses gaps',()=>{
  assert.equal(t('labelReferral',{organisation:'Sample Skills Trust'}),'Referred by Sample Skills Trust, confirmed by them, not by Yoma');
  assert.equal(t('statedBy',{first:'Thandi'}),'stated by Thandi, not checked');
  assert.throws(()=>t('statedBy',{}));
  assert.throws(()=>t('noSuchKey'));
});
test('the YoCV footer and About dialog say Not operated by Yoma or UNICEF and keep the old lines',()=>{
  const html=read('index.html');
  const foot=html.match(/<footer class="app-footer">[\s\S]*?<\/footer>/)[0],about=html.match(/<dialog id="about-dialog"[\s\S]*?<\/dialog>/)[0];
  for(const part of [foot,about])assert.ok(part.includes('Not operated by Yoma or UNICEF'));
  assert.ok(foot.includes('Independent student prototype')&&about.includes('No UNICEF or Yoma endorsement is implied'));
});
test('no YoCV string says verified by Yoma',()=>assert.ok(!/verified by Yoma/i.test(JSON.stringify(COPY))));
