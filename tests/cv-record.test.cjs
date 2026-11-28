const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {readCvRecord,credentialSkills,issuerOf}=require('../server/cv/record.js');
const {createAccountSource}=require('../server/card/account.js');
const {loadConfig}=require('../server/config.js');
const personas=require('../server/card/personas.json');
const {NOW,fakeYoma}=require('./helpers/vouch-boot.cjs');
const now=()=>NOW;
const config={...loadConfig({env:{},cwd:fs.mkdtempSync(path.join(os.tmpdir(),'yocv-record-'))}),yomaAccessToken:''};
test('every persona carries one sample credential per completion on Yoma\'s wallet model',()=>{
  // Halima follows the shared mock data instead: her own test below.
  for(const p of personas.filter(x=>x.id!=='halima')){
    assert.equal(p.credentials.length,p.completions.length,p.id);
    p.credentials.forEach((c,i)=>{
      assert.equal(c.issuer,p.completions[i].organizationName); assert.ok(!/yoma/i.test(c.issuer)); assert.equal(c.title,p.completions[i].title);
      for(const a of c.attributes)assert.ok(['Opportunity_Skills','Opportunity_Summary'].includes(a.name),a.name);
      assert.equal(c.schemaType,'Opportunity'); assert.ok(!('verificationStatus' in c));
      const s=c.attributes.find(a=>a.name==='Opportunity_Skills');
      assert.deepEqual(s.itemsDisplay.map(x=>x.name),p.completions[i].skills.map(x=>x.name));
      for(const a of c.attributes)if(a.name!=='Opportunity_Skills')assert.equal(a.itemsDisplay,null);
    });
  }
});
test('readCvRecord reads Thandi with credentials linked by title and no email or birth date',async()=>{
  const r=await readCvRecord({accountSource:createAccountSource({config,yoma:fakeYoma(),now}),selector:{persona:'thandi'}});
  assert.equal(r.source,'sample'); assert.equal(r.fictional,true); assert.equal(r.wallet,'sample');
  assert.deepEqual(r.credentials[1],{id:'w2',walletId:'sample-cred-thandi-2',title:'Customer Care Skills and Telephone Etiquette',issuer:'Alison Learning',dateIssued:'2025-10-06T11:05:00+00:00',month:'October 2025',skills:['Customer Service'],completionId:'c2'});
  assert.deepEqual(Object.keys(r.user).sort(),['city','displayName','firstName','id','phoneNumber']);
});
test('credentialSkills reads itemsDisplay once per name and never splits valueDisplay',()=>{
  assert.deepEqual(credentialSkills({attributes:[{name:'Opportunity_Skills',valueDisplay:'A, B',itemsDisplay:[{name:'A, B'},{name:'A, B'},{name:'C'}]},{name:'MyOpportunity_Skills',valueDisplay:'D',itemsDisplay:[{name:'D'}]}]}),['A, B','C']);
  assert.deepEqual(credentialSkills({attributes:[{name:'Opportunity_Skills',valueDisplay:'n/a',itemsDisplay:[]}]}),[]);
});
test('issuerOf never prints Yoma as the issuer',()=>{
  assert.equal(issuerOf({issuer:'Atingi',attributes:[]}),'Atingi');
  assert.equal(issuerOf({issuer:'Yoma (Youth Agency Marketplace)',attributes:[]}),null);
});
// A fake Yoma account API for token mode, routed by method and path. The first three routes are the calls today's
// readToken in server/card/account.js makes: GET /user, GET /user/skills, POST /myOpportunity/search. Then the wallet
// and self-attested calls.
const attr=(name,nameDisplay,valueDisplay,itemsDisplay=null)=>({name,nameDisplay,valueDisplay,group:null,subGroup:null,sortOrder:null,itemsDisplay});
const CARE_SKILL={id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/open-skills/skills/KS121Z26S4VJLQ1WXN21'};
const credInfo=(id,title,status)=>({id,artifactType:'JWS',schemaType:'Opportunity',typeContext:'Learning',status,issuer:'Sample Org',issuerLogoURL:null,title,dateIssued:'2025-06-02T10:00:00+00:00'});
const credDetail=(id,title,status)=>({...credInfo(id,title,status),attributes:[attr('Opportunity_Skills','Skills','Customer Service',[{name:'Customer Service'}]),
  attr('MyOpportunity_UserDisplayName','Name','Cred Holder Name'),attr('MyOpportunity_Location','Location','Cred Holder Town')]});
const TOKEN_ROUTES={
  'GET /user':{id:'token-user-1',firstName:'Sample',displayName:'Sample Holder',city:'Sample Town',phoneNumber:null,opportunityCountCompleted:1},
  'GET /user/skills':[],
  'GET /user/skills?type=SelfAttested':[],
  'POST /myOpportunity/search':{totalCount:1,items:[{id:'my-opp-1',opportunityId:'sample-opp-1',opportunityTitle:'Sample Course',organizationName:'Sample Org',organizationLogoURL:null,
    dateCompleted:'2025-06-02T10:00:00+00:00',opportunityType:'Learning',verificationStatus:'Completed',skills:[CARE_SKILL],verifications:[]}]},
  'POST /ssi/wallet/user/search':{totalCount:2,items:[credInfo('cred-1','Sample Course','Issued'),credInfo('cred-2','Old Course','Revoked')]},
  'POST /ssi/wallet/user/cred-1':credDetail('cred-1','Sample Course','Issued'),
  'POST /ssi/wallet/user/cred-2':credDetail('cred-2','Old Course','Revoked')
};
function tokenFetch({walletStatus=200}={}){
  const calls=[];
  const fetch=async(url,init={})=>{
    const u=new URL(url),key=(init.method||'GET')+' '+u.pathname.replace(/^\/api\/v3/,'')+u.search;
    calls.push({key,body:init.body});
    const body=TOKEN_ROUTES[key];
    if(key==='POST /ssi/wallet/user/search'&&walletStatus!==200)return new Response('{}',{status:walletStatus});
    return body?new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}}):new Response('{}',{status:404});
  };
  return {fetch,calls};
}
const tokenSource=fetch=>createAccountSource({config:{...config,yomaAccessToken:'test-token'},yoma:fakeYoma(),fetch,now});
test('token mode reads the wallet: search, then one detail call per credential',async()=>{
  const {fetch,calls}=tokenFetch();
  const r=await readCvRecord({accountSource:tokenSource(fetch),selector:{}});
  assert.deepEqual(calls.slice(0,3).map(c=>c.key),['GET /user','GET /user/skills','POST /myOpportunity/search']);
  assert.equal(r.source,'token'); assert.equal(r.fictional,false); assert.equal(r.wallet,'available');
  assert.deepEqual(JSON.parse(calls.find(c=>c.key==='POST /ssi/wallet/user/search').body),{schemaType:'Opportunity',pageNumber:1,pageSize:50});
  assert.ok(calls.some(c=>c.key==='POST /ssi/wallet/user/cred-1'));
  assert.deepEqual(r.credentials,[{id:'w1',walletId:'cred-1',title:'Sample Course',issuer:'Sample Org',dateIssued:'2025-06-02T10:00:00+00:00',month:'June 2025',skills:['Customer Service'],completionId:'c1'}]);
  for(const pii of ['MyOpportunity_UserDisplayName','Cred Holder Name','MyOpportunity_Location','Cred Holder Town'])assert.ok(!JSON.stringify(r).includes(pii),pii);
});
test('token mode keeps only Issued credentials; a revoked one is left out',async()=>{
  const {fetch}=tokenFetch();
  const r=await readCvRecord({accountSource:tokenSource(fetch),selector:{}});
  assert.ok(!r.credentials.some(c=>c.walletId==='cred-2'));
  assert.deepEqual(r.credentialsLeftOut,[{walletId:'cred-2',title:'Old Course',status:'Revoked'}]);
});
test('token mode: SSI not enabled (503) gives Wallet not available, not an error',async()=>{
  const {fetch}=tokenFetch({walletStatus:503});
  const r=await readCvRecord({accountSource:tokenSource(fetch),selector:{}});
  assert.equal(r.wallet,'unavailable'); assert.deepEqual(r.credentials,[]); assert.equal(r.completions.length,1);
});
test('a sample credential still links when Yoma serves a longer live title, and Amara carries one self-attested skill',async()=>{
  const yoma={...fakeYoma(),async opportunityInfo(id){const {item}=await fakeYoma().opportunityInfo(id);return {item:item&&{...item,title:'New: '+item.title},source:'live'};}};
  const r=await readCvRecord({accountSource:createAccountSource({config,yoma,now}),selector:{persona:'amara'}});
  assert.ok(r.completions[0].title.startsWith('New: '));
  assert.deepEqual(r.credentials.map(c=>c.completionId),['c1','c2','c3']);
  assert.deepEqual(r.selfAttested,[{evidenceId:'a1',id:'081d98d0-2094-449c-ab92-139cda908d36',name:'Pattern Making',infoURL:'https://lightcast.io/open-skills/skills/KS127LX759Q0BR1BYR7K'}]);
  assert.deepEqual(r.credentialsLeftOut,[]);
});

// The team's shared person (shared mock data, 2026-11-25): the same courses, credentials and ids in all four prototypes.
test('readCvRecord reads Halima as the shared mock data has her',async()=>{
  const r=await readCvRecord({accountSource:createAccountSource({config,yoma:fakeYoma(),now}),selector:{persona:'halima'}});
  assert.equal(r.user.displayName,'Halima Yusuf'); assert.equal(r.user.city,'Kaduna North, Kaduna State');
  assert.deepEqual(r.completions.map(c=>c.title),['Customer Service Basics','Digital Literacy Essentials','Community Tree Planting Day','Working Safely at Height','Solar PV Installation Basics']);
  assert.ok(r.completions.every(c=>c.opportunityId===null),'fictional, so no Yoma opportunity id');
  assert.deepEqual(r.credentials.map(c=>c.walletId),['cred-005','cred-001','cred-004','cred-003','cred-002']);
  const skill=r.credentials.find(c=>c.walletId==='cred-002');
  assert.equal(skill.title,'Solar PV Installation Basics: practical challenge passed','the contract and SkillLens title'); assert.equal(skill.issuer,'SkillLens');
  assert.equal(skill.completionId,null,'the Skill Credential stands on its own, not on a course');
  assert.deepEqual(skill.skills,['Photovoltaic Systems','Solar Panels']);
  assert.equal(r.credentials.find(c=>c.walletId==='cred-003').completionId,r.completions[3].evidenceId);
  assert.deepEqual(r.selfAttested.map(s=>s.name),['Mobile Device Troubleshooting']);
});
