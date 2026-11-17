'use strict';
/* YoVouch rotating code (spec section 4.3). A 90-second step, counter = floor(unixSeconds / 90). The spoken
   code is RFC 4226 HOTP over HMAC-SHA256, 6 digits; the QR tag is the first 40 bits of
   HMAC-SHA256(secret, "qr:" + counter) in the store alphabet. The scan page accepts {now-1, now}, SMS and the
   call {now-2, now-1, now}, never now+1. A step is single use once consumed (vouch.usedSteps, last 10).
   Five wrong spoken codes per card in 10 minutes are allowed; the sixth locks the spoken path for 10 minutes
   while the QR path stays open. A sender with 10 wrong codes in an hour is ignored for an hour. */
const crypto=require('node:crypto');
const {ALPHABET}=require('./store.js');

const STEP_SECONDS=90;
const BATCH_STEPS=10;
const USED_KEEP=10;
const EXPIRED_STEPS=5;
const LOCK_AFTER=5;
const LOCK_MS=10*60*1000;
const SENDER_MAX=10;
const SENDER_MS=60*60*1000;
const WINDOWS={web:1,sms:2,ivr:2};
const CARD_CODE=/^[A-Z2-9]{6}$/;

function counterAt(ms){return Math.floor(ms/1000/STEP_SECONDS);}
function counterBytes(counter){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(counter));return b;}
function hotp(key,counter,digits=6){
  const mac=crypto.createHmac('sha256',key).update(counterBytes(counter)).digest();
  const off=mac[mac.length-1]&0x0f;
  const bin=((mac[off]&0x7f)<<24)|(mac[off+1]<<16)|(mac[off+2]<<8)|mac[off+3];
  return String(bin%10**digits).padStart(digits,'0');
}
function spokenCode(secretHex,counter){return hotp(Buffer.from(secretHex,'hex'),counter,6);}
function formatSpoken(code){const s=String(code);return s.slice(0,3)+' '+s.slice(3);}
function qrTag(secretHex,counter){
  const mac=crypto.createHmac('sha256',Buffer.from(secretHex,'hex')).update('qr:'+counter).digest();
  let bits=0n;for(let i=0;i<5;i++)bits=(bits<<8n)|BigInt(mac[i]);
  let out='';for(let i=7;i>=0;i--)out+=ALPHABET[Number((bits>>BigInt(i*5))&31n)];
  return out;
}
function newSecret(random=crypto.randomBytes){return random(20).toString('hex');}
function normaliseSpoken(input){
  if(typeof input!=='string'&&typeof input!=='number')return null;
  const s=String(input).replace(/[\s.-]/g,'');
  return /^\d{6}$/.test(s)?s:null;
}
function normaliseCardRef(input){
  if(typeof input!=='string')return null;
  const s=input.trim().replace(/\s/g,'').toUpperCase();
  if(/^\d{5}$/.test(s))return {smsId:s};
  return CARD_CODE.test(s)?{cardCode:s}:null;
}
function scanUrl(base,cardId,counter,tag){return String(base).replace(/\/+$/,'')+'/s/'+cardId+'?t='+counter+'&k='+tag;}
function codeBatch(secretHex,nowMs){
  const from=counterAt(nowMs),codes=[];
  for(let i=0;i<BATCH_STEPS;i++)codes.push({spoken:spokenCode(secretHex,from+i),qr:qrTag(secretHex,from+i)});
  return {serverNow:new Date(nowMs).toISOString(),stepSeconds:STEP_SECONDS,fromCounter:from,codes};
}
function same(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
function recent(list,nowMs,ms){return (Array.isArray(list)?list:[]).filter(e=>Date.parse(e?.at)>nowMs-ms);}

function createCodeService({store,voucherFiles,now=Date.now}){
  if(!store)throw new Error('createCodeService needs a store');
  const iso=ms=>new Date(ms).toISOString();
  const fail=(code,extra={})=>({ok:false,code,...extra});

  function lockState(cardId){
    const until=Date.parse(store.get(cardId)?.vouch?.lockedUntil);
    return until>now()?{until:iso(until),reason:'wrong_codes'}:null;
  }

  function spokenWrong(cardId,t){
    let locked=null;
    store.update(cardId,e=>{
      const v=e.vouch,list=recent(v.failedAttempts,t,LOCK_MS);
      list.push({at:iso(t)});
      if(list.length>LOCK_AFTER){v.lockedUntil=iso(t+LOCK_MS);v.failedAttempts=[];locked=v.lockedUntil;}
      else v.failedAttempts=list;
    });
    return locked?fail('card_locked',{until:locked}):fail('code_wrong');
  }

  function accept(cardId,step,t,consume){
    if(consume)store.update(cardId,e=>{e.vouch.usedSteps=[...(e.vouch.usedSteps||[]),step].slice(-USED_KEEP);});
    return {ok:true,step,provedAt:iso(t)};
  }

  function verify(cardId,proof,{channel='web',consume=false}={}){
    const t=now(),entry=store.get(cardId);
    if(!entry||!entry.vouch?.secret)return fail('not_found');
    if(entry.withdrawnAt)return fail('card_withdrawn');
    const v=entry.vouch,secret=v.secret,cur=counterAt(t),back=WINDOWS[channel]??WINDOWS.web,used=v.usedSteps||[];
    const inWindow=step=>used.includes(step)?fail('code_used'):accept(cardId,step,t,consume);
    if(proof?.method==='qr'){
      const step=/^\d{1,15}$/.test(String(proof.t))?Number(proof.t):NaN;
      if(!(step<=cur)||typeof proof.k!=='string')return fail('code_wrong');
      if(step<cur-back)return fail('code_expired');
      return same(qrTag(secret,step),proof.k)?inWindow(step):fail('code_wrong');
    }
    const lockedUntil=Date.parse(v.lockedUntil);
    if(lockedUntil>t)return fail('card_locked',{until:iso(lockedUntil)});
    const code=normaliseSpoken(proof?.code);
    if(code){
      let hit=null,old=false;
      for(let step=cur-back;step<=cur;step++)if(same(spokenCode(secret,step),code))hit=step;
      if(hit!==null)return inWindow(hit);
      for(let step=cur-back-1;step>=cur-back-EXPIRED_STEPS;step--)if(same(spokenCode(secret,step),code))old=true;
      if(old)return fail('code_expired');
    }
    return spokenWrong(cardId,t);
  }

  function resolveCard(ref){
    if(typeof ref==='string')ref=normaliseCardRef(ref);
    if(!ref||typeof ref!=='object')return null;
    if(typeof ref.smsId==='string')return store.indexGet('smsids',ref.smsId);
    if(typeof ref.cardCode!=='string'||!CARD_CODE.test(ref.cardCode))return null;
    const hit=store.indexGet('codes',ref.cardCode);
    if(hit)return hit;
    // Cards published before codes.json existed: a scan over the store is the fallback (spec 9.6).
    for(const id of store.list())if(store.get(id)?.record?.code===ref.cardCode)return id;
    return null;
  }

  function senderBlocked(senderKey){
    const t=now(),ats=voucherFiles.read(senderKey).wrongCodes.map(e=>Date.parse(e?.at)).filter(Number.isFinite).sort((a,b)=>a-b);
    for(let i=SENDER_MAX-1;i<ats.length;i++)if(ats[i]-ats[i-SENDER_MAX+1]<=SENDER_MS&&t-ats[i]<SENDER_MS)return true;
    return false;
  }
  function recordSenderWrong(senderKey){
    const t=now();
    voucherFiles.update(senderKey,f=>{f.wrongCodes=[...recent(f.wrongCodes,t,2*SENDER_MS),{at:iso(t)}];});
  }

  return {verify,lockState,resolveCard,senderBlocked,recordSenderWrong};
}

module.exports={STEP_SECONDS,BATCH_STEPS,counterAt,hotp,spokenCode,formatSpoken,qrTag,newSecret,normaliseSpoken,normaliseCardRef,scanUrl,codeBatch,createCodeService};
