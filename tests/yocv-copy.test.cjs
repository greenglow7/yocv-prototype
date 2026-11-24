const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {COPY,t}=require('../server/cv/copy.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

const SPEC=read('docs/superpowers/specs/2026-11-19-yocv-credential-cv-design.md');
const section=n=>SPEC.split('\n## '+n+'.')[1].split('\n## ')[0];
const strings=v=>typeof v==='string'?[v]:Array.isArray(v)?v.flatMap(strings):v&&typeof v==='object'?Object.values(v).flatMap(strings):[];
const values=strings(COPY.en).map(v=>v.replace(/\{[^}]+\}/g,'§'));
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
test('the Yo-ID shell copy exists and matches the spec wording',()=>{
  const c=COPY.en;
  assert.deepEqual(c.tabs.map(t=>t.label),['Overview','Wallet','Passport','Opportunities','Skills','CV']);
  assert.deepEqual(c.tabs.map(t=>t.route),['#/','#/wallet','#/passport','#/opportunities','#/skills','#/cv']);
  assert.deepEqual(c.tabs.map(t=>t.emoji),['💳','💸','🌐','🏆','⚡','📄']);
  assert.equal(c.tabs[2].blurb,'Verified credentials for every opportunity you complete.');
  assert.equal(c.greetingMorning,'Good morning, {first}');assert.equal(c.greetingAfternoon,'Good afternoon, {first}');assert.equal(c.greetingEvening,'Good evening, {first}');
  assert.equal(c.greetingNoName,'Good morning');
  assert.equal(c.cvTileNote,'A CV built from your Yo-ID.');assert.equal(c.cvTileDraft,'Draft at step {n} of 4 · {k} lines accepted');assert.equal(c.cvTileReady,'Ready to print or download');
  assert.equal(c.walletSetup,'Wallet being set up');
  assert.equal(c.walletSetupBody,'Your wallet is still being set up. It usually takes less than 24 hours. Any ZLTO you earn in the meantime is safe and will show here once it is ready.');
  assert.equal(c.passportEmpty,'No credentials yet');assert.equal(c.passportEmptyBody,'Complete an opportunity to get a verified credential: proof of what you did.');
  assert.equal(c.oppsEmpty,'No opportunities yet');assert.equal(c.oppsEmptyBody,'Save one for later or complete one, and it shows up here.');
  assert.equal(c.skillsEmpty,'No skills yet');assert.equal(c.skillsEmptyBody,'Each opportunity you complete adds the skills it taught you.');
  assert.equal(c.signedOutTitle,'Welcome back!');assert.equal(c.signedOutBody,'This content is just a click away. Please log in to continue.');assert.equal(c.logIn,'Log in');assert.equal(c.signOut,'Sign out');
  assert.equal(c.switchAccount,'Switch account');assert.equal(c.switchTitle,'Switch account?');assert.equal(c.switchCopy,'Your CV draft will be cleared.');
  assert.equal(c.footerFictional,'The people shown are fictional sample accounts.');assert.equal(c.footerPrototype,'Independent student prototype. Not operated by Yoma or UNICEF.');
  assert.equal(c.whatIsYoid,'What is Yo-ID?');
  for(const k of ['openWallet','openPassport','openOpportunities','openSkills','openCv','continueCv','breadcrumbRoot','passportIntro','skillsIntro','oppsIntro','walletHow','walletHowBullets','statusIssued','viewCredential','viewOpportunity','issuedByPartner','selfAttested','skillIssuedBy','completedBadge','aboutPrototype','sourceLink','resetAction','menuHome','menuAbout','menuOpportunities','menuMarketplace','menuYoid','menuYocard','openMenu','closeMenu','languageOnly','drawerAccount'])assert.ok(k in c,k);
  assert.equal(c.breadcrumbRoot,'Yo-ID');assert.equal(c.statusIssued,'Issued');assert.equal(c.resetAction,'Reset');
  assert.ok(!/verified by Yoma/i.test(JSON.stringify(c)));
});
