'use strict';
/* YoVouch routes (spec 9.5), delegated from createCardRouter. handle(req,res,url) returns false when the
   request is not a YoVouch route, otherwise a promise that resolves to true once the response is sent.
     GET  /my/:cardId/:cardToken           the worker's code page (works without JavaScript)
     POST /my/:cardId/:cardToken/lang      stores vouch.lang
     POST /api/vouch/codes                 {cardId, cardToken} -> the next 10 codes and the server time
     GET  /qr-browser.js                   server/qr.js for the browser, cached a day
     GET  /s/:cardId?t=&k=[&w=1]           scan landing page; checks the code, consumes nothing
     GET  /s/:cardId | GET /s              typed path: the six digits (and first the card code or card number)
     POST /s/:cardId | POST /s             the 18-or-older answer: consumes the step, opens the session, chips page
     POST /api/vouch/open                  the JSON form of the same step (spec 4.3)
     GET  /v/:vouchId.json                 {record, jwt, jwksUrl, held}, signed with sub: vouchId; 410 unless live
     GET  /v/:vouchId/clip                 410 unless live (clip storage arrives with Task 11)
     GET  /v/:vouchId/withdraw?w=          the withdraw question; POST (w, mode now|quiet) withdraws
     POST /api/vouch/:vouchToken/chips     chips (and, from the no-JS form, words); JSON or form
     POST /api/vouch/:vouchToken/words     {text, lang}
     POST|GET /api/vouch/:vouchToken/bind  issue the YES session code | {bound, phoneLast3, error}
     POST /api/vouch/:vouchToken/otp       demo fallback, mounted only when no gateway is configured
     POST /api/vouch/:vouchToken/confirm   publish; the form gets the done page
     GET|POST /s/t/:vouchToken             the session page for its step (chips, disclose, bind, readback);
                                           the no-JS disclosure form and "Change something" post here
     GET  /my/:cardId/:cardToken/status.json and POST .../hide|show|show-words {vouchId}
     POST /api/sms/webhook                 gateway, only when YOVOUCH_GATEWAY_SECRET is set (constant-time header check)
     POST /api/sim/sms and GET /demo/phone the simulated gateway, only when YOVOUCH_SIM=1 and no gateway secret
   Every response that carries a live code or the card token is private: no-store and no-referrer. A form
   post (application/x-www-form-urlencoded) gets HTML back; JSON gets JSON. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {validId,secretsMatch}=require('./store.js');
const {codeBatch,normaliseCardRef}=require('./vouchcode.js');
const {LANGS,t,splitOptions}=require('./copy.js');
const {STRINGS}=require('./render.js');
const {flowPage,workerPage,scanPage,typedPage,adultsOnlyPage,errorPage,chipsPage,withdrawPage,
  disclosePage,bindPage,readbackPage,donePage,demoPhonePage}=require('./pages.js');
const {tierItem}=require('./vouch-lines.js');
const {withdrawnAtOf}=require('./vouches.js');
const {signRecord}=require('./sign.js');
const {cardFields}=require('./events.js');
const {chipsFor,messageFor,gatewayConfigured,STATUS}=require('./vouch-service.js');
const {myUrl}=require('./vouch-system.js');

const MY_PATH=/^\/my\/([A-Z2-9]{10})\/([0-9a-f]{16})(\/[a-z-]+(?:\.json)?)?$/;
const SCAN_PATH=/^\/s(?:\/([A-Z2-9]{10}))?$/;
const VOUCH_PATH=/^\/v\/([A-Z2-9]{10})(\.json|\/clip|\/withdraw)?$/;
const NONCE=/^[0-9a-f]{16}$/;
const SESSION_PAGE=/^\/s\/t\/([0-9a-f]{24})$/;
const API_SESSION=/^\/api\/vouch\/([0-9a-f]{24})\/(chips|words|bind|otp|confirm)$/;
const ARRIVED_MS=10*60*1000;
const MAX_FORM_BYTES=64*1024;
const PRIVATE={'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};

function send(res,status,body,type,extra={}){
  const data=Buffer.from(body);
  res.writeHead(status,{'content-type':type,'content-length':data.length,...PRIVATE,...extra});
  res.end(data);
}
function sendPage(res,status,html){send(res,status,html,'text/html; charset=utf-8');}
function sendPrivateJSON(res,status,payload){send(res,status,JSON.stringify(payload),'application/json; charset=utf-8');}
function sendError(res,status,code,message,retryable=false){sendPrivateJSON(res,status,{error:{code,message,retryable}});}
function redirect(res,location){res.writeHead(303,{location,'content-length':0,...PRIVATE});res.end();}

// The gateway's shared secret, compared in constant time over SHA-256 digests so the lengths always match.
function gatewaySecretOk(header,secret){
  if(typeof header!=='string'||typeof secret!=='string'||!header||!secret)return false;
  const a=crypto.createHash('sha256').update(header).digest(),b=crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a,b);
}

function inputError(message){const err=new Error(message);err.code='invalid_input';return err;}
// URL-encoded form body, 64 KB cap; repeated names keep the last value.
function readForm(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0,tooLarge=false;
    req.on('data',chunk=>{
      if(tooLarge)return;
      size+=chunk.length;
      if(size>MAX_FORM_BYTES){tooLarge=true;reject(inputError('The request body must be under 64 KB.'));req.resume();return;}
      chunks.push(chunk);
    });
    req.on('error',reject);
    req.on('end',()=>{if(!tooLarge)resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8'))));});
  });
}
function isPlainObject(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
const field=v=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):'';
const langOf=v=>LANGS.includes(v)?v:'en';
function isForm(req){return /^application\/x-www-form-urlencoded\b/i.test(String(req.headers?.['content-type']||''));}

// server/qr.js rewritten for the browser once (spec 4.3): TextEncoder for Buffer, no module.exports, an IIFE.
let qrBrowserSource=null;
function qrBrowser(){
  if(qrBrowserSource)return qrBrowserSource;
  const src=fs.readFileSync(path.join(__dirname,'..','qr.js'),'utf8');
  if(!src.includes("Buffer.from(text,'utf8')"))throw new Error('server/qr.js no longer reads text with Buffer.from');
  const body=src.replace(/^'use strict';\n?/,'').replace("Buffer.from(text,'utf8')",'new TextEncoder().encode(text)').replace(/^module\.exports=.*$/m,'');
  qrBrowserSource="(function(){'use strict';\n"+body+"window.qrSvg=qrSvg;})();\n";
  return qrBrowserSource;
}

function createVouchRouter(system){
  const {store,codes,now,sessions,service,vouchStore,events,key}=system;
  const readJSONBody=req=>require('../../server.js').readJSONBody(req);
  // Raw bodies (audio uploads, Task 11) go through server.js too, loaded lazily for the same reason.
  const readRawBody=(req,maxBytes)=>require('../../server.js').readRawBody(req,maxBytes);
  void readRawBody;
  const sampleMode=!system.liveModel;
  const notFound=()=>flowPage({title:STRINGS.notFound,body:'<section class="notice"><h1>'+STRINGS.notFound+'</h1></section>',sampleMode});

  async function readBody(req,res){
    try{return await (isForm(req)?readForm(req):readJSONBody(req));}
    catch(err){
      if(err?.code==='invalid_input'||err?.name==='InputError'){
        if(isForm(req))sendPage(res,400,flowPage({title:'YoCard',body:'<p class="bad">'+err.message+'</p>',sampleMode}));
        else sendError(res,400,'invalid_input',err.message);
        return undefined;
      }
      throw err;
    }
  }

  // The card for a card token, or null. Only the token's hash is stored; the owner secret never matches it.
  function cardFor(cardId,cardToken){
    if(!validId(cardId)||typeof cardToken!=='string'||!/^[0-9a-f]{16}$/.test(cardToken))return null;
    const entry=store.get(cardId);
    if(!entry?.record||!entry.vouch?.secret||!secretsMatch(entry.cardTokenHash,cardToken))return null;
    return entry;
  }

  function myPage(res,entry,cardToken){
    if(entry.withdrawnAt)return sendPage(res,410,flowPage({title:t('cardWithdrawn'),body:'<section class="notice"><h1>'+t('cardWithdrawn')+'</h1></section>',sampleMode}));
    const nowMs=now(),lang=LANGS.includes(entry.vouch.lang)?entry.vouch.lang:'en';
    const mine=ownVouches(entry,nowMs),live=mine.filter(f=>vouchStore.isLive(f,nowMs));
    const newest=Math.max(...mine.map(f=>Date.parse(f.record.confirmedAt)||0),0);
    const vouches=mine.slice().reverse().map(f=>({vouchId:f.record.vouchId,line:tierItem(f.record,firstOf(entry),{nowMs}).line,
      words:f.held?.words||null,hidden:Boolean(f.private?.hiddenAt),held:Boolean(f.held)&&!f.record.wordsShownAt}));
    sendPage(res,200,workerPage({entry,record:entry.record,batch:codeBatch(entry.vouch.secret,nowMs),locked:codes.lockState(entry.cardId),lang,
      publicUrl:system.publicUrl,myUrl:myUrl(system,entry.cardId,cardToken),nowMs,sampleMode,yv:system.yv,
      vouches,arrived:newest>0&&nowMs-newest<=ARRIVED_MS,waiting:live.filter(waitingWords).length,liveCount:live.length}));
  }

  // ---- The worker's own vouch list (spec 9.5, plan Task 6) ----
  // Every line of the card not withdrawn, hidden ones included, oldest first; organisation referrals arrive with Task 13.
  function ownVouches(entry,nowMs){return vouchStore.listForCard(entry.cardId).filter(f=>f.record&&!withdrawnAtOf(f,nowMs)&&f.record.kind!=='organisation');}
  const waitingWords=f=>Boolean(f.held)&&!f.record.wordsShownAt;
  function myStatus(res,entry){
    const nowMs=now(),live=ownVouches(entry,nowMs).filter(f=>vouchStore.isLive(f,nowMs));
    const last=live.map(f=>f.record.confirmedAt).sort().at(-1)||null;
    sendPrivateJSON(res,200,{vouchCount:live.length,lastVouchAt:last,wordsWaiting:live.filter(waitingWords).length});
  }
  async function myAction(req,res,entry,cardToken,action){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const vouchId=field(isPlainObject(payload)?payload.vouchId:'');
    const ok=validId(vouchId)&&(action==='hide'?vouchStore.hide(vouchId,entry.cardId):action==='show'?vouchStore.show(vouchId,entry.cardId):Boolean(vouchStore.showWords(vouchId,entry.cardId)));
    if(form)return ok?redirect(res,'/my/'+entry.cardId+'/'+cardToken):sendPage(res,404,notFound());
    return ok?sendPrivateJSON(res,200,{vouchId,ok:true}):sendError(res,404,'not_found','No vouch with this id on this card.');
  }

  async function setLang(req,res,entry,cardToken){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const lang=payload&&typeof payload==='object'?payload.lang:null;
    if(!LANGS.includes(lang)){
      if(form)return sendPage(res,400,flowPage({title:'YoCard',body:'<p class="bad">'+t('languageMenu')+'</p>',sampleMode}));
      return sendError(res,400,'invalid_input','lang must be one of '+LANGS.join(', ')+'.');
    }
    store.update(entry.cardId,e=>{e.vouch.lang=lang;});
    if(form)return redirect(res,'/my/'+entry.cardId+'/'+cardToken);
    sendPrivateJSON(res,200,{lang});
  }

  async function apiCodes(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    const entry=cardFor(payload?.cardId,payload?.cardToken);
    if(!entry)return sendError(res,404,'not_found',STRINGS.notFound);
    if(entry.withdrawnAt)return sendError(res,410,'card_withdrawn',t('cardWithdrawn'));
    sendPrivateJSON(res,200,{...codeBatch(entry.vouch.secret,now()),locked:codes.lockState(entry.cardId)});
  }


  // ---- Scan page and typed path (spec 7.2, plan Task 4) ----
  const newNonce=()=>system.random(8).toString('hex');
  const firstOf=entry=>entry?.record?.user?.firstName||'';
  const typedLink=(cardId,lang)=>({href:'/s/'+cardId,text:t('typeInstead',lang)});

  function scanGet(res,cardId,url){
    const q=url.searchParams,lang=langOf(q.get('lang'));
    if(!cardId)return sendPage(res,200,typedPage({card:null,lang,formNonce:newNonce(),sampleMode}));
    const entry=store.get(cardId);
    if(!entry?.record)return sendPage(res,404,notFound());
    if(entry.withdrawnAt)return sendPage(res,410,errorPage({message:t('cardWithdrawn',lang),lang,sampleMode}));
    const tq=q.get('t'),k=q.get('k');
    if(!tq||!k)return sendPage(res,200,typedPage({card:entry,lang,formNonce:newNonce(),sampleMode}));
    // Only checks: a link preview, a bystander's scan or an abandoned scan consumes nothing (spec 4.3).
    const r=codes.verify(cardId,{method:'qr',t:tq,k},{channel:'web'});
    if(!r.ok)return sendPage(res,STATUS[r.code]||400,errorPage({message:messageFor(r.code,firstOf(entry),lang),lang,sampleMode,link:r.code==='card_withdrawn'?null:typedLink(cardId,lang)}));
    sendPage(res,200,scanPage({card:entry,proof:{t:tq,k},lang,onWorkerPhone:q.get('w')==='1',formNonce:newNonce(),sampleMode}));
  }

  function openFailed(res,r){
    sendPrivateJSON(res,r.status,{error:{code:r.code,message:r.message,retryable:false,...(r.existingVouchId?{existingVouchId:r.existingVouchId}:{})}});
  }
  function openedJSON(res,r){
    const {ok,...body}=r;void ok;
    sendPrivateJSON(res,200,body);
  }
  function renderChips(res,r){
    const session=sessions.get(r.vouchToken),card=store.get(session.cardId);
    sendPage(res,200,chipsPage({session,card,chips:chipsFor(card.record.tradeId),lang:session.lang,sampleMode}));
  }

  // The 18-or-older POST. "No" ends the flow and consumes nothing; "Yes" runs open().
  async function scanPost(req,res,cardId){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},lang=langOf(p.lang);
    const entry=cardId?store.get(cardId):null;
    if(cardId&&!entry?.record)return form?sendPage(res,404,notFound()):sendError(res,404,'not_found',STRINGS.notFound);
    const qr=Boolean(cardId)&&field(p.t)!==''&&field(p.k)!=='',onWorkerPhone=field(p.w)==='1';
    const again=(status,error,card=entry)=>sendPage(res,status,qr
      ?scanPage({card,proof:{t:field(p.t),k:field(p.k)},lang,onWorkerPhone,formNonce:newNonce(),error,sampleMode})
      :typedPage({card,lang,formNonce:newNonce(),error,sampleMode}));
    if(form&&p.adult==='no')return sendPage(res,200,adultsOnlyPage({lang,sampleMode}));
    if(form&&p.adult!=='yes')return again(400,splitOptions(t('adultQ',lang)).stem);
    const r=await service.open({...(cardId?{cardId}:{cardRef:field(p.ref)}),
      proof:qr?{method:'qr',t:field(p.t),k:field(p.k)}:{method:'code',code:field(p.code)},
      voucher:{kind:'customer'},onWorkerPhone,channel:'web',lang,formNonce:NONCE.test(field(p.f))?field(p.f):undefined});
    if(!form)return r.ok?openedJSON(res,r):openFailed(res,r);
    if(r.ok)return renderChips(res,r);
    if(r.code==='card_withdrawn')return sendPage(res,r.status,errorPage({message:r.message,lang,sampleMode}));
    if(r.code==='not_found')return again(r.status,r.message,null);
    if(qr)return sendPage(res,r.status,errorPage({message:r.message,lang,sampleMode,link:typedLink(cardId,lang)}));
    again(r.status,r.message);
  }

  // POST /api/vouch/open (spec 4.3). The channel is always web here: the SMS and call windows are only for
  // the gateway handlers, so a browser cannot widen its own window. Worker and organisation vouchers arrive
  // with Task 13, the request proof with Task 14.
  async function apiOpen(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!isPlainObject(payload))return sendError(res,400,'invalid_input','Send a JSON object.');
    if(!isPlainObject(payload.voucher)||payload.voucher.kind!=='customer')return sendError(res,400,'invalid_input','voucher.kind must be "customer".');
    const proof=payload.proof;
    if(!isPlainObject(proof)||(proof.method!=='qr'&&proof.method!=='code'))return sendError(res,400,'invalid_input','proof.method must be "qr" or "code".');
    if(payload.channel!==undefined&&payload.channel!=='web')return sendError(res,400,'invalid_input','channel must be "web".');
    const cardId=typeof payload.cardId==='string'?payload.cardId:null;
    if(!cardId&&proof.method==='qr')return sendError(res,400,'invalid_input','cardId is needed with a QR proof.');
    const cardRef=cardId?null:normaliseCardRef(field(proof.smsId)||field(proof.cardCode));
    const r=await service.open({...(cardId?{cardId}:{cardRef}),
      proof:proof.method==='qr'?{method:'qr',t:field(proof.t),k:field(proof.k)}:{method:'code',code:field(proof.code)},
      voucher:{kind:'customer'},onWorkerPhone:payload.onWorkerPhone===true,channel:'web',lang:langOf(payload.lang),
      formNonce:NONCE.test(field(payload.formNonce))?payload.formNonce:undefined});
    return r.ok?openedJSON(res,r):openFailed(res,r);
  }

  // ---- Vouch JSON, clip and withdrawal (spec 5.6, 9.5, plan Task 5) ----
  // A withdrawal holds at read time: a withdrawn or hidden vouch, a passed quiet withdrawal, an unaccepted
  // referral and any vouch on a withdrawn card are all 410 before the sweep runs.
  function vouchJson(res,vouchId){
    const file=vouchStore.get(vouchId);
    if(!file)return sendError(res,404,'not_found','No vouch with this id.');
    if(!vouchStore.isLive(file,now()))return sendError(res,410,'withdrawn','This vouch was withdrawn.');
    const record=vouchStore.publicPart(file);
    const jwt=signRecord(key,record,{sub:vouchId,now:()=>Date.parse(record.wordsShownAt||record.confirmedAt)});
    sendPrivateJSON(res,200,{record,jwt,jwksUrl:system.publicUrl+'/.well-known/jwks.json',held:file.held&&!record.wordsShownAt?['words','clip']:[]});
  }
  function vouchClip(res,vouchId){
    const file=vouchStore.get(vouchId);
    if(!file)return sendError(res,404,'not_found','No vouch with this id.');
    if(!vouchStore.isLive(file,now()))return sendError(res,410,'withdrawn','This vouch was withdrawn.');
    sendError(res,404,'not_found','No clip for this vouch.');
  }
  const workerFirst=file=>firstOf(store.get(file.record.cardId));
  const secretField=v=>/^[0-9A-Za-z]{6,16}$/.test(field(v))?field(v):'';
  function doneMessage(file,lang){return t(file.private?.withdrawnAt?'withdrawnNow':'withdrawnLater',lang);}
  function withdrawGet(res,vouchId,url){
    const file=vouchStore.get(vouchId);
    if(!file?.record)return sendPage(res,404,notFound());
    const lang=langOf(file.record.lang);
    if(file.private?.withdrawnAt||file.private?.withdrawAfter)return sendPage(res,200,errorPage({message:doneMessage(file,lang),lang,sampleMode}));
    sendPage(res,200,withdrawPage({first:workerFirst(file),vouchId,secret:secretField(url.searchParams.get('w')),lang,sampleMode}));
  }
  async function withdrawPost(req,res,vouchId){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},file=vouchStore.get(vouchId);
    if(!file?.record)return form?sendPage(res,404,notFound()):sendError(res,404,'not_found','No vouch with this id.');
    const lang=langOf(file.record.lang),mode=field(p.mode);
    if(mode!=='now'&&mode!=='quiet'){
      if(form)return sendPage(res,400,withdrawPage({first:workerFirst(file),vouchId,secret:secretField(p.w),lang,sampleMode}));
      return sendError(res,400,'invalid_input','mode must be "now" or "quiet".');
    }
    const r=vouchStore.withdraw(vouchId,field(p.w),mode);
    if(!r.ok){
      if(form)return sendPage(res,403,withdrawPage({first:workerFirst(file),vouchId,secret:'',lang,sampleMode}));
      return sendError(res,403,'forbidden','That withdraw secret does not match this vouch.');
    }
    events.log('vouch_withdrawn',{vouchId,...cardFields(store.get(file.record.cardId)||{cardId:file.record.cardId}),mode,by:'voucher'});
    if(form)return sendPage(res,200,errorPage({message:doneMessage(r.file,lang),lang,sampleMode}));
    sendPrivateJSON(res,200,{vouchId,mode:r.file.private.withdrawnAt?'now':'quiet'});
  }

  // ---- Chips, words, disclosure, binding, read-back and confirm (spec 7.2, plan Task 6) ----
  const demoMode=!gatewayConfigured(system.yv);
  const shortcode=system.yv?.shortcode||'12345';
  function ended(res,form,r){
    if(form)return sendPage(res,r.status||410,errorPage({message:r.message,sampleMode}));
    sendError(res,r.status||410,r.code||'session_ended',r.message);
  }
  const sessionGone=()=>({status:410,code:'session_ended',message:t('sessionEnded','en',{first:'the worker'})});
  const QUESTION={work:'whatDid',when:'when',howOften:'howOften',hireAgain:'hireAgainQ'};
  function fieldMessage(fields,first,lang){
    const k=QUESTION[fields?.[0]]||'whatDid';
    return splitOptions(t(k,lang,{first})).stem;
  }
  // Renders the page for the session's step. A bound phone moves bind on to the read-back.
  function sessionPage(res,token,{status=200,error}={}){
    const session=sessions.get(token),card=session?store.get(session.cardId):null;
    if(!session||!card?.record)return ended(res,true,sessionGone());
    const lang=session.lang;
    if(session.step==='chips'||!session.chips)return sendPage(res,status,chipsPage({session,card,chips:chipsFor(card.record.tradeId),lang,sampleMode,error}));
    if(session.step==='disclose')return sendPage(res,status,disclosePage({session,card,lang,sampleMode,error}));
    if(session.step==='bind'){
      if(demoMode&&!session.demo)return sendPage(res,status,bindPage({session,card,lang,sampleMode,demo:true,error}));
      if(!demoMode){
        const b=service.issueBind(token);
        if(!b.bound)return sendPage(res,status,bindPage({session,card,lang,sampleMode,shortcode,sessionCode:b.sessionCode,error:error||session.bind?.error}));
      }
      session.step='readback';
    }
    session.readbackSeen=true;
    const bound=!demoMode&&session.bind?.at?session.bind.phoneLast3:null;
    sendPage(res,status,readbackPage({session,card,record:service.preview(token),lang,sampleMode,phoneLast3:bound,
      demoCode:demoMode?session.demo?.code:null,recent:Boolean(session.recentVouchId),error}));
  }
  async function sessionPost(req,res,token){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},session=sessions.get(token);
    if(!session)return ended(res,true,sessionGone());
    if(p.step==='change'){session.step='chips';return redirect(res,'/s/t/'+token);}
    if(p.step==='disclose'){
      const r=service.setDisclose(token,{showMe:field(p.showMe),firstName:field(p.firstName),attachClip:field(p.attachClip),showCard:field(p.showCard)});
      if(!r.ok)return r.code==='invalid_input'?sessionPage(res,token,{status:400,error:r.message}):ended(res,true,r);
    }
    redirect(res,'/s/t/'+token);
  }
  async function apiChips(req,res,token){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},session=sessions.get(token);
    const r=service.setChips(token,p);
    if(!r.ok&&!r.fields)return ended(res,form,r);
    const first=firstOf(store.get(session.cardId)),lang=session.lang;
    if(!r.ok){
      if(form){session.step='chips';return sessionPage(res,token,{status:400,error:fieldMessage(r.fields,first,lang)});}
      return sendPrivateJSON(res,400,{error:{code:'invalid_input',message:fieldMessage(r.fields,first,lang),retryable:false,fields:r.fields}});
    }
    if(p.words!==undefined){
      const w=service.setWords(token,{text:field(p.words),lang:p.lang});
      if(!w.ok){
        if(form){session.step='chips';return sessionPage(res,token,{status:400,error:w.message});}
        return sendPrivateJSON(res,400,{error:{code:w.reason,message:w.message,retryable:false,fields:['words']}});
      }
    }
    if(form)return redirect(res,'/s/t/'+token);
    sendPrivateJSON(res,200,{ok:true,chips:r.chips});
  }
  async function apiWords(req,res,token){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{};
    const r=service.setWords(token,{text:field(p.text),lang:p.lang});
    if(!r.ok&&!r.reason)return ended(res,form,r);
    if(form)return r.ok?redirect(res,'/s/t/'+token):sessionPage(res,token,{status:400,error:r.message});
    if(!r.ok)return sendPrivateJSON(res,400,{error:{code:r.reason,message:r.message,retryable:false}});
    sendPrivateJSON(res,200,{text:r.text});
  }
  async function apiBind(req,res,token,method){
    if(method==='GET'||method==='HEAD'){
      const st=service.bindStatus(token);
      return st?sendPrivateJSON(res,200,st):ended(res,false,sessionGone());
    }
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!sessions.get(token))return ended(res,form,sessionGone());
    if(demoMode)return form?redirect(res,'/s/t/'+token):sendError(res,409,'demo_mode',t('demoNoGateway'));
    const r=service.issueBind(token);
    if(r.ok===false)return ended(res,form,r);
    if(form)return redirect(res,'/s/t/'+token);
    sendPrivateJSON(res,200,r);
  }
  async function apiOtp(req,res,token){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!sessions.get(token))return ended(res,form,sessionGone());
    const r=service.demoOtp(token,field(isPlainObject(payload)?payload.phone:''));
    if(r.error){
      if(r.error.code==='session_ended'||r.error.code==='card_withdrawn')return ended(res,form,{status:410,...r.error});
      if(form){const s=sessions.get(token);s.step='bind';return sessionPage(res,token,{status:400,error:r.error.message});}
      return sendPrivateJSON(res,400,{error:{...r.error,retryable:false}});
    }
    if(form)return redirect(res,'/s/t/'+token);
    sendPrivateJSON(res,200,r);
  }
  async function apiConfirm(req,res,token){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},session=sessions.get(token);
    if(!session)return ended(res,form,sessionGone());
    const card=store.get(session.cardId),first=firstOf(card),lang=session.lang,onWorkerPhone=session.onWorkerPhone;
    // A form post had its 18-or-older answer when the session opened; Publish posts consent=yes.
    const body=form?{consent:p.consent==='yes',adult:true,visit:field(p.visit)||undefined,otp:field(p.otp)}:p;
    const r=service.confirm(token,body);
    if(r.rebind)return form?redirect(res,'/s/t/'+token):sendPrivateJSON(res,409,{error:{code:'rebind',message:t('waiting',lang),retryable:true},sessionCode:r.sessionCode});
    if(!r.ok){
      if(r.code==='not_bound'&&sessions.get(token))sessions.get(token).step='bind';
      const again=['voucher_recent','otp_wrong','consent_needed','not_bound','invalid_input'].includes(r.code)&&sessions.get(token);
      if(form)return again?sessionPage(res,token,{status:r.status,error:r.code==='voucher_recent'?null:r.message}):ended(res,true,r);
      return sendPrivateJSON(res,r.status||400,{error:{code:r.code,message:r.message,retryable:false,...(r.existingVouchId?{existingVouchId:r.existingVouchId}:{}),...(r.fields?{fields:r.fields}:{})}});
    }
    if(!form)return sendPrivateJSON(res,200,{vouchId:r.vouchId,line:r.line,withdrawUrl:r.withdrawUrl,visitAdded:r.visitAdded});
    const L=(k,v)=>t(k,lang,v);
    let messages;
    if(r.visitAdded)messages=[L('visitAdded',{first})];
    else if(!r.vouchId)messages=[L('recentNo',{first})];
    else if(r.withdrawSent)messages=[L('thanks',{first}),L('withdrawSent')];
    else messages=[L('thanks',{first}),...(onWorkerPhone&&r.demo?[L('demoWithdrawHere')]:[]),L('withdrawAt',{link:r.withdrawUrl,vouchId:r.vouchId})];
    sendPage(res,200,donePage({messages,lang,sampleMode}));
  }

  // ---- Gateways (spec 9.5): the production webhook and the simulator drive the same SMS handler ----
  const gatewaySecret=String(system.yv?.gatewaySecret||'');
  const simOn=Boolean(system.yv?.sim)&&!gatewaySecret;
  async function smsWebhook(req,res){
    if(!gatewaySecretOk(String(req.headers['x-yovouch-gateway-secret']||''),gatewaySecret))return sendError(res,403,'forbidden','Unknown gateway.');
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{};
    sendPrivateJSON(res,200,await system.sms.handle({from:field(p.from),text:field(p.text)}));
  }
  async function simSms(req,res){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{};
    const r=await system.sms.handle({from:field(p.from),text:field(p.text)});
    if(form)return sendPage(res,200,demoPhonePage({from:field(p.from),replies:r.replies,sampleMode}));
    sendPrivateJSON(res,200,r);
  }

  function handle(req,res,url){
    const pathname=url.pathname,method=req.method;
    const wrap=p=>Promise.resolve(p).then(()=>true);
    const notAllowed=()=>wrap(sendError(res,405,'method_not_allowed','Method not allowed.'));
    if(pathname==='/qr-browser.js'){
      if(method!=='GET'&&method!=='HEAD')return notAllowed();
      return wrap(send(res,200,qrBrowser(),'text/javascript; charset=utf-8',{'cache-control':'max-age=86400'}));
    }
    if(pathname==='/api/vouch/codes')return method==='POST'?wrap(apiCodes(req,res)):notAllowed();
    if(pathname==='/api/vouch/open')return method==='POST'?wrap(apiOpen(req,res)):notAllowed();
    const api=API_SESSION.exec(pathname);
    if(api){
      const [,token,action]=api;
      if(action==='bind')return method==='GET'||method==='HEAD'||method==='POST'?wrap(apiBind(req,res,token,method)):notAllowed();
      if(action==='otp'&&!demoMode)return false;
      if(method!=='POST')return notAllowed();
      return wrap(action==='chips'?apiChips(req,res,token):action==='words'?apiWords(req,res,token):action==='otp'?apiOtp(req,res,token):apiConfirm(req,res,token));
    }
    if(pathname==='/api/sms/webhook'&&gatewaySecret)return method==='POST'?wrap(smsWebhook(req,res)):notAllowed();
    if(pathname==='/api/sim/sms'&&simOn)return method==='POST'?wrap(simSms(req,res)):notAllowed();
    if(pathname==='/demo/phone'&&simOn)return method==='GET'||method==='HEAD'?wrap(sendPage(res,200,demoPhonePage({sampleMode}))):notAllowed();
    const sp=SESSION_PAGE.exec(pathname);
    if(sp){
      if(method==='GET'||method==='HEAD')return wrap(sessionPage(res,sp[1]));
      return method==='POST'?wrap(sessionPost(req,res,sp[1])):notAllowed();
    }
    if(pathname==='/s'||pathname.startsWith('/s/')){
      const m=SCAN_PATH.exec(pathname),cardId=m?.[1]??null;
      if(!m||(cardId&&!validId(cardId)))return wrap(sendPage(res,404,notFound()));
      if(method==='GET'||method==='HEAD')return wrap(scanGet(res,cardId,url));
      return method==='POST'?wrap(scanPost(req,res,cardId)):notAllowed();
    }
    if(pathname.startsWith('/v/')){
      const m=VOUCH_PATH.exec(pathname),suffix=m?.[2]||'';
      if(!m||!validId(m[1])||!suffix)return wrap(sendPage(res,404,notFound()));
      if(suffix==='/withdraw'){
        if(method==='GET'||method==='HEAD')return wrap(withdrawGet(res,m[1],url));
        return method==='POST'?wrap(withdrawPost(req,res,m[1])):notAllowed();
      }
      if(method!=='GET'&&method!=='HEAD')return notAllowed();
      return wrap(suffix==='.json'?vouchJson(res,m[1]):vouchClip(res,m[1]));
    }
    if(pathname.startsWith('/my/')){
      const m=MY_PATH.exec(pathname),entry=m?cardFor(m[1],m[2]):null;
      if(!entry)return wrap(sendPage(res,404,notFound()));
      const suffix=m[3]||'';
      if(!suffix)return method==='GET'||method==='HEAD'?wrap(myPage(res,entry,m[2])):notAllowed();
      if(suffix==='/lang')return method==='POST'?wrap(setLang(req,res,entry,m[2])):notAllowed();
      if(suffix==='/status.json')return method==='GET'||method==='HEAD'?wrap(myStatus(res,entry)):notAllowed();
      if(suffix==='/hide'||suffix==='/show'||suffix==='/show-words')return method==='POST'?wrap(myAction(req,res,entry,m[2],suffix.slice(1))):notAllowed();
      return wrap(sendPage(res,404,notFound()));
    }
    return false;
  }

  return {handle};
}

module.exports={createVouchRouter,sendPage,sendPrivateJSON,readForm,gatewaySecretOk,gatewayConfigured,MY_PATH,VOUCH_PATH};
