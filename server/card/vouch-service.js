'use strict';
/* YoVouch open step (spec 4.3, 7.2 step 2). open() is the one place a code is consumed and a vouch session
   opened: the scan form's 18-or-older POST, POST /api/vouch/open and, later, the SMS and call handlers all
   call it. Every refusal logs code_refused with its reason; every open logs vouch_opened. */
const fs=require('node:fs');
const path=require('node:path');
const {t,LANGS}=require('./copy.js');
const {STRINGS}=require('./render.js');
const {cardFields}=require('./events.js');
const {ALPHABET}=require('./store.js');
const {normalisePhone,keyedHash}=require('./vouchers.js');
const {capFor,recentFor,isSelfVouch,capMessage}=require('./vouches.js');
const {parseChips,checkWords,buildLine}=require('./vouch-lines.js');
const {flagsAtConfirm,cardCreatedMs}=require('./flags.js');
const {CONFIDENCE_FLOOR,sha256}=require('./transcribe.js');

const CHIPS=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','data','vouch-chips.json'),'utf8'));
const EXPIRES_IN_MS=30*60*1000;
const MINUTE=60000,HOUR=60*MINUTE;
const BIND_TTL_MS=10*MINUTE,BINDS_PER_HOUR=3;
const DEMO_TTL_MS=10*MINUTE,DEMO_WRONG=3,DEMO_PER_HOUR=3;
const REPLY_WINDOW_MS=15*MINUTE;
const MAX_FIRST_NAME=30;
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

// A gateway is configured when the simulator or the production webhook is on; otherwise the demo fallback runs.
// Takes config or config.yovouch.
function gatewayConfigured(config){
  const yv=config?.yovouch&&typeof config.yovouch==='object'?config.yovouch:config;
  return Boolean(yv?.sim||yv?.gatewaySecret);
}
const iso=ms=>new Date(ms).toISOString();
const withinHour=(list,nowMs)=>(Array.isArray(list)?list:[]).filter(e=>{const n=Date.parse(typeof e==='string'?e:e?.at);return n>nowMs-HOUR&&n<=nowMs;}).length;

function createVouchService(system){
  const {store,codes,sessions,events,yv}=system;

  function workerOf(entry){return {firstName:entry.record?.user?.firstName||'',trade:entry.record?.trade||''};}
  function refuse(code,{entry=null,channel,lang}){
    events.log('code_refused',{reason:code,channel,...(entry?cardFields(entry):{})});
    return {ok:false,status:STATUS[code]||400,code,message:messageFor(code,entry?.record?.user?.firstName,lang)};
  }
  function opened(vouchToken,session,entry){
    return {ok:true,vouchToken,worker:workerOf(entry),proof:{method:session.proof.method,step:session.proof.step,provedAt:session.proof.provedAt},
      bind:gatewayConfigured(yv)?'sms':'demo',expiresInMs:EXPIRES_IN_MS};
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

  // ---- Chips, words, disclosure, phone binding and confirm (spec 7.2 steps 2 to 7, plan Task 6) ----
  const nowMs=()=>system.now();
  const firstOf=entry=>entry?.record?.user?.firstName||'';
  const orgsOf=entry=>(entry?.record?.disclosed?.completions||[]).map(c=>String(c?.organizationName||'')).filter(Boolean);
  // The session and its card, or the refusal for a session that ended (30 minutes, or confirmed).
  function ctx(token){
    const session=system.sessions.get(token);
    const entry=session?store.get(session.cardId):null;
    if(!session||!entry?.record)return {ok:false,status:410,code:'session_ended',message:t('sessionEnded','en',{first:firstOf(entry)||'the worker'})};
    if(entry.withdrawnAt){system.sessions.delete(token);return {ok:false,status:410,code:'card_withdrawn',message:t('cardWithdrawn',session.lang)};}
    return {ok:true,session,entry,first:firstOf(entry),lang:session.lang};
  }
  function newSessionCode(){
    for(let i=0;i<20;i++){
      const bytes=system.random(6);let code='';
      for(let j=0;j<6;j++)code+=ALPHABET[bytes[j]%ALPHABET.length];
      if(!system.sessions.bySessionCode(code))return code;
    }
    throw new Error('could not allocate a session code');
  }
  // Which chips or words the voucher changed after seeing the read-back (private.editedFields, spec 15).
  function noteEdit(session,name){
    if(!session.readbackSeen)return;
    session.editedFields=[...new Set([...(session.editedFields||[]),name])];
  }

  function setChips(token,body){
    const c=ctx(token);if(!c.ok)return c;
    const {session,entry}=c;
    const r=parseChips(body,{chips:chipsFor(entry.record.tradeId),nowMs:nowMs(),country:entry.record.user?.country,organisationNames:orgsOf(entry)});
    if(!r.ok)return {ok:false,status:400,code:'invalid_input',fields:r.fields};
    for(const k of Object.keys(r.chips))if(session.chips&&session.chips[k]!==r.chips[k])noteEdit(session,k);
    session.chips=r.chips;
    session.step='disclose';
    return {ok:true,chips:r.chips};
  }
  // fromClip (the "Use these words" tap): the words came from this session's model transcript, so its numbers
  // are checked against that transcript and the record says wordsSource 'clip', transcription 'model'.
  function setWords(token,{text,lang,fromClip=false}={}){
    const c=ctx(token);if(!c.ok)return c;
    const {session,entry}=c,s=String(text??'').trim();
    const before=session.words?.text??null;
    if(!s){if(before!==null)noteEdit(session,'words');session.words=null;return {ok:true,text:''};}
    const transcript=fromClip===true&&session.transcript?.text?session.transcript.text:null;
    const r=checkWords(s,{organisationNames:orgsOf(entry),lang:LANGS.includes(lang)?lang:session.lang,transcript});
    if(!r.ok){
      session.rejected=[...(session.rejected||[]),{text:s,reason:r.reason}];
      return {ok:false,status:400,reason:r.reason,message:t('cannotKeep',session.lang)};
    }
    if(before!==r.text)noteEdit(session,'words');
    session.words={text:r.text,source:r.source,fromModel:transcript!=null};
    return {ok:true,text:r.text};
  }
  // A recorded clip (spec 7.2 step 3): kept in the session, held until the worker taps Show, and transcribed
  // inside the in-flight guard. Returns the route's JSON body. A failure logs transcription_failed {lang}.
  async function clipWords(token,{audio,contentType,seconds}={}){
    const c=ctx(token);if(!c.ok)return c;
    const {session,entry,lang}=c;
    session.clip={data:audio,contentType,seconds,bytes:audio.length,sha256:sha256(audio)};
    session.transcript=null;
    const tr=system.transcriber;
    if(!tr||tr.template)return {ok:true,body:{transcript:null,typed:true,messages:[t('sampleMode',lang)]}};
    const slot=system.withSlot||(fn=>fn());
    let r;
    try{r=await slot(()=>tr.transcribe({audio,contentType,lang}));}
    catch(err){
      if(err?.code==='busy')throw err;
      events.log('transcription_failed',{lang,channel:session.channel,...cardFields(entry)});
      return {ok:true,body:{transcript:null,typed:true}};
    }
    if(!String(r?.text??'').trim()||(r.confidence!=null&&r.confidence<CONFIDENCE_FLOOR))return {ok:true,body:{message:t('hearBadly',lang)}};
    session.transcript={text:r.text,lang:r.lang,confidence:r.confidence,unclear:r.unclear||[]};
    return {ok:true,body:{transcript:r.text,unclear:r.unclear||[],confidence:r.confidence}};
  }
  function setDisclose(token,{showMe,firstName,attachClip,showCard}={}){
    const c=ctx(token);if(!c.ok)return c;
    const {session,entry,first,lang}=c;
    const name=String(firstName??'').trim(),asName=showMe==='name';
    const nameOk=[...name].length>=1&&[...name].length<=MAX_FIRST_NAME&&/^\p{L}[\p{L}' -]*$/u.test(name)&&checkWords(name,{organisationNames:orgsOf(entry)}).ok;
    if(asName&&!nameOk)return {ok:false,status:400,code:'invalid_input',message:splitOptionsStem(t('showMeAs',lang,{first,name:'',digits:''}))};
    const yes=v=>v===true||v==='yes'||v==='on'||v==='1';
    session.disclose={showMe:asName?'name':'customer',firstName:asName?name:null,attachClip:yes(attachClip),showCard:yes(showCard)};
    session.step='bind';
    return {ok:true};
  }

  function issueBind(token){
    const c=ctx(token);if(!c.ok)return c;
    const {session,lang}=c,shortcode=yv?.shortcode||'12345';
    if(!gatewayConfigured(yv))return {ok:false,status:409,code:'demo_mode',message:t('demoNoGateway',lang)};
    const b=session.bind;
    if(session.step==='chips'||session.step==='disclose')session.step='bind';
    if(b?.at)return {sessionCode:b.sessionCode,shortcode,bound:true};
    if(b?.sessionCode&&nowMs()-b.issuedAt<=BIND_TTL_MS)return {sessionCode:b.sessionCode,shortcode,bound:false};
    session.bind={method:'sms_bind',sessionCode:newSessionCode(),issuedAt:nowMs(),voucherKey:null,phoneLast3:null,at:null,replyTo:null,error:null,mustKey:b?.mustKey??null};
    return {sessionCode:session.bind.sessionCode,shortcode,bound:false};
  }
  // The YES <session code> text from the customer's own phone. The first sender binds; a wrong or old code, a
  // second sender and a text after binding are ignored, and nothing is ever sent back.
  function bindBySms(fromRaw,sessionCode){
    const session=system.sessions.bySessionCode(String(sessionCode??'').trim().toUpperCase());
    const b=session?.bind;
    if(!b||b.method!=='sms_bind'||b.at||nowMs()-b.issuedAt>BIND_TTL_MS)return 'ignored';
    const entry=store.get(session.cardId);
    if(!entry?.record||entry.withdrawnAt)return 'ignored';
    const raw=String(fromRaw??'');
    const e164=normalisePhone(raw,entry.record.user?.country)||normalisePhone(raw,yv?.smsCountry);
    if(!e164)return 'ignored';
    const key=keyedHash(system.hashKey,e164),lang=session.lang;
    if(b.mustKey&&b.mustKey!==key)return 'ignored';       // one number per session, across a rebind
    const refuse=(result,message)=>{b.error=message;return result;};
    if(isSelfVouch(entry,key))return refuse('self',t('selfVouch',lang,{first:firstOf(entry)}));
    const file=system.voucherFiles.read(key);
    if(withinHour(file.binds,nowMs())>=BINDS_PER_HOUR)return refuse('cap_binds',t('capBinds',lang));
    const cap=capFor(file,session.cardId,nowMs());
    if(cap)return refuse(cap,capMessage(cap,lang));
    system.voucherFiles.update(key,f=>{f.binds.push({at:iso(nowMs())});});
    Object.assign(b,{voucherKey:key,phoneLast3:e164.slice(-3),at:nowMs(),replyTo:session.onWorkerPhone?e164:null,error:null});
    session.recentVouchId=recentFor(system.vouchStore.listByVoucherKey(key),session.cardId,nowMs())?.record?.vouchId??null;
    return 'bound';
  }
  function bindStatus(token){
    const session=system.sessions.get(token);
    if(!session)return null;
    const b=session.bind,bound=Boolean(b?.at);
    return {bound,phoneLast3:bound?b.phoneLast3:null,error:b?.error??null};
  }
  // Demo fallback (no gateway): the one-time code is shown on screen and nothing is sent to the typed number.
  function demoOtp(token,phoneRaw){
    const c=ctx(token);if(!c.ok)return {error:{code:c.code,message:c.message}};
    const {session,entry,first,lang}=c;
    if(gatewayConfigured(yv))return {error:{code:'not_found',message:STRINGS.notFound}};
    const raw=String(phoneRaw??'');
    const e164=normalisePhone(raw,entry.record.user?.country)||normalisePhone(raw,yv?.smsCountry);
    if(!e164)return {error:{code:'invalid_phone',message:t('demoNumberBad',lang)}};
    const key=keyedHash(system.hashKey,e164);
    if(session.demo&&session.demo.key!==key)return {error:{code:'one_number',message:t('demoOneNumber',lang,{first})}};
    if(isSelfVouch(entry,key))return {error:{code:'self',message:t('selfVouch',lang,{first})}};
    const file=system.voucherFiles.read(key);
    if(withinHour(file.otpSentAt,nowMs())>=DEMO_PER_HOUR)return {error:{code:'demo_cap',message:t('demoCap',lang)}};
    const cap=capFor(file,session.cardId,nowMs());
    if(cap)return {error:{code:cap,message:capMessage(cap,lang)}};
    const demoCode=String(system.random(4).readUInt32BE(0)%1000000).padStart(6,'0');
    system.voucherFiles.update(key,f=>{f.otpSentAt.push({at:iso(nowMs())});});
    session.demo={key,phoneLast3:e164.slice(-3),code:demoCode,issuedAt:nowMs(),wrong:session.demo?.wrong||0};
    session.recentVouchId=recentFor(system.vouchStore.listByVoucherKey(key),session.cardId,nowMs())?.record?.vouchId??null;
    session.step='readback';
    return {demoCode};
  }

  // The record the read-back shows and confirm stores (spec 9.1): chips only in the public part.
  function draftRecord(session,{method,last3}){
    const ch=session.chips,d=session.disclose||{showMe:'customer'};
    const fields={work:ch.work,words:null,wordsSource:null,when:ch.when,howOften:ch.howOften,hireAgain:ch.hireAgain};
    const named=d.showMe==='name'&&d.firstName&&last3;
    const p=session.proof||{};
    const transcription=session.words?(session.words.source==='clip'&&session.words.fromModel?'model':'typed'):'none';
    return {vouchId:null,cardId:session.cardId,kind:'customer',
      proof:{method:p.method,step:p.step,provedAt:p.provedAt,channel:p.channel||session.channel,onWorkerPhone:session.onWorkerPhone===true},
      voucher:{label:named?STRINGS.voucherShown(d.firstName,last3):STRINGS.aCustomer,firstName:named?d.firstName:null,phoneLast3:named?last3:null,
        phoneConfirmedBy:method,cardId:null,showCard:false,orgName:null,orgId:null,adultSelfDeclared:true},
      fields,line:buildLine('customer',fields),lang:session.lang,wordsShownAt:null,clip:null,restsOn:null,statement:null,acceptedAt:null,
      jobPostId:null,flags:[],visits:1,confirmedAt:iso(nowMs()),expiresAt:null,
      generation:{mode:transcription==='model'?'live':'sample',transcription}};
  }
  // The voucher as far as the session knows it: the bound phone, or the demo code's number.
  function voucherOf(session){
    if(!gatewayConfigured(yv))return session.demo?{method:'demo',key:session.demo.key,last3:session.demo.phoneLast3}:null;
    return session.bind?.at?{method:'sms_bind',key:session.bind.voucherKey,last3:session.bind.phoneLast3}:null;
  }
  function preview(token){
    const c=ctx(token);if(!c.ok||!c.session.chips)return null;
    const v=voucherOf(c.session)||{method:gatewayConfigured(yv)?'sms_bind':'demo',last3:null};
    return draftRecord(c.session,v);
  }

  // body = {fields, disclose:{firstName, phoneLast3, clip, showCard}, otp, adult, consent, visit}. The route sets
  // adult for a form post, whose 18-or-older answer opened the session; JSON must send adult:true itself.
  function confirm(token,body={}){
    const c=ctx(token);if(!c.ok)return c;
    const {session,entry,first,lang}=c,b=body&&typeof body==='object'?body:{};
    if(b.fields&&typeof b.fields==='object'){const r=setChips(token,b.fields);if(!r.ok)return r;}
    if(b.disclose&&typeof b.disclose==='object'){
      const d=b.disclose,name=String(d.firstName??'').trim();
      const r=setDisclose(token,{showMe:name?'name':'customer',firstName:name,attachClip:d.clip===true,showCard:d.showCard===true});
      if(!r.ok)return r;
    }
    if(!session.adult||b.adult!==true)return {ok:false,status:400,code:'adult_needed',message:splitOptionsStem(t('adultQ',lang))};
    if(!session.chips)return {ok:false,status:400,code:'invalid_input',fields:['work','when','howOften','hireAgain'],message:t('whatDid',lang,{first})};
    const visit=b.visit==='yes'||b.visit==='no'?b.visit:null;
    if(b.consent!==true&&visit!=='no')return {ok:false,status:400,code:'consent_needed',message:t('readIt',lang,{first})};
    let voucher;
    if(!gatewayConfigured(yv)){
      const d=session.demo;
      if(!d)return {ok:false,status:409,code:'not_bound',message:t('demoNoGateway',lang)};
      const otp=String(b.otp??'').replace(/[\s-]/g,'');
      const ended=()=>{system.sessions.delete(token);return {ok:false,status:400,code:'demo_wrong',message:t('demoWrong',lang,{first}),ended:true};};
      if(nowMs()-d.issuedAt>DEMO_TTL_MS)return ended();
      if(otp!==d.code){d.wrong=(d.wrong||0)+1;return d.wrong>=DEMO_WRONG?ended():{ok:false,status:400,code:'otp_wrong',message:t('demoCodeWrong',lang)};}
      voucher={method:'demo',key:d.key,last3:d.phoneLast3};
    }else{
      const bind=session.bind;
      if(!bind?.at)return {ok:false,status:409,code:'not_bound',message:t('waiting',lang)};
      // The withdraw SMS must leave inside the 15-minute rule: a slow confirm asks the same phone to text again.
      if(session.onWorkerPhone&&nowMs()-bind.at>REPLY_WINDOW_MS){
        session.bind={method:'sms_bind',sessionCode:newSessionCode(),issuedAt:nowMs(),voucherKey:null,phoneLast3:null,at:null,replyTo:null,error:null,mustKey:bind.voucherKey};
        session.step='bind';
        return {ok:false,rebind:true,sessionCode:session.bind.sessionCode};
      }
      voucher={method:'sms_bind',key:bind.voucherKey,last3:bind.phoneLast3};
    }
    const cap=capFor(system.voucherFiles.read(voucher.key),session.cardId,nowMs());
    if(cap){system.sessions.delete(token);return {ok:false,status:429,code:cap,message:capMessage(cap,lang)};}
    const recentFile=session.recentVouchId?system.vouchStore.get(session.recentVouchId):null;
    const recent=recentFile&&system.vouchStore.isLive(recentFile,nowMs())?recentFile:null;
    const counted=()=>system.voucherFiles.update(voucher.key,f=>{f.sessions.push({cardId:session.cardId,at:iso(nowMs())});});
    if(recent){
      const existingVouchId=recent.record.vouchId;
      if(!visit)return {ok:false,status:409,code:'voucher_recent',message:t('recent',lang,{first}),existingVouchId};
      system.sessions.delete(token);
      if(visit==='no')return {ok:true,vouchId:null,line:null,withdrawUrl:null,visitAdded:false};
      const file=system.vouchStore.update(existingVouchId,f=>{f.record.visits=(Number(f.record.visits)||1)+1;});
      counted();
      events.log('vouch_visit_added',{vouchId:existingVouchId,...cardFields(entry),channel:session.channel});
      return {ok:true,vouchId:existingVouchId,line:file.record.line,withdrawUrl:null,visitAdded:true};
    }
    const record=draftRecord(session,voucher);
    record.flags=flagsAtConfirm(system.vouchStore,record,cardCreatedMs(entry),nowMs());
    // The clip is stored only when the voucher ticked Attach; vouchStore.create writes it and holds it with the words.
    const clip=session.disclose?.attachClip&&session.clip?.data?session.clip:null;
    const held=session.words||clip?{words:session.words?.text??null,wordsSource:session.words?.source??null,clip:null}:null;
    const {vouchId,withdrawSecret}=system.vouchStore.create({record,held,channel:session.channel,clip,
      private:{voucherKey:voucher.key,editedFields:session.editedFields||[],rawTranscript:session.transcript?.text??null,rejected:session.rejected||[]}});
    counted();
    events.log('vouch_confirmed',{vouchId,...cardFields(entry),channel:session.channel,method:record.proof.method,kind:'customer',onWorkerPhone:record.proof.onWorkerPhone});
    const withdrawUrl=system.publicUrl+'/v/'+vouchId+'/withdraw?w='+withdrawSecret;
    const bySms=session.onWorkerPhone&&voucher.method==='sms_bind';
    if(bySms)system.outbox.send(session.bind.replyTo,t('withdrawSms',lang,{first,link:withdrawUrl}));
    if(session.bind)session.bind.replyTo=null;
    system.sessions.delete(token);
    return {ok:true,vouchId,line:record.line,withdrawUrl:bySms?null:withdrawUrl,visitAdded:false,withdrawSent:bySms,demo:voucher.method==='demo'};
  }

  return {open,setChips,setWords,clipWords,setDisclose,issueBind,bindBySms,bindStatus,demoOtp,confirm,preview};
}
const splitOptionsStem=s=>{const i=String(s).search(/[?:]/);return i<0?String(s):String(s).slice(0,i+1);};

module.exports={createVouchService,chipsFor,messageFor,gatewayConfigured,STATUS,EXPIRES_IN_MS,BIND_TTL_MS,REPLY_WINDOW_MS};
