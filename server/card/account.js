'use strict';
/* YoCard account sources (spec §3.2): everything the card renders from comes through one snapshot shape
   (spec §3.1), whichever source produced it.
     sample  the fictional personas in personas.json (default). Opportunity details on each completion are
             read live from Yoma's anonymous /opportunity/{id}/info; the stored copy is the fallback when
             Yoma is unreachable or the opportunity is unpublished, and `live` is then null.
     token   a real Yoma account read with a bearer token (config.yomaAccessToken or selector.token):
             GET /user, GET /user/skills, POST /myOpportunity/search. 401/403 map to code `yoma_auth`;
             network failures, 5xx and non-JSON bodies to YomaUnavailable.
   The snapshot keeps dateOfBirth (the route applies the age gate) and the full phone number (the route masks
   it); it never carries the account's email address. Evidence ids are c1..cn and s1..sn in order. */

const {YomaUnavailable}=require('../yoma.js');
const PERSONAS=require('./personas.json');

const USER_AGENT='YoCV-prototype';
const DEFAULT_API_BASE='https://api.yoma.world/api/v3';
const PERSONA_ID=/^[a-z][a-z0-9-]{0,31}$/;
const MESSAGES={
  unknown_persona:'Choose one of the sample accounts.',
  yoma_auth:'Yoma rejected the access token. Refresh YOMA_ACCESS_TOKEN on the server; sample mode still works.',
  yoma_bad_request:'Yoma rejected the account request (400).'
};

function coded(code,message=MESSAGES[code]){const err=new Error(message);err.code=code;return err;}
function isUnavailable(err){return err?.code==='yoma_unavailable'||err?.name==='YomaUnavailable';}
function str(value){return value==null?null:String(value);}
function bool(value){return value===true;}
function count(value){return Number.isInteger(value)&&value>=0?value:0;}
function list(value){return Array.isArray(value)?value:[];}
function toDate(value){
  if(typeof value==='function')value=value();
  if(value instanceof Date)return value;
  if(typeof value==='number')return new Date(value);
  if(typeof value==='string'&&value.trim())return new Date(value);
  return new Date(NaN);
}

// Whole years between a date of birth and `now` (ms, Date, ISO string or clock function), in UTC.
// null when the date of birth is missing or unparseable.
function ageAt(dateOfBirth,now=Date.now){
  if(dateOfBirth==null||String(dateOfBirth).trim()==='')return null;
  const dob=new Date(dateOfBirth),at=toDate(now);
  if(Number.isNaN(dob.getTime())||Number.isNaN(at.getTime()))return null;
  let age=at.getUTCFullYear()-dob.getUTCFullYear();
  const beforeBirthday=at.getUTCMonth()<dob.getUTCMonth()||(at.getUTCMonth()===dob.getUTCMonth()&&at.getUTCDate()<dob.getUTCDate());
  if(beforeBirthday)age--;
  return age;
}

function mapSkill(skill){return {id:str(skill?.id),name:str(skill?.name),infoURL:str(skill?.infoURL)};}
function mapOrganisation(org){return {id:str(org?.id),name:str(org?.name),logoURL:str(org?.logoURL)};}
function mapAccountSkill(skill,index){
  return {evidenceId:'s'+(index+1),...mapSkill(skill),organizations:list(skill?.organizations).map(mapOrganisation)};
}
function liveOf(item){
  if(!item)return null;
  return {
    verificationMethod:str(item.verificationMethod),
    verificationTypes:list(item.verificationTypes).map(t=>({type:str(t?.type),displayName:str(t?.displayName),description:str(t?.description)})),
    participantCountCompleted:count(item.participantCountCompleted),
    yomaInfoURL:str(item.yomaInfoURL),
    published:bool(item.published)
  };
}

function createAccountSource({config,yoma,fetch=globalThis.fetch,now=Date.now,personas=PERSONAS,timeoutMs=10000}={}){
  const token=String(config?.yomaAccessToken??'').trim();
  const kind=token?'token':'sample';
  const apiBase=String(config?.yomaBase||yoma?.baseUrl||DEFAULT_API_BASE).replace(/\/+$/,'');
  const readAt=()=>new Date(toDate(now)).toISOString();

  // Opportunity details from Yoma for one completion. `stored` is the account's own copy (persona file or
  // myOpportunity item). Live wins for the opportunity's public attributes (title, organisation, logo) and
  // the stored copy is their fallback. Evidence types are only ever the account's own record of what was
  // submitted (never padded from the opportunity's configured verification types); awarded skills come from
  // the account and fall back to the opportunity's skill list.
  async function enrich(stored,index){
    let item=null;
    if(yoma&&typeof yoma.opportunityInfo==='function'){
      try{item=(await yoma.opportunityInfo(stored.opportunityId))?.item??null;}
      catch(err){if(!isUnavailable(err))throw err;item=null;}
    }
    const storedSkills=list(stored.skills).map(mapSkill);
    return {
      evidenceId:'c'+(index+1),
      myOpportunityId:str(stored.myOpportunityId),
      opportunityId:str(stored.opportunityId),
      title:str(item?.title??stored.title),
      organizationName:str(item?.organizationName??stored.organizationName),
      organizationLogoURL:str(item?.organizationLogoURL??stored.organizationLogoURL),
      dateCompleted:str(stored.dateCompleted),
      verificationStatus:'Completed',
      opportunityType:str(stored.opportunityType??item?.type??'Learning'),
      skills:storedSkills.length?storedSkills:list(item?.skills).map(mapSkill),
      evidenceTypes:list(stored.evidenceTypes).map(str).filter(Boolean),
      live:liveOf(item)
    };
  }
  const enrichAll=(completions)=>Promise.all(completions.map((c,i)=>enrich(c,i)));

  function listPersonas(){
    if(kind!=='sample')return [];
    const at=toDate(now);
    return personas.map(p=>({id:p.id,displayName:p.displayName,trade:p.trade,city:p.city,age:ageAt(p.dateOfBirth,at)}));
  }

  async function readPersona(id){
    const wanted=typeof id==='string'&&PERSONA_ID.test(id)?id:null;
    const persona=wanted?personas.find(p=>p.id===wanted):null;
    if(!persona)throw coded('unknown_persona');
    const completions=await enrichAll(list(persona.completions));
    return {
      source:'sample',
      readAt:readAt(),
      apiBase,
      user:{
        id:str(persona.userId),
        displayName:str(persona.displayName),
        firstName:str(persona.firstName??String(persona.displayName??'').split(/\s+/)[0]),
        photoURL:str(persona.photoURL),
        country:str(persona.country),
        city:str(persona.city),
        dateOfBirth:str(persona.dateOfBirth),
        dateCreated:str(persona.dateCreated),
        yoIDOnboarded:bool(persona.yoIDOnboarded),
        dateYoIDOnboarded:str(persona.dateYoIDOnboarded),
        phoneNumberConfirmed:bool(persona.phoneNumberConfirmed),
        phoneNumber:str(persona.phoneNumber),
        emailConfirmed:bool(persona.emailConfirmed),
        opportunityCountCompleted:completions.length,
        opportunityCountPending:0,
        opportunityCountRejected:0
      },
      completions,
      skills:list(persona.skills).map(mapAccountSkill)
    };
  }

  // One authenticated request to a holder-only endpoint. Static messages only: the token never leaves this
  // function except inside the Authorization header, and response bodies are never embedded in errors.
  async function holderRequest(method,path,body,bearer){
    const headers={'accept':'application/json','user-agent':USER_AGENT,'authorization':'Bearer '+bearer};
    const serialised=body===undefined?undefined:JSON.stringify(body);
    if(serialised!==undefined)headers['content-type']='application/json';
    let response;
    try{
      response=await fetch(apiBase+path,{method,headers,body:serialised,signal:AbortSignal.timeout(timeoutMs)});
    }catch(err){
      throw new YomaUnavailable('Yoma could not be reached ('+(err?.name==='TimeoutError'?'timeout':'network error')+')');
    }
    if(response.status===401||response.status===403)throw coded('yoma_auth');
    if(response.status===400)throw coded('yoma_bad_request');
    if(response.status<200||response.status>=300)throw new YomaUnavailable('Yoma could not be reached (HTTP '+response.status+')');
    let data;
    try{data=JSON.parse(await response.text());}
    catch{throw new YomaUnavailable('Yoma could not be reached (non-JSON body)');}
    return data;
  }

  async function readToken(bearer){
    if(!bearer)throw coded('yoma_auth');
    const profile=await holderRequest('GET','/user',undefined,bearer);
    const userSkills=await holderRequest('GET','/user/skills',undefined,bearer);
    const search=await holderRequest('POST','/myOpportunity/search',{action:'Verification',verificationStatuses:['Completed'],pageNumber:1,pageSize:50},bearer);
    const items=list(search?.items).filter(item=>item&&typeof item==='object'&&item.verificationStatus==='Completed');
    const completions=await enrichAll(items.map(item=>({
      myOpportunityId:item.id,
      opportunityId:item.opportunityId,
      title:item.opportunityTitle,
      organizationName:item.organizationName,
      organizationLogoURL:item.organizationLogoURL,
      dateCompleted:item.dateCompleted,
      opportunityType:item.opportunityType,
      skills:list(item.skills),
      evidenceTypes:list(item.verifications).map(v=>v?.verificationType)
    })));
    const displayName=str(profile?.displayName);
    return {
      source:'token',
      readAt:readAt(),
      apiBase,
      user:{
        id:str(profile?.id),
        displayName,
        firstName:str(profile?.firstName??String(displayName??'').split(/\s+/)[0]??null),
        photoURL:str(profile?.photoURL),
        country:str(profile?.country),
        city:str(profile?.city),
        dateOfBirth:str(profile?.dateOfBirth),
        dateCreated:str(profile?.dateCreated),
        yoIDOnboarded:bool(profile?.yoIDOnboarded),
        dateYoIDOnboarded:str(profile?.dateYoIDOnboarded),
        phoneNumberConfirmed:bool(profile?.phoneNumberConfirmed),
        phoneNumber:str(profile?.phoneNumber),
        emailConfirmed:bool(profile?.emailConfirmed),
        opportunityCountCompleted:count(profile?.opportunityCountCompleted),
        opportunityCountPending:count(profile?.opportunityCountPending),
        opportunityCountRejected:count(profile?.opportunityCountRejected)
      },
      completions,
      skills:list(userSkills).filter(s=>s&&typeof s==='object').map(mapAccountSkill)
    };
  }

  async function read(selector={}){
    const explicit=typeof selector?.token==='string'?selector.token.trim():'';
    if(explicit||kind==='token')return readToken(explicit||token);
    return readPersona(selector?.persona);
  }

  return {kind,apiBase,listPersonas,read};
}

module.exports={createAccountSource,ageAt,MESSAGES};
