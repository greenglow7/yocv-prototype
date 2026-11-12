'use strict';
/* Yoma public API client (api.yoma.world v3): unauthenticated, read-only, with a TTL cache.
   Every request carries `accept: application/json` and a non-default user agent, which Yoma requires.
   Query strings sent as nameContains/valueContains must be 3 to 50 characters; shorter or longer
   values are never sent. A Yoma 400 is a programming error on our side and is surfaced as such;
   anything else that stops us reading JSON falls back to the stale cache entry when there is one. */

const QUERY_MIN=3,QUERY_MAX=50;
const USER_AGENT='YoCV-prototype';

class YomaUnavailable extends Error{
  constructor(message='Yoma could not be reached'){super(message);this.name='YomaUnavailable';this.code='yoma_unavailable';}
}

function badRequest(message){const err=new Error(message);err.code='yoma_bad_request';return err;}
function queryOk(value){const s=String(value??'').trim();return s.length>=QUERY_MIN&&s.length<=QUERY_MAX?s:null;}
function pick(obj,keys){const out={};for(const k of keys)out[k]=obj?.[k]??null;return out;}
function mapSkill(skill){return pick(skill,['id','name','infoURL']);}
function mapOpportunity(item){
  const out=pick(item,['id','title','organizationName','organizationLogoURL','summary','yomaInfoURL','commitmentIntervalDescription','difficulty']);
  out.skills=Array.isArray(item?.skills)?item.skills.map(mapSkill):[];
  out.zltoReward=item?.zltoReward??null;
  out.isCompletable=item?.isCompletable===true;
  return out;
}
function listOf(data){return Array.isArray(data)?data:Array.isArray(data?.items)?data.items:[];}
const OPPORTUNITY_ID=/^[0-9a-f-]{36}$/;
function mapOpportunityInfo(item){
  const out=pick(item,['id','title','organizationName','organizationLogoURL','type','verificationMethod','yomaInfoURL']);
  out.verificationEnabled=item?.verificationEnabled===true;
  out.verificationTypes=Array.isArray(item?.verificationTypes)?item.verificationTypes.map(t=>pick(t,['type','displayName','description'])):[];
  out.participantCountCompleted=Number.isFinite(item?.participantCountCompleted)?item.participantCountCompleted:0;
  out.published=item?.published===true;
  out.isCompletable=item?.isCompletable===true;
  out.skills=Array.isArray(item?.skills)?item.skills.map(mapSkill):[];
  return out;
}

function createYomaClient({baseUrl,fetch=globalThis.fetch,now=Date.now,ttlMs=3600000,reachTtlMs=300000,timeoutMs=10000}={}){
  if(!baseUrl)throw new Error('createYomaClient needs a baseUrl');
  const base=String(baseUrl).replace(/\/+$/,'');
  const cache=new Map();
  let reach=null;

  async function readJSON(response){
    const text=await response.text();
    try{return {ok:true,data:JSON.parse(text)};}catch{return {ok:false};}
  }

  // Returns {data, source:'live'|'cache'}. `force` skips the fresh-cache read (used by reachable()).
  // `notFoundIsNull` turns a 404 into a cached `data: null` instead of a stale-or-throw failure.
  async function request(method,path,body,{ttl=ttlMs,force=false,notFoundIsNull=false}={}){
    const url=base+path;
    const serialised=body===undefined?'':JSON.stringify(body);
    const key=method+' '+url+' '+serialised;
    const entry=cache.get(key);
    if(!force&&entry&&now()-entry.at<ttl)return {data:entry.data,source:'cache'};
    const fallback=(reason)=>{
      if(entry)return {data:entry.data,source:'cache'};
      throw new YomaUnavailable('Yoma could not be reached ('+reason+')');
    };
    const headers={'accept':'application/json','user-agent':USER_AGENT};
    if(body!==undefined)headers['content-type']='application/json';
    let response;
    try{
      response=await fetch(url,{method,headers,body:body===undefined?undefined:serialised,signal:AbortSignal.timeout(timeoutMs)});
    }catch(err){return fallback(err?.name==='TimeoutError'?'timeout':'network error');}
    if(response.status===400)throw badRequest('Yoma rejected the request to '+path+' (400): check query parameters');
    if(response.status===404&&notFoundIsNull){cache.set(key,{data:null,at:now()});return {data:null,source:'live'};}
    if(response.status<200||response.status>=300)return fallback('HTTP '+response.status);
    const parsed=await readJSON(response);
    if(!parsed.ok)return fallback('non-JSON body');
    cache.set(key,{data:parsed.data,at:now()});
    return {data:parsed.data,source:'live'};
  }

  async function skillByName(name){
    const query=queryOk(name);
    if(!query)return {item:null,source:'live'};
    const {data,source}=await request('GET','/lookup/skill?nameContains='+encodeURIComponent(query)+'&pageNumber=1&pageSize=20');
    const wanted=query.toLowerCase();
    const match=listOf(data).find(s=>String(s?.name??'').trim().toLowerCase()===wanted);
    return {item:match?mapSkill(match):null,source};
  }

  async function opportunityTypes({force=false}={}){
    const {data,source}=await request('GET','/opportunity/type',undefined,{force});
    return {items:listOf(data).map(t=>({id:t?.id??null,name:t?.name??null})),source};
  }

  async function learningTypeId(){
    const {items}=await opportunityTypes();
    const learning=items.find(t=>t.name==='Learning');
    if(!learning)throw badRequest('Yoma opportunity types do not include a "Learning" type');
    return learning.id;
  }

  async function searchLearningOpportunities(phrase){
    const query=queryOk(phrase);
    if(!query)return {items:[],totalCount:0,source:'live'};
    const typeId=await learningTypeId();
    const {data,source}=await request('POST','/opportunity/search',{pageNumber:1,pageSize:12,valueContains:query,types:[typeId]});
    const items=listOf(data).map(mapOpportunity);
    const totalCount=Number.isFinite(data?.totalCount)?data.totalCount:items.length;
    return {items,totalCount,source};
  }

  // Anonymous opportunity details (YoCard): `item: null` when the id is malformed (no request) or the
  // opportunity is not published (404, cached). Other failures follow the stale-or-throw rule above.
  async function opportunityInfo(id){
    if(!OPPORTUNITY_ID.test(String(id??'')))return {item:null,source:'live'};
    const {data,source}=await request('GET','/opportunity/'+id+'/info',undefined,{notFoundIsNull:true});
    return {item:data&&typeof data==='object'?mapOpportunityInfo(data):null,source};
  }

  async function reachable(){
    if(reach&&now()-reach.at<reachTtlMs)return reach.value;
    let value=false;
    try{value=(await opportunityTypes({force:true})).source==='live';}catch{value=false;}
    reach={value,at:now()};
    return value;
  }

  return {skillByName,opportunityTypes,learningTypeId,searchLearningOpportunities,opportunityInfo,reachable,baseUrl:base};
}

module.exports={createYomaClient,YomaUnavailable};
