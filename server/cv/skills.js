'use strict';
/* The evidence methodology (spec 6). Every skill on the CV carries at least one source, and its level and label
   are the strongest source's: S1 recorded on Yoma (a ticked completion or credential), S2 vouched (a live, shown
   YoVouch line on the person's newest live card), S3 shown in the person's own interview answer, S4 self-stated.
   One credential, one vouch id and one interview entry each support a skill once, and volume never promotes a
   skill. Model-proposed and hand-added names must be on the role menu; every name the person or the model gives
   passes the inflation stems. The card and vouch stores are read only, fresh on every call, never cached. */
const {RULES}=require('../../cv-rules.js');
const {burstHeld,cardCreatedMs}=require('../card/flags.js');

const LEVELS=['S1','S2','S3','S4'];
const VOUCH_LABEL={customer:'labelCustomer',worker:'labelWorker'};
const NONE={cardId:null,sources:[]};
const list=v=>Array.isArray(v)?v:[];
const str=v=>v==null?'':String(v);
const keyOf=name=>str(name).normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const words=t=>str(t).toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
const overstated=name=>words(name).some(w=>RULES.inflationStems.some(st=>w.startsWith(st)));
const msOf=v=>{const n=Date.parse(v);return Number.isNaN(n)?0:n;};
const yomaOf=s=>s&&s.id&&s.name?{id:str(s.id),name:str(s.name),infoURL:s.infoURL??null}:null;
const fill=(text,vars)=>str(text).replace(/\{(\w+)\}/g,(m,slot)=>str(vars[slot]));

// The newest card published from this account (persona id in sample mode, user id in token mode) and not withdrawn.
function ownerCard(cardStore,owner){
  const id=owner?.source==='token'?owner.userId:owner?.personaId;
  if(!id)return null;
  const mine=e=>e?.record&&!e.withdrawnAt&&e.record.accountSource===owner.source&&
    (owner.source==='token'?e.record.user?.id===id:e.record.personaId===id);
  let best=null;
  for(const cardId of cardStore.list()){
    const e=cardStore.get(cardId);
    if(mine(e)&&(!best||msOf(e.record.publishedAt)>msOf(best.record.publishedAt)))best=e;
  }
  return best;
}

// The shown vouches of that card, as the card page shows them (shownFiles in server/card/routes.js), as skill sources.
function vouchSources({cardStore,vouchStore,owner,chipSkills,copy,nowMs}={}){
  if(!cardStore||!vouchStore)return NONE;
  const entry=ownerCard(cardStore,owner);
  if(!entry)return NONE;
  const all=vouchStore.listForCard(entry.cardId),held=burstHeld(all,cardCreatedMs(entry),nowMs);
  const chips=chipSkills?.[entry.record.tradeId??'default']||{};
  const sources=[];
  for(const f of all){
    const r=f.record;
    if(!vouchStore.isLive(f,nowMs)||held.has(r.vouchId))continue;
    if(VOUCH_LABEL[r.kind]){
      const work=str(r.fields?.work);
      for(const name of Object.hasOwn(chips,work)?list(chips[work]):[])sources.push({name,kind:r.kind,ref:r.vouchId,label:copy[VOUCH_LABEL[r.kind]]});
    }else if(r.kind==='organisation'&&r.voucher?.orgName){
      const c=list(entry.record.disclosed?.completions).find(x=>str(x?.evidenceId)===str(r.restsOn?.evidenceId));
      const label=fill(copy.labelReferral,{organisation:r.voucher.orgName});
      for(const s of list(c?.skills))if(s?.name)sources.push({name:s.name,kind:'referral',ref:r.vouchId,label});
    }
  }
  return {cardId:entry.cardId,sources};
}

function combineSkills({record,include={},vouches=[],interview=[],handAdded=[],menu=[],copy}={}){
  const skills=new Map(),rejected=[];
  const ticked=ids=>new Set(list(ids).map(str));
  const onMenu=name=>list(menu).find(m=>keyOf(m?.name)===keyOf(name))||null;
  const reject=(name,reason)=>{if(!rejected.some(x=>x.name===name&&x.reason===reason))rejected.push({name,reason});};
  // unit is what counts once: a completion, a credential (its completion when both are ticked), a vouch, an entry.
  function add(name,source,unit,yomaSkill=null){
    const k=keyOf(name);
    if(!k)return;
    if(!skills.has(k))skills.set(k,{name:str(name).trim(),yomaSkill:null,own:null,units:new Set(),sources:[]});
    const s=skills.get(k);
    if(s.units.has(unit))return;
    s.units.add(unit);
    s.sources.push(source);
    if(source.level==='S1'&&!s.yomaSkill)s.yomaSkill=yomaSkill;
    else if(source.level!=='S1'&&!s.own)s.own=yomaSkill;
  }
  // A model-proposed or hand-added name: on the menu, then no inflation stem. Returns the menu entry or null.
  function checked(name){
    const m=onMenu(name);
    if(!m){reject(str(name),'skill_not_in_menu');return null;}
    if(overstated(m.name)){reject(str(name),'overstated');return null;}
    return m;
  }

  const completions=ticked(include.completions),yoma={level:'S1',label:copy.labelYoma};
  for(const c of list(record?.completions).filter(c=>completions.has(str(c.evidenceId))))
    for(const s of list(c.skills))add(s?.name,{...yoma,kind:'completion',ref:c.evidenceId},'yoma:'+c.evidenceId,yomaOf(s));
  const credentials=ticked(include.credentials);
  for(const cr of list(record?.credentials).filter(cr=>credentials.has(str(cr.id)))){
    const unit='yoma:'+(cr.completionId&&completions.has(str(cr.completionId))?cr.completionId:cr.id);
    for(const name of list(cr.skills))add(name,{...yoma,kind:'credential',ref:cr.id},unit);
  }
  for(const vch of list(vouches))add(vch?.name,{level:'S2',kind:vch.kind,ref:vch.ref,label:vch.label},'vouch:'+vch.ref);
  for(const it of list(interview)){
    const m=checked(it?.name);
    if(m)add(m.name,{level:'S3',kind:'entry',ref:it.entryIndex,label:copy.labelOwn,quote:it.sourceQuote},'entry:'+it.entryIndex,yomaOf(it.yomaSkill));
  }
  for(const h of list(handAdded)){
    const m=checked(h?.name);
    if(m)add(m.name,{level:'S4',kind:'self',ref:null,label:copy.labelSelf},'self',yomaOf(h.yomaSkill));
  }
  const attested=ticked(include.selfAttested);
  for(const a of list(record?.selfAttested).filter(a=>attested.has(str(a.evidenceId)))){
    if(overstated(a.name)){reject(str(a.name),'overstated');continue;}
    add(a.name,{level:'S4',kind:'self_attested',ref:a.evidenceId,label:copy.labelSelf},'attested:'+a.evidenceId,yomaOf(a));
  }

  const rank=level=>LEVELS.indexOf(level);
  const out=[...skills.values()].map(s=>{
    const best=s.sources.reduce((a,b)=>rank(b.level)<rank(a.level)?b:a);
    return {name:s.name,yomaSkill:s.yomaSkill||yomaOf(onMenu(s.name))||s.own||null,level:best.level,label:best.label,sources:s.sources};
  }).sort((a,b)=>rank(a.level)-rank(b.level)||a.name.localeCompare(b.name,'en'));
  return {skills:out,rejected};
}

module.exports={LEVELS,vouchSources,combineSkills};
