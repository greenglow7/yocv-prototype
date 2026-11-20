const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {combineSkills,vouchSources,LEVELS}=require('../server/cv/skills.js');
const {readCvRecord}=require('../server/cv/record.js');
const {copyFor}=require('../server/cv/copy.js');
const {createAccountSource}=require('../server/card/account.js');
const {burstHeld,cardCreatedMs}=require('../server/card/flags.js');
const {loadConfig}=require('../server/config.js');
const chipSkills=require('../data/chip-skills.json');
const {NOW,PUBLIC_URL,bootVouch,fakeYoma}=require('./helpers/vouch-boot.cjs');
const {seedDemo}=require('../scripts/seed-demo.js');
const copy=copyFor();
const now=()=>NOW;
const config={...loadConfig({env:{},cwd:fs.mkdtempSync(path.join(os.tmpdir(),'yocv-skills-'))}),yomaAccessToken:''};
const ROLE_SKILLS=require('../data/role-skills.json');
const menuOf=role=>ROLE_SKILLS[role].skillNames.map(name=>({id:'fake-'+name.toLowerCase().replace(/\W+/g,'-'),name,infoURL:'https://example.org/skill/'+encodeURIComponent(name)}));
const RETAIL_MENU=menuOf('Retail assistant'),HAIR_MENU=menuOf('Hairdresser');
const v=id=>({name:'Hairstyling',kind:'customer',ref:id,label:copy.labelCustomer});
const s3=i=>({entryIndex:i,name:'Hairstyling',yomaSkill:null,sourceQuote:'braid hair at home'});
let record;
before(async()=>{record=await readCvRecord({accountSource:createAccountSource({config,yoma:fakeYoma(),now}),selector:{persona:'thandi'}});});
const include={completions:['c1','c2'],credentials:['w1','w2'],selfAttested:[]};
test('rule 1 and 2: every skill has a source; a Yoma skill off the role menu still shows; interview and hand-added skills must be on the menu',()=>{
  const {skills,rejected}=combineSkills({record,include,vouches:[],interview:[{entryIndex:0,name:'Teamwork',yomaSkill:null,sourceQuote:'q'}],handAdded:[{name:'Cash Handling',yomaSkill:null}],menu:RETAIL_MENU,copy});
  assert.deepEqual(skills.map(s=>[s.name,s.level,s.label]),[['Cosmetics','S1','Confirmed from Yoma'],['Customer Service','S1','Confirmed from Yoma'],['Teamwork','S3','From your own account'],['Cash Handling','S4','Self-stated']]);
  assert.deepEqual(rejected,[]);
  assert.deepEqual(combineSkills({record,include,vouches:[],interview:[],handAdded:[{name:'Plumbing',yomaSkill:null}],menu:RETAIL_MENU,copy}).rejected,[{name:'Plumbing',reason:'skill_not_in_menu'}]);
});
test('rule 2: a ticked self-attested skill off the role menu still shows',async()=>{
  const amara=await readCvRecord({accountSource:createAccountSource({config,yoma:fakeYoma(),now}),selector:{persona:'amara'}});
  const r=combineSkills({record:amara,include:{completions:[],credentials:[],selfAttested:['a1']},vouches:[],interview:[],handAdded:[],menu:RETAIL_MENU,copy});
  assert.deepEqual(r.skills.map(s=>[s.name,s.level,s.label]),[['Pattern Making','S4','Self-stated']]);
  assert.ok(!r.rejected.some(x=>x.reason==='skill_not_in_menu'));
});
test('rule 3: no double counting',()=>{
  const cs=combineSkills({record,include,vouches:[v('V1'),v('V1')],interview:[s3(0),s3(0)],handAdded:[],menu:HAIR_MENU,copy}).skills;
  const service=cs.find(s=>s.name==='Customer Service');
  assert.equal(service.sources.length,1,'credential w2 and completion c2 are one source');
  assert.equal(cs.find(s=>s.name==='Hairstyling').sources.filter(x=>x.kind==='customer').length,1);
});
test('rule 4: three S3 sources stay S3',()=>{
  const {skills}=combineSkills({record,include,vouches:[],interview:[s3(0),s3(1),s3(2)],handAdded:[],menu:HAIR_MENU,copy});
  const hair=skills.find(s=>s.name==='Hairstyling');
  assert.equal(hair.level,'S3'); assert.equal(hair.label,'From your own account');
  assert.deepEqual(hair.sources.map(x=>[x.kind,x.ref]),[['entry',0],['entry',1],['entry',2]]);
});
test('the strongest label wins and every source is listed',()=>{
  const {skills}=combineSkills({record,include,vouches:[v('V1')],interview:[s3(0)],handAdded:[],menu:HAIR_MENU,copy});
  const hair=skills.find(s=>s.name==='Hairstyling');
  assert.equal(hair.level,'S2'); assert.equal(hair.label,'Vouched by a customer, confirmed by them, not by Yoma');
  assert.deepEqual(hair.sources.map(x=>x.kind),['customer','entry']);
  assert.deepEqual(LEVELS,['S1','S2','S3','S4']);
});
test('vouchSources reads the newest live card of the same account, live vouches only',async()=>{
  const {dir,store,vouch}=await bootVouch({env:{sim:true}});
  const r=await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const got=vouchSources({cardStore:store,vouchStore:vouch.vouchStore,owner:{source:'sample',personaId:'thandi'},chipSkills,copy,nowMs:NOW});
  assert.equal(got.cardId,r.cards.thandi.cardId);
  assert.deepEqual([...new Set(got.sources.map(s=>s.name))],['Hairstyling']);
  assert.equal(got.sources.length,3);
  assert.ok(got.sources.every(s=>s.label==='Vouched by a customer, confirmed by them, not by Yoma'));
});
test('Review Focus 4: a hidden or withdrawn vouch or a withdrawn card stops counting at once',async()=>{
  const {dir,store,vouch}=await bootVouch({env:{sim:true}});
  const {cards}=await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const cardId=cards.thandi.cardId,vs=vouch.vouchStore;
  const read=()=>vouchSources({cardStore:store,vouchStore:vs,owner:{source:'sample',personaId:'thandi'},chipSkills,copy,nowMs:NOW});
  const first=vs.listForCard(cardId).find(f=>f.record.kind==='customer');
  assert.equal(vs.hide(first.record.vouchId,cardId),true);
  const hidden=read();
  assert.equal(hidden.sources.length,2); assert.ok(!hidden.sources.some(x=>x.ref===first.record.vouchId));
  const second=vs.listForCard(cardId).find(f=>f.record.kind==='customer'&&f.record.vouchId!==first.record.vouchId);
  vs.withdrawAs(second.record.vouchId,'now');
  assert.equal(read().sources.length,1); assert.ok(!read().sources.some(x=>x.ref===second.record.vouchId));
  // seedDemo returns {cardId, cardToken, myUrl} per card and no ownerSecret, so the test withdraws through the store.
  store.update(cardId,e=>({...e,withdrawnAt:new Date(NOW).toISOString()}));
  assert.deepEqual(read(),{cardId:null,sources:[]});
});
test('a burst-held customer line gives no source, as on the card page',async()=>{
  const {dir,store,vouch}=await bootVouch({env:{sim:true}});
  const {cards}=await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const cardId=cards.thandi.cardId,vs=vouch.vouchStore,entry=store.get(cardId);
  // Three more customer lines in the card's first 24 hours make six; the sixth is past FIRST_DAY_MAX (5) and held.
  const base=vs.listForCard(cardId).find(f=>f.record.kind==='customer').record;
  const at=k=>new Date(cardCreatedMs(entry)+60000*(k+1)).toISOString();
  for(const k of [1,2,3])vs.create({record:{...base,vouchId:null,confirmedAt:at(100+k)}});
  const held=burstHeld(vs.listForCard(cardId),cardCreatedMs(entry),NOW);
  assert.equal(held.size,1);
  const got=vouchSources({cardStore:store,vouchStore:vs,owner:{source:'sample',personaId:'thandi'},chipSkills,copy,nowMs:NOW});
  assert.equal(got.sources.length,5); assert.ok(!got.sources.some(x=>held.has(x.ref)));
});
test('a worker vouch carries the worker label',async()=>{
  const {dir,store,vouch}=await bootVouch({env:{sim:true}});
  await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const got=vouchSources({cardStore:store,vouchStore:vouch.vouchStore,owner:{source:'sample',personaId:'sipho'},chipSkills,copy,nowMs:NOW});
  const paving=got.sources.find(x=>x.name==='Paving'); // Bongani's worker vouch on Sipho's card, chip Paving
  assert.equal(paving.kind,'worker');
  assert.equal(paving.label,'Vouched by another worker, confirmed by them, not by Yoma');
});
test('a referral contributes the skills of the completion it rests on, with the referral label',async()=>{
  const {dir,store,vouch}=await bootVouch({env:{sim:true}});
  await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const got=vouchSources({cardStore:store,vouchStore:vouch.vouchStore,owner:{source:'sample',personaId:'amara'},chipSkills,copy,nowMs:NOW});
  assert.deepEqual(got.sources.map(s=>s.name),['Active Listening','Conflict Resolution','Empathy']);
  assert.ok(got.sources.every(s=>s.kind==='referral'&&s.label==='Referred by Sample Skills Trust, confirmed by them, not by Yoma'));
  assert.equal(vouch.vouchStore.get(got.sources[0].ref).record.kind,'organisation');
});
test('an unmapped chip and a card without a trade',()=>{
  const stores=(tradeId,work,{source='sample',personaId='thandi',userId=null}={})=>{
    const entry={cardId:'CARD',withdrawnAt:null,createdAt:'2026-11-01T00:00:00Z',record:{cardId:'CARD',accountSource:source,personaId,user:{id:userId},tradeId,publishedAt:'2026-11-01T00:00:00Z',disclosed:{completions:[]}}};
    const file={record:{vouchId:'V1',cardId:'CARD',kind:'customer',confirmedAt:'2026-11-02T00:00:00Z',fields:{work}},private:{}};
    return {cardStore:{list:()=>['CARD'],get:()=>entry},vouchStore:{listForCard:()=>[file],isLive:()=>true}};
  };
  const read=(tradeId,work,owner={source:'sample',personaId:'thandi'},card)=>vouchSources({...stores(tradeId,work,card),owner,chipSkills,copy,nowMs:NOW});
  assert.deepEqual(read('hair','Gutters'),{cardId:'CARD',sources:[]},'free text from the SMS fallback maps to nothing');
  assert.deepEqual(read('hair','Braids').sources.map(s=>s.name),['Hairstyling']);
  assert.deepEqual(read(null,'Work done'),{cardId:'CARD',sources:[]},'chipSkills.default maps to none');
  assert.deepEqual(read(null,'Braids'),{cardId:'CARD',sources:[]},'a card without a trade never reads the hair map');
  assert.equal(read('hair','Braids',{source:'token',userId:'u-1'},{source:'token',personaId:null,userId:'u-1'}).sources.length,1,'token mode matches the user id');
  assert.equal(read('hair','Braids',{source:'token',userId:'u-2'},{source:'token',personaId:null,userId:'u-1'}).cardId,null);
});
test('no card or vouch store gives no vouch sources',()=>{
  assert.deepEqual(vouchSources({cardStore:null,vouchStore:null,owner:{source:'sample',personaId:'thandi'},chipSkills,copy,nowMs:NOW}),{cardId:null,sources:[]});
});
test('chip-skills.json covers every chip in vouch-chips.json and nothing else',()=>{
  const chips=require('../data/vouch-chips.json');
  assert.deepEqual(Object.keys(chipSkills),Object.keys(chips));
  for(const [trade,names] of Object.entries(chips)){
    assert.deepEqual(Object.keys(chipSkills[trade]).sort(),[...names].sort(),trade);
    for(const value of Object.values(chipSkills[trade]))assert.ok(Array.isArray(value),trade);
  }
});
