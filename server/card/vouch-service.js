'use strict';
/* YoVouch open step (spec 4.3, 7.2 step 2). open() is the one place a code is consumed and a vouch session
   opened: the scan form's 18-or-older POST, POST /api/vouch/open and, later, the SMS and call handlers all
   call it. Every refusal logs code_refused with its reason; every open logs vouch_opened. With a voucherKey (the
   SMS path, plan Task 12) the self, cap and recent checks run after a matched code and before the step is used. */
const fs=require('node:fs');
const path=require('node:path');
const {t,LANGS}=require('./copy.js');
const {STRINGS,fullDate,evidenceLabel,safeUrl}=require('./render.js');
const {orgKeyOf}=require('./orgs.js');
const {cardFields}=require('./events.js');
const {ALPHABET,validId,secretsMatch,hashSecret}=require('./store.js');
const {normalisePhone,keyedHash}=require('./vouchers.js');
const {capFor,recentFor,isSelfVouch,capMessage,workerCapReached,withdrawnAtOf}=require('./vouches.js');
const {parseChips,checkWords,buildLine}=require('./vouch-lines.js');
const {flagsAtConfirm,cardCreatedMs,eligibility,PAIR_MS}=require('./flags.js');
const {noBannedClaims,noInventedNumbers}=require('../validate.js');
const {BANNED_CONFIRM_PHRASE}=require('./draft.js');
const {CONFIDENCE_FLOOR,sha256}=require('./transcribe.js');

const CHIPS=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','data','vouch-chips.json'),'utf8'));
const EXPIRES_IN_MS=30*60*1000;
const MINUTE=60000,HOUR=60*MINUTE;
const BIND_TTL_MS=10*MINUTE,BINDS_PER_HOUR=3;
const DEMO_TTL_MS=10*MINUTE,DEMO_WRONG=3,DEMO_PER_HOUR=3;
const REPLY_WINDOW_MS=15*MINUTE;
const MAX_FIRST_NAME=30;
const DAY_MS=86400000,REFERRAL_DAYS=30,MAX_STATEMENT=160,REFER_TTL_MS=30*MINUTE;
const REQUEST_DAYS=14,MAX_OPEN_REQUESTS=10;
const STATUS={code_expired:400,code_wrong:400,code_used:409,card_locked:429,card_withdrawn:410,not_found:404,self_vouch:403,
  voucher_cap_day:429,voucher_cap_cards:429,voucher_recent:409,not_eligible:403,request_used:409,request_expired:410,request_cap:429};

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
  if(code==='self_vouch')return t('selfVouch',lang,vars);
  if(code==='voucher_recent')return t('recent',lang,vars);
  if(code==='voucher_cap_day'||code==='voucher_cap_cards')return capMessage(code,lang);
  if(code==='not_eligible')return t('notEligible',lang);
  if(code==='request_used')return t('requestUsed',lang);
  if(code==='request_expired')return t('requestExpired',lang,vars);
  if(code==='request_cap')return t('requestCap',lang);
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
  function refuse(code,{entry=null,channel,lang,message}){
    events.log('code_refused',{reason:code,channel,...(entry?cardFields(entry):{})});
    return {ok:false,status:STATUS[code]||400,code,message:message||messageFor(code,entry?.record?.user?.firstName,lang)};
  }
  // A worker voucher needs no phone binding: the card token (or, on SMS, the number index) is the voucher.
  function opened(vouchToken,session,entry){
    return {ok:true,vouchToken,worker:workerOf(entry),proof:{method:session.proof.method,step:session.proof.step,provedAt:session.proof.provedAt},
      bind:session.voucher?.kind==='worker'?null:gatewayConfigured(yv)?'sms':'demo',expiresInMs:EXPIRES_IN_MS};
  }
  // The vouching card (spec 5.3, 7.4): found by its card token, or on SMS by the sender's Yoma-confirmed number.
  // The owner secret never matches. Then not the vouched card, eligible, and under the worker cap.
  function workerVoucher(entry,voucher,{channel,voucherKey,lang}){
    const vcId=typeof voucher.cardId==='string'?voucher.cardId:'',vEntry=validId(vcId)?store.get(vcId):null;
    const bySms=channel==='sms'&&Boolean(voucherKey)&&store.indexGet('numbers',voucherKey)===vcId;
    const token=typeof voucher.cardToken==='string'&&/^[0-9a-f]{16}$/.test(voucher.cardToken)?voucher.cardToken:null;
    if(!vEntry?.record||vEntry.withdrawnAt||!vEntry.vouch?.secret||(!bySms&&!(token&&secretsMatch(vEntry.cardTokenHash,token))))return {code:'not_found'};
    if(vcId===entry.cardId)return {code:'self_vouch'};
    const el=eligibility(vEntry,{vouchStore:system.vouchStore,nowMs:system.now()});
    if(!el.ok)return {code:'not_eligible'};
    // The spec 4.3 enum has no worker cap code, so the cards cap code carries the worker message (plan Task 13).
    if(workerCapReached(system.vouchStore.listByVoucherCard(vcId),system.now()))return {code:'voucher_cap_cards',message:t('workerCap',lang)};
    return {voucher:{kind:'worker',cardId:vcId,firstName:vEntry.record.user?.firstName||'',eligibility:{rule:el.rule,at:el.at}}};
  }

  // input = {cardId | cardRef, proof, voucher, voucherKey = null, phoneLast3, onWorkerPhone, channel, lang, formNonce}.
  // voucherKey (with phoneLast3) is known only on the SMS and call paths, where the sender's number is the voucher.
  async function open(input={}){
    const channel=['web','sms','ivr'].includes(input.channel)?input.channel:'web';
    const lang=LANGS.includes(input.lang)?input.lang:'en';
    // A request proof names its card through the request (plan Task 14); a cardId given with it must match.
    const rqId=input.proof?.method==='request'?String(input.proof.requestId??''):null;
    const rq=rqId&&validId(rqId)?system.requestStore.get(rqId):null;
    const cardId=input.cardId!=null?String(input.cardId):rqId!==null?rq?.cardId||null:codes.resolveCard(input.cardRef??null);
    const entry=cardId?store.get(cardId):null;
    if(!entry?.record)return refuse('not_found',{channel,lang});
    if(entry.withdrawnAt)return refuse('card_withdrawn',{entry,channel,lang});
    // A double tap posts the same form nonce: hand back the session the first tap opened (plan Task 4).
    const again=sessions.byNonce(input.formNonce);
    const prior=again?sessions.get(again):null;
    if(prior&&prior.cardId===entry.cardId)return opened(again,prior,entry);
    const proof=input.proof||{};
    if(proof.method==='request')return openRequest(entry,rq,input,{channel,lang});
    if(proof.method!=='qr'&&proof.method!=='code')return refuse('code_wrong',{entry,channel,lang});
    const voucherKey=typeof input.voucherKey==='string'&&/^[0-9a-f]{64}$/.test(input.voucherKey)?input.voucherKey:null;
    let voucher={kind:'customer'};
    if(input.voucher?.kind==='worker'){
      const w=workerVoucher(entry,input.voucher,{channel,voucherKey,lang});
      if(!w.voucher)return refuse(w.code,{entry,channel,lang,message:w.message});
      voucher=w.voucher;
    }else if(voucherKey){
      const pre=codes.verify(entry.cardId,proof,{channel,consume:false});
      if(!pre.ok)return refuse(pre.code,{entry,channel,lang});
      if(isSelfVouch(entry,voucherKey))return refuse('self_vouch',{entry,channel,lang});
      const cap=capFor(system.voucherFiles.read(voucherKey),entry.cardId,system.now());
      if(cap)return refuse(cap,{entry,channel,lang});
      const recent=recentFor(system.vouchStore.listByVoucherKey(voucherKey),entry.cardId,system.now());
      if(recent)return {...refuse('voucher_recent',{entry,channel,lang}),existingVouchId:recent.record.vouchId};
    }
    const r=codes.verify(entry.cardId,proof,{channel,consume:true});
    if(!r.ok)return refuse(r.code,{entry,channel,lang});
    const onWorkerPhone=input.onWorkerPhone===true;
    const {vouchToken,session}=sessions.open({cardId:entry.cardId,proof:{method:proof.method,step:r.step,provedAt:r.provedAt,channel,onWorkerPhone},
      voucher,onWorkerPhone,channel,lang,adult:true,formNonce:input.formNonce});
    // The SMS sender is the voucher: the number is taken from the sender, phoneConfirmedBy 'sms_origin' (spec 7.3).
    if(voucherKey)session.smsOrigin={key:voucherKey,last3:/^\d{3}$/.test(String(input.phoneLast3??''))?String(input.phoneLast3):null};
    events.log('vouch_opened',{channel,method:proof.method,...cardFields(entry)});
    return opened(vouchToken,session,entry);
  }

  // A request vouch (spec 7.8, plan Task 14): a past customer opens the worker's forwarded link, or a worker pastes it
  // on their own page. Web only. The first open marks the request used; a double tap re-opens the same session
  // through the form nonce, before this runs. Then the customer path runs unchanged, with its binding and caps.
  function openRequest(entry,rq,input,{channel,lang}){
    if(channel!=='web'||!rq||rq.kind!=='vouch'||rq.cardId!==entry.cardId)return refuse('not_found',{entry,channel,lang});
    if(rq.usedAt)return refuse('request_used',{entry,channel,lang});
    if(!(Date.parse(rq.expiresAt)>system.now()))return refuse('request_expired',{entry,channel,lang});
    let voucher={kind:'customer'};
    if(input.voucher?.kind==='worker'){
      const w=workerVoucher(entry,input.voucher,{channel,voucherKey:null,lang});
      if(!w.voucher)return refuse(w.code,{entry,channel,lang,message:w.message});
      voucher=w.voucher;
    }
    if(!system.requestStore.markUsed(rq.requestId))return refuse('request_used',{entry,channel,lang});
    const proof={method:'request',requestId:rq.requestId,step:null,provedAt:iso(system.now()),channel:'web',onWorkerPhone:false};
    const {vouchToken,session}=sessions.open({cardId:entry.cardId,proof,voucher,onWorkerPhone:false,channel:'web',lang,adult:true,formNonce:input.formNonce});
    events.log('request_opened',{requestId:rq.requestId,...cardFields(entry),kind:'vouch'});
    events.log('vouch_opened',{channel:'web',method:'request',...cardFields(entry)});
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
    const w=session.voucher?.kind==='worker'?session.voucher:null;
    const rq=p.method==='request'?{requestId:p.requestId}:{};
    // A worker line shows the vouching worker's first name and card, never a number; the SMS path asks no showCard.
    if(w)return {vouchId:null,cardId:session.cardId,kind:'worker',
      proof:{method:p.method,...rq,step:p.step,provedAt:p.provedAt,channel:p.channel||session.channel,onWorkerPhone:false},
      voucher:{label:w.firstName+"'s card",firstName:w.firstName,phoneLast3:null,phoneConfirmedBy:method,cardId:w.cardId,
        showCard:method==='card'&&d.showCard===true,orgName:null,orgId:null,adultSelfDeclared:true},
      eligibility:{rule:w.eligibility?.rule??null,at:w.eligibility?.at??null},
      fields,line:buildLine('worker',fields),lang:session.lang,wordsShownAt:null,clip:null,restsOn:null,statement:null,acceptedAt:null,
      jobPostId:null,flags:[],visits:1,confirmedAt:iso(nowMs()),expiresAt:null,
      generation:{mode:transcription==='model'?'live':'sample',transcription}};
    return {vouchId:null,cardId:session.cardId,kind:'customer',
      proof:{method:p.method,...rq,step:p.step,provedAt:p.provedAt,channel:p.channel||session.channel,onWorkerPhone:session.onWorkerPhone===true},
      voucher:{label:named?STRINGS.voucherShown(d.firstName,last3):STRINGS.aCustomer,firstName:named?d.firstName:null,phoneLast3:named?last3:null,
        phoneConfirmedBy:method,cardId:null,showCard:false,orgName:null,orgId:null,adultSelfDeclared:true},
      fields,line:buildLine('customer',fields),lang:session.lang,wordsShownAt:null,clip:null,restsOn:null,statement:null,acceptedAt:null,
      jobPostId:null,flags:[],visits:1,confirmedAt:iso(nowMs()),expiresAt:null,
      generation:{mode:transcription==='model'?'live':'sample',transcription}};
  }
  // The voucher as far as the session knows it: the bound phone, or the demo code's number.
  function voucherOf(session){
    if(session.voucher?.kind==='worker'&&!session.smsOrigin)return {method:'card',key:null,last3:null};
    if(session.smsOrigin)return {method:'sms_origin',key:session.smsOrigin.key,last3:session.smsOrigin.last3};
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
    if(session.voucher?.kind==='worker')return confirmWorker(token,c);
    let voucher;
    if(session.smsOrigin)voucher=voucherOf(session);
    else if(!gatewayConfigured(yv)){
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
    events.log('vouch_confirmed',{vouchId,...cardFields(entry),channel:session.channel,method:record.proof.method,kind:'customer',onWorkerPhone:record.proof.onWorkerPhone,
      ...(record.proof.requestId?{requestId:record.proof.requestId}:{})});
    const withdrawUrl=system.publicUrl+'/v/'+vouchId+'/withdraw?w='+withdrawSecret;
    const bySms=session.onWorkerPhone&&voucher.method==='sms_bind';
    if(bySms)system.outbox.send(session.bind.replyTo,t('withdrawSms',lang,{first,link:withdrawUrl}));
    if(session.bind)session.bind.replyTo=null;
    system.sessions.delete(token);
    // The SMS voucher types the 6-character secret back in REMOVE; no link is sent.
    if(voucher.method==='sms_origin')return {ok:true,vouchId,line:record.line,withdrawUrl:null,withdrawSecret,visitAdded:false};
    return {ok:true,vouchId,line:record.line,withdrawUrl:bySms?null:withdrawUrl,visitAdded:false,withdrawSent:bySms,demo:voucher.method==='demo'};
  }

  // A worker vouch (spec 7.4 step 5): no binding, the worker cap again at confirm, no voucher file. The vouched worker
  // is told only through a chat they opened in the last 15 minutes; otherwise nothing is sent.
  function confirmWorker(token,{session,entry}){
    const w=session.voucher,vEntry=store.get(w.cardId),voucher=voucherOf(session);
    const end=r=>{system.sessions.delete(token);return r;};
    if(!vEntry?.record||vEntry.withdrawnAt)return end({ok:false,status:410,code:'card_withdrawn',message:t('cardWithdrawn',session.lang)});
    if(workerCapReached(system.vouchStore.listByVoucherCard(w.cardId),nowMs()))return end({ok:false,status:429,code:'voucher_cap_cards',message:t('workerCap',session.lang)});
    const record=draftRecord(session,voucher);
    record.flags=flagsAtConfirm(system.vouchStore,record,cardCreatedMs(entry),nowMs());
    const clip=session.disclose?.attachClip&&session.clip?.data?session.clip:null;
    const held=session.words||clip?{words:session.words?.text??null,wordsSource:session.words?.source??null,clip:null}:null;
    const {vouchId,withdrawSecret}=system.vouchStore.create({record,held,channel:session.channel,clip,
      private:{voucherKey:voucher.key,editedFields:session.editedFields||[],rawTranscript:session.transcript?.text??null,rejected:session.rejected||[]}});
    events.log('vouch_confirmed',{vouchId,...cardFields(entry),channel:session.channel,method:record.proof.method,kind:'worker',voucherCardId:w.cardId,
      ...(record.proof.requestId?{requestId:record.proof.requestId}:{})});
    const lang=LANGS.includes(entry.vouch?.lang)?entry.vouch.lang:'en';
    if(entry.ownerPhoneHash)system.outbox.sendToKey(entry.ownerPhoneHash,t('vouchedForYou',lang,{name:w.firstName}));
    end();
    return {ok:true,vouchId,line:record.line,withdrawUrl:null,worker:true,visitAdded:false,...(voucher.method==='sms_origin'?{withdrawSecret}:{})};
  }
  // A live worker vouch from the vouched card to the vouching card, under 14 days old: the read-back says the
  // pair will be marked "Vouched for each other" (spec 7.4 step 4).
  function reciprocal(token){
    const session=system.sessions.get(token),w=session?.voucher;
    if(w?.kind!=='worker')return false;
    // As the flag itself does (workerEdges), a hidden line still counts; a withdrawn one does not.
    return system.vouchStore.listByVoucherCard(session.cardId).some(f=>f.record.kind==='worker'&&f.record.cardId===w.cardId&&
      system.vouchStore.isLive({...f,private:{...f.private,hiddenAt:null}},nowMs())&&nowMs()-Date.parse(f.record.confirmedAt)<=PAIR_MS);
  }

  // A second matched code this month from the same number adds a visit to its live vouch (the SMS YES after "recent").
  function addVisit({vouchId,voucherKey,channel='sms',lang='en'}={}){
    const file=system.vouchStore.get(vouchId);
    if(!file?.record||!voucherKey||file.private?.voucherKey!==voucherKey||!system.vouchStore.isLive(file,nowMs()))return {ok:false,code:'not_found',message:t('smsNothing',lang)};
    const cap=capFor(system.voucherFiles.read(voucherKey),file.record.cardId,nowMs());
    if(cap)return {ok:false,code:cap,message:capMessage(cap,lang)};
    system.vouchStore.update(vouchId,f=>{f.record.visits=(Number(f.record.visits)||1)+1;});
    system.voucherFiles.update(voucherKey,f=>{f.sessions.push({cardId:file.record.cardId,at:iso(nowMs())});});
    events.log('vouch_visit_added',{vouchId,...cardFields(store.get(file.record.cardId)||{cardId:file.record.cardId}),channel});
    return {ok:true,vouchId};
  }

  return {open,setChips,setWords,clipWords,setDisclose,issueBind,bindBySms,bindStatus,demoOtp,confirm,preview,addVisit,reciprocal,...createReferrals(system)};
}
// ---- Organisation referral (spec 7.5, plan Task 13) ----
// Each disclosed completion organisation once, with its newest completion by dateCompleted: the worker page's
// "Ask <organisation> to refer me" buttons carry that completion's evidenceId.
function referralOrgs(record){
  const byOrg=new Map();
  for(const c of record?.disclosed?.completions||[]){
    const org=String(c?.organizationName||'').trim();
    if(!org)continue;
    const before=byOrg.get(org);
    if(!before||(Date.parse(c.dateCompleted)||0)>(Date.parse(before.dateCompleted)||0))byOrg.set(org,c);
  }
  return [...byOrg].map(([org,c])=>({org,evidenceId:String(c.evidenceId)}));
}
// The statement (spec 7.5 step 4): under 160 characters, no credential words, no Yoma confirmation phrase, and no
// number the completion year or the post does not hold. It is kept verbatim.
function statementOk(statement,{year,rawText}){
  const s=String(statement??'').trim(),n=[...s].length;
  return n>=1&&n<=MAX_STATEMENT&&noBannedClaims(s).ok&&!BANNED_CONFIRM_PHRASE.test(s)&&noInventedNumbers(s,{dates:year,context:rawText}).ok;
}
function createReferrals(system){
  const {store,events}=system;
  const nowMs=()=>system.now(),referSessions=new Map();
  const fail=(status,code,message)=>({ok:false,status,code,message});
  const firstOf=entry=>entry?.record?.user?.firstName||'';
  const langOf=entry=>LANGS.includes(entry?.vouch?.lang)?entry.vouch.lang:'en';
  function cardByToken(cardId,cardToken){
    if(!validId(cardId)||typeof cardToken!=='string'||!/^[0-9a-f]{16}$/.test(cardToken))return null;
    const entry=store.get(cardId);
    return entry?.record&&entry.vouch?.secret&&secretsMatch(entry.cardTokenHash,cardToken)?entry:null;
  }
  const completionOf=(entry,evidenceId)=>(entry?.record?.disclosed?.completions||[]).find(c=>String(c?.evidenceId)===String(evidenceId))||null;
  const textOf=v=>String(v?.text??'').trim();
  // The chat the worker opened: the linked WhatsApp number, else the owner's number. Nothing when none is open.
  const tellWorker=(entry,text)=>{const key=entry.linkedPhoneHash||entry.ownerPhoneHash;return key?system.outbox.sendToKey(key,text):false;};

  function createReferralRequest(cardId,cardToken,{jobPostId,evidenceId}={}){
    const entry=cardByToken(cardId,cardToken);
    if(!entry)return fail(404,'not_found',STRINGS.notFound);
    if(entry.withdrawnAt)return fail(410,'card_withdrawn',t('cardWithdrawn'));
    const lang=langOf(entry),post=validId(jobPostId)?system.postStore.get(jobPostId):null;
    if(!post)return fail(404,'not_found',t('cannotRead',lang));
    const c=completionOf(entry,evidenceId),org=String(c?.organizationName||'').trim();
    if(!c||!org)return fail(403,'not_eligible',t('referralNoOrg',lang));
    const expires=(Date.parse(post.postedAt)||nowMs())+REFERRAL_DAYS*DAY_MS;
    if(expires<=nowMs())return fail(410,'request_expired',t('requestExpired',lang,{first:firstOf(entry)}));
    const {requestId,expiresAt}=system.requestStore.create({kind:'referral',cardId,ttlMs:expires-nowMs(),jobPostId,evidenceId:String(c.evidenceId),orgName:org});
    events.log('request_created',{requestId,...cardFields(entry),kind:'referral'});
    const url=system.publicUrl+'/o/'+requestId;
    return {ok:true,requestId,url,expiresAt,text:t('forwardOrg',lang,{org,link:url})};
  }

  // A request link for a past customer or worker (spec 7.8, plan Task 14): 14 days, single use, at most 10 open per
  // card (referral requests do not count). YoVouch sends nothing: the worker forwards the text.
  function newRequest(entry){
    const lang=langOf(entry);
    if(entry.withdrawnAt)return fail(410,'card_withdrawn',t('cardWithdrawn',lang));
    if(system.requestStore.listOpen(entry.cardId,'vouch').length>=MAX_OPEN_REQUESTS)return {...fail(429,'request_cap',t('requestCap',lang)),error:'request_cap'};
    const {requestId,expiresAt}=system.requestStore.create({kind:'vouch',cardId:entry.cardId,ttlMs:REQUEST_DAYS*DAY_MS});
    events.log('request_created',{requestId,...cardFields(entry),kind:'vouch'});
    const url=system.publicUrl+'/a/'+requestId;
    return {ok:true,requestId,url,expiresAt,text:t('requestForward',lang,{first:firstOf(entry),link:url})};
  }
  function createRequest(cardId,cardToken){
    const entry=cardByToken(cardId,cardToken);
    return entry?newRequest(entry):fail(404,'not_found',STRINGS.notFound);
  }
  // REQUEST by SMS: the sender's keyed hash names the card through numbers/ (the owner's confirmed number).
  function requestFromNumber(senderKey){
    const cardId=typeof senderKey==='string'?store.indexGet('numbers',senderKey):null,entry=cardId?store.get(cardId):null;
    return entry?.record&&entry.vouch?.secret?newRequest(entry):fail(404,'not_found',STRINGS.notFound);
  }

  // The open referral request with its card, completion and post, or the refusal.
  function requestContext(requestId){
    const rq=system.requestStore.get(requestId);
    if(!rq||rq.kind!=='referral')return fail(404,'not_found',STRINGS.notFound);
    const entry=store.get(rq.cardId);
    if(!entry?.record)return fail(404,'not_found',STRINGS.notFound);
    if(entry.withdrawnAt)return fail(410,'card_withdrawn',t('cardWithdrawn'));
    if(rq.usedAt)return fail(409,'request_used',t('requestUsed'));
    const post=system.postStore.get(rq.jobPostId);
    if(Date.parse(rq.expiresAt)<=nowMs()||!post)return fail(410,'request_expired',t('requestExpired','en',{first:firstOf(entry)}));
    const c=completionOf(entry,rq.evidenceId);
    if(!c||orgKeyOf(c.organizationName)!==orgKeyOf(rq.orgName))return fail(403,'forbidden',t('orgKeyWrong'));
    return {ok:true,rq,entry,c,post};
  }
  // What the organisation page shows (spec 7.5 step 3). The label uses today's date: it is signed on the worker's YES.
  function orgView({rq,entry,c,post}){
    const p=post.parsed||{},fictional=!String(c.opportunityId||'');
    return {requestId:rq.requestId,orgName:String(c.organizationName),firstName:firstOf(entry),trade:entry.record.trade||'',
      completion:{title:String(c.title||''),date:fullDate(c.dateCompleted),evidence:evidenceLabel(c),fictional,link:fictional?null:safeUrl(c.live?.yomaInfoURL)},
      post:{work:textOf(p.work),area:textOf(p.area),pay:textOf(p.pay),start:textOf(p.start)},
      date:fullDate(iso(nowMs()))};
  }
  function orgOpen(requestId,orgKey){
    const r=requestContext(requestId);
    if(!r.ok)return r;
    if(!system.orgStore.check(r.rq.orgName,typeof orgKey==='string'?orgKey:''))return fail(403,'forbidden',t('orgKeyWrong'));
    const referToken=system.random(12).toString('hex');
    for(const [k,v] of referSessions)if(nowMs()-v.at>REFER_TTL_MS)referSessions.delete(k);
    referSessions.set(referToken,{requestId:r.rq.requestId,at:nowMs()});
    events.log('request_opened',{requestId:r.rq.requestId,...cardFields(r.entry),kind:'referral'});
    return {ok:true,referToken,view:orgView(r),worker:{firstName:firstOf(r.entry),trade:r.entry.record.trade||''},
      proof:{method:'request',step:null,provedAt:iso(nowMs())},expiresInMs:REFER_TTL_MS};
  }
  function referSession(referToken){
    const ses=typeof referToken==='string'?referSessions.get(referToken):null;
    if(!ses||nowMs()-ses.at>REFER_TTL_MS)return null;
    return ses;
  }
  function orgViewFor(referToken){
    const ses=referSession(referToken),r=ses?requestContext(ses.requestId):null;
    return r?.ok?orgView(r):null;
  }

  // The draft referral: stored, not live until the worker's YES. orgWrote goes only into a chat the worker opened.
  function orgSend(referToken,statement){
    const ses=referSession(referToken);
    if(!ses)return fail(410,'session_ended',t('sessionEnded','en',{first:'the worker'}));
    const r=requestContext(ses.requestId);
    if(!r.ok)return r;
    const {rq,entry,c,post}=r,s=String(statement??'').trim();
    if(!statementOk(s,{year:String(new Date(c.dateCompleted).getUTCFullYear()),rawText:post.rawText}))return fail(400,'invalid_input',t('sayWhatYouSaw'));
    if(!system.requestStore.markUsed(rq.requestId))return fail(409,'request_used',t('requestUsed'));
    const at=iso(nowMs()),org=String(c.organizationName),p=post.parsed||{};
    const restsOn={evidenceId:String(c.evidenceId),opportunityId:c.opportunityId||null,title:String(c.title||'')};
    const jobPost={work:textOf(p.work),area:textOf(p.area),postedAt:post.postedAt};
    const record={vouchId:null,cardId:entry.cardId,kind:'organisation',proof:{method:'request',step:null,provedAt:at,channel:'web',onWorkerPhone:false},
      voucher:{label:org,firstName:null,phoneLast3:null,phoneConfirmedBy:'org_key',cardId:null,showCard:false,orgName:org,
        orgId:c.organizationId||system.orgStore.get(org)?.orgId||null,adultSelfDeclared:null},
      fields:null,line:buildLine('organisation',null,{statement:s,restsOn,jobPost,at}),lang:'en',wordsShownAt:null,clip:null,restsOn,statement:s,
      acceptedAt:null,jobPostId:rq.jobPostId,jobPost,flags:[],visits:1,confirmedAt:null,
      expiresAt:iso((Date.parse(post.postedAt)||nowMs())+REFERRAL_DAYS*DAY_MS),generation:{mode:'sample',transcription:'none'}};
    const {vouchId}=system.vouchStore.create({record,private:{referTokenHash:hashSecret(referToken),requestId:rq.requestId}});
    tellWorker(entry,t('orgWrote',langOf(entry),{org,sentence:s,job:jobPost.work,date:fullDate(at),title:restsOn.title}));
    return {ok:true,vouchId};
  }

  // The worker's YES signs the referral and puts it on the card; NO deletes the draft (spec 7.5 step 6).
  function acceptReferral(vouchId,cardId,cardToken,answer){
    const entry=cardByToken(cardId,cardToken);
    if(!entry||entry.withdrawnAt)return fail(404,'not_found',STRINGS.notFound);
    const lang=langOf(entry),file=system.vouchStore.get(vouchId);
    if(!file?.record||file.record.kind!=='organisation'||file.record.cardId!==entry.cardId||withdrawnAtOf(file,nowMs()))return fail(404,'not_found',STRINGS.notFound);
    if(file.record.acceptedAt)return {ok:true,message:t('referralDone',lang)};
    if(answer!=='yes'&&answer!=='no')return fail(400,'invalid_input','answer must be "yes" or "no".');
    if(answer==='no'){system.vouchStore.remove(vouchId);return {ok:true,message:t('referralDeclined',lang)};}
    const at=iso(nowMs());
    system.vouchStore.update(vouchId,f=>{
      const rec=f.record;
      rec.acceptedAt=at;rec.confirmedAt=at;
      rec.line=buildLine('organisation',null,{statement:rec.statement,restsOn:rec.restsOn,jobPost:rec.jobPost,at});
    });
    events.log('vouch_confirmed',{vouchId,...cardFields(entry),channel:'web',method:'request',kind:'organisation'});
    return {ok:true,message:t('referralDone',lang)};
  }

  // The organisation's withdraw form carries the refer token; only its hash is kept on the referral.
  function withdrawReferral(referToken,requestId=null){
    if(typeof referToken!=='string'||!/^[0-9a-f]{24}$/.test(referToken))return {ok:false};
    const file=system.vouchStore.listAll().find(f=>f.record?.kind==='organisation'&&secretsMatch(f.private?.referTokenHash,referToken));
    if(!file||(requestId&&file.private.requestId!==requestId))return {ok:false};
    const vouchId=file.record.vouchId,entry=store.get(file.record.cardId);
    if(withdrawnAtOf(file,nowMs()))return {ok:true,vouchId};
    system.vouchStore.withdrawAs(vouchId,'now');
    events.log('vouch_withdrawn',{vouchId,...cardFields(entry||{cardId:file.record.cardId}),mode:'now',by:'org'});
    if(file.record.acceptedAt&&entry)tellWorker(entry,t('referralWithdrawnMsg',langOf(entry),{org:file.record.voucher.orgName}));
    return {ok:true,vouchId};
  }

  return {createRequest,requestFromNumber,createReferralRequest,orgOpen,orgViewFor,orgSend,acceptReferral,withdrawReferral};
}
const splitOptionsStem=s=>{const i=String(s).search(/[?:]/);return i<0?String(s):String(s).slice(0,i+1);};

module.exports={referralOrgs,statementOk,createVouchService,chipsFor,messageFor,gatewayConfigured,STATUS,EXPIRES_IN_MS,BIND_TTL_MS,REPLY_WINDOW_MS,REQUEST_DAYS,MAX_OPEN_REQUESTS};
