const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const core=require('../core.js');
const {YomaUnavailable}=require('../server/yoma.js');
const {createLocalProvider}=require('../server/providers/local.js');
let serverModule={}; try {serverModule=require('../server.js')}catch{}
const {createApp}=serverModule;

const rootDir=path.join(__dirname,'..');
const roleSkills=require('../data/role-skills.json');
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
 for(const file of ['/cv-copy.js','/cv-rules.js']){
  const js=await fetch(base+file);
  assert.equal(js.status,200,file);
  assert.match(js.headers.get('content-type'),/javascript/);
 }
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
test('the old flow is gone',async()=>{
  const {base}=await boot({config:localConfig});
  // the file's post() helper always targets /api/generate and is deleted with those cases, so fetch directly
  const res=await fetch(base+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'Retail assistant',experience:'x'})});
  assert.equal(res.status,404);
  assert.equal((await fetch(base+'/data/sample-credential.json')).status,404);
  assert.ok(!fs.existsSync(path.join(rootDir,'server/generation.js'))&&!fs.existsSync(path.join(rootDir,'data/sample-credential.json')));
  for(const name of ['localExperienceClaims','generateClaims','buildTextCV','setCredential'])assert.equal(require('../core.js')[name],undefined,name);
  for(const name of ['escapeHTML','shortQuote'])assert.equal(typeof require('../core.js')[name],'function',name);
  assert.doesNotThrow(()=>createLocalProvider(require('../core.js')));
  assert.equal(typeof createLocalProvider(require('../core.js')).generate,'undefined');
});
