const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const core=require('../core.js');
const {YomaUnavailable}=require('../server/yoma.js');
const {createAccountSource}=require('../server/card/account.js');
const {createCardStore}=require('../server/card/store.js');
const {loadOrCreateKey,verifyJwt}=require('../server/card/sign.js');
let serverModule={}; try {serverModule=require('../server.js')}catch{}
let routesModule={}; try {routesModule=require('../server/card/routes.js')}catch{}
const {createApp}=serverModule;
const {buildRecord,createCardRouter}=routesModule;

const rootDir=path.join(__dirname,'..');
const roleSkills=require('../data/role-skills.json');
const NOW=Date.parse('2026-11-12T10:00:00Z');
const PUBLIC_URL='https://yocard.example';
const HAIR='019e6f89-b66b-798e-a380-cbf33d634de5';
const CARE='019e6f11-51ae-7a56-bbdd-9ee548b58cda';
const FINLIT='019a1062-2518-756d-bc33-1b68b8f67d96';
const info={
 [HAIR]:{id:HAIR,title:'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro',organizationName:'Alison Learning',organizationLogoURL:null,type:'Learning',verificationEnabled:true,verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:3,yomaInfoURL:'https://app.yoma.world/opportunities/'+HAIR,published:true,isCompletable:true,skills:[]},
 [CARE]:{id:CARE,title:'Customer Care Skills and Telephone Etiquette',organizationName:'Alison Learning',organizationLogoURL:null,type:'Learning',verificationEnabled:true,verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:5,yomaInfoURL:'https://app.yoma.world/opportunities/'+CARE,published:true,isCompletable:true,skills:[]},
 [FINLIT]:{id:FINLIT,title:'Financial Literacy for Gig Workers',organizationName:'UNICEF Kenya',organizationLogoURL:null,type:'Learning',verificationEnabled:true,verificationMethod:'Manual',verificationTypes:[{type:'FileUpload',displayName:'File Upload',description:''}],participantCountCompleted:37,yomaInfoURL:'https://app.yoma.world/opportunities/'+FINLIT,published:true,isCompletable:true,skills:[]}
};
function fakeYoma({unavailable=false}={}){
 const state={unavailable};
 return {
  state,baseUrl:'https://api.yoma.test/api/v3',
  async opportunityInfo(id){if(state.unavailable)throw new YomaUnavailable();const item=info[id];return {item:item?JSON.parse(JSON.stringify(item)):null,source:'live'};},
  async reachable(){return !state.unavailable;},
  async skillByName(){return {item:null,source:'live'};},
  async searchLearningOpportunities(){return {items:[],totalCount:0,source:'live'};}
 };
}
const goodSelf={headline:'Braids and cornrows in Khayelitsha',services:[{name:'Braids',priceFrom:150,priceTo:400,currency:'ZAR'}],area:'Khayelitsha',hours:'Mon-Sat',languages:['isiXhosa','English'],notes:''};
const goodConfirms={lines:[
 {text:'Completed Hair Styling with Alison Learning in September 2025, checked automatically.',evidenceIds:['c1']},
 {text:'Completed Financial Literacy for Gig Workers with UNICEF Kenya; UNICEF Kenya checked a file upload.',evidenceIds:['c3']},
 {text:'Trained at UNICEF Kenya on customer care.',evidenceIds:['c2']}
]};
function fakeProvider(outputs={yocard_self_declared:goodSelf,yocard_confirms:goodConfirms},{name='azure-openai',model='gpt-4.1-mini'}={}){
 const calls=[];
 return {name,model,calls,
  async generate(){throw new Error('generate must not be used by card routes');},
  async complete(request,opts){calls.push({request,opts});const out=outputs[request.schemaName];if(out instanceof Error)throw out;return typeof out==='function'?out(request):out;}
 };
}
const localProvider={name:'local',model:null,async generate(){return {output:{experience:[],skills:[]}};}};
const liveConfig={provider:'azure-openai',model:'gpt-4.1-mini',yomaBase:'https://api.yoma.test/api/v3',port:0,host:'127.0.0.1',yomaAccessToken:'',publicUrl:PUBLIC_URL};
const localConfig={...liveConfig,provider:'local',model:null};
const description='I do braids and cornrows in Khayelitsha, R150-R400, Mon-Sat. I speak isiXhosa and English.';

const servers=[];
async function boot({config=liveConfig,provider=fakeProvider(),yoma=fakeYoma(),now=()=>NOW,dir=fs.mkdtempSync(path.join(os.tmpdir(),'yocard-routes-')),accountSource=null,maxInFlight}={}){
 assert.equal(typeof createApp,'function','server.js must export createApp');
 accountSource=accountSource||createAccountSource({config,yoma,now});
 const store=createCardStore(dir,{now});
 const key=loadOrCreateKey(dir);
 const server=createApp({config,provider,yoma,roleSkills,core,rootDir,card:{accountSource,store,key},publicUrl:PUBLIC_URL,now,maxInFlight});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 servers.push(server);
 const base='http://127.0.0.1:'+server.address().port;
 return {base,server,provider,yoma,store,key,dir};
}
test.after(()=>{for(const s of servers){s.closeAllConnections();s.close();}});

async function post(base,route,payload,init={}){
 return fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:typeof payload==='string'?payload:JSON.stringify(payload),...init});
}
async function okJson(res){
 const text=await res.text();
 assert.equal(res.status,200,text);
 return JSON.parse(text);
}
async function connect(base,persona='thandi'){
 return okJson(await post(base,'/api/card/account',{persona}));
}
async function draftOf(base,draftToken,extra={}){
 return okJson(await post(base,'/api/card/draft',{draftToken,trade:'hair',description,...extra}));
}
async function publishThandi(base,{whatsapp=false,photo=true,extra={}}={}){
 const {draftToken,snapshot}=await connect(base,'thandi');
 const draft=await draftOf(base,draftToken);
 const payload={
  draftToken,trade:'hair',description,
  selfDeclared:draft.selfDeclared,confirms:draft.confirms,
  disclose:{completions:snapshot.completions.map(c=>c.evidenceId),skills:snapshot.skills.map(s=>s.evidenceId),photo,whatsapp},
  consent:true,
  ...extra
 };
 const res=await post(base,'/api/card/publish',payload);
 return {res,payload,snapshot,draft};
}

test('GET /api/card/status reports the account source, model and personas',async()=>{
 const {base}=await boot();
 const res=await fetch(base+'/api/card/status');
 assert.equal(res.status,200);
 const json=await res.json();
 assert.equal(json.accountSource,'sample');
 assert.deepEqual(json.model,{mode:'live',provider:'azure-openai',model:'gpt-4.1-mini'});
 assert.equal(json.adultsOnly,true);
 const ids=json.personas.map(p=>p.id);
 assert.ok(ids.includes('thandi')&&ids.includes('sipho')&&ids.includes('lerato'),ids.join(','));
 assert.ok(json.personas.every(p=>typeof p.displayName==='string'&&typeof p.trade==='string'));
 assert.ok(!JSON.stringify(json).includes('+27'),'status never carries phone numbers');
});
test('GET /api/card/status reports sample model mode with the local provider',async()=>{
 const {base}=await boot({config:localConfig,provider:localProvider});
 const json=await (await fetch(base+'/api/card/status')).json();
 assert.deepEqual(json.model,{mode:'sample',provider:'local',model:null});
});

test('POST /api/card/account returns the snapshot with the phone masked and a draft token',async()=>{
 const {base}=await boot();
 const json=await connect(base,'thandi');
 assert.match(json.draftToken,/^[0-9a-f]{24}$/);
 assert.equal(json.snapshot.user.displayName,'Thandi Mokoena');
 assert.equal(json.snapshot.user.phoneNumber,'••• ••• 147');
 assert.equal(json.snapshot.user.phoneMaskedOnly,true);
 assert.equal(json.snapshot.user.dateOfBirth,undefined);
 assert.equal(json.snapshot.user.age,24);
 assert.equal(json.snapshot.completions.length,3);
 assert.deepEqual(json.snapshot.completions.map(c=>c.evidenceId),['c1','c2','c3']);
 assert.equal(json.snapshot.completions[0].live.verificationMethod,'Automatic');
 assert.ok(!JSON.stringify(json).includes('+27735550147'));
});
test('POST /api/card/account rejects an under-18 persona with 403 under_18 and an unknown persona with 400',async()=>{
 const {base}=await boot();
 const res=await post(base,'/api/card/account',{persona:'lerato'});
 assert.equal(res.status,403);
 const json=await res.json();
 assert.equal(json.error.code,'under_18');
 assert.equal(json.error.message,"YoCard is for adults. This account's date of birth is self-declared on Yoma and shows under 18.");
 const unknown=await post(base,'/api/card/account',{persona:'nobody'});
 assert.equal(unknown.status,400);
 assert.equal((await unknown.json()).error.code,'invalid_input');
 const tricky=await post(base,'/api/card/account',{persona:'../x'});
 assert.equal(tricky.status,400);
});
test('POST /api/card/account keeps stored opportunity details when Yoma is unreachable (Review Focus 2)',async()=>{
 const {base}=await boot({yoma:fakeYoma({unavailable:true})});
 const json=await connect(base,'thandi');
 assert.equal(json.snapshot.completions[0].live,null);
 assert.equal(json.snapshot.completions[0].organizationName,'Alison Learning');
});
// Token-mode account reads: the route maps the source's errors (account.js) to 502 with the source's code.
function tokenSourceThrowing(err){return {kind:'token',apiBase:liveConfig.yomaBase,listPersonas:()=>[],async read(){throw err;}};}
test('POST /api/card/account answers 502 yoma_unavailable (retryable) when the token read cannot reach Yoma',async()=>{
 const {base}=await boot({config:{...liveConfig,yomaAccessToken:'t'},accountSource:tokenSourceThrowing(new YomaUnavailable())});
 const res=await post(base,'/api/card/account',{});
 assert.equal(res.status,502);
 const json=await res.json();
 assert.equal(json.error.code,'yoma_unavailable');
 assert.equal(json.error.retryable,true);
 assert.equal(json.error.message,'Yoma could not be reached. Try again in a moment.');
});
test('POST /api/card/account answers 502 yoma_auth (not retryable) when Yoma rejects the token',async()=>{
 const authErr=new Error('Yoma rejected the access token. Refresh YOMA_ACCESS_TOKEN on the server; sample mode still works.');authErr.code='yoma_auth';
 const {base}=await boot({config:{...liveConfig,yomaAccessToken:'t'},accountSource:tokenSourceThrowing(authErr)});
 const res=await post(base,'/api/card/account',{});
 assert.equal(res.status,502);
 const json=await res.json();
 assert.equal(json.error.code,'yoma_auth');
 assert.equal(json.error.retryable,false);
 assert.equal(json.error.message,authErr.message);
});

test('POST /api/card/draft runs the pipeline with the model and reports dropped lines',async()=>{
 const {base,provider}=await boot();
 const {draftToken}=await connect(base,'thandi');
 const draft=await draftOf(base,draftToken);
 assert.equal(provider.calls.length,2);
 assert.equal(draft.selfDeclared.headline,'Braids and cornrows in Khayelitsha');
 assert.deepEqual(draft.confirms.map(l=>l.evidenceIds),[['c1'],['c3']]);
 assert.equal(draft.generation.mode,'live');
 assert.ok(draft.generation.rejected.some(r=>r.reason==='wrong_organisation'));
 const sent=JSON.stringify(provider.calls.map(c=>c.request.messages));
 assert.ok(!/Thandi|Mokoena|\+27|2002-03-15|phoneNumber|dateOfBirth/.test(sent),'the model never receives user fields');
});
test('POST /api/card/draft with mode sample uses the template draft; expired or unknown tokens are rejected',async()=>{
 const {base,provider}=await boot();
 const {draftToken}=await connect(base,'thandi');
 const draft=await draftOf(base,draftToken,{mode:'sample'});
 assert.equal(provider.calls.length,0);
 assert.equal(draft.generation.mode,'sample');
 assert.equal(draft.confirms.length,3);
 assert.equal(draft.selfDeclared.services[0].priceFrom,150);
 const bad=await post(base,'/api/card/draft',{draftToken:'0'.repeat(24),trade:'hair',description});
 assert.equal(bad.status,400);
 assert.equal((await bad.json()).error.code,'session_expired');
 const missing=await post(base,'/api/card/draft',{draftToken,trade:'hair',description:''});
 assert.equal(missing.status,400);
 assert.equal((await missing.json()).error.code,'invalid_input');
});
test('POST /api/card/draft maps provider failures to 502 with the provider code',async()=>{
 const {ProviderError}=require('../server/providers/errors.js');
 const {base}=await boot({provider:fakeProvider({yocard_self_declared:new ProviderError('provider_timeout',undefined,{retryable:true})})});
 const {draftToken}=await connect(base,'thandi');
 const res=await post(base,'/api/card/draft',{draftToken,trade:'hair',description});
 assert.equal(res.status,502);
 const json=await res.json();
 assert.equal(json.error.code,'provider_timeout');
 assert.equal(json.error.retryable,true);
});
test('draft sessions expire after 30 minutes',async()=>{
 let clock=NOW;
 const {base}=await boot({now:()=>clock});
 const {draftToken}=await connect(base,'thandi');
 clock+=31*60*1000;
 const res=await post(base,'/api/card/draft',{draftToken,trade:'hair',description});
 assert.equal(res.status,400);
 assert.equal((await res.json()).error.code,'session_expired');
});

test('POST /api/card/publish rejects missing consent, unknown disclosed ids (Review Focus 4) and long descriptions',async()=>{
 const {base,store}=await boot();
 const noConsent=await publishThandi(base,{extra:{consent:false}});
 assert.equal(noConsent.res.status,400);
 assert.equal((await noConsent.res.json()).error.code,'invalid_input');
 const unknownId=await publishThandi(base,{extra:{disclose:{completions:['c1','c9'],skills:[],photo:false,whatsapp:false}}});
 assert.equal(unknownId.res.status,400);
 assert.equal((await unknownId.res.json()).error.code,'invalid_input');
 const longDesc=await publishThandi(base,{extra:{description:'x'.repeat(1001)}});
 assert.equal(longDesc.res.status,400);
 const invented=await publishThandi(base,{extra:{selfDeclared:{...goodSelf,services:[{name:'Braids',priceFrom:999,priceTo:null,currency:'ZAR'}]}}});
 assert.equal(invented.res.status,400);
 const inventedJson=await invented.res.json();
 assert.equal(inventedJson.error.code,'invalid_input');
 assert.ok(inventedJson.error.rejected.some(r=>r.reason==='invented_number'));
 const uncited=await publishThandi(base,{extra:{confirms:[{text:'Completed everything.',evidenceIds:[]}]}});
 assert.equal(uncited.res.status,400);
 // Spec §3.3: organisation names from the live organisation list must not appear in the self-declared
 // text, also when the worker edits the fields after the draft.
 const org=await publishThandi(base,{extra:{selfDeclared:{...goodSelf,headline:'Trained by Alison Learning'}}});
 assert.equal(org.res.status,400);
 const orgJson=await org.res.json();
 assert.equal(orgJson.error.code,'invalid_input');
 assert.ok(orgJson.error.rejected.some(r=>r.reason==='organisation_name'),JSON.stringify(orgJson));
 const orgNotes=await publishThandi(base,{extra:{selfDeclared:{...goodSelf,notes:'Ask UNICEF Kenya about me'}}});
 assert.equal(orgNotes.res.status,400);
 assert.ok((await orgNotes.res.json()).error.rejected.some(r=>r.reason==='organisation_name'));
 assert.equal(store.list().length,0,'nothing was published');
});
test('POST /api/card/publish stores a signed record and the public routes serve it',async()=>{
 const {base,store,key}=await boot();
 const {res,snapshot}=await publishThandi(base,{whatsapp:true});
 assert.equal(res.status,200);
 const json=await res.json();
 assert.match(json.cardId,/^[A-Z2-9]{10}$/);
 assert.equal(json.url,PUBLIC_URL+'/c/'+json.cardId);
 assert.equal(json.svgUrl,PUBLIC_URL+'/c/'+json.cardId+'.svg');
 assert.match(json.code,/^[A-Z0-9]{6}$/);
 assert.match(json.ownerSecret,/^[0-9a-f]{32}$/);
 assert.deepEqual(store.list(),[json.cardId]);
 const entry=store.get(json.cardId);
 assert.equal(entry.record.user.dateOfBirth,undefined);
 assert.equal(entry.record.user.email,undefined);
 assert.equal(entry.record.user.phoneNumber,undefined);
 assert.equal(entry.record.user.phoneLast3,'147');
 assert.deepEqual(entry.record.whatsapp,{enabled:true,number:'+27735550147'});
 assert.equal(entry.record.user.displayName,snapshot.user.displayName);
 assert.deepEqual(entry.record.disclosed.completions.map(c=>c.evidenceId),['c1','c2','c3']);
 assert.equal(entry.record.generation.mode,'live');

 const page=await fetch(base+'/c/'+json.cardId);
 assert.equal(page.status,200);
 assert.match(page.headers.get('content-type'),/text\/html/);
 const html=await page.text();
 assert.ok(html.includes("Read from Thandi's Yoma account on"));
 assert.ok(html.includes('Thandi Mokoena'));
 assert.ok(html.includes('https://wa.me/27735550147?text='));
 assert.ok(html.includes('<form method="post" action="/c/'+json.cardId+'/check"'));

 const svg=await fetch(base+'/c/'+json.cardId+'.svg');
 assert.equal(svg.status,200);
 assert.match(svg.headers.get('content-type'),/image\/svg\+xml/);
 const svgText=await svg.text();
 assert.ok(svgText.startsWith('<svg'));
 assert.ok(svgText.includes(json.code));

 const signed=await fetch(base+'/c/'+json.cardId+'.json');
 assert.equal(signed.status,200);
 const body=await signed.json();
 assert.equal(body.record.cardId,json.cardId);
 assert.equal(body.record.code,json.code);
 const jwks=await (await fetch(base+'/.well-known/jwks.json')).json();
 assert.equal(jwks.keys[0].kty,'EC');
 assert.equal(jwks.keys[0].crv,'P-256');
 assert.equal(jwks.keys[0].kid,key.kid);
 const payload=verifyJwt(key,body.jwt);
 assert.ok(payload,'jwt verifies with the server key');
 assert.equal(payload.sub,json.cardId);
 assert.equal(payload.iss,'yocard-prototype');
 assert.deepEqual(payload.record,body.record);
 const publicKey=crypto.createPublicKey({key:jwks.keys[0],format:'jwk'});
 assert.ok(verifyJwt({publicKey,kid:jwks.keys[0].kid},body.jwt),'jwt verifies with the JWKS key');
});
test('publish without WhatsApp keeps the number out of the record and the page',async()=>{
 const {base,store}=await boot();
 const {res}=await publishThandi(base,{whatsapp:false,photo:false});
 const json=await res.json();
 const entry=store.get(json.cardId);
 assert.deepEqual(entry.record.whatsapp,{enabled:false});
 assert.ok(!JSON.stringify(entry).includes('27735550147'));
 const html=await (await fetch(base+'/c/'+json.cardId)).text();
 assert.ok(!html.includes('wa.me'));
 assert.ok(html.includes('••• ••• 147'));
});
test('publish for Sipho (no completions) renders the empty state (Review Focus 1)',async()=>{
 const {base}=await boot({config:localConfig,provider:localProvider});
 const {draftToken,snapshot}=await connect(base,'sipho');
 assert.equal(snapshot.completions.length,0);
 const draft=await draftOf(base,draftToken,{trade:'cleaner',description:'I clean houses and offices in Durban.'});
 assert.deepEqual(draft.confirms,[]);
 const res=await post(base,'/api/card/publish',{draftToken,trade:'cleaner',description:'I clean houses and offices in Durban.',selfDeclared:{headline:'',services:[],area:'',hours:'',languages:[],notes:''},confirms:[],disclose:{completions:[],skills:[],photo:false,whatsapp:false},consent:true});
 const json=await okJson(res);
 const html=await (await fetch(base+'/c/'+json.cardId)).text();
 assert.ok(html.includes('No services listed yet'));
 assert.ok(html.includes('Sipho Dlamini'));
 assert.ok(html.includes('Phone confirmed by Yoma (not an ID check)'));
});

test('card ids with path tricks never read outside data/cards (Review Focus 3)',async()=>{
 const {base,store}=await boot();
 const {res}=await publishThandi(base);
 const {cardId}=await res.json();
 for(const route of ['/c/../.keys.json','/c/.keys.json','/c/ABC.svg.json','/c/'+cardId+'.json.svg','/c/'+cardId.toLowerCase(),'/c/'+cardId+'x','/c/','/c/%2E%2E/.keys.json','/c/'+cardId+'/../.keys.json','/c/'+cardId+'.JSON']){
  const r=await fetch(base+route);
  assert.equal(r.status,404,route);
  const text=await r.text();
  assert.ok(!text.includes('privatePem'),route);
 }
 const direct=await fetch(base+'/data/cards/'+cardId+'.json');
 assert.equal(direct.status,404);
 const keys=await fetch(base+'/data/cards/.keys.json');
 assert.equal(keys.status,404);
 assert.deepEqual(store.list(),[cardId]);
 const html=await (await fetch(base+'/c/ZZZZZZZZZZ')).text();
 assert.ok(html.includes('No card with this code'));
});

test('POST /api/card/:id/check returns signals from a fresh read, labelled simulated for sample accounts',async()=>{
 const {base,store}=await boot();
 const {res}=await publishThandi(base);
 const {cardId}=await res.json();
 const check=await post(base,'/api/card/'+cardId+'/check',{});
 assert.equal(check.status,200);
 const json=await check.json();
 assert.ok(!Number.isNaN(Date.parse(json.checkedAt)));
 assert.equal(json.simulated,true);
 const byKey=Object.fromEntries(json.signals.map(s=>[s.key,s]));
 assert.equal(byKey.account_exists.ok,true);
 assert.equal(byKey.yoid_onboarded.ok,true);
 assert.equal(byKey.phone_confirmed.ok,true);
 assert.equal(byKey['completion:c1'].ok,true);
 assert.equal(byKey['completion:c3'].ok,true);
 assert.equal(byKey['skill:s1'].ok,true);
 assert.ok(json.signals.every(s=>typeof s.label==='string'&&s.label));
 assert.ok(!JSON.stringify(json).includes('+27735550147'));
 assert.equal(store.get(cardId).lastCheck.checkedAt,json.checkedAt);
 const unknown=await post(base,'/api/card/ZZZZZZZZZZ/check',{});
 assert.equal(unknown.status,404);
});
test('the no-JavaScript check form posts to /c/:id/check and renders the result inline',async()=>{
 const {base}=await boot();
 const {res}=await publishThandi(base);
 const {cardId}=await res.json();
 const page=await fetch(base+'/c/'+cardId+'/check',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:''});
 assert.equal(page.status,200);
 const html=await page.text();
 assert.ok(html.includes('Yoma account exists'));
 assert.ok(html.includes("Read from Thandi's Yoma account on"));
});
// Token-mode Yoma: the three holder endpoints answered from fixtures until `down` is set.
const TOKEN_PROFILE={id:'8f0b4e9e-1b1c-4d2e-9a1f-0c0c0c0c0c0c',email:'worker@example.org',emailConfirmed:true,firstName:'Thandi',surname:'Mokoena',displayName:'Thandi Mokoena',phoneNumber:'+27735550147',phoneNumberConfirmed:true,dateOfBirth:'2002-03-15T00:00:00+00:00',photoURL:null,yoIDOnboarded:true,dateYoIDOnboarded:'2025-02-12T09:41:00+00:00',dateCreated:'2025-02-10T14:03:00+00:00',opportunityCountPending:0,opportunityCountCompleted:1,opportunityCountRejected:0};
const TOKEN_SKILLS=[{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:null,organizations:[{id:'org-alison',name:'Alison Learning',logoURL:null}]}];
const TOKEN_OPPS={totalCount:1,items:[{id:'mo-1',userId:TOKEN_PROFILE.id,opportunityId:HAIR,opportunityTitle:info[HAIR].title,opportunityType:'Learning',organizationName:'Alison Learning',organizationLogoURL:null,action:'Verification',verificationStatus:'Completed',dateCompleted:'2025-09-18T16:20:00+00:00',verifications:[],skills:[]}]};
function tokenFetch(state){
 const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
 const fetchImpl=async(url,init={})=>{
  fetchImpl.calls.push(String(url));
  if(state.down)throw new TypeError('fetch failed');
  if(init.headers?.authorization!=='Bearer t')return json([{type:'Unauthorized'}],401);
  const u=String(url);
  if(u.endsWith('/user'))return json(TOKEN_PROFILE);
  if(u.endsWith('/user/skills'))return json(TOKEN_SKILLS);
  if(u.endsWith('/myOpportunity/search'))return json(TOKEN_OPPS);
  return json([{type:'EntityNotFoundException'}],404);
 };
 fetchImpl.calls=[];
 return fetchImpl;
}
test('check reports unavailable when Yoma cannot be reached, never a stale green',async()=>{
 const state={down:false};
 const tokenConfig={...liveConfig,yomaAccessToken:'t'};
 const accountSource=createAccountSource({config:tokenConfig,yoma:fakeYoma(),fetch:tokenFetch(state),now:()=>NOW});
 const {base,store}=await boot({config:tokenConfig,accountSource});
 assert.equal((await (await fetch(base+'/api/card/status')).json()).accountSource,'token');
 const {res}=await publishThandi(base);
 const {cardId}=await okJson(res);
 assert.equal(store.get(cardId).record.accountSource,'token');
 const live=await (await post(base,'/api/card/'+cardId+'/check',{})).json();
 assert.equal(live.unavailable,false);
 assert.equal(live.simulated,false);
 assert.ok(live.signals.find(s=>s.key==='account_exists').ok);
 state.down=true;
 const check=await post(base,'/api/card/'+cardId+'/check',{});
 assert.equal(check.status,200);
 const json=await check.json();
 assert.ok(!Number.isNaN(Date.parse(json.checkedAt)));
 assert.equal(json.unavailable,true);
 assert.equal(json.signals,undefined);
 assert.equal(json.simulated,false);
 assert.equal(store.get(cardId).lastCheck.unavailable,true);
 const page=await fetch(base+'/c/'+cardId+'/check',{method:'POST',body:''});
 assert.equal(page.status,200);
 const html=await page.text();
 assert.ok(html.includes('Could not check with Yoma right now'));
 assert.ok(!html.includes('class="ok"'),'no stale green');
 assert.ok(html.includes("Read from Thandi's Yoma account on"));
});
test('check routes share the concurrency guard: a check past the limit gets 503 busy on both forms',async()=>{
 const real=createAccountSource({config:liveConfig,yoma:fakeYoma(),now:()=>NOW});
 let gate=null;
 const accountSource={kind:real.kind,apiBase:real.apiBase,listPersonas:()=>real.listPersonas(),async read(selector){if(gate)await gate;return real.read(selector);}};
 const {base}=await boot({accountSource,maxInFlight:1});
 const {res}=await publishThandi(base);
 const {cardId}=await okJson(res);
 let release;
 gate=new Promise(resolve=>{release=resolve;});
 const first=post(base,'/api/card/'+cardId+'/check',{});
 await new Promise(resolve=>setTimeout(resolve,50));
 const second=await post(base,'/api/card/'+cardId+'/check',{});
 assert.equal(second.status,503);
 assert.deepEqual((await second.json()).error,{code:'busy',message:'The server is busy, try again in a moment.',retryable:true});
 const form=await fetch(base+'/c/'+cardId+'/check',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:''});
 assert.equal(form.status,503);
 assert.match(form.headers.get('content-type'),/text\/html/);
 const html=await form.text();
 assert.ok(html.includes('The server is busy, try again in a moment.'));
 assert.ok(html.includes("Read from Thandi's Yoma account on"));
 assert.ok(!html.includes('class="ok"'));
 release();
 const firstRes=await first;
 assert.equal(firstRes.status,200);
 assert.ok(Array.isArray((await firstRes.json()).signals));
 gate=null;
 assert.equal((await post(base,'/api/card/'+cardId+'/check',{})).status,200,'the slot is released afterwards');
});

test('withdraw needs the owner secret; afterwards the page, image and json answer 410 without WhatsApp',async()=>{
 const {base}=await boot();
 const {res}=await publishThandi(base,{whatsapp:true});
 const {cardId,ownerSecret}=await res.json();
 const wrong=await post(base,'/api/card/'+cardId+'/withdraw',{ownerSecret:'0'.repeat(32)});
 assert.equal(wrong.status,403);
 assert.equal((await wrong.json()).error.code,'forbidden');
 assert.equal((await fetch(base+'/c/'+cardId)).status,200);
 const right=await post(base,'/api/card/'+cardId+'/withdraw',{ownerSecret});
 assert.equal(right.status,200);
 assert.ok(!Number.isNaN(Date.parse((await right.json()).withdrawnAt)));
 const page=await fetch(base+'/c/'+cardId);
 assert.equal(page.status,410);
 const html=await page.text();
 assert.ok(html.includes('This card was withdrawn by its owner on'));
 assert.ok(!html.includes('wa.me'));
 assert.ok(!html.includes('27735550147'));
 assert.equal((await fetch(base+'/c/'+cardId+'.json')).status,410);
 const svg=await fetch(base+'/c/'+cardId+'.svg');
 assert.equal(svg.status,410);
 assert.match(svg.headers.get('content-type'),/image\/svg\+xml/);
 assert.equal((await post(base,'/api/card/'+cardId+'/check',{})).status,410);
 const unknown=await post(base,'/api/card/ZZZZZZZZZZ/withdraw',{ownerSecret});
 assert.equal(unknown.status,404);
});

test('the static allowlist serves the worker page files and still blocks data/cards and server files',async()=>{
 const {base}=await boot();
 assert.deepEqual(['/card.html','/card.js','/card.css'].filter(p=>p in serverModule.STATIC),['/card.html','/card.js','/card.css']);
 for(const route of ['/data/cards/','/data/cards/.keys.json','/server/card/personas.json','/server/card/routes.js']){
  assert.equal((await fetch(base+route)).status,404,route);
 }
});

test('buildRecord strips date of birth, email and the phone unless WhatsApp is on',()=>{
 assert.equal(typeof buildRecord,'function');
 const snapshot={
  source:'sample',readAt:'2026-11-12T10:00:00.000Z',apiBase:'https://api.yoma.test/api/v3',
  user:{id:'u1',displayName:'Thandi Mokoena',firstName:'Thandi',photoURL:'https://cdn.example/t.jpg',country:'South Africa',city:'Cape Town',dateOfBirth:'2002-03-15',dateCreated:'2025-02-10T14:03:00+00:00',yoIDOnboarded:true,dateYoIDOnboarded:'2025-02-12T09:41:00+00:00',phoneNumberConfirmed:true,phoneNumber:'+27735550147',emailConfirmed:true,email:'t@example.test',opportunityCountCompleted:1,opportunityCountPending:0,opportunityCountRejected:0},
  completions:[{evidenceId:'c1',myOpportunityId:'m1',opportunityId:HAIR,title:'Hair Styling',organizationName:'Alison Learning',organizationLogoURL:null,dateCompleted:'2025-09-18T16:20:00+00:00',verificationStatus:'Completed',opportunityType:'Learning',skills:[],evidenceTypes:[],live:null}],
  skills:[{evidenceId:'s1',id:'sk1',name:'Cosmetics',infoURL:null,organizations:[]}]
 };
 const base={snapshot,trade:'hair',selfDeclared:goodSelf,confirms:[{text:'Completed Hair Styling with Alison Learning.',evidenceIds:['c1']}],code:'K7PQ2M',now:()=>NOW,personaId:'thandi'};
 const off=buildRecord({...base,disclose:{completions:['c1'],skills:[],photo:false,whatsapp:false}});
 const text=JSON.stringify(off);
 assert.ok(!text.includes('2002-03-15'));
 assert.ok(!text.includes('t@example.test'));
 assert.ok(!text.includes('27735550147'));
 assert.equal(off.user.phoneLast3,'147');
 assert.equal(off.user.photoURL,null);
 assert.deepEqual(off.whatsapp,{enabled:false});
 assert.deepEqual(off.disclosed.completions.map(c=>c.evidenceId),['c1']);
 assert.deepEqual(off.disclosed.skills,[]);
 assert.equal(off.trade,'Hairdresser');
 assert.equal(off.code,'K7PQ2M');
 assert.equal(off.accountSource,'sample');
 assert.equal(off.snapshotReadAt,'2026-11-12T10:00:00.000Z');
 assert.equal(off.publishedAt,new Date(NOW).toISOString());
 const on=buildRecord({...base,disclose:{completions:['c1'],skills:['s1'],photo:true,whatsapp:true}});
 assert.deepEqual(on.whatsapp,{enabled:true,number:'+27735550147'});
 assert.equal(on.user.photoURL,'https://cdn.example/t.jpg');
 assert.deepEqual(on.disclosed.skills.map(s=>s.evidenceId),['s1']);
 const unconfirmed=buildRecord({...base,snapshot:{...snapshot,user:{...snapshot.user,phoneNumberConfirmed:false}},disclose:{completions:[],skills:[],photo:false,whatsapp:true}});
 assert.deepEqual(unconfirmed.whatsapp,{enabled:false},'WhatsApp needs an OTP-confirmed phone');
});

test('createCardRouter.handle returns false for routes it does not own',async()=>{
 assert.equal(typeof createCardRouter,'function');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yocard-router-'));
 const router=createCardRouter({config:liveConfig,accountSource:createAccountSource({config:liveConfig,yoma:fakeYoma()}),provider:fakeProvider(),store:createCardStore(dir),key:loadOrCreateKey(dir),yoma:fakeYoma(),publicUrl:PUBLIC_URL});
 const res={writeHead(){},end(){}};
 assert.equal(await router.handle({method:'GET',url:'/api/status',headers:{}},res,new URL('http://localhost/api/status')),false);
 assert.equal(await router.handle({method:'GET',url:'/index.html',headers:{}},res,new URL('http://localhost/index.html')),false);
});
