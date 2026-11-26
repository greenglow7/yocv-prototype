'use strict';
/* YoCV QR verification (spec docs/superpowers/specs/2026-11-25-yocv-qr-verify-design.md).
   buildCheck turns the CV the page built into a check the server can stand behind: the learning lines come from the
   session's Yoma record and ticks, each skill's level and label from the session's own skills answer, and every bullet
   must pass checkBullet against an entry of the session again (AGENTS rule 5). The browser's labels are never used.
   No phone, email, town, optional field, photo or profile line is copied into a check.
   checkPage renders the employer's page; createCheckStore keeps one signed JWS per check under <dir>, with the hash
   of its withdraw secret and the time it was withdrawn (spec 2026-11-25-yocv-journey-close-design). */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {flowPage}=require('../card/pages.js');
const {escapeHtml:E}=require('../card/render.js');

const CHECK_ID=/^[0-9a-f]{16}$/;
const CHECK_DAYS=90,DAY_MS=24*3600*1000;
const VOUCHED='S2',CONFIRMED='S1';
const MAX_BULLETS=5,MAX_NAME=80;
const MAX_CHECKS_PER_SESSION=5;
const str=v=>v==null?'':String(v);
const trim=v=>str(v).trim();
const list=v=>Array.isArray(v)?v:[];
const fill=(t,v={})=>str(t).replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?'':String(v[k]));
const codeOf=id=>id.slice(0,4).toUpperCase()+'-'+id.slice(4,8).toUpperCase();
const dateOf=ms=>new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}).format(new Date(ms));
const fieldsOf=({confirm,...fields})=>fields;

// The ticked learning, as the CV paper prints it: a ticked credential replaces its linked completion (core.js learningItems).
function confirmedLearning(record,include,copy){
  const creds=list(record?.credentials).filter(c=>list(include?.credentials).includes(c.id)),used=new Set(),out=[];
  const cred=c=>{used.add(c.id);out.push({kind:'credential',line:fill(copy.learningCredential,{title:c.title,issuer:c.issuer||copy.issuerNotStated,month:c.month})});};
  for(const c of list(record?.completions)){
    const w=creds.find(x=>x.completionId===c.evidenceId);
    if(w)cred(w);
    else if(list(include?.completions).includes(c.evidenceId))out.push({kind:'completion',line:fill(copy.learningCompletion,{title:c.title,organisation:c.organizationName,month:c.month})});
  }
  for(const c of creds)if(!used.has(c.id))cred(c);
  return out;
}

// Returns {record} or {status, code, fields, message} for the first thing the server will not stand behind.
// Each CV entry is matched to one session entry (used once) whose answers every bullet passes; its months are printed
// from that session entry, never from the browser, and the place is left out (it is often the person's town).
function buildCheck({session,cv,checkBullet,copy,checkId,nowMs,monthsOf,hasContact}){
  const refuse=(fields,message,status=400,code='invalid_input')=>({status,code,fields,message});
  if(!session.entries||!session.skills)return refuse([],copy.errVerifyReview,409,'not_reviewed');
  const experience=[],used=new Set();
  for(const [i,e] of list(cv.experience).entries()){
    const title=trim(e?.title),bullets=list(e?.bullets).map(trim);
    if(!title||!bullets.length||bullets.length>MAX_BULLETS)return refuse(['cv.experience.'+i],copy.errVerifyLine);
    const dup=bullets.findIndex((b,j)=>bullets.indexOf(b)!==j);
    if(dup>=0)return refuse(['cv.experience.'+i+'.bullets.'+dup],copy.errVerifyLine);
    const candidates=session.entries.map((x,k)=>({x,k})).filter(({x,k})=>!used.has(k)&&trim(x.title)===title);
    if(!candidates.length)return refuse(['cv.experience.'+i],copy.errVerifyLine);
    const passes=({x},text)=>checkBullet({text,sourceQuote:x.what.trim()},{fields:fieldsOf(x),role:session.role}).ok;
    const match=candidates.find(c=>bullets.every(b=>passes(c,b)));
    if(!match){
      const j=bullets.findIndex(b=>!candidates.some(c=>passes(c,b)));
      return refuse(['cv.experience.'+i+(j>=0?'.bullets.'+j:'')],copy.errVerifyLine);
    }
    used.add(match.k);
    experience.push({title,months:monthsOf(match.x.months),bullets});
  }
  const skills=[];
  for(const [i,k] of list(cv.skills).entries()){
    const known=session.skills.find(s=>s.name===trim(k?.name));
    if(!known||skills.some(s=>s.name===known.name))return refuse(['cv.skills.'+i],copy.errVerifyLine);
    skills.push({name:known.name,level:known.level,label:known.label});
  }
  const name=trim(cv.name);
  if(!name||[...name].length>MAX_NAME||hasContact(name))return refuse(['cv.name'],copy.errBody);
  return {record:{v:1,checkId,code:codeOf(checkId),madeAt:new Date(nowMs).toISOString(),expiresAt:new Date(nowMs+CHECK_DAYS*DAY_MS).toISOString(),
    sample:session.record.source!=='token',name,role:trim(session.role),
    learning:confirmedLearning(session.record,session.include,copy),skills,experience}};
}

// The employer's page: state ok, bad (the signature failed), expired, withdrawn or missing. Server-rendered, no script.
function checkPage({state,record,copy,withdrawnAt=null}){
  const p=(t,cls)=>'<p'+(cls?' class="'+cls+'"':'')+'>'+E(t)+'</p>',ul=items=>items.length?'<ul>'+items.map(t=>'<li>'+E(t)+'</li>').join('')+'</ul>':p(copy.checkNone,'small');
  const say=text=>flowPage({title:copy.checkTitle,body:'<section><h1>'+E(copy.checkTitle)+'</h1>'+p(text,'notice')+'</section>'});
  if(state==='missing')return say(copy.checkMissing);
  if(state==='expired')return say(copy.checkExpired);
  if(state==='withdrawn')return say(fill(copy.checkWithdrawn,{date:withdrawnAt?dateOf(Date.parse(withdrawnAt)):''}));
  if(state!=='ok')return say(copy.checkBad);
  const r=record,skillLine=k=>fill(copy.cvSkillLine,k);
  const ofLevel=test=>r.skills.filter(k=>test(k.level)).map(skillLine);
  const group=(heading,note,cls,blocks)=>'<section class="group '+cls+'"><h2>'+E(heading)+'</h2>'+p(note,'small')+blocks+'</section>';
  const sub=(label,items)=>items.length?'<h3>'+E(label)+'</h3>'+ul(items):'';
  const confirmed=[...r.learning.map(l=>l.line)],s1=ofLevel(l=>l===CONFIRMED),s2=ofLevel(l=>l===VOUCHED),own=ofLevel(l=>l!==CONFIRMED&&l!==VOUCHED);
  const exp=r.experience.map(e=>'<div class="entry"><h3>'+E(e.title)+'</h3>'+(e.months?p(e.months,'small'):'')+ul(e.bullets)+'</div>').join('');
  const body='<section><h1>'+E(copy.checkTitle)+'</h1>'+'<p class="name">'+E(r.name)+(r.role?' · '+E(r.role):'')+'</p>'
    +p(fill(copy.checkLead,{name:r.name.split(/\s+/)[0],date:dateOf(Date.parse(r.madeAt))}))
    +p(fill(copy.checkCodeLine,{code:r.code}),'code')+p(fill(copy.checkUntil,{date:dateOf(Date.parse(r.expiresAt))}),'small')
    +(r.sample?p(copy.cvSampleFooter,'notice'):'')+'</section>'
    +group(copy.checkConfirmed,copy.checkConfirmedNote,'yoma',(confirmed.length||s1.length)?ul(confirmed)+sub(copy.checkSkillsLabel,s1):p(copy.checkNone,'small'))
    +group(copy.checkVouched,copy.checkVouchedNote,'vouched',s2.length?ul(s2):p(copy.checkNone,'small'))
    +group(copy.checkSelf,copy.checkSelfNote,'self',(exp||own.length)?(exp?'<h3 class="label">'+E(copy.checkExperienceLabel)+'</h3>'+exp:'')+sub(copy.checkSkillsLabel,own):p(copy.checkNone,'small'))
    +'<p class="small"><a href="/cv-check/'+E(r.checkId)+'.json">'+E(copy.checkJson)+'</a> · <a href="/.well-known/jwks.json">'+E(copy.checkKey)+'</a></p>';
  const css='.name{font-size:22px;font-weight:700;margin:4px 0}.code{font-weight:700}.group{border-left:6px solid #d8dde3;padding:4px 0 4px 12px;margin:20px 0}'
    +'.group.yoma{border-color:#2b6a57}.group.vouched{border-color:#c98a1a}.group.self{border-color:#8a8f98}.group h3{font-size:16px;margin:12px 0 4px}'
    +'.entry h3{margin-bottom:0}.notice{background:#f3f5f7;padding:8px 12px;border-radius:8px}';
  return flowPage({title:copy.checkTitle+' · '+r.name,body,css});
}

function createCheckStore(dir){
  const file=id=>path.join(dir,id+'.json');
  const read=id=>{
    if(!CHECK_ID.test(str(id)))return null;
    try{const v=JSON.parse(fs.readFileSync(file(id),'utf8'));return typeof v?.jwt==='string'?v:null;}catch{return null;}
  };
  const hash=secret=>crypto.createHash('sha256').update(str(secret)).digest();
  return {
    dir,
    // withdrawSecret is optional: only its SHA-256 hash is kept, beside the signed check and outside it.
    put(id,jwt,withdrawSecret){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file(id),JSON.stringify({jwt,...(withdrawSecret?{withdrawHash:hash(withdrawSecret).toString('hex')}:{})}),{mode:0o600});},
    get(id){return read(id)?.jwt??null;},
    withdrawnAt(id){const v=read(id);return typeof v?.withdrawnAt==='string'?v.withdrawnAt:null;},
    // 'ok', 'missing', 'forbidden' or 'withdrawn'. The secret is compared in constant time.
    withdraw(id,secret,atIso){
      const v=read(id);if(!v)return 'missing';
      const want=Buffer.from(str(v.withdrawHash),'hex');
      if(typeof secret!=='string'||!secret||want.length!==32||!crypto.timingSafeEqual(want,hash(secret)))return 'forbidden';
      if(v.withdrawnAt)return 'withdrawn';
      fs.writeFileSync(file(id),JSON.stringify({...v,withdrawnAt:atIso}),{mode:0o600});
      return 'ok';
    }
  };
}

module.exports={buildCheck,checkPage,createCheckStore,confirmedLearning,CHECK_ID,CHECK_DAYS,MAX_CHECKS_PER_SESSION};
