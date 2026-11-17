'use strict';
// YoVouch test boot (plan Task 3): a server on a temp card directory at the spec clock, sample personas, the
// template draft, and a fake Yoma that answers every persona opportunity id as published.
const {after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const core=require('../../core.js');
const {createApp}=require('../../server.js');
const {loadConfig}=require('../../server/config.js');
const {createAccountSource}=require('../../server/card/account.js');
const {createCardStore}=require('../../server/card/store.js');
const {loadOrCreateKey}=require('../../server/card/sign.js');
const personas=require('../../server/card/personas.json');
const roleSkills=require('../../data/role-skills.json');

const NOW=Date.parse('2026-11-16T14:40:12Z');
const PUBLIC_URL='https://yocard.example';
const rootDir=path.join(__dirname,'..','..');
const servers=[];
after(()=>{for(const s of servers){s.closeAllConnections();s.close();}});

const INFO={};
for(const p of personas)for(const c of p.completions||[])INFO[c.opportunityId]={id:c.opportunityId,title:c.title,organizationName:c.organizationName,organizationLogoURL:c.organizationLogoURL??null,type:c.opportunityType||'Learning',verificationEnabled:true,verificationMethod:c.verificationMethod||'Automatic',verificationTypes:[],participantCountCompleted:3,yomaInfoURL:'https://app.yoma.world/opportunities/'+c.opportunityId,published:true,isCompletable:true,skills:c.skills||[]};
function fakeYoma(){
 return {baseUrl:'https://api.yoma.test/api/v3',
  async opportunityInfo(id){const item=INFO[id];return {item:item?JSON.parse(JSON.stringify(item)):null,source:'live'};},
  async reachable(){return true;},async skillByName(){return {item:null,source:'live'};},async searchLearningOpportunities(){return {items:[],totalCount:0,source:'live'};}};
}

async function bootVouch({env={},provider=null,clock={t:NOW},outbox}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yovouch-'));
 const now=()=>clock.t;
 const config={...loadConfig({env,cwd:dir}),provider:'local',model:null,azure:null,openai:null,port:0,host:'127.0.0.1',yomaAccessToken:'',publicUrl:PUBLIC_URL};
 // env keys named like config.yovouch fields ({sim:true}, {gatewaySecret:'s3cret'}) override its defaults.
 config.yovouch={...config.yovouch,...Object.fromEntries(Object.entries(env).filter(([k])=>Object.hasOwn(config.yovouch,k)))};
 const yoma=fakeYoma();
 const store=createCardStore(dir,{now});
 const key=loadOrCreateKey(dir);
 const card={accountSource:createAccountSource({config,yoma,now}),store,key,outbox};
 const server=createApp({config,provider,yoma,roleSkills,core,rootDir,card,publicUrl:PUBLIC_URL,now});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 servers.push(server);
 return {base:'http://127.0.0.1:'+server.address().port,server,store,key,dir,vouch:server.card.vouch,clock};
}

async function raw(base,route,payload){return fetch(base+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});}
async function post(base,route,payload){return (await raw(base,route,payload)).json();}
async function ok(res){const text=await res.text();assert.equal(res.status,200,text);return JSON.parse(text);}
async function page(base,route){return (await fetch(base+route)).text();}
async function get(base,route){return (await fetch(base+route)).json();}
async function form(base,route,fields,{cookie}={}){
 const headers={'content-type':'application/x-www-form-urlencoded'};
 if(cookie)headers.cookie=cookie;
 return (await fetch(base+route,{method:'POST',headers,body:new URLSearchParams(fields).toString()})).text();
}

// Connect, draft and publish a persona over HTTP, disclosing every completion and skill.
async function publishPersona(base,personaId,{trade,area}={}){
 const persona=personas.find(p=>p.id===personaId);
 assert.ok(persona,'unknown persona '+personaId);
 const where=area||persona.city;
 const description='I do '+persona.tradeLabel.toLowerCase()+' work in '+where+'. Careful and on time.';
 const {draftToken,snapshot}=await ok(await raw(base,'/api/card/account',{persona:personaId}));
 trade=trade||persona.trade;
 const draft=await ok(await raw(base,'/api/card/draft',{draftToken,trade,description,mode:'sample'}));
 const selfDeclared={...draft.selfDeclared};
 if(area)selfDeclared.area=area;
 const json=await ok(await raw(base,'/api/card/publish',{draftToken,trade,description,selfDeclared,confirms:draft.confirms,
  disclose:{completions:snapshot.completions.map(c=>c.evidenceId),skills:snapshot.skills.map(s=>s.evidenceId),photo:false,whatsapp:false},consent:true}));
 return {cardId:json.cardId,cardToken:json.cardToken,smsId:json.smsId,myUrl:json.myUrl,code:json.code,ownerSecret:json.ownerSecret};
}

module.exports={NOW,PUBLIC_URL,bootVouch,publishPersona,post,form,page,get};
