'use strict';
/* Generation pipeline (spec §3.2 steps 2 to 5, §4 success shape).
   1. Build the Yoma skill menu for the role (buildSkillMenu).
   2. Call the provider with only role, context, dates, experience and the menu. Profile fields never leave this server.
   3. Truncate to 4 experience bullets and 3 skills (extras recorded as over_limit), then run every claim through
      the grounding validators and dedupe. Rejected claims are dropped and recorded, never silently.
   4. Assemble claims in the core.js claim shape, experience first, then skills.
   Provider failures (ProviderError) propagate untouched so the route can map them to the §4 error table. */

const {quoteInSource,noInventedNumbers,lengthOk,noBannedClaims,resolveSkill,dedupe}=require('./validate.js');
const {ProviderError}=require('./providers/errors.js');

const MAX_EXPERIENCE=4;
const MAX_SKILLS=3;
const CREDENTIAL_LIKE=/certif|licens|diploma|degree/i;

function str(value){return value==null?'':String(value);}
function isPlainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function isUnavailable(err){return err?.code==='yoma_unavailable'||err?.name==='YomaUnavailable';}
function menuEntry(item){return {id:item.id,name:item.name,infoURL:item.infoURL??null};}

async function buildSkillMenu(role,{yoma,roleSkills}={}){
  const names=Array.isArray(roleSkills?.[role]?.skillNames)?roleSkills[role].skillNames:[];
  if(!names.length||!yoma||typeof yoma.skillByName!=='function')return {menu:[],source:'none'};
  const results=await Promise.allSettled(names.map(name=>yoma.skillByName(name)));
  const menu=[],seen=new Set();
  let answered=0,fromCache=false;
  for(const result of results){
    if(result.status==='rejected'){
      if(isUnavailable(result.reason))continue;
      throw result.reason; // yoma_bad_request or an unexpected failure is a programming error: surface it
    }
    answered++;
    const {item,source}=result.value||{};
    if(source==='cache')fromCache=true;
    if(!item||!item.id||!item.name)continue;
    if(CREDENTIAL_LIKE.test(item.name))continue;
    if(seen.has(item.id))continue;
    seen.add(item.id);
    menu.push(menuEntry(item));
  }
  if(!answered)return {menu:[],source:'none'};
  return {menu,source:fromCache?'cache':'live'};
}

function cleanInput(input){
  return {role:str(input?.role),experience:str(input?.experience),context:str(input?.context),dates:str(input?.dates)};
}

// Splits a provider list into the first `limit` items and `over_limit` rejections for the rest.
function truncate(list,limit,kind,textOf){
  const kept=list.slice(0,limit);
  const rejected=list.slice(limit).map(item=>({kind,text:textOf(item),reason:'over_limit'}));
  return {kept,rejected};
}

function wellFormed(item,fields){
  return isPlainObject(item)&&fields.every(field=>typeof item[field]==='string');
}

// `core` is accepted for interface symmetry with the plan; the pipeline itself needs only the provider
// (the local provider already wraps core.localExperienceClaims).
async function runGeneration({input,provider,yoma,roleSkills,core,now=Date.now,signal}={}){
  if(!provider||typeof provider.generate!=='function')throw new ProviderError('provider_not_configured');
  return run({input:cleanInput(input),provider,yoma,roleSkills,now,signal});
}

async function run({input,provider,yoma,roleSkills,now,signal}){
  const started=now();
  const {role,experience,context,dates}=input;
  const {menu,source:skillMenuSource}=await buildSkillMenu(role,{yoma,roleSkills});
  const providerInput={role,experience,context,dates,skillMenu:menu.map(entry=>({...entry})),menuNames:menu.map(entry=>entry.name)};
  const result=await provider.generate(providerInput,{signal});
  const output=result?.output;
  if(!isPlainObject(output)||!Array.isArray(output.experience)||(output.skills!==undefined&&!Array.isArray(output.skills))){
    throw new ProviderError('provider_bad_output',undefined,{retryable:true});
  }
  const rejected=[];
  const sources={experience,context,dates};
  const bulletText=item=>isPlainObject(item)?str(item.text):'';
  const skillText=item=>isPlainObject(item)?str(item.name):'';

  // Experience bullets: truncate, validate each, dedupe.
  const bullets=truncate(output.experience,MAX_EXPERIENCE,'experience',bulletText);
  rejected.push(...bullets.rejected);
  const validBullets=[];
  for(const item of bullets.kept){
    if(!wellFormed(item,['text','sourceQuote'])){rejected.push({kind:'experience',text:bulletText(item),reason:'malformed'});continue;}
    const text=item.text.trim();
    const checks=[lengthOk(text),quoteInSource(item.sourceQuote,experience),noInventedNumbers(text,sources),noBannedClaims(text)];
    const failed=checks.find(check=>!check.ok);
    if(failed){rejected.push({kind:'experience',text:item.text,reason:failed.reason});continue;}
    validBullets.push({text,sourceQuote:item.sourceQuote,reason:str(item.reason)});
  }
  const dedupedBullets=dedupe(validBullets);
  rejected.push(...dedupedBullets.rejected.map(({text,reason})=>({kind:'experience',text,reason})));

  // Skills: truncate, resolve against the Yoma menu, check the quote, dedupe by menu entry.
  const skills=truncate(Array.isArray(output.skills)?output.skills:[],MAX_SKILLS,'skill',skillText);
  rejected.push(...skills.rejected);
  const validSkills=[];
  for(const item of skills.kept){
    if(!wellFormed(item,['name','sourceQuote'])){rejected.push({kind:'skill',text:skillText(item),reason:'malformed'});continue;}
    const entry=resolveSkill(item.name,menu);
    if(!entry){rejected.push({kind:'skill',text:item.name,reason:'skill_not_in_menu'});continue;}
    const quote=quoteInSource(item.sourceQuote,experience);
    if(!quote.ok){rejected.push({kind:'skill',text:item.name,reason:quote.reason});continue;}
    validSkills.push({text:entry.name,yomaSkill:{...entry},sourceQuote:item.sourceQuote,reason:str(item.reason)});
  }
  const dedupedSkills=dedupe(validSkills);
  rejected.push(...dedupedSkills.rejected.map(({text,reason})=>({kind:'skill',text,reason})));
  if(!menu.length)rejected.push({kind:'skill',text:'',reason:'yoma_skill_menu_unavailable'});

  const generated=provider.name==='local'?'local':'model';
  const base={sourceId:'experience',sourceLabel:context||'Your experience',sourceText:experience,category:'self',originalCategory:'self',context,dates,decision:'pending',edited:false,generated};
  const claims=[
    ...dedupedBullets.kept.map((b,i)=>({id:'experience-'+i,kind:'experience',text:b.text,originalText:b.text,sourceQuote:b.sourceQuote,...base,reason:b.reason})),
    ...dedupedSkills.kept.map((s,i)=>({id:'skill-'+i,kind:'skill',text:s.text,originalText:s.text,sourceQuote:s.sourceQuote,yomaSkill:s.yomaSkill,...base,reason:s.reason}))
  ];
  const finished=now();
  const generation={
    mode:generated==='local'?'sample':'live',
    provider:str(provider.name)||'local',
    model:provider.model??null,
    generatedAt:new Date(finished).toISOString(),
    durationMs:Math.max(0,finished-started),
    skillMenuSize:menu.length,
    skillMenuSource,
    rejected
  };
  return {claims,generation};
}

module.exports={buildSkillMenu,runGeneration,MAX_EXPERIENCE,MAX_SKILLS};
