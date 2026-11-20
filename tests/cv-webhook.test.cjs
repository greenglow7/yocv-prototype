const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const {bootVouch,raw,skillYoma}=require('./helpers/vouch-boot.cjs'); // raw, skillYoma and the cv option: Task 12
const {role,entry}=JSON.parse(read('tests/fixtures/cv-thandi.json'));
const {place,confirm,...hook}=entry;
test('the webhook is absent without YOCV_SERVICE_SECRET',async()=>{
  const {base}=await bootVouch({yoma:skillYoma()});
  assert.equal((await raw(base,'/api/cv/draft',{role,entries:[hook]})).status,404);
});
test('the webhook needs the secret and answers the spec shape with S3 skills only',async()=>{
  const {base}=await bootVouch({yoma:skillYoma(),cv:{serviceSecret:'s3cret'}});
  const send=h=>fetch(base+'/api/cv/draft',{method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify({role,entries:[hook],lang:'en'})});
  assert.equal((await send({})).status,403);
  assert.equal((await send({'x-yocv-service-secret':'wrong'})).status,403);
  const j=await (await send({'x-yocv-service-secret':'s3cret'})).json();
  assert.deepEqual(Object.keys(j),['draft','bullets','skills','rejected','generation','notice']);
  assert.equal(j.draft,true); assert.equal(j.notice,'Draft. Nothing is saved until the person confirms it.');
  assert.equal(j.bullets[0].entryIndex,0); assert.ok(j.skills.every(s=>s.level==='S3'));
  const routes=read('server/cv/routes.js');
  assert.ok(routes.includes('gatewaySecretOk'),'the secret is compared in constant time');
});
test('the webhook refuses bad input and a place field never reaches the provider',async()=>{
  const calls=[];
  const fakeLive={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(input){calls.push(input);return {bullets:[],skills:[{name:'Hairstyling',sourceQuote:'braid hair at home'}]};}};
  const {base}=await bootVouch({yoma:skillYoma(),provider:fakeLive,cv:{serviceSecret:'s3cret'}});
  const send=body=>fetch(base+'/api/cv/draft',{method:'POST',headers:{'content-type':'application/json','x-yocv-service-secret':'s3cret'},body:JSON.stringify(body)});
  const fields=async body=>{const res=await send(body);assert.equal(res.status,400);const e=(await res.json()).error;assert.equal(e.code,'invalid_input');return e.fields;};
  assert.deepEqual(await fields({role:'Astronaut',entries:[hook]}),['role']);
  assert.deepEqual(await fields({role,entries:[{...hook,months:{start:'2026-04',end:'2025-03'}}]}),['entries.0.months']);
  assert.equal(calls.length,0,'a refused body makes no model call');
  const res=await send({role,entries:[{...hook,place},{...hook,title:'Braiding at the market',place}],lang:'en'});
  assert.equal(res.status,200);
  const j=await res.json();
  assert.equal(calls.length,2);
  for(const c of calls){assert.ok(!Object.hasOwn(c.entry,'place'),'no place key'); assert.ok(!JSON.stringify(c).includes(place),'the place never reaches the provider');}
  assert.equal(j.skills.filter(s=>s.name==='Hairstyling').length,1);
  assert.deepEqual(j.skills.find(s=>s.name==='Hairstyling'),{name:'Hairstyling',yomaSkill:{id:'skill-hairstyling',name:'Hairstyling',infoURL:'https://skills.example/hairstyling'},level:'S3'});
  assert.deepEqual(j.generation,{mode:'live',provider:'azure-openai',model:'gpt-4.1-mini'});
});
test('the RapidPro skeleton calls the endpoint, reads the first bullet back and asks 1 or 2',()=>{
  const flow=JSON.parse(read('integration/rapidpro/yocv-draft-flow.json')),text=JSON.stringify(flow);
  assert.equal(flow._note,'Skeleton. Untested against a RapidPro instance.');
  const actions=flow.flows[0].nodes.flatMap(n=>n.actions||[]);
  const hookAction=actions.find(a=>a.type==='call_webhook');
  assert.ok(hookAction.url.endsWith('/api/cv/draft')&&hookAction.method==='POST');
  assert.equal(hookAction.headers['x-yocv-service-secret'],'@globals.yocv_service_secret');
  for(const key of ['role','entries','title','what','forWhom','frequency','months','number','outcome'])assert.ok(hookAction.body.includes('"'+key+'"'),key);
  assert.ok(!/@contact|@urns|@fields\.(name|phone)/.test(hookAction.body),'no contact field goes to the webhook');
  assert.ok(text.includes('@webhook.json.bullets.0.text'));
  assert.ok(flow.flows[0].nodes.some(n=>n.router?.cases?.some(c=>c.arguments?.includes('1'))&&n.router.cases.some(c=>c.arguments?.includes('2'))));
});
