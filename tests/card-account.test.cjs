const {test}=require('node:test');
const assert=require('node:assert/strict');
const {YomaUnavailable}=require('../server/yoma.js');
let account={}; try {account=require('../server/card/account.js')}catch{}
const {createAccountSource,ageAt}=account;
let personas=null; try {personas=require('../server/card/personas.json')}catch{}

const NOW=Date.parse('2026-11-12T10:00:00Z');
const now=()=>NOW;
const BASE='https://yoma.example/api/v3';
const config={yomaBase:BASE};

const HAIR='019e6f89-b66b-798e-a380-cbf33d634de5';
const CARE='019e6f11-51ae-7a56-bbdd-9ee548b58cda';
const FINLIT='019a1062-2518-756d-bc33-1b68b8f67d96';

const liveInfo={
 [HAIR]:{id:HAIR,title:'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro',organizationName:'Alison Learning',organizationLogoURL:'https://logo.example/alison.png',type:'Learning',verificationEnabled:true,verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:0,yomaInfoURL:'https://yoma.world/opportunities/'+HAIR,published:true,isCompletable:true,skills:[{id:'6e85a30a-008b-4340-a3de-eeb8e7f7ce88',name:'Cosmetics',infoURL:'https://lightcast.io/open-skills/skills/KS122FL69C9376N0WS3D'}]},
 [CARE]:{id:CARE,title:'Customer Care Skills and Telephone Etiquette',organizationName:'Alison Learning',organizationLogoURL:'https://logo.example/alison.png',type:'Learning',verificationEnabled:true,verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:0,yomaInfoURL:'https://yoma.world/opportunities/'+CARE,published:true,isCompletable:true,skills:[{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/open-skills/skills/KS121Z26S4VJLQ1WXN21'}]},
 [FINLIT]:{id:FINLIT,title:'💡 Financial Literacy for Gig Workers – Learn, Save & Grow in the Digital Economy! 💰',organizationName:'UNICEF Kenya',organizationLogoURL:'https://logo.example/unicef-kenya.png',type:'Learning',verificationEnabled:true,verificationMethod:'Manual',verificationTypes:[{type:'FileUpload',displayName:'File Upload',description:'A file of your completion certificate'}],participantCountCompleted:37,yomaInfoURL:'https://yoma.world/opportunities/'+FINLIT,published:true,isCompletable:true,skills:[{id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS'}]}
};

function fakeYoma({info=liveInfo,unavailable=false,source='live'}={}){
 const calls=[];
 return {
  baseUrl:BASE,calls,
  async opportunityInfo(id){
   calls.push(id);
   if(unavailable)throw new YomaUnavailable();
   const item=info[id];
   return {item:item?JSON.parse(JSON.stringify(item)):null,source};
  }
 };
}

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
function fakeFetch(handler){
 const calls=[];
 const fetch=async(url,init={})=>{calls.push({url:String(url),init});return handler(String(url),init,calls.length);};
 fetch.calls=calls;
 return fetch;
}

// --- ageAt ---

test('ageAt computes whole years from a date of birth at a given instant',()=>{
 assert.equal(typeof ageAt,'function');
 assert.equal(ageAt('2009-01-01',NOW),17);
 assert.equal(ageAt('2009-01-01',new Date(NOW)),17);
 assert.equal(ageAt('2009-01-01','2026-11-12T10:00:00Z'),17);
 assert.equal(ageAt('2008-11-12T00:00:00+00:00',NOW),18); // birthday today counts
 assert.equal(ageAt('2008-11-13',NOW),17); // birthday tomorrow does not
 assert.equal(ageAt('2002-03-15',NOW),24);
});

test('ageAt returns null for missing or unparseable dates',()=>{
 assert.equal(ageAt(null,NOW),null);
 assert.equal(ageAt(undefined,NOW),null);
 assert.equal(ageAt('',NOW),null);
 assert.equal(ageAt('not a date',NOW),null);
});

// --- personas.json ---

test('personas.json holds the five spec personas with real opportunity ids and confirmed phones',()=>{
 assert.ok(Array.isArray(personas),'personas.json must be an array');
 const ids=personas.map(p=>p.id);
 assert.deepEqual(ids,['thandi','brian','amara','sipho','lerato']);
 const byId=Object.fromEntries(personas.map(p=>[p.id,p]));
 assert.deepEqual(byId.thandi.completions.map(c=>c.opportunityId),[HAIR,CARE,FINLIT]);
 assert.deepEqual(byId.brian.completions.map(c=>c.opportunityId),['019e6fa0-1b36-7cba-a344-44f23ab7619d','019e6fb9-bfc4-7dd7-ac9d-c09a384c5160',FINLIT]);
 assert.deepEqual(byId.amara.completions.map(c=>c.opportunityId),['019e6f0f-b3d6-7b5f-b2fa-08709752d809','1a1637fe-dd44-4845-b544-6908516836e3','98b4dc3d-24a0-455d-981b-08da8fc2edc0']);
 assert.deepEqual(byId.sipho.completions,[]);
 assert.deepEqual(byId.sipho.skills,[]);
 for(const p of personas){
  assert.match(p.phoneNumber,/^\+[1-9]\d{7,14}$/,p.id+' phone must be E.164');
  assert.equal(p.phoneNumberConfirmed,true);
  assert.equal(p.yoIDOnboarded,true);
  assert.ok(p.dateYoIDOnboarded&&p.dateCreated&&p.dateOfBirth&&p.country&&p.city&&p.displayName&&p.firstName&&p.trade);
  assert.equal(p.photoURL,null);
  for(const c of p.completions){
   assert.match(c.opportunityId,/^[0-9a-f-]{36}$/);
   assert.ok(c.myOpportunityId&&c.title&&c.organizationName&&c.dateCompleted);
   assert.ok(/^202[56]-/.test(c.dateCompleted),p.id+' completion dates are in 2025 or 2026');
   assert.ok(Array.isArray(c.evidenceTypes)&&Array.isArray(c.skills));
  }
  for(const s of p.skills){
   assert.ok(s.id&&s.name&&Array.isArray(s.organizations)&&s.organizations.length>0);
  }
 }
 assert.equal(ageAt(byId.thandi.dateOfBirth,NOW),24);
 assert.equal(ageAt(byId.brian.dateOfBirth,NOW),26);
 assert.equal(ageAt(byId.amara.dateOfBirth,NOW),22);
 assert.equal(ageAt(byId.sipho.dateOfBirth,NOW),19);
 assert.equal(ageAt(byId.lerato.dateOfBirth,NOW),17);
 assert.ok(byId.thandi.skills.some(s=>s.name==='Cosmetics'));
 assert.ok(byId.brian.skills.some(s=>s.name==='First Aid'));
 assert.ok(byId.amara.skills.some(s=>s.name==='Sewing'));
});

// --- sample source ---

test('createAccountSource defaults to the sample kind and lists every persona with an age',()=>{
 assert.equal(typeof createAccountSource,'function');
 const source=createAccountSource({config,yoma:fakeYoma(),now});
 assert.equal(source.kind,'sample');
 const listed=source.listPersonas();
 assert.deepEqual(listed.map(p=>p.id),['thandi','brian','amara','sipho','lerato']);
 const lerato=listed.find(p=>p.id==='lerato');
 assert.equal(lerato.age,17);
 assert.deepEqual(Object.keys(listed[0]).sort(),['age','city','displayName','id','trade']);
 assert.equal(listed[0].displayName,'Thandi Mokoena');
 assert.ok(!('phoneNumber' in listed[0]));
});

test('sample read returns the spec snapshot for Thandi with live opportunity details and evidence ids',async()=>{
 const yoma=fakeYoma();
 const source=createAccountSource({config,yoma,now});
 const snapshot=await source.read({persona:'thandi'});
 assert.equal(snapshot.source,'sample');
 assert.equal(snapshot.readAt,new Date(NOW).toISOString());
 assert.equal(snapshot.apiBase,BASE);
 assert.equal(snapshot.user.displayName,'Thandi Mokoena');
 assert.equal(snapshot.user.firstName,'Thandi');
 assert.equal(snapshot.user.phoneNumberConfirmed,true);
 assert.match(snapshot.user.phoneNumber,/^\+27\d{9}$/);
 assert.equal(snapshot.user.yoIDOnboarded,true);
 assert.equal(snapshot.user.photoURL,null);
 assert.equal(snapshot.user.country,'South Africa');
 assert.equal(snapshot.user.city,'Khayelitsha, Cape Town');
 assert.equal(snapshot.user.opportunityCountCompleted,3);
 assert.equal(snapshot.user.opportunityCountPending,0);
 assert.equal(snapshot.user.opportunityCountRejected,0);
 assert.ok(!('email' in snapshot.user));
 assert.equal(snapshot.completions.length,3);
 assert.deepEqual(snapshot.completions.map(c=>c.evidenceId),['c1','c2','c3']);
 assert.deepEqual(snapshot.completions.map(c=>c.opportunityId),[HAIR,CARE,FINLIT]);
 assert.deepEqual(yoma.calls,[HAIR,CARE,FINLIT]);
 const first=snapshot.completions[0];
 assert.equal(first.verificationStatus,'Completed');
 assert.equal(first.opportunityType,'Learning');
 assert.equal(first.title,'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro');
 assert.equal(first.organizationName,'Alison Learning');
 assert.equal(first.organizationLogoURL,'https://logo.example/alison.png');
 assert.deepEqual(first.live,{verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:0,yomaInfoURL:'https://yoma.world/opportunities/'+HAIR,published:true});
 assert.deepEqual(first.skills,[{id:'6e85a30a-008b-4340-a3de-eeb8e7f7ce88',name:'Cosmetics',infoURL:'https://lightcast.io/open-skills/skills/KS122FL69C9376N0WS3D'}]);
 const third=snapshot.completions[2];
 assert.equal(third.live.verificationMethod,'Manual');
 assert.deepEqual(third.evidenceTypes,['FileUpload']);
 assert.equal(third.organizationName,'UNICEF Kenya');
 assert.ok(snapshot.skills.length>=1);
 assert.deepEqual(snapshot.skills.map(s=>s.evidenceId),snapshot.skills.map((s,i)=>'s'+(i+1)));
 for(const s of snapshot.skills){
  assert.ok(s.id&&s.name);
  assert.ok(Array.isArray(s.organizations)&&s.organizations.every(o=>o.id&&o.name&&'logoURL' in o));
 }
});

test('sample read keeps the stored organisation and sets live null when Yoma is unreachable (Review Focus 2)',async()=>{
 const source=createAccountSource({config,yoma:fakeYoma({unavailable:true}),now});
 const snapshot=await source.read({persona:'thandi'});
 assert.equal(snapshot.completions.length,3);
 for(const c of snapshot.completions)assert.equal(c.live,null);
 assert.equal(snapshot.completions[0].organizationName,'Alison Learning');
 assert.equal(snapshot.completions[2].organizationName,'UNICEF Kenya');
 assert.equal(snapshot.completions[2].title,'Financial Literacy for Gig Workers');
 assert.deepEqual(snapshot.completions[2].evidenceTypes,['FileUpload']);
 assert.ok(snapshot.completions[0].skills.length>=1);
});

test('sample read sets live null for an unpublished opportunity (404) and keeps the rest live',async()=>{
 const info={...liveInfo};delete info[CARE];
 const source=createAccountSource({config,yoma:fakeYoma({info}),now});
 const snapshot=await source.read({persona:'thandi'});
 assert.equal(snapshot.completions[1].live,null);
 assert.equal(snapshot.completions[1].title,'Customer Care Skills and Telephone Etiquette');
 assert.equal(snapshot.completions[1].organizationName,'Alison Learning');
 assert.notEqual(snapshot.completions[0].live,null);
 assert.notEqual(snapshot.completions[2].live,null);
});

test('sample read returns the empty state for Sipho and the under-18 date for Lerato without gating',async()=>{
 const yoma=fakeYoma();
 const source=createAccountSource({config,yoma,now});
 const sipho=await source.read({persona:'sipho'});
 assert.deepEqual(sipho.completions,[]);
 assert.deepEqual(sipho.skills,[]);
 assert.equal(sipho.user.opportunityCountCompleted,0);
 assert.equal(sipho.user.yoIDOnboarded,true);
 assert.equal(sipho.user.phoneNumberConfirmed,true);
 assert.equal(yoma.calls.length,0);
 const lerato=await source.read({persona:'lerato'});
 assert.equal(ageAt(lerato.user.dateOfBirth,NOW),17);
});

test('sample read rejects an unknown persona with code unknown_persona and no Yoma call',async()=>{
 const yoma=fakeYoma();
 const source=createAccountSource({config,yoma,now});
 await assert.rejects(source.read({persona:'nobody'}),err=>err instanceof Error&&err.code==='unknown_persona');
 await assert.rejects(source.read({}),err=>err.code==='unknown_persona');
 await assert.rejects(source.read({persona:'../thandi'}),err=>err.code==='unknown_persona');
 assert.equal(yoma.calls.length,0);
});

test('sample read does not hand out references into personas.json',async()=>{
 const source=createAccountSource({config,yoma:fakeYoma(),now});
 const a=await source.read({persona:'thandi'});
 a.user.displayName='Changed';
 a.completions[0].title='Changed';
 const b=await source.read({persona:'thandi'});
 assert.equal(b.user.displayName,'Thandi Mokoena');
 assert.notEqual(b.completions[0].title,'Changed');
});

// --- token source ---

const TOKEN='tok-abc.def';
const profile={
 id:'8f0b4e9e-1b1c-4d2e-9a1f-0c0c0c0c0c0c',username:'worker@example.org',email:'worker@example.org',emailConfirmed:true,firstName:'Nomsa',surname:'Nkosi',displayName:'Nomsa Nkosi',
 phoneNumber:'+27735550199',phoneNumberConfirmed:true,countryId:'c-za',dateOfBirth:'2001-04-02T00:00:00+00:00',photoURL:'https://photos.example/nomsa.jpg',
 yoIDOnboarded:true,dateYoIDOnboarded:'2025-02-01T09:00:00+00:00',dateCreated:'2025-01-20T08:00:00+00:00',dateModified:'2026-01-01T00:00:00+00:00',
 opportunityCountSaved:2,opportunityCountPending:1,opportunityCountCompleted:2,opportunityCountRejected:0,zlto:{available:10}
};
const userSkills=[
 {id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/open-skills/skills/KS121Z26S4VJLQ1WXN21',organizations:[{id:'org-alison',name:'Alison Learning',logoId:'l1',logoURL:'https://logo.example/alison.png'}]},
 {id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS',organizations:[{id:'org-unicef-ke',name:'UNICEF Kenya',logoId:null,logoURL:null}]}
];
const myOpps={totalCount:2,items:[
 {id:'mo-1',userId:profile.id,userEmail:'worker@example.org',userPhoneNumer:'+27735550199',userDisplayName:'Nomsa Nkosi',opportunityId:CARE,opportunityTitle:'Customer Care Skills and Telephone Etiquette',opportunityType:'Learning',organizationId:'org-alison',organizationName:'Alison Learning',organizationLogoURL:'https://logo.example/alison.png',action:'Verification',verificationStatus:'Completed',dateCompleted:'2026-02-03T00:00:00+00:00',verifications:[],skills:[{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/open-skills/skills/KS121Z26S4VJLQ1WXN21'}]},
 {id:'mo-2',userId:profile.id,opportunityId:FINLIT,opportunityTitle:'Financial Literacy for Gig Workers',opportunityType:'Learning',organizationId:'org-unicef-ke',organizationName:'UNICEF Kenya',organizationLogoURL:'https://logo.example/unicef-kenya.png',action:'Verification',verificationStatus:'Completed',dateCompleted:'2025-12-10T00:00:00+00:00',verifications:[{verificationType:'FileUpload',fileId:'f1',fileURL:'https://files.example/cert.pdf'},{verificationType:'Picture',fileId:'f2',fileURL:null}],skills:[{id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS'}]}
]};
function tokenRouter(url,init){
 if(init.headers?.authorization!=='Bearer '+TOKEN&&init.headers?.Authorization!=='Bearer '+TOKEN)return json([{type:'Unauthorized'}],401);
 if(url===BASE+'/user')return json(profile);
 if(url===BASE+'/user/skills')return json(userSkills);
 if(url===BASE+'/myOpportunity/search')return json(myOpps);
 return json([{type:'EntityNotFoundException'}],404);
}
const tokenConfig={yomaBase:BASE,yomaAccessToken:TOKEN};

test('token source reads the three holder endpoints with the bearer header and maps the snapshot',async()=>{
 const fetch=fakeFetch(tokenRouter);
 const yoma=fakeYoma();
 const source=createAccountSource({config:tokenConfig,yoma,fetch,now});
 assert.equal(source.kind,'token');
 assert.deepEqual(source.listPersonas(),[]);
 const snapshot=await source.read({});
 assert.equal(fetch.calls.length,3);
 const urls=fetch.calls.map(c=>c.url);
 assert.deepEqual(urls,[BASE+'/user',BASE+'/user/skills',BASE+'/myOpportunity/search']);
 for(const call of fetch.calls){
  const h=call.init.headers;
  assert.equal(h.authorization??h.Authorization,'Bearer '+TOKEN);
  assert.equal(h['accept'],'application/json');
  assert.equal(h['user-agent'],'YoCV-prototype');
 }
 const search=fetch.calls[2];
 assert.equal(search.init.method,'POST');
 assert.equal(search.init.headers['content-type'],'application/json');
 assert.deepEqual(JSON.parse(search.init.body),{action:'Verification',verificationStatuses:['Completed'],pageNumber:1,pageSize:50});
 assert.equal((fetch.calls[0].init.method||'GET').toUpperCase(),'GET');

 assert.equal(snapshot.source,'token');
 assert.equal(snapshot.readAt,new Date(NOW).toISOString());
 assert.equal(snapshot.apiBase,BASE);
 assert.deepEqual(snapshot.user,{
  id:profile.id,displayName:'Nomsa Nkosi',firstName:'Nomsa',photoURL:'https://photos.example/nomsa.jpg',country:null,city:null,
  dateOfBirth:'2001-04-02T00:00:00+00:00',dateCreated:'2025-01-20T08:00:00+00:00',yoIDOnboarded:true,dateYoIDOnboarded:'2025-02-01T09:00:00+00:00',
  phoneNumberConfirmed:true,phoneNumber:'+27735550199',emailConfirmed:true,
  opportunityCountCompleted:2,opportunityCountPending:1,opportunityCountRejected:0
 });
 assert.equal(snapshot.completions.length,2);
 const [c1,c2]=snapshot.completions;
 assert.equal(c1.evidenceId,'c1');
 assert.equal(c1.myOpportunityId,'mo-1');
 assert.equal(c1.opportunityId,CARE);
 assert.equal(c1.title,'Customer Care Skills and Telephone Etiquette');
 assert.equal(c1.organizationName,'Alison Learning');
 assert.equal(c1.organizationLogoURL,'https://logo.example/alison.png');
 assert.equal(c1.dateCompleted,'2026-02-03T00:00:00+00:00');
 assert.equal(c1.verificationStatus,'Completed');
 assert.equal(c1.opportunityType,'Learning');
 assert.deepEqual(c1.evidenceTypes,[]);
 assert.deepEqual(c1.skills,[{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/open-skills/skills/KS121Z26S4VJLQ1WXN21'}]);
 assert.deepEqual(c1.live,{verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:0,yomaInfoURL:'https://yoma.world/opportunities/'+CARE,published:true});
 assert.equal(c2.evidenceId,'c2');
 assert.deepEqual(c2.evidenceTypes,['FileUpload','Picture']);
 assert.equal(c2.live.verificationMethod,'Manual');
 assert.deepEqual(yoma.calls,[CARE,FINLIT]);
 assert.ok(!('userEmail' in c1)&&!('userPhoneNumer' in c1)&&!('fileURL' in c2));
 assert.deepEqual(snapshot.skills,[
  {evidenceId:'s1',id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/open-skills/skills/KS121Z26S4VJLQ1WXN21',organizations:[{id:'org-alison',name:'Alison Learning',logoURL:'https://logo.example/alison.png'}]},
  {evidenceId:'s2',id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS',organizations:[{id:'org-unicef-ke',name:'UNICEF Kenya',logoURL:null}]}
 ]);
});

test('token source accepts a token in the selector, which overrides the configured one',async()=>{
 const fetch=fakeFetch(tokenRouter);
 const source=createAccountSource({config:{yomaBase:BASE,yomaAccessToken:'stale'},yoma:fakeYoma(),fetch,now});
 const snapshot=await source.read({token:TOKEN});
 assert.equal(snapshot.user.displayName,'Nomsa Nkosi');
});

test('token source maps 401 and 403 to code yoma_auth',async()=>{
 const fetch=fakeFetch(tokenRouter);
 const source=createAccountSource({config:{yomaBase:BASE,yomaAccessToken:'expired'},yoma:fakeYoma(),fetch,now});
 await assert.rejects(source.read({}),err=>err instanceof Error&&err.code==='yoma_auth'&&!(err instanceof YomaUnavailable));
 const forbidden=fakeFetch(()=>json([{type:'Forbidden'}],403));
 const s2=createAccountSource({config:tokenConfig,yoma:fakeYoma(),fetch:forbidden,now});
 await assert.rejects(s2.read({}),err=>err.code==='yoma_auth');
 const missing=createAccountSource({config:{yomaBase:BASE,yomaAccessToken:''},yoma:fakeYoma(),fetch,now});
 assert.equal(missing.kind,'sample');
});

test('token source maps network failures, 5xx and non-JSON bodies to YomaUnavailable',async()=>{
 const down=fakeFetch(()=>{throw new TypeError('fetch failed');});
 await assert.rejects(createAccountSource({config:tokenConfig,yoma:fakeYoma(),fetch:down,now}).read({}),err=>err instanceof YomaUnavailable&&err.code==='yoma_unavailable');
 const five=fakeFetch(()=>new Response('boom',{status:503}));
 await assert.rejects(createAccountSource({config:tokenConfig,yoma:fakeYoma(),fetch:five,now}).read({}),err=>err instanceof YomaUnavailable);
 const html=fakeFetch(()=>new Response('<html>Maintenance</html>',{status:200,headers:{'content-type':'text/html'}}));
 await assert.rejects(createAccountSource({config:tokenConfig,yoma:fakeYoma(),fetch:html,now}).read({}),err=>err instanceof YomaUnavailable);
 const aborted=fakeFetch(()=>{const err=new Error('timeout');err.name='TimeoutError';throw err;});
 await assert.rejects(createAccountSource({config:tokenConfig,yoma:fakeYoma(),fetch:aborted,now}).read({}),err=>err instanceof YomaUnavailable);
});

test('token source keeps completions with live null when the info endpoint is unreachable',async()=>{
 const fetch=fakeFetch(tokenRouter);
 const source=createAccountSource({config:tokenConfig,yoma:fakeYoma({unavailable:true}),fetch,now});
 const snapshot=await source.read({});
 assert.equal(snapshot.completions.length,2);
 assert.deepEqual(snapshot.completions.map(c=>c.live),[null,null]);
 assert.equal(snapshot.completions[1].organizationName,'UNICEF Kenya');
});

test('token source tolerates missing arrays and skips items that are not Completed',async()=>{
 const fetch=fakeFetch((url,init)=>{
  if(url===BASE+'/user')return json({...profile,photoURL:null,dateOfBirth:null});
  if(url===BASE+'/user/skills')return json(null);
  if(url===BASE+'/myOpportunity/search')return json({totalCount:1,items:[{...myOpps.items[0],verificationStatus:'Pending'},{...myOpps.items[1],verifications:null,skills:null}]});
  return json({},404);
 });
 const snapshot=await createAccountSource({config:tokenConfig,yoma:fakeYoma(),fetch,now}).read({});
 assert.deepEqual(snapshot.skills,[]);
 assert.equal(snapshot.completions.length,1);
 assert.equal(snapshot.completions[0].evidenceId,'c1');
 assert.equal(snapshot.completions[0].opportunityId,FINLIT);
 assert.deepEqual(snapshot.completions[0].evidenceTypes,[]);
 assert.deepEqual(snapshot.completions[0].skills,[{id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS'}]);
 assert.equal(snapshot.user.photoURL,null);
 assert.equal(snapshot.user.dateOfBirth,null);
});
