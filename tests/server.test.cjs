const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=require('../core.js');
const {YomaUnavailable}=require('../server/yoma.js');
const {ProviderError}=require('../server/providers/errors.js');
let serverModule={}; try {serverModule=require('../server.js')}catch{}
const {createApp}=serverModule;

const rootDir=path.join(__dirname,'..');
const roleSkills=require('../data/role-skills.json');
const experience='I helped customers find products and packed orders at my aunt’s shop.\nI counted the cash at the end of the day.';
const body={role:'Retail assistant',experience,context:'Family shop',dates:'School holidays, 2025'};
const skillTable={
 'Customer Service':{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/skills/customer-service'},
 'Cash Handling':{id:'cash-1',name:'Cash Handling',infoURL:'https://lightcast.io/skills/cash-handling'}
};
const good={
 experience:[
  {text:'Helped customers find products in a family shop.',sourceQuote:'helped customers find products',reason:'Reworded from your text; check it still fits.'},
  {text:'Packed customer orders.',sourceQuote:"packed orders at my aunt's shop",reason:'Based on your words about packing orders.'},
  {text:'Managed 2 tills every day.',sourceQuote:'counted the cash',reason:'Invented number, should be rejected.'}
 ],
 skills:[{name:'Customer Service',sourceQuote:'I helped customers find products',reason:'You described helping customers.'}]
};
const opportunity=(id,isCompletable=true)=>({id,title:'Course '+id,organizationName:'Org',organizationLogoURL:null,summary:'s',yomaInfoURL:'https://www.yoma.world/opportunities/'+id,commitmentIntervalDescription:'2 hours',difficulty:'Beginner',skills:[skillTable['Customer Service']],zltoReward:10,isCompletable});

function fakeYoma({opportunities={},reachable=true,skills=skillTable,unavailable=false,source='live'}={}){
 const calls={skills:[],searches:[],reachable:0};
 return {
  calls,baseUrl:'https://api.yoma.test/api/v3',
  async skillByName(name){calls.skills.push(name);if(unavailable)throw new YomaUnavailable();return {item:skills[name]?{...skills[name]}:null,source};},
  async searchLearningOpportunities(phrase){
   calls.searches.push(phrase);
   if(unavailable)throw new YomaUnavailable();
   const items=opportunities[phrase]||[];
   return {items:items.map(o=>({...o})),totalCount:items.length,source};
  },
  async reachable(){calls.reachable++;return reachable;}
 };
}
function fakeProvider(output,{name='azure-openai',model='gpt-4.1-mini',gate=null}={}){
 const calls=[];
 return {name,model,calls,async generate(input,opts){calls.push({input,opts});if(gate)await gate;if(output instanceof Error)throw output;return {output:typeof output==='function'?output(input):output};}};
}
const liveConfig={provider:'azure-openai',model:'gpt-4.1-mini',yomaBase:'https://api.yoma.test/api/v3',port:0,host:'127.0.0.1'};
const localConfig={provider:'local',model:null,yomaBase:'https://api.yoma.test/api/v3',port:0,host:'127.0.0.1'};

const servers=[];
async function boot({config=liveConfig,provider=fakeProvider(good),yoma=fakeYoma(),maxInFlight}={}){
 assert.equal(typeof createApp,'function','server.js must export createApp');
 const server=createApp({config,provider,yoma,roleSkills,core,rootDir,maxInFlight});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 servers.push(server);
 const base='http://127.0.0.1:'+server.address().port;
 return {base,server,provider,yoma};
}
test.after(()=>{for(const s of servers){s.closeAllConnections();s.close();}});

async function post(base,payload,init={}){
 return fetch(base+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:typeof payload==='string'?payload:JSON.stringify(payload),...init});
}

test('GET /api/status reports live mode, provider, model and Yoma reachability',async()=>{
 const {base,yoma}=await boot();
 const res=await fetch(base+'/api/status');
 assert.equal(res.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
 assert.match(res.headers.get('content-type'),/application\/json/);
 const json=await res.json();
 assert.equal(json.mode,'live');
 assert.equal(json.provider,'azure-openai');
 assert.equal(json.model,'gpt-4.1-mini');
 assert.equal(json.yoma.reachable,true);
 assert.equal(json.yoma.baseUrl,'https://api.yoma.test/api/v3');
 assert.ok(!Number.isNaN(Date.parse(json.yoma.checkedAt)));
 assert.equal(yoma.calls.reachable,1);
});
test('GET /api/status reports sample mode with the local provider',async()=>{
 const {base}=await boot({config:localConfig,provider:{name:'local',model:null,async generate(){return {output:{experience:[],skills:[]}};}},yoma:fakeYoma({reachable:false})});
 const json=await (await fetch(base+'/api/status')).json();
 assert.deepEqual({mode:json.mode,provider:json.provider,model:json.model,reachable:json.yoma.reachable},{mode:'sample',provider:'local',model:null,reachable:false});
});

test('POST /api/generate returns 400 invalid_input for a short experience with core wording',async()=>{
 const {base,provider}=await boot();
 const res=await post(base,{...body,experience:'Shop work'});
 assert.equal(res.status,400);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const json=await res.json();
 assert.equal(json.error.code,'invalid_input');
 assert.equal(json.error.retryable,false);
 assert.equal(json.error.message,'Tell us one concrete responsibility, such as who you helped and what you did.');
 assert.equal(provider.calls.length,0);
});
test('POST /api/generate rejects an experience over 4000 characters',async()=>{
 const {base}=await boot();
 const res=await post(base,{...body,experience:'I helped customers. '.repeat(250)});
 assert.equal(res.status,400);
 assert.equal((await res.json()).error.message,'Keep your experience under 4,000 characters for this demo.');
});
test('POST /api/generate rejects a role that differs only by case or whitespace (Review Focus 5)',async()=>{
 const {base,provider}=await boot();
 for(const role of ['retail assistant ','Retail Assistant','Retail assistant ',' Retail assistant','Barista']){
  const res=await post(base,{...body,role});
  assert.equal(res.status,400,'role '+JSON.stringify(role));
  assert.equal((await res.json()).error.code,'invalid_input');
 }
 assert.equal(provider.calls.length,0);
});
test('POST /api/generate rejects context over 120 and dates over 100 characters',async()=>{
 const {base}=await boot();
 assert.equal((await post(base,{...body,context:'c'.repeat(121)})).status,400);
 assert.equal((await post(base,{...body,dates:'d'.repeat(101)})).status,400);
 assert.equal((await post(base,{...body,context:'c'.repeat(120),dates:'d'.repeat(100)})).status,200);
});
test('POST /api/generate rejects an unknown mode',async()=>{
 const {base}=await boot();
 const res=await post(base,{...body,mode:'turbo'});
 assert.equal(res.status,400);
 assert.equal((await res.json()).error.code,'invalid_input');
});
test('POST /api/generate returns 400 for a body over 64 KB and for a non-object JSON root (Review Focus 4)',async()=>{
 const {base,provider}=await boot();
 const big=JSON.stringify({...body,padding:'x'.repeat(70*1024)});
 const resBig=await post(base,big);
 assert.equal(resBig.status,400);
 assert.equal((await resBig.json()).error.code,'invalid_input');
 const resArray=await post(base,'[1,2,3]');
 assert.equal(resArray.status,400);
 assert.equal((await resArray.json()).error.code,'invalid_input');
 const resString=await post(base,'"hello"');
 assert.equal(resString.status,400);
 const resNull=await post(base,'null');
 assert.equal(resNull.status,400);
 const resBroken=await post(base,'{"role":');
 assert.equal(resBroken.status,400);
 assert.equal((await resBroken.json()).error.code,'invalid_input');
 assert.equal(provider.calls.length,0);
});

test('POST /api/generate returns 200 with claims and generation metadata',async()=>{
 const {base,provider}=await boot();
 const res=await post(base,body);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const json=await res.json();
 assert.ok(Array.isArray(json.claims));
 assert.deepEqual(json.claims.map(c=>c.kind),['experience','experience','skill']);
 assert.equal(json.claims[0].text,'Helped customers find products in a family shop.');
 assert.equal(json.claims[0].generated,'model');
 assert.deepEqual(json.claims[2].yomaSkill,skillTable['Customer Service']);
 assert.equal(json.generation.mode,'live');
 assert.equal(json.generation.provider,'azure-openai');
 assert.equal(json.generation.model,'gpt-4.1-mini');
 assert.ok(!Number.isNaN(Date.parse(json.generation.generatedAt)));
 assert.equal(typeof json.generation.durationMs,'number');
 assert.equal(json.generation.skillMenuSize,2);
 assert.equal(json.generation.skillMenuSource,'live');
 assert.deepEqual(json.generation.rejected,[{kind:'experience',text:'Managed 2 tills every day.',reason:'invented_number'}]);
 assert.equal(provider.calls.length,1);
});
test('POST /api/generate forwards only role, context, dates, experience and the menu to the provider',async()=>{
 const {base,provider}=await boot();
 const res=await post(base,{...body,profile:{name:'Amina',email:'a@example.com'},name:'Amina',email:'a@example.com',phone:'123',city:'Durban'});
 assert.equal(res.status,200);
 const input=provider.calls[0].input;
 assert.deepEqual(Object.keys(input).sort(),['context','dates','experience','menuNames','role','skillMenu']);
 assert.ok(!JSON.stringify(input).includes('Amina'));
 assert.ok(!JSON.stringify(input).includes('example.com'));
});
test('POST /api/generate with mode sample uses the local provider even when a live provider is configured',async()=>{
 const {base,provider}=await boot();
 const res=await post(base,{...body,mode:'sample'});
 assert.equal(res.status,200);
 const json=await res.json();
 assert.equal(json.generation.mode,'sample');
 assert.equal(json.generation.provider,'local');
 assert.equal(json.generation.model,null);
 assert.ok(json.claims.length>0);
 assert.ok(json.claims.every(c=>c.generated==='local'));
 assert.equal(provider.calls.length,0);
});
test('POST /api/generate with mode live and a local config returns 502 provider_not_configured',async()=>{
 const {base}=await boot({config:localConfig,provider:{name:'local',model:null,async generate(){throw new Error('must not be called');}}});
 const res=await post(base,{...body,mode:'live'});
 assert.equal(res.status,502);
 const json=await res.json();
 assert.equal(json.error.code,'provider_not_configured');
 assert.equal(json.error.retryable,false);
 assert.equal(typeof json.error.message,'string');
});
test('POST /api/generate without mode on a local config runs the configured local provider',async()=>{
 const provider=fakeProvider({experience:[good.experience[0]],skills:[]},{name:'local',model:null});
 const {base}=await boot({config:localConfig,provider});
 const res=await post(base,body);
 assert.equal(res.status,200);
 const json=await res.json();
 assert.equal(json.generation.mode,'sample');
 assert.equal(json.generation.provider,'local');
 assert.equal(json.generation.model,null);
 assert.equal(json.claims.length,1);
 assert.equal(json.claims[0].generated,'local');
 assert.equal(provider.calls.length,1);
});
test('POST /api/generate maps a ProviderError to 502 with code and retryable, never leaking details',async()=>{
 const {base}=await boot({provider:fakeProvider(new ProviderError('provider_timeout',undefined,{retryable:true}))});
 const res=await post(base,body);
 assert.equal(res.status,502);
 const json=await res.json();
 assert.deepEqual(Object.keys(json),['error']);
 assert.equal(json.error.code,'provider_timeout');
 assert.equal(json.error.retryable,true);
 assert.equal(json.error.message,'The AI service did not answer in time. You can retry or continue in sample mode.');
 const auth=await boot({provider:fakeProvider(new ProviderError('provider_auth','key sk-secret-123 rejected',{retryable:false}))});
 const authJson=await (await post(auth.base,body)).json();
 assert.equal(authJson.error.code,'provider_auth');
 assert.equal(authJson.error.retryable,false);
});
test('POST /api/generate returns 200 with empty claims when nothing grounded survives (Review Focus 1)',async()=>{
 const output={experience:[{text:'Managed shop accounts.',sourceQuote:'managed the shop accounts',reason:'r'}],skills:[]};
 const {base}=await boot({provider:fakeProvider(output)});
 const res=await post(base,{...body,experience:'I swept the floor every morning.'});
 assert.equal(res.status,200);
 const json=await res.json();
 assert.deepEqual(json.claims,[]);
 assert.equal(json.generation.rejected[0].reason,'quote_not_in_source');
});
test('POST /api/generate rejects a numbers-only experience as invalid input',async()=>{
 const {base}=await boot({provider:fakeProvider({experience:[],skills:[]})});
 const res=await post(base,{...body,experience:'2024 2025 2026 2027 2028 2029'});
 assert.equal(res.status,400);
 assert.equal((await res.json()).error.code,'invalid_input');
});
test('POST /api/generate returns 500 internal_error for an unexpected failure',async()=>{
 const {base}=await boot({provider:fakeProvider(new TypeError('boom'))});
 const res=await post(base,body);
 assert.equal(res.status,500);
 const json=await res.json();
 assert.equal(json.error.code,'internal_error');
 assert.ok(!json.error.message.includes('boom'));
});
test('a fifth concurrent generate gets 503 busy while four are in flight',async()=>{
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 const provider=fakeProvider(good,{gate});
 const {base}=await boot({provider});
 const first=[1,2,3,4].map(()=>post(base,body));
 while(provider.calls.length<4)await new Promise(r=>setTimeout(r,5));
 const fifth=await post(base,body);
 assert.equal(fifth.status,503);
 const json=await fifth.json();
 assert.deepEqual(json.error,{code:'busy',message:'The server is busy, try again in a moment.',retryable:true});
 release();
 const statuses=(await Promise.all(first)).map(r=>r.status);
 assert.deepEqual(statuses,[200,200,200,200]);
 const after=await post(base,body);
 assert.equal(after.status,200);
});
test('a failing generate frees its in-flight slot',async()=>{
 const {base}=await boot({provider:fakeProvider(new ProviderError('provider_error',undefined,{retryable:true})),maxInFlight:1});
 assert.equal((await post(base,body)).status,502);
 assert.equal((await post(base,body)).status,502);
});
test('GET /api/generate is not allowed',async()=>{
 const {base}=await boot();
 const res=await fetch(base+'/api/generate');
 assert.equal(res.status,405);
 assert.equal(res.headers.get('allow'),'POST');
});

test('GET /api/yoma/opportunities returns completable items from the first phrase with results',async()=>{
 const yoma=fakeYoma({opportunities:{retail:[opportunity('a'),opportunity('b',false),opportunity('c'),opportunity('d'),opportunity('e'),opportunity('f')]}});
 const {base}=await boot({yoma});
 const res=await fetch(base+'/api/yoma/opportunities?role=Retail%20assistant');
 assert.equal(res.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
 const json=await res.json();
 assert.deepEqual(yoma.calls.searches,['customer service','retail']);
 assert.equal(json.matchedQuery,'retail');
 assert.equal(json.totalCount,6);
 assert.equal(json.source,'live');
 assert.equal(json.unavailable,false);
 assert.deepEqual(json.items.map(i=>i.id),['a','c','d','e']);
 assert.ok(json.items.every(i=>i.isCompletable===true));
 assert.deepEqual(Object.keys(json.items[0]).sort(),['commitmentIntervalDescription','difficulty','id','isCompletable','organizationLogoURL','organizationName','skills','summary','title','yomaInfoURL','zltoReward']);
});
test('GET /api/yoma/opportunities reports cache as the source',async()=>{
 const yoma=fakeYoma({opportunities:{retail:[opportunity('a')]},source:'cache'});
 const {base}=await boot({yoma});
 const json=await (await fetch(base+'/api/yoma/opportunities?role=Retail%20assistant')).json();
 assert.equal(json.source,'cache');
 assert.equal(json.matchedQuery,'retail');
});
test('GET /api/yoma/opportunities returns the empty state when no phrase matches',async()=>{
 const yoma=fakeYoma();
 const {base}=await boot({yoma});
 const json=await (await fetch(base+'/api/yoma/opportunities?role=Community%20outreach%20assistant')).json();
 assert.deepEqual(yoma.calls.searches,['community','volunteer']);
 assert.deepEqual(json,{items:[],matchedQuery:null,totalCount:0,source:'live',unavailable:false});
});
test('GET /api/yoma/opportunities returns the unavailable state when Yoma cannot be reached',async()=>{
 const {base}=await boot({yoma:fakeYoma({unavailable:true})});
 const res=await fetch(base+'/api/yoma/opportunities?role=Retail%20assistant');
 assert.equal(res.status,200);
 const json=await res.json();
 assert.equal(json.unavailable,true);
 assert.deepEqual(json.items,[]);
 assert.equal(json.matchedQuery,null);
 assert.equal(json.totalCount,0);
});
test('GET /api/yoma/opportunities rejects an unknown or missing role',async()=>{
 const {base,yoma}=await boot();
 for(const query of ['?role=Barista','?role=retail%20assistant','']){
  const res=await fetch(base+'/api/yoma/opportunities'+query);
  assert.equal(res.status,400,'query '+query);
  assert.equal((await res.json()).error.code,'invalid_input');
 }
 assert.equal(yoma.calls.searches.length,0);
});
test('unknown API routes return a JSON 404',async()=>{
 const {base}=await boot();
 const res=await fetch(base+'/api/nothing');
 assert.equal(res.status,404);
 assert.equal((await res.json()).error.code,'not_found');
});

test('static allowlist serves the app files with content types',async()=>{
 const {base}=await boot();
 const root=await fetch(base+'/');
 assert.equal(root.status,200);
 assert.match(root.headers.get('content-type'),/text\/html/);
 assert.match(await root.text(),/<!doctype html>/i);
 const index=await fetch(base+'/index.html');
 assert.equal(index.status,200);
 assert.match(index.headers.get('content-type'),/text\/html/);
 const css=await fetch(base+'/styles.css');
 assert.equal(css.status,200);
 assert.match(css.headers.get('content-type'),/text\/css/);
 for(const file of ['/core.js','/app.js']){
  const js=await fetch(base+file);
  assert.equal(js.status,200,file);
  assert.match(js.headers.get('content-type'),/javascript/);
 }
 const fixture=await fetch(base+'/data/sample-credential.json');
 assert.equal(fixture.status,200);
 assert.match(fixture.headers.get('content-type'),/application\/json/);
 assert.equal((await fixture.json()).id,'sample-credential-atingi-digital-skills');
 const query=await fetch(base+'/index.html?v=1');
 assert.equal(query.status,200);
});
test('static requests outside the allowlist return 404',async()=>{
 const {base}=await boot();
 for(const file of ['/server/config.js','/.env','/.env.example','/tests/core.test.cjs','/docs/x','/package.json','/data/role-skills.json','/README.md','/server.js','/../server/config.js','/data/../server/config.js','/index.html/','/INDEX.HTML']){
  const res=await fetch(base+file);
  assert.equal(res.status,404,file);
 }
});
test('HEAD works for static files and POST to a static path is rejected',async()=>{
 const {base}=await boot();
 const head=await fetch(base+'/core.js',{method:'HEAD'});
 assert.equal(head.status,200);
 assert.equal(await head.text(),'');
 const res=await fetch(base+'/index.html',{method:'POST'});
 assert.equal(res.status,405);
});
