'use strict';
// The CV draft pipeline (spec 7, 8). Per entry: mask the answers, ask the provider for one or two bullets,
// restore the names, check each bullet against the person's own words, and fall back to the template.
// Nothing here is saved. Nothing reaches the CV without an Accept (spec 5, Step 3).
// A ProviderError from the provider propagates untouched, so the route can map it.
const core=require('../../core.js');
const {checkBullet,checkBullets,RULES}=require('./validate.js');
const {quoteInSource,resolveSkill}=require('../validate.js');
const {ProviderError}=require('../providers/errors.js');

const MAX_BULLETS=2;
const str=v=>v==null?'':String(v);
const words=t=>str(t).toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
const overstated=name=>words(name).some(w=>RULES.inflationStems.some(st=>w.startsWith(st)));

// EntryFields: the entry without place and confirm. The model sees it masked; the checks compare against it as typed.
function fieldsOf(e){
  const x=e||{},n=x.number&&typeof x.number==='object'?{value:x.number.value??null,unit:str(x.number.unit),hedge:str(x.number.hedge)}:null;
  return {title:str(x.title),what:str(x.what),forWhom:str(x.forWhom),frequency:str(x.frequency),months:{start:str(x.months?.start),end:str(x.months?.end)},number:n,outcome:str(x.outcome)};
}

// The person's number in the final text, with their hedge in front of it when they gave one (as templateBullet marks it).
function highlightOf(text,f){
  const value=f.number?.value,hedge=f.number?.hedge;
  if(value==null||str(value).trim()==='')return null;
  const vals=typeof value==='number'?[value]:core.numbersIn(str(value)).map(n=>n.value);
  const hit=core.numbersIn(text).find(n=>n.value!=null&&vals.includes(n.value));
  if(!hit)return null;
  const lead=hedge==='about'||hedge==='at least'?new RegExp('\\b'+hedge+'\\s+$','i').exec(text.slice(0,hit.index)):null;
  return [lead?lead.index:hit.index,hit.index+hit.raw.length];
}

const proposal=(b,origin,templateWording,checks,f)=>({text:b.text,origin,templateWording,sourceQuote:b.sourceQuote,sourceFields:[...(b.sourceFields||[])],usedNumbers:[...(b.usedNumbers||[])],highlight:highlightOf(b.text,f),checks});

async function draftEntry({role,entry,index,provider,menu,learningTitles=[],known=[],now=Date.now,signal}={}){
  if(!provider||typeof provider.cvBullets!=='function')throw new ProviderError('provider_not_configured');
  const r0=str(role),fields=fieldsOf(entry),list=Array.isArray(menu)?menu:[],nowIso=new Date(now()).toISOString();
  const {fields:masked,map}=core.maskNames(fields,{role:r0,verbs:RULES.verbs,known});
  const out=await provider.cvBullets({role:r0,entry:masked,menuNames:list.map(m=>m.name),learningTitles:[...(learningTitles||[])],nowIso},{signal});
  // The local provider's bullet is the template itself; sample mode says so in the mode label.
  const local=provider.name==='local',rejected=[],ctx={fields,role:r0};
  const bullets=(Array.isArray(out?.bullets)?out.bullets:[]).map(b=>({...b,text:core.restoreNames(str(b?.text),map).trim(),sourceQuote:core.restoreNames(str(b?.sourceQuote),map)}));
  for(const b of bullets.slice(MAX_BULLETS))rejected.push({kind:'bullet',text:b.text,reason:'over_limit'});
  const {kept,rejected:refused}=checkBullets(bullets.slice(0,MAX_BULLETS),ctx);
  rejected.push(...refused.map(r=>({kind:'bullet',text:r.text,reason:r.reason})));
  let proposals=kept.map(b=>proposal(b,local?'template':'model',false,checkBullet(b,ctx).checks,fields));
  if(!proposals.length){
    const t=core.templateBullet(fields,RULES,{nowIso});
    const b=t&&{text:t.text,sourceQuote:fields.what.trim(),sourceFields:t.sourceFields,usedNumbers:core.numbersIn(t.text).map(n=>n.raw)};
    const r=b&&checkBullet(b,ctx);
    if(r&&r.ok)proposals=[proposal(b,'template',!local,r.checks,fields)];
    else if(b&&!rejected.some(x=>x.text===b.text))rejected.push({kind:'bullet',text:b.text,reason:r.reason});
  }
  // Skills: on the menu, quoted from the person's own answers, no inflation stem, one per menu entry.
  const source=[fields.title,fields.what,fields.forWhom,fields.outcome].join('\n'),skills=[],seen=new Set();
  for(const s of Array.isArray(out?.skills)?out.skills:[]){
    const name=str(s?.name),sourceQuote=core.restoreNames(str(s?.sourceQuote),map),hit=resolveSkill(name,list);
    const reason=!hit?'skill_not_in_menu':!quoteInSource(sourceQuote,source).ok?'quote_not_found':overstated(hit.name)?'overstated':seen.has(hit.id)?'duplicate':'';
    if(reason){rejected.push({kind:'skill',text:name,reason});continue;}
    seen.add(hit.id);
    skills.push({name:hit.name,yomaSkill:{id:hit.id,name:hit.name,infoURL:hit.infoURL??null},sourceQuote});
  }
  return {index,proposals,rejected,skills,needsDetail:!proposals.length};
}

async function draftEntries({role,entries,provider,menu,learningTitles,known,now=Date.now,signal}={}){
  if(!provider||typeof provider.cvBullets!=='function')throw new ProviderError('provider_not_configured');
  const started=now();
  const drafts=await Promise.all((Array.isArray(entries)?entries:[]).map((entry,index)=>draftEntry({role,entry,index,provider,menu,learningTitles,known,now,signal})));
  const generation={mode:provider.name==='local'?'sample':'live',provider:str(provider.name)||'local',model:provider.model??null,durationMs:Math.max(0,now()-started)};
  return {entries:drafts,generation};
}

module.exports={MAX_BULLETS,draftEntry,draftEntries};
