'use strict';
/* YoVouch open step (spec 4.3, 7.2 step 2). open() is the one place a code is consumed and a vouch session
   opened: the scan form's 18-or-older POST, POST /api/vouch/open and, later, the SMS and call handlers all
   call it. Every refusal logs code_refused with its reason; every open logs vouch_opened. */
const fs=require('node:fs');
const path=require('node:path');
const {t,LANGS}=require('./copy.js');
const {STRINGS}=require('./render.js');
const {cardFields}=require('./events.js');

const CHIPS=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','data','vouch-chips.json'),'utf8'));
const EXPIRES_IN_MS=30*60*1000;
const STATUS={code_expired:400,code_wrong:400,code_used:409,card_locked:429,card_withdrawn:410,not_found:404,
  voucher_cap_day:429,voucher_cap_cards:429,voucher_recent:409,not_eligible:403,request_used:409,request_expired:410};

// The work chips for a TRADES id; free-text trades and unknown ids get the default list.
function chipsFor(tradeId){
  const list=typeof tradeId==='string'&&Object.hasOwn(CHIPS,tradeId)&&tradeId!=='default'?CHIPS[tradeId]:CHIPS.default;
  return [...list];
}

// The refusal message for a code, in the voucher's language. {first} is the worker the vouch is about.
function messageFor(code,first,lang){
  const vars={first:first||''};
  if(code==='code_expired')return t('codeOld',lang,vars);
  if(code==='code_used')return t('codeUsed',lang);
  if(code==='code_wrong')return t('codeWrongWeb',lang,vars);
  if(code==='card_locked')return t('codeLockedWeb',lang);
  if(code==='card_withdrawn')return t('cardWithdrawn',lang);
  return STRINGS.notFound;
}

function createVouchService(system){
  const {store,codes,sessions,events,yv}=system;

  function workerOf(entry){return {firstName:entry.record?.user?.firstName||'',trade:entry.record?.trade||''};}
  function refuse(code,{entry=null,channel,lang}){
    events.log('code_refused',{reason:code,channel,...(entry?cardFields(entry):{})});
    return {ok:false,status:STATUS[code]||400,code,message:messageFor(code,entry?.record?.user?.firstName,lang)};
  }
  function opened(vouchToken,session,entry){
    return {ok:true,vouchToken,worker:workerOf(entry),proof:{method:session.proof.method,step:session.proof.step,provedAt:session.proof.provedAt},
      bind:yv?.gatewaySecret?'sms':'demo',expiresInMs:EXPIRES_IN_MS};
  }

  // input = {cardId | cardRef, proof, voucher, voucherKey = null, onWorkerPhone, channel, lang, formNonce}. voucherKey is
  // known only on the SMS and call paths; the caps that read it arrive with Task 5 and Task 12.
  async function open(input={}){
    const channel=['web','sms','ivr'].includes(input.channel)?input.channel:'web';
    const lang=LANGS.includes(input.lang)?input.lang:'en';
    const cardId=input.cardId!=null?String(input.cardId):codes.resolveCard(input.cardRef??null);
    const entry=cardId?store.get(cardId):null;
    if(!entry?.record)return refuse('not_found',{channel,lang});
    if(entry.withdrawnAt)return refuse('card_withdrawn',{entry,channel,lang});
    // A double tap posts the same form nonce: hand back the session the first tap opened (plan Task 4).
    const again=sessions.byNonce(input.formNonce);
    const prior=again?sessions.get(again):null;
    if(prior&&prior.cardId===entry.cardId)return opened(again,prior,entry);
    const proof=input.proof||{};
    if(proof.method!=='qr'&&proof.method!=='code')return refuse('code_wrong',{entry,channel,lang});
    const r=codes.verify(entry.cardId,proof,{channel,consume:true});
    if(!r.ok)return refuse(r.code,{entry,channel,lang});
    const onWorkerPhone=input.onWorkerPhone===true;
    const {vouchToken,session}=sessions.open({cardId:entry.cardId,proof:{method:proof.method,step:r.step,provedAt:r.provedAt,channel,onWorkerPhone},
      voucher:input.voucher||{kind:'customer'},onWorkerPhone,channel,lang,adult:true,formNonce:input.formNonce});
    events.log('vouch_opened',{channel,method:proof.method,...cardFields(entry)});
    return opened(vouchToken,session,entry);
  }

  return {open};
}

module.exports={createVouchService,chipsFor,messageFor,STATUS,EXPIRES_IN_MS};
