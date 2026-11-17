'use strict';
/* YoVouch lines and labels (spec 4.2, 5.7). Every line is built by code from the voucher's chips and, once the
   worker taps Show, their words kept verbatim; never by the model. Labels are fixed STRINGS. Every tier label
   carries "confirmed by them, not by Yoma"; a flag label is appended after it with " · ". */
const fs=require('node:fs');
const path=require('node:path');
const {STRINGS,fullDate,monthYear}=require('./render.js');
const {noBannedClaims,noInventedNumbers}=require('../validate.js');
const {BANNED_CONFIRM_PHRASE,namesOrganisation}=require('./draft.js');

// Display value (web form, SMS and IVR alike) to stored value. There is no "no".
const HOW_OFTEN={'once':'once','a few times':'a few times','regularly':'regularly','rather not say':'not stated'};
const HIRE_AGAIN={'yes':'yes','rather not say':'not stated'};
const FLAG_LABELS={reciprocal:STRINGS.flagReciprocal,ring:STRINGS.flagRing};
const NOT_BY=' · confirmed by them, not by Yoma';
const SLOW=new Set(['sms','ivr']);
const PROFANITY=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','data','profanity.json'),'utf8'));
const MAX_WORDS=120,MAX_OTHER=30,EARLIEST_MONTHS=24;

const str=v=>v==null?'':String(v);
function whenText(when){return /^\d{4}-\d{2}$/.test(str(when))&&monthYear(when)?monthYear(when):'earlier';}

// Customer: "<work>, <when>, <howOften>. Would hire again: <yes | not stated>." then "<words>" when shown.
// Worker: the same with "Would work together again". Organisation: "Referred for <work> at <area>, <date>, ...".
function buildLine(kind,fields,{statement,restsOn,jobPost,at}={}){
  if(kind==='organisation')return 'Referred for '+str(jobPost?.work)+' at '+str(jobPost?.area)+', '+fullDate(at)+', resting on '+str(restsOn?.title)+'. "'+str(statement)+'"';
  const f=fields||{},yes=f.hireAgain==='yes';
  const head=whenText(f.when)==='earlier'?STRINGS.whenEarlier(str(f.work),str(f.howOften)):str(f.work)+', '+whenText(f.when)+', '+str(f.howOften)+'.';
  const again=kind==='worker'?(yes?STRINGS.workAgainYes:STRINGS.workAgainNotStated):(yes?STRINGS.hireAgainYes:STRINGS.hireAgainNotStated);
  return head+' '+again+'.'+(f.words?' "'+f.words+'"':'');
}

function voucherLabel(record){
  const v=record?.voucher||{};
  if(record?.kind==='organisation')return str(v.orgName||v.label);
  if(record?.kind==='worker')return str(v.firstName)+"'s card";
  return v.firstName&&v.phoneLast3?STRINGS.voucherShown(v.firstName,v.phoneLast3):STRINGS.aCustomer;
}

function numberLabel(phoneConfirmedBy){
  return {sms_bind:STRINGS.numberSmsBind,demo:STRINGS.numberDemo,sms_origin:STRINGS.numberSms,caller_id:STRINGS.numberCall}[phoneConfirmedBy]||null;
}

// A referral is closed once its post expires (30 days after postedAt). nowMs is a plan addition, so a test clock
// decides it. The closed history line gains the not-by-Yoma part, which the spec 5.6 wording leaves out.
function referralLabel(record,nowMs){
  const v=record.voucher||{},org=str(v.orgName||v.label),job=str(record.jobPost?.work);
  const closed=record.expiresAt&&Date.parse(record.expiresAt)<=nowMs;
  if(closed)return STRINGS.labelReferralClosed(org,job,monthYear(record.jobPost?.postedAt||record.acceptedAt))+NOT_BY;
  return STRINGS.labelReferral(org,job,fullDate(record.acceptedAt||record.proof?.provedAt),str(record.restsOn?.title));
}

function baseLabel(record,first,nowMs){
  const p=record?.proof||{},v=record?.voucher||{},date=fullDate(p.provedAt),worker=record?.kind==='worker';
  if(record?.kind==='organisation')return referralLabel(record,nowMs);
  if(p.method==='request')return worker?STRINGS.labelWorkerRequest(str(v.firstName)):STRINGS.labelCustomerRequest;
  if(worker)return p.channel==='sms'?STRINGS.labelWorkerSms(str(v.firstName),date):STRINGS.labelWorkerCode(str(v.firstName),date);
  if(p.onWorkerPhone===true)return v.phoneConfirmedBy==='demo'?STRINGS.labelCustomerDemo(date,first):STRINGS.labelCustomerTexted(date,first);
  if(p.channel==='sms')return STRINGS.labelCustomerSms(date);
  if(p.channel==='ivr')return STRINGS.labelCustomerCall(date);
  return STRINGS.labelCustomerCode(date);
}

function tierLabel(record,firstName,flags=record?.flags,{nowMs=Date.now()}={}){
  const extra=(Array.isArray(flags)?flags:[]).map(f=>FLAG_LABELS[f]).filter(Boolean);
  return [baseLabel(record,str(firstName),nowMs),...extra].join(' · ');
}

function finePrint(record,firstName){
  const p=record?.proof||{},first=str(firstName),number=numberLabel(record?.voucher?.phoneConfirmedBy);
  if(record?.kind==='organisation')return [STRINGS.fineReferral(first),STRINGS.demoOrgKey];
  if(record?.kind==='worker')return [STRINGS.fineWorker,...(p.channel==='sms'&&number?[number]:[])];
  const lead=p.method==='request'?STRINGS.fineRequest(first):p.onWorkerPhone===true?STRINGS.fineTexted:STRINGS.limitsLong(first,SLOW.has(p.channel)?p.channel:'web');
  return [lead,...(number?[number]:[])];
}

function clipOf(clip){
  if(clip?.expired)return {href:null,text:STRINGS.clipExpired};
  if(!clip?.url)return null;
  return {href:clip.url,text:STRINGS.playClip(clip.seconds,Math.round(Number(clip.bytes||0)/1024))};
}

function tierItem(record,firstName,{flags,nowMs}={}){
  const visits=Number(record?.visits)||1,referral=record?.kind==='organisation';
  return {vouchId:record?.vouchId??null,label:tierLabel(record,firstName,flags===undefined?record?.flags:flags,{nowMs:nowMs??Date.now()}),
    line:str(record?.line)+(visits>1?' '+STRINGS.visits(visits)+'.':''),clip:clipOf(record?.clip),finePrint:finePrint(record,firstName),
    window:SLOW.has(record?.proof?.channel)?'sms':'web',referral,demoKey:referral};
}

// ---- The voucher's own words (spec 5.7). Checked in this order; every refusal shows cannotKeep. ----
function profane(text,lang){
  const list=new Set([...(PROFANITY.en||[]),...(Array.isArray(PROFANITY[lang])?PROFANITY[lang]:[])]);
  return (String(text).toLowerCase().match(/\p{L}+/gu)||[]).some(w=>list.has(w));
}
function checkWords(text,{organisationNames=[],transcript=null,lang='en'}={}){
  const s=str(text).trim(),n=[...s].length;
  const no=reason=>({ok:false,reason});
  if(n<1||n>MAX_WORDS)return no('length');
  if(!noBannedClaims(s).ok)return no('asserts_credential');
  // Shadowed today, because BANNED in validate.js already holds "verified"; kept so a change there cannot open the gap.
  if(BANNED_CONFIRM_PHRASE.test(s))return no('banned_phrase');
  if(namesOrganisation(s,(Array.isArray(organisationNames)?organisationNames:[]).map(str)))return no('organisation_name');
  if(transcript==null&&/\d{3,}/.test(s))return no('no_numbers');
  if(profane(s,lang))return no('profanity');
  if(transcript!=null&&!noInventedNumbers(s,{experience:str(transcript)}).ok)return no('invented_number');
  return {ok:true,text:s,source:transcript==null?'typed':'clip'};
}

// ---- Chips (spec 7.2 step 2). The same keys arrive as JSON or from the no-JS form. ----
// The month index (year * 12 + month - 1) of ms in the card country's time zone.
function monthIndex(ms,country){
  const zone=require('./pages.js').TIME_ZONES[country]||'UTC';
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit'}).formatToParts(new Date(ms));
  const at=type=>Number(parts.find(p=>p.type===type)?.value);
  return at('year')*12+at('month')-1;
}
const monthOf=i=>String(Math.floor(i/12)).padStart(4,'0')+'-'+String(i%12+1).padStart(2,'0');
function parseChips(body,{chips=[],nowMs=Date.now(),country,organisationNames=[]}={}){
  const b=body&&typeof body==='object'?body:{},out={},fields=[];
  const work=str(b.work).trim();
  if(work==='Other'||work==='other'){
    const other=str(b.other).trim(),n=[...other].length;
    if(n>=1&&n<=MAX_OTHER&&checkWords(other,{organisationNames}).ok)out.work=other;
  }else if(work&&chips.includes(work))out.work=work;
  const cur=monthIndex(nowMs,country),when=str(b.when).trim(),month=str(b.month).trim();
  if(when==='this month')out.when=monthOf(cur);
  else if(when==='last month')out.when=monthOf(cur-1);
  else if(when==='earlier'){
    if(!month)out.when='earlier';
    else if(/^\d{4}-\d{2}$/.test(month)){
      const [y,m]=month.split('-').map(Number),i=y*12+m-1;
      if(m>=1&&m<=12&&i<cur-1&&i>=cur-EARLIEST_MONTHS)out.when=month;
    }
  }
  if(Object.hasOwn(HOW_OFTEN,str(b.howOften)))out.howOften=HOW_OFTEN[b.howOften];
  if(Object.hasOwn(HIRE_AGAIN,str(b.hireAgain)))out.hireAgain=HIRE_AGAIN[b.hireAgain];
  for(const k of ['work','when','howOften','hireAgain'])if(out[k]===undefined)fields.push(k);
  return fields.length?{ok:false,fields}:{ok:true,chips:{work:out.work,when:out.when,howOften:out.howOften,hireAgain:out.hireAgain}};
}

module.exports={checkWords,parseChips,HOW_OFTEN,HIRE_AGAIN,whenText,buildLine,voucherLabel,numberLabel,tierLabel,finePrint,tierItem};
