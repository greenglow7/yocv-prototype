const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {ProviderError}=require('../server/providers/errors.js');
const {NOW,PUBLIC_URL,bootVouch,raw,ok,post,get,skillYoma}=require('./helpers/vouch-boot.cjs');
const {seedDemo}=require('../scripts/seed-demo.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {role,entry}=JSON.parse(read('tests/fixtures/cv-thandi.json'));
const include={completions:['c1','c2'],credentials:['w1','w2'],selfAttested:[]};
// Boots with the skill fake and the simulators, seeds the demo, opens Thandi's record.
async function thandiSession(opts={}){
  const booted=await bootVouch({yoma:skillYoma(),env:{sim:true},...opts});
  await seedDemo({dir:booted.dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const {sessionId}=await ok(await raw(booted.base,'/api/cv/record',{persona:'thandi'}));
  return {...booted,sessionId};
}
test('config carries the copy, the rules, fifteen roles and the six personas',async()=>{
  const {base}=await bootVouch({yoma:skillYoma()});
  const c=await get(base,'/api/cv/config');
  assert.equal(c.copy.stepRecord,'Your Yoma record'); assert.equal(c.rules.inflation.length,8);
  assert.equal(c.roles.length,15); assert.equal(c.accounts.personas.length,6);
});
test('record then review gives Thandi\'s skills with their levels and a checked bullet',async()=>{
  const {base,dir}=await bootVouch({yoma:skillYoma(),env:{sim:true}});
  await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const {sessionId,record}=await ok(await raw(base,'/api/cv/record',{persona:'thandi'}));
  assert.match(sessionId,/^[0-9a-f]{24}$/); assert.equal(record.credentials.length,3);
  const r=await ok(await raw(base,'/api/cv/review',{sessionId,role,include,entries:[entry]}));
  const by=n=>r.skills.find(s=>s.name===n);
  assert.equal(by('Customer Service').label,'Confirmed from Yoma');
  assert.equal(by('Cosmetics').label,'Confirmed from Yoma');
  assert.equal(by('Hairstyling').label,'Vouched by a customer, confirmed by them, not by Yoma');
  assert.equal(r.entries[0].proposals[0].origin,'template'); assert.equal(r.generation.mode,'sample');
});
test('Review Focus 3: months in the wrong order or in the future are refused with the field named',async()=>{
  const {base,sessionId}=await thandiSession();
  for(const months of [{start:'2026-04',end:'2025-03'},{start:'2025-03',end:'2027-01'},{start:'',end:'2025-03'}]){
    const res=await raw(base,'/api/cv/review',{sessionId,role,include,entries:[{...entry,months}]});
    assert.equal(res.status,400); assert.deepEqual((await res.json()).error.fields,['entries.0.months']);
  }
});
test('the other limits: four entries, a short answer, a number without a unit, a completion not ticked',async()=>{
  const {base,sessionId}=await thandiSession();
  const fields=async entries=>{const res=await raw(base,'/api/cv/review',{sessionId,role,include,entries});assert.equal(res.status,400);return (await res.json()).error.fields;};
  assert.deepEqual(await fields([entry,entry,entry,entry]),['entries']);
  assert.deepEqual(await fields([{...entry,what:'I braid hair a lot.'}]),['entries.0.what']); // 19 code points
  assert.deepEqual(await fields([{...entry,number:{value:40,hedge:'about'}}]),['entries.0.number.unit']);
  assert.deepEqual(await fields([{...entry,confirm:{kind:'completion',completionId:'c3'}}]),['entries.0.confirm.completionId']); // c3 not ticked
  assert.equal((await raw(base,'/api/cv/review',{sessionId,role,include,entries:[(({place,...e})=>e)(entry)]})).status,200);
});
test('Review Focus 5 (online half): an edit is checked against her own answers',async()=>{
  const {base,sessionId}=await thandiSession();
  await ok(await raw(base,'/api/cv/review',{sessionId,role,include,entries:[entry]}));
  const check=text=>post(base,'/api/cv/check',{sessionId,entryIndex:0,text,kind:'bullet'});
  assert.deepEqual(await check('Braided hair at home for about 40 customers a week since March 2025.'),{ok:true,checks:['numbers','names','overstatement','opening','length','quote']});
  for(const [text,reason] of [['Braided hair at home for about 45 customers a week since 2025.','invented_number'],['Braided hair at home for 40 customers a week since March 2025.','hedge_dropped'],['Braided hair at home as an expert for about 40 customers a week.','overstated'],['Braided hair at Sunrise Salon for about 40 customers a week.','invented_name']]){
    const r=await check(text); assert.equal(r.ok,false); assert.equal(r.reason,reason); assert.ok(r.message);
  }
});
test('skills recompute without a model call and see a newly hidden vouch',async()=>{
  const calls=[];
  const fakeLive={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(input){calls.push(input);return {bullets:[],skills:[]};}};
  const {base,sessionId,vouch,store}=await thandiSession({provider:fakeLive});
  await ok(await raw(base,'/api/cv/review',{sessionId,role,include,entries:[entry]}));
  const cardId=store.list().map(id=>store.get(id)).find(e=>e.record.personaId==='thandi').cardId; // list() returns ids
  const first=vouch.vouchStore.listForCard(cardId).find(f=>f.record.kind==='customer');
  vouch.vouchStore.hide(first.record.vouchId,cardId);
  const before=calls.length;
  const r=await ok(await raw(base,'/api/cv/skills',{sessionId,include,handAdded:[]}));
  assert.equal(r.skills.find(k=>k.name==='Hairstyling').sources.filter(x=>x.kind==='customer').length,2);
  assert.equal(calls.length,before,'no model call');
});
test('a Yoma completion link never changes a skill\'s level (spec 5 Q6)',async()=>{
  const {base,sessionId}=await thandiSession();
  const levels=async confirm=>(await ok(await raw(base,'/api/cv/review',{sessionId,role,include,entries:[{...entry,confirm}]}))).skills.map(k=>[k.name,k.level,k.label]);
  assert.deepEqual(await levels({kind:'completion',completionId:'c1'}),await levels({kind:'none'}));
});
test('a fifth concurrent review gets 503 busy while four are in flight; a failing call frees its slot',async()=>{
  // Ported from the tests/server.test.cjs cases for POST /api/generate that Task 16 deletes.
  let release; const gate=new Promise(r=>{release=r;}); const calls=[];
  const gated={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(input){calls.push(input);await gate;return {bullets:[],skills:[]};}};
  const {base,sessionId}=await thandiSession({provider:gated});
  const body={sessionId,role,include,entries:[entry]};
  const first=[1,2,3,4].map(()=>raw(base,'/api/cv/review',body));
  while(calls.length<4)await new Promise(r=>setTimeout(r,5));
  const fifth=await raw(base,'/api/cv/review',body);
  assert.equal(fifth.status,503); assert.equal((await fifth.json()).error.code,'busy');
  release(); assert.deepEqual((await Promise.all(first)).map(r=>r.status),[200,200,200,200]);
  const failing={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(){throw new ProviderError('provider_error',undefined,{retryable:true});}};
  const one=await thandiSession({provider:failing,maxInFlight:1});
  const again=()=>raw(one.base,'/api/cv/review',{sessionId:one.sessionId,role,include,entries:[entry]});
  assert.equal((await again()).status,502); assert.equal((await again()).status,502);
});
test('a session slides 30 minutes from its last use, then answers 410 session_expired',async()=>{
  const {base,sessionId,clock}=await thandiSession();
  const review=()=>raw(base,'/api/cv/review',{sessionId,role,include,entries:[entry]});
  await ok(await review());
  clock.t+=20*60*1000;
  assert.equal((await post(base,'/api/cv/check',{sessionId,entryIndex:0,text:'Braided hair at home for about 40 customers a week since March 2025.',kind:'bullet'})).ok,true);
  clock.t+=20*60*1000;
  await ok(await review());
  clock.t+=30*60*1000+1;
  const res=await review();
  assert.equal(res.status,410); assert.equal((await res.json()).error.code,'session_expired');
});
test('a profile is checked against the entry profileLine picks, the months and the accepted skill names',async()=>{
  const {base,sessionId}=await thandiSession();
  await ok(await raw(base,'/api/cv/review',{sessionId,role,include,entries:[entry]}));
  // At the boot clock (2026-11-16) the entry, March 2025 to now, has 21 months.
  const text='Hairdresser with customer service recorded on Yoma and 21 months of braiding at home.';
  const check=months=>post(base,'/api/cv/check',{sessionId,kind:'profile',text,months,skillNames:['Customer Service']});
  assert.equal((await check(21)).ok,true);
  assert.equal((await check(20)).reason,'invented_number');
});
test('the person\'s number reaches the browser only, never a session or a provider call',async()=>{
  const calls=[];
  const fakeLive={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(input){calls.push(input);return {bullets:[],skills:[]};}};
  const {base,server}=await bootVouch({yoma:skillYoma(),provider:fakeLive});
  const {sessionId,record}=await ok(await raw(base,'/api/cv/record',{persona:'thandi'}));
  assert.equal(record.user.phoneNumber,'+27735550147'); // the prefill, Deviations 9
  await ok(await raw(base,'/api/cv/review',{sessionId,role,include,entries:[entry]}));
  assert.ok(!JSON.stringify(calls).includes('735550147'));
  assert.ok(!JSON.stringify([...server.cv.sessions.values()]).includes('735550147'));
});
test('a place the person typed never reaches the model, even as the first word of an answer',async()=>{
  const calls=[];
  const fakeLive={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(input){calls.push(input);return {bullets:[],skills:[]};}};
  const {base,sessionId}=await thandiSession({provider:fakeLive});
  const e={...entry,place:'Mamelodi',what:'Mamelodi is where I sell braids at home for women in my street.'};
  await ok(await raw(base,'/api/cv/review',{sessionId,role,include,entries:[e],knownWords:['Mamelodi']}));
  assert.ok(calls.length>0&&!JSON.stringify(calls).includes('Mamelodi'));
});
test('mode sample uses the local provider when a live one is configured; a provider error is 502',async()=>{
  const calls=[];
  const fakeLive={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(input){calls.push(input);return {bullets:[],skills:[]};}};
  const {base,sessionId}=await thandiSession({provider:fakeLive});
  const review=(extra={})=>raw(base,'/api/cv/review',{sessionId,role,include,entries:[entry],...extra});
  assert.equal((await ok(await review({mode:'sample'}))).generation.mode,'sample'); assert.equal(calls.length,0);
  const live=await ok(await review());
  assert.equal(live.generation.mode,'live'); assert.equal(live.generation.model,'gpt-4.1-mini'); assert.equal(calls.length,1);
  const local=await thandiSession();
  const notConfigured=await raw(local.base,'/api/cv/review',{sessionId:local.sessionId,role,include,entries:[entry],mode:'live'});
  assert.equal(notConfigured.status,502); assert.equal((await notConfigured.json()).error.code,'provider_not_configured');
  const failing={...fakeLive,async cvBullets(){throw new ProviderError('provider_timeout');}};
  const one=await thandiSession({provider:failing});
  const res=await raw(one.base,'/api/cv/review',{sessionId:one.sessionId,role,include,entries:[entry]});
  assert.equal(res.status,502); assert.equal((await res.json()).error.code,'provider_timeout');
});
