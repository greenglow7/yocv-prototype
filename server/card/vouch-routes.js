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
     GET  /v/:vouchId/clip                 the released clip in its stored type; 404 while held, 410 unless live
     GET  /v/:vouchId/withdraw?w=          the withdraw question; POST (w, mode now|quiet) withdraws
     POST /api/vouch/:vouchToken/chips     chips (and, from the no-JS form, words); JSON or form
     POST /api/vouch/:vouchToken/words     {text, lang, fromClip}, or a clip (audio/webm or audio/mp4, x-clip-seconds
                                           at most 16, 400 KB) -> {transcript, unclear, confidence}
     GET  /mic.js                          the chips page recorder (progressive), its labels in every language
     POST|GET /api/vouch/:vouchToken/bind  issue the YES session code | {bound, phoneLast3, error}
     POST /api/vouch/:vouchToken/otp       demo fallback, mounted only when no gateway is configured
     POST /api/vouch/:vouchToken/confirm   publish; the form gets the done page
     GET|POST /s/t/:vouchToken             the session page for its step (chips, disclose, bind, readback);
                                           the no-JS disclosure form and "Change something" post here
     GET  /my/:cardId/:cardToken/status.json and POST .../hide|show|show-words {vouchId}
     POST /api/sms/webhook                 gateway, only when YOVOUCH_GATEWAY_SECRET is set (constant-time header check)
     POST /api/sim/sms and GET /demo/phone the simulated gateway, only when YOVOUCH_SIM=1 and no gateway secret
     GET|POST /demo/ivr                    the simulated call-back (plan Task 17), same condition: {from} starts a call,
                                           {s, k[, words]} presses a key, multipart adds the optional clip
     GET  /demo/beat3                      the prepared beat 3 extraction from demo.json (plan Task 18), same condition
   WhatsApp (plan Task 16):
     POST /my/:cardId/:cardToken/link      issues the one-time link code: vouch.linkCode {hash, expiresAt}, 10 minutes
     POST /api/wa/webhook                  gateway, only when YOVOUCH_GATEWAY_SECRET is set (constant-time header check)
     POST /api/sim/wa {from, text}         the simulated chat behind thread.html, only when YOVOUCH_SIM=1 and no gateway secret
   Worker to worker and organisation referral (plan Task 13):
     GET  /my/:cardId/:cardToken/vouch     Vouch for another worker: the typed form (hidden vc, vt) and the yv_worker
                                           cookie, so a camera scan from this browser opens /s as that worker
     POST /my/:cardId/:cardToken/withdraw-given {vouchId}   withdraws a vouch this card gave
     POST /my/:cardId/:cardToken/referral  {post, evidenceId} -> the message to forward to the organisation
     GET  /o/:requestId                    the organisation key form (password field; the key is never in a URL)
     POST /o/:requestId {orgKey} | POST /api/refer/open {orgKey, requestId}   the organisation page
     POST /api/refer/:referToken/send      {statement} -> the draft referral, waiting for the worker's YES
     POST /o/:requestId/withdraw           {referToken}
     POST /api/vouch/:vouchId/accept       {cardId, cardToken, answer: yes | no}; a form post answers 303 to /my
   Request path for past customers and workers (plan Task 14):
     POST /api/request/create              {cardId, cardToken} -> {requestId, url, text}; 429 request_cap past 10 open
     POST /my/:cardId/:cardToken/request   the worker page button; the page shows the text to forward
     POST /my/:cardId/:cardToken/vouch     {request, adult}: a worker answers a request link (or the bare id)
     GET  /a/:requestId                    the landing page with the 18-or-older form; consumes nothing
     POST /a/:requestId                    {adult, lang, f}: opens the session, marks the request used, chips page
   Every response that carries a live code or the card token is private: no-store and no-referrer. A form
   post (application/x-www-form-urlencoded) gets HTML back; JSON gets JSON. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {validId,secretsMatch,hashSecret,ALPHABET}=require('./store.js');
const {codeBatch,normaliseCardRef}=require('./vouchcode.js');
const {normalisePhone,keyedHash}=require('./vouchers.js');
const {LANGS,t,splitOptions}=require('./copy.js');
const {STRINGS,fullDate}=require('./render.js');
const {flowPage,workerPage,myVouchesPage,scanPage,typedPage,adultsOnlyPage,errorPage,chipsPage,withdrawPage,
  disclosePage,bindPage,readbackPage,donePage,demoPhonePage,ivrPage,workerVouchPage,orgKeyPage,orgPage,requestLandingPage,requestMadePage,linkCodePage,beat3Page}=require('./pages.js');
const {tierItem}=require('./vouch-lines.js');
const {withdrawnAtOf}=require('./vouches.js');
const {signRecord}=require('./sign.js');
const {cardFields}=require('./events.js');
const {chipsFor,messageFor,gatewayConfigured,referralOrgs,STATUS}=require('./vouch-service.js');
const {HOW_OFTEN,HIRE_AGAIN}=require('./vouch-lines.js');
const {myUrl}=require('./vouch-system.js');
const {audioType,isAudio,clipSeconds,MAX_AUDIO_BYTES}=require('./transcribe.js');

const MY_PATH=/^\/my\/([A-Z2-9]{10})\/([0-9a-f]{16})(\/[a-z-]+(?:\.json)?)?$/;
const SCAN_PATH=/^\/s(?:\/([A-Z2-9]{10}))?$/;
const VOUCH_PATH=/^\/v\/([A-Z2-9]{10})(\.json|\/clip|\/withdraw)?$/;
const NONCE=/^[0-9a-f]{16}$/;
const SESSION_PAGE=/^\/s\/t\/([0-9a-f]{24})$/;
const API_SESSION=/^\/api\/vouch\/([0-9a-f]{24})\/(chips|words|bind|otp|confirm)$/;
const ACCEPT_PATH=/^\/api\/vouch\/([A-Z2-9]{10})\/accept$/;
const ORG_PATH=/^\/o\/([A-Z2-9]{10})(\/withdraw)?$/;
const REFER_SEND=/^\/api\/refer\/([0-9a-f]{24})\/send$/;
const REQUEST_PATH=/^\/a\/([A-Z2-9]{10})$/;
// A pasted request: the /a/<requestId> link as forwarded, or the bare id, in any case.
const PASTED_REQUEST=/^(?:\S*\/a\/)?([A-Za-z2-9]{10})\/?$/;
// The vouching worker's browser (spec 7.4 step 1): set by /my/<id>/<token>/vouch for 15 minutes, read only under /s.
const WORKER_COOKIE=/(?:^|;\s*)yv_worker=([A-Z2-9]{10})\.([0-9a-f]{16})(?=;|$)/;
const WORKER_COOKIE_AGE=900;
const ARRIVED_MS=10*60*1000;
const MAX_FORM_BYTES=64*1024;
const MAX_CLIP_SECONDS=16;
const LINK_TTL_MS=10*60*1000;
// The call-back (plan Task 17): 30-minute calls in memory; the refusals that read as ivrWrong, and those that count
// against the caller, as on SMS. A clip recorded on the call is the 15 seconds after the tone.
const IVR_MS=30*60*1000,IVR_CLIP_SECONDS=15;
const IVR_WRONG=new Set(['not_found','code_wrong','code_expired','code_used','card_locked','card_withdrawn']);
const IVR_SENDER_WRONG=new Set(['not_found','code_wrong','card_locked']);
const IVR_WHEN=['this month','last month','earlier'],IVR_HOW=Object.keys(HOW_OFTEN),IVR_HIRE=Object.keys(HIRE_AGAIN);
const NO_CHIP='\u0000';
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
// multipart/form-data: text fields and files ({filename, contentType, data}), for the call-back's clip upload only.
function parseMultipart(body,contentType){
  const m=/boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(String(contentType||''));
  const out={fields:{},files:{}};
  if(!m)return out;
  const delim=Buffer.from('--'+(m[1]||m[2]));
  let at=body.indexOf(delim);
  while(at>=0){
    const start=at+delim.length;
    if(body.subarray(start,start+2).toString()==='--')break;
    const next=body.indexOf(delim,start+2);
    if(next<0)break;
    const part=body.subarray(start+2,Math.max(start+2,next-2)),sep=part.indexOf('\r\n\r\n');
    if(sep>=0){
      const head=part.subarray(0,sep).toString('utf8'),data=part.subarray(sep+4);
      const name=/;\s*name="([^"]*)"/i.exec(head)?.[1],filename=/;\s*filename="([^"]*)"/i.exec(head)?.[1];
      if(name!=null){
        if(filename!=null)out.files[name]={filename,contentType:(/content-type:\s*([^\r\n]+)/i.exec(head)?.[1]||'').trim(),data};
        else out.fields[name]=data.toString('utf8');
      }
    }
    at=next;
  }
  return out;
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

// The chips page recorder (spec 7.2 steps 2 and 3): MediaRecorder at a 16 kbit/s hint in the browser's own
// container, stopped at 15 seconds, posted to /words; then "We heard" with the unclear spans shown as the marker
// and "Use these words", which fills the words box and marks the form fromClip. Without it the box is all there is.
let micSource=null;
function micScript(){
  if(micSource)return micSource;
  const labels=Object.fromEntries(LANGS.map(l=>[l,{r:t('record',l),s:t('stop',l),l:t('listen',l),a:t('recordAgain',l),h:t('weHeard',l,{transcript:'%s'}),u:t('useWords',l),x:t('unclear',l)}]));
  micSource=['(function(){var m=document.getElementById("mic");if(!m||!window.MediaRecorder||!window.fetch||!navigator.mediaDevices)return;',
    'var T=',JSON.stringify(labels).replace(/</g,'\\u003c'),',D=document,lang=D.documentElement.lang,L=T[lang]||T.en,tk=m.getAttribute("data-t"),f=m.closest("form"),w=f&&f.querySelector("textarea[name=words]");',
    'function el(n,x){var e=D.createElement(n);if(x)e.textContent=x;return e}',
    'var b=el("button",L.r),p=el("button",L.l),o=el("p"),u=el("button",L.u),r,ch,s0,tm,url,said="";b.type=p.type=u.type="button";p.hidden=u.hidden=true;',
    '[b,p,o,u].forEach(function(e){m.appendChild(e)});m.hidden=false;',
    'function stop(){clearTimeout(tm);if(r&&r.state!=="inactive")r.stop()}',
    'function post(h,body){return fetch("/api/vouch/"+tk+"/words",{method:"POST",headers:h,body:body}).then(function(x){return x.json()})}',
    'function heard(j){if(j&&typeof j.transcript==="string"){var s=j.transcript,c=s;(j.unclear||[]).forEach(function(x){s=s.split(x).join(L.x);c=c.split(x).join(" ")});',
    'said=c.replace(/\\s+/g," ").trim();o.textContent=L.h.replace("%s",s);u.hidden=!said}else o.textContent=j&&(j.message||(j.messages||[]).join(" ")||(j.error&&j.error.message))||""}',
    'b.onclick=function(){if(r&&r.state==="recording")return stop();navigator.mediaDevices.getUserMedia({audio:true}).then(function(st){ch=[];',
    'try{r=new MediaRecorder(st,{audioBitsPerSecond:16000})}catch(e){r=new MediaRecorder(st)}r.ondataavailable=function(e){if(e.data&&e.data.size)ch.push(e.data)};',
    'r.onstop=function(){st.getTracks().forEach(function(x){x.stop()});var bl=new Blob(ch,{type:r.mimeType||"audio/webm"}),sec=Math.max(1,Math.min(',MAX_CLIP_SECONDS,',Math.ceil((Date.now()-s0)/1000)));',
    'if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(bl);b.textContent=L.a;p.hidden=false;u.hidden=true;o.textContent="";',
    'post({"content-type":(bl.type||"audio/webm").split(";")[0],"x-clip-seconds":String(sec)},bl).then(heard).catch(function(){})};',
    's0=Date.now();r.start();b.textContent=L.s;tm=setTimeout(stop,15000)}).catch(function(){})};',
    'p.onclick=function(){if(url)new Audio(url).play()};',
    'u.onclick=function(){post({"content-type":"application/json"},JSON.stringify({text:said,lang:lang,fromClip:true})).then(function(j){if(j&&typeof j.text==="string"){if(w)w.value=j.text;',
    'if(!f.querySelector("input[name=fromClip]")){var h=el("input");h.type="hidden";h.name="fromClip";h.value="1";f.appendChild(h)}u.hidden=true}else heard(j)}).catch(function(){})}})();\n'].join('');
  return micSource;
}

function createVouchRouter(system){
  const {store,codes,now,sessions,service,vouchStore,events,key}=system;
  const readJSONBody=req=>require('../../server.js').readJSONBody(req);
  // Raw bodies (audio uploads) go through server.js too, loaded lazily for the same reason.
  const readRawBody=(req,maxBytes)=>require('../../server.js').readRawBody(req,maxBytes);
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

  function myPage(res,entry,cardToken,url=null){
    if(entry.withdrawnAt)return sendPage(res,410,flowPage({title:t('cardWithdrawn'),body:'<section class="notice"><h1>'+t('cardWithdrawn')+'</h1></section>',sampleMode}));
    const nowMs=now(),lang=LANGS.includes(entry.vouch.lang)?entry.vouch.lang:'en';
    const mine=ownVouches(entry,nowMs),live=mine.filter(f=>vouchStore.isLive(f,nowMs));
    const newest=Math.max(...mine.map(f=>Date.parse(f.record.confirmedAt)||0),0),vouches=listItems(entry,mine,nowMs);
    const notice=url?.searchParams.get('n')==='referral'?t('referralDone',lang):null;
    sendPage(res,200,workerPage({entry,record:entry.record,batch:codeBatch(entry.vouch.secret,nowMs),locked:codes.lockState(entry.cardId),lang,
      publicUrl:system.publicUrl,myUrl:myUrl(system,entry.cardId,cardToken),nowMs,sampleMode,yv:system.yv,
      vouches,arrived:newest>0&&nowMs-newest<=ARRIVED_MS,waiting:live.filter(waitingWords).length,liveCount:live.length,
      given:givenBy(entry,nowMs),pending:pendingReferrals(entry,lang,nowMs),orgs:referralOrgs(entry.record),notice}));
  }
  // The live worker vouches this card gave, newest first, each with the vouched worker's first name.
  function givenBy(entry,nowMs){
    return vouchStore.listByVoucherCard(entry.cardId).filter(f=>f.record.kind==='worker'&&!withdrawnAtOf(f,nowMs)).reverse()
      .map(f=>({vouchId:f.record.vouchId,first:firstOf(store.get(f.record.cardId))||'the worker'}));
  }
  // Referrals an organisation sent that wait for this worker's YES (spec 7.5 step 5).
  function pendingReferrals(entry,lang,nowMs){
    return vouchStore.listForCard(entry.cardId).filter(f=>f.record.kind==='organisation'&&!f.record.acceptedAt&&!withdrawnAtOf(f,nowMs)).map(f=>{
      const r=f.record;
      return {vouchId:r.vouchId,text:t('orgWrote',lang,{org:r.voucher.orgName,sentence:r.statement,job:r.jobPost?.work||'',date:fullDate(new Date(nowMs).toISOString()),title:r.restsOn?.title||''})};
    });
  }

  // ---- The worker's own vouch list (spec 9.5, plan Task 6) ----
  // The list items for the pages, newest first; pages.js orders and windows them.
  const listItems=(entry,mine,nowMs)=>mine.slice().reverse().map(f=>({vouchId:f.record.vouchId,line:tierItem(f.record,firstOf(entry),{nowMs}).line,
    words:f.held?.words||null,hidden:Boolean(f.private?.hiddenAt),held:Boolean(f.held)&&!f.record.wordsShownAt}));
  function myVouches(res,entry,cardToken,url){
    if(entry.withdrawnAt)return myPage(res,entry,cardToken);
    const nowMs=now(),lang=LANGS.includes(entry.vouch.lang)?entry.vouch.lang:'en',mine=ownVouches(entry,nowMs);
    const page=/^[1-9]\d{0,5}$/.test(url.searchParams.get('page')||'')?Number(url.searchParams.get('page')):1;
    sendPage(res,200,myVouchesPage({entry,lang,myUrl:myUrl(system,entry.cardId,cardToken),vouches:listItems(entry,mine,nowMs),
      waiting:mine.filter(f=>vouchStore.isLive(f,nowMs)&&waitingWords(f)).length,page,sampleMode}));
  }
  // Every line of the card not withdrawn, hidden ones included, oldest first. Referrals are listed apart: a pending
  // one waits for the worker's YES at the top of the page (plan Task 13).
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
    // A post from the full list carries its page and goes back to it; the code page's form carries none.
    const page=field(isPlainObject(payload)?payload.page:''),back='/my/'+entry.cardId+'/'+cardToken+(/^[1-9]\d{0,5}$/.test(page)?'/vouches?page='+page:'');
    if(form)return ok?redirect(res,back):sendPage(res,404,notFound());
    return ok?sendPrivateJSON(res,200,{vouchId,ok:true}):sendError(res,404,'not_found','No vouch with this id on this card.');
  }

  // ---- Worker to worker (spec 7.4) and the referral request (spec 7.5 step 1), plan Task 13 ----
  const secureCookie=/^https:/i.test(system.publicUrl);
  function workerVouch(res,entry,cardToken,{status=200,error=null,lang='en'}={}){
    if(entry.withdrawnAt)return myPage(res,entry,cardToken);
    const cookie='yv_worker='+entry.cardId+'.'+cardToken+'; Path=/s; HttpOnly; SameSite=Lax; Max-Age='+WORKER_COOKIE_AGE+(secureCookie?'; Secure':'');
    send(res,status,workerVouchPage({entry,cardToken,lang,formNonce:newNonce(),requestNonce:newNonce(),error,sampleMode}),'text/html; charset=utf-8',{'set-cookie':cookie});
  }
  // POST /my/:id/:token/vouch {request, adult} (plan Task 14): this card vouches by the other worker's request link.
  async function workerRequest(req,res,entry,cardToken){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},lang=langOf(p.lang);
    if(entry.withdrawnAt)return myPage(res,entry,cardToken);
    if(form&&p.adult==='no')return sendPage(res,200,adultsOnlyPage({lang,sampleMode}));
    const adult=form?p.adult==='yes':p.adult===true;
    if(!adult){
      const msg=splitOptions(t('adultQ',lang)).stem;
      return form?workerVouch(res,entry,cardToken,{status:400,error:msg,lang}):sendError(res,400,'adult_needed',msg);
    }
    const m=PASTED_REQUEST.exec(field(p.request).trim()),requestId=m?m[1].toUpperCase():'';
    const r=await service.open({proof:{method:'request',requestId},voucher:{kind:'worker',cardId:entry.cardId,cardToken},channel:'web',lang,
      formNonce:NONCE.test(field(p.f))?field(p.f):undefined});
    if(!form)return r.ok?openedJSON(res,r):openFailed(res,r);
    if(r.ok)return renderChips(res,r);
    workerVouch(res,entry,cardToken,{status:r.status,error:r.message,lang});
  }
  // POST /my/:id/:token/request: the worker page button. A form gets the text to forward; JSON gets the API shape.
  async function myRequest(req,res,entry,cardToken){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const lang=LANGS.includes(entry.vouch.lang)?entry.vouch.lang:'en',myPath='/my/'+entry.cardId+'/'+cardToken;
    const r=service.createRequest(entry.cardId,cardToken);
    if(!form)return r.ok?sendPrivateJSON(res,200,{requestId:r.requestId,url:r.url,text:r.text}):sendError(res,r.status,r.code,r.message);
    if(!r.ok)return sendPage(res,r.status,errorPage({message:r.message,lang,sampleMode,link:{href:myPath,text:t('backToCode',lang)}}));
    sendPage(res,200,requestMadePage({text:r.text,myPath,lang,sampleMode}));
  }
  async function apiRequestCreate(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{};
    const r=service.createRequest(field(p.cardId),field(p.cardToken));
    if(!r.ok)return sendError(res,r.status,r.code,r.message);
    sendPrivateJSON(res,200,{requestId:r.requestId,url:r.url,text:r.text});
  }
  // GET /a/:requestId: checks the request and renders the 18-or-older form; consumes nothing.
  function requestGet(res,requestId,url){
    const lang=langOf(url.searchParams.get('lang')),rq=system.requestStore.get(requestId);
    const entry=rq?.kind==='vouch'?store.get(rq.cardId):null;
    if(!entry?.record)return sendPage(res,404,notFound());
    const refused=code=>sendPage(res,STATUS[code],errorPage({message:messageFor(code,firstOf(entry),lang),lang,sampleMode}));
    if(entry.withdrawnAt)return refused('card_withdrawn');
    if(rq.usedAt)return refused('request_used');
    if(!(Date.parse(rq.expiresAt)>now()))return refused('request_expired');
    sendPage(res,200,requestLandingPage({card:entry,requestId,lang,formNonce:newNonce(),sampleMode}));
  }
  // POST /a/:requestId: "No" consumes nothing; "Yes" opens the customer session and marks the request used.
  async function requestPost(req,res,requestId){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},lang=langOf(p.lang);
    if(form&&p.adult==='no')return sendPage(res,200,adultsOnlyPage({lang,sampleMode}));
    const rq=system.requestStore.get(requestId),entry=rq?.kind==='vouch'?store.get(rq.cardId):null;
    if(form&&p.adult!=='yes'&&entry?.record&&!rq.usedAt)return sendPage(res,400,requestLandingPage({card:entry,requestId,lang,formNonce:newNonce(),error:splitOptions(t('adultQ',lang)).stem,sampleMode}));
    if(!form&&p.adult!==true)return sendError(res,400,'adult_needed',splitOptions(t('adultQ',lang)).stem);
    const r=await service.open({proof:{method:'request',requestId},voucher:{kind:'customer'},channel:'web',lang,formNonce:NONCE.test(field(p.f))?field(p.f):undefined});
    if(!form)return r.ok?openedJSON(res,r):openFailed(res,r);
    if(r.ok)return renderChips(res,r);
    sendPage(res,r.status,r.code==='not_found'?notFound():errorPage({message:r.message,lang,sampleMode}));
  }
  async function withdrawGiven(req,res,entry,cardToken){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const vouchId=field(isPlainObject(payload)?payload.vouchId:''),file=validId(vouchId)?vouchStore.get(vouchId):null;
    const ok=Boolean(file?.record)&&file.record.kind==='worker'&&file.record.voucher?.cardId===entry.cardId&&!withdrawnAtOf(file,now())&&Boolean(vouchStore.withdrawAs(vouchId,'now'));
    if(ok)events.log('vouch_withdrawn',{vouchId,...cardFields(store.get(file.record.cardId)||{cardId:file.record.cardId}),mode:'now',by:'voucher_card'});
    if(form)return ok?redirect(res,'/my/'+entry.cardId+'/'+cardToken):sendPage(res,404,notFound());
    return ok?sendPrivateJSON(res,200,{vouchId,ok:true}):sendError(res,404,'not_found','No vouch with this id from this card.');
  }
  // The pasted post is parsed as POST /api/reply/parse does; a parser refusal shows its message.
  async function referralRequest(req,res,entry,cardToken){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},lang=LANGS.includes(entry.vouch.lang)?entry.vouch.lang:'en';
    const fail=(status,code,message)=>form?sendPage(res,status,errorPage({message,lang,sampleMode,link:{href:'/my/'+entry.cardId+'/'+cardToken,text:t('backToCode',lang)}})):sendError(res,status,code,message);
    let parsed;
    try{parsed=await system.replyService.parse(field(p.post),{lang});}
    catch(err){if(err?.code==='busy')return fail(503,'busy',err.message);throw err;}
    if(!parsed.jobPostId)return fail(400,parsed.refusal?.reason||'invalid_input',parsed.messages[0]);
    const r=service.createReferralRequest(entry.cardId,cardToken,{jobPostId:parsed.jobPostId,evidenceId:field(p.evidenceId)});
    if(!r.ok)return fail(r.status,r.code,r.message);
    if(form)return sendPage(res,200,donePage({messages:[r.text],lang,sampleMode}));
    sendPrivateJSON(res,200,{requestId:r.requestId,url:r.url,text:r.text,jobPostId:parsed.jobPostId});
  }

  // POST /my/:id/:token/link (spec 7.6 step 1): a 6-character code in the card code alphabet, stored as its hash
  // for 10 minutes. A new code replaces the last one; the sweep clears it past expiresAt.
  async function linkWhatsapp(req,res,entry,cardToken){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    if(entry.withdrawnAt)return myPage(res,entry,cardToken);
    const bytes=system.random(6);let code='';
    for(let i=0;i<6;i++)code+=ALPHABET[bytes[i]%ALPHABET.length];
    const expiresAt=new Date(now()+LINK_TTL_MS).toISOString(),lang=langOf(entry.vouch.lang);
    store.update(entry.cardId,e=>{e.vouch.linkCode={hash:hashSecret(code),expiresAt};});
    const message=t('linkCode',lang,{code});
    if(form)return sendPage(res,200,linkCodePage({message,myPath:'/my/'+entry.cardId+'/'+cardToken,lang,sampleMode}));
    sendPrivateJSON(res,200,{linkCode:code,expiresAt,message});
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
    // The vouching worker: hidden vc and vt from their own form, else the yv_worker cookie when it opens a live card
    // that is not this one (the worker's own card on the worker's phone stays the customer path).
    let worker=field(p.vc)||field(p.vt)?{cardId:field(p.vc),cardToken:field(p.vt),typed:true}:null;
    if(!worker&&!onWorkerPhone){
      const m=WORKER_COOKIE.exec(String(req.headers?.cookie||'')),target=cardId||codes.resolveCard(field(p.ref));
      if(m&&m[1]!==target&&cardFor(m[1],m[2]))worker={cardId:m[1],cardToken:m[2]};
    }
    if(worker?.typed&&form&&p.adult==='no')return sendPage(res,200,adultsOnlyPage({lang,sampleMode}));
    const again=(status,error,card=entry)=>sendPage(res,status,qr
      ?scanPage({card,proof:{t:field(p.t),k:field(p.k)},lang,onWorkerPhone,formNonce:newNonce(),error,sampleMode})
      :typedPage({card,lang,formNonce:newNonce(),error,sampleMode}));
    if(form&&p.adult==='no')return sendPage(res,200,adultsOnlyPage({lang,sampleMode}));
    if(form&&p.adult!=='yes')return again(400,splitOptions(t('adultQ',lang)).stem);
    const r=await service.open({...(cardId?{cardId}:{cardRef:field(p.ref)}),
      proof:qr?{method:'qr',t:field(p.t),k:field(p.k)}:{method:'code',code:field(p.code)},
      voucher:worker?{kind:'worker',cardId:worker.cardId,cardToken:worker.cardToken}:{kind:'customer'},onWorkerPhone,channel:'web',lang,formNonce:NONCE.test(field(p.f))?field(p.f):undefined});
    if(!form)return r.ok?openedJSON(res,r):openFailed(res,r);
    if(r.ok)return renderChips(res,r);
    // The worker's typed form comes back with its message; a token that does not open the card (the owner secret) is 404.
    if(worker?.typed){
      const own=cardFor(worker.cardId,worker.cardToken);
      return own?workerVouch(res,own,worker.cardToken,{status:r.status,error:r.message,lang}):sendPage(res,404,notFound());
    }
    if(r.code==='card_withdrawn')return sendPage(res,r.status,errorPage({message:r.message,lang,sampleMode}));
    if(r.code==='not_found')return again(r.status,r.message,null);
    if(qr)return sendPage(res,r.status,errorPage({message:r.message,lang,sampleMode,link:typedLink(cardId,lang)}));
    again(r.status,r.message);
  }

  // POST /api/vouch/open (spec 4.3). The channel is always web here: the SMS and call windows are only for
  // the gateway handlers, so a browser cannot widen its own window. A worker voucher brings its card token; an
  // organisation brings its key and the referral request. A request proof opens a customer or worker request (Task 14).
  async function apiOpen(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!isPlainObject(payload))return sendError(res,400,'invalid_input','Send a JSON object.');
    const v=payload.voucher;
    if(!isPlainObject(v)||!['customer','worker','organisation'].includes(v.kind))return sendError(res,400,'invalid_input','voucher.kind must be "customer", "worker" or "organisation".');
    if(v.kind==='worker'&&(typeof v.cardId!=='string'||typeof v.cardToken!=='string'))return sendError(res,400,'invalid_input','A worker voucher needs voucher.cardId and voucher.cardToken.');
    const proof=payload.proof;
    // An organisation opens a referral request with its key (plan Task 13): the vouchToken is the refer token, no bind.
    if(v.kind==='organisation'){
      if(!isPlainObject(proof)||proof.method!=='request')return sendError(res,400,'invalid_input','proof.method must be "request".');
      const rq=system.requestStore.get(field(proof.requestId));
      if(rq&&rq.jobPostId&&field(v.jobPostId)!==rq.jobPostId)return sendError(res,403,'forbidden',t('orgKeyWrong'));
      const r=service.orgOpen(field(proof.requestId),field(v.orgKey));
      if(!r.ok)return sendError(res,r.status,r.code,r.message);
      return sendPrivateJSON(res,200,{vouchToken:r.referToken,worker:r.worker,proof:r.proof,expiresInMs:r.expiresInMs});
    }
    // A request proof (plan Task 14): the request names the card; a cardId sent with it must be that card.
    if(isPlainObject(proof)&&proof.method==='request'){
      if(payload.channel!==undefined&&payload.channel!=='web')return sendError(res,400,'invalid_input','channel must be "web".');
      const r=await service.open({...(typeof payload.cardId==='string'?{cardId:payload.cardId}:{}),proof:{method:'request',requestId:field(proof.requestId)},
        voucher:v.kind==='worker'?{kind:'worker',cardId:field(v.cardId),cardToken:field(v.cardToken)}:{kind:'customer'},channel:'web',lang:langOf(payload.lang),
        formNonce:NONCE.test(field(payload.formNonce))?payload.formNonce:undefined});
      return r.ok?openedJSON(res,r):openFailed(res,r);
    }
    if(!isPlainObject(proof)||(proof.method!=='qr'&&proof.method!=='code'))return sendError(res,400,'invalid_input','proof.method must be "qr", "code" or "request".');
    if(payload.channel!==undefined&&payload.channel!=='web')return sendError(res,400,'invalid_input','channel must be "web".');
    const cardId=typeof payload.cardId==='string'?payload.cardId:null;
    if(!cardId&&proof.method==='qr')return sendError(res,400,'invalid_input','cardId is needed with a QR proof.');
    const cardRef=cardId?null:normaliseCardRef(field(proof.smsId)||field(proof.cardCode));
    const r=await service.open({...(cardId?{cardId}:{cardRef}),
      proof:proof.method==='qr'?{method:'qr',t:field(proof.t),k:field(proof.k)}:{method:'code',code:field(proof.code)},
      voucher:v.kind==='worker'?{kind:'worker',cardId:field(v.cardId),cardToken:field(v.cardToken)}:{kind:'customer'},
      onWorkerPhone:v.kind==='customer'&&payload.onWorkerPhone===true,channel:'web',lang:langOf(payload.lang),
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
  // Served exactly as recorded, with the stored type; a held clip is in file.held, never in the record.
  function vouchClip(res,vouchId){
    const file=vouchStore.get(vouchId);
    if(!file)return sendError(res,404,'not_found','No vouch with this id.');
    if(!vouchStore.isLive(file,now()))return sendError(res,410,'withdrawn','This vouch was withdrawn.');
    const clip=file.record.clip,data=clip?.url&&!clip.expired?vouchStore.readClip(vouchId):null;
    if(!data)return sendError(res,404,'not_found','No clip for this vouch.');
    send(res,200,data,clip.contentType==='audio/mp4'?'audio/mp4':'audio/webm');
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
    const worker=session.voucher?.kind==='worker';
    if(session.step==='bind'&&worker)session.step='readback';   // the card token is the voucher: no phone binding
    if(session.step==='bind'){
      if(demoMode&&!session.demo)return sendPage(res,status,bindPage({session,card,lang,sampleMode,demo:true,error}));
      if(!demoMode){
        const b=service.issueBind(token);
        if(!b.bound)return sendPage(res,status,bindPage({session,card,lang,sampleMode,shortcode,sessionCode:b.sessionCode,error:error||session.bind?.error}));
      }
      session.step='readback';
    }
    session.readbackSeen=true;
    const bound=!worker&&!demoMode&&session.bind?.at?session.bind.phoneLast3:null;
    sendPage(res,status,readbackPage({session,card,record:service.preview(token),lang,sampleMode,phoneLast3:bound,
      demoCode:demoMode&&!worker?session.demo?.code:null,recent:!worker&&Boolean(session.recentVouchId),reciprocal:service.reciprocal(token),error}));
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
      const w=service.setWords(token,{text:field(p.words),lang:p.lang,fromClip:p.fromClip===true||field(p.fromClip)==='1'});
      if(!w.ok){
        if(form){session.step='chips';return sessionPage(res,token,{status:400,error:w.message});}
        return sendPrivateJSON(res,400,{error:{code:w.reason,message:w.message,retryable:false,fields:['words']}});
      }
    }
    if(form)return redirect(res,'/s/t/'+token);
    sendPrivateJSON(res,200,{ok:true,chips:r.chips});
  }
  async function apiWords(req,res,token){
    if(isAudio(req.headers['content-type']))return clipWords(req,res,token);
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{};
    const r=service.setWords(token,{text:field(p.text),lang:p.lang,fromClip:p.fromClip===true});
    if(!r.ok&&!r.reason)return ended(res,form,r);
    if(form)return r.ok?redirect(res,'/s/t/'+token):sessionPage(res,token,{status:400,error:r.message});
    if(!r.ok)return sendPrivateJSON(res,400,{error:{code:r.reason,message:r.message,retryable:false}});
    sendPrivateJSON(res,200,{text:r.text});
  }
  // A clip upload: audio/webm or audio/mp4, at most 400 KB and 16 seconds.
  async function clipWords(req,res,token){
    const type=audioType(req.headers['content-type']),seconds=clipSeconds(req.headers['x-clip-seconds'],MAX_CLIP_SECONDS);
    let audio;
    try{audio=await readRawBody(req,MAX_AUDIO_BYTES);}
    catch(err){if(err?.code==='invalid_input')return sendError(res,400,'invalid_input',err.message);throw err;}
    if(!type)return sendError(res,400,'invalid_input','Send audio/webm or audio/mp4.');
    if(!seconds)return sendError(res,400,'invalid_input','x-clip-seconds must be a whole number from 1 to '+MAX_CLIP_SECONDS+'.');
    if(!audio.length)return sendError(res,400,'invalid_input','The clip is empty.');
    let r;
    try{r=await service.clipWords(token,{audio,contentType:type,seconds});}
    catch(err){if(err?.code==='busy')return sendError(res,503,'busy',err.message,true);throw err;}
    if(!r.ok)return ended(res,false,r);
    sendPrivateJSON(res,200,r.body);
  }
  async function apiBind(req,res,token,method){
    if(method==='GET'||method==='HEAD'){
      const st=service.bindStatus(token);
      return st?sendPrivateJSON(res,200,st):ended(res,false,sessionGone());
    }
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!sessions.get(token))return ended(res,form,sessionGone());
    if(sessions.get(token).voucher?.kind==='worker')return form?redirect(res,'/s/t/'+token):sendError(res,409,'no_binding','A worker vouch needs no phone binding.');
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
    if(r.worker)messages=[L('givenNote',{first})];
    else if(r.visitAdded)messages=[L('visitAdded',{first})];
    else if(!r.vouchId)messages=[L('recentNo',{first})];
    else if(r.withdrawSent)messages=[L('thanks',{first}),L('withdrawSent')];
    else messages=[L('thanks',{first}),...(onWorkerPhone&&r.demo?[L('demoWithdrawHere')]:[]),L('withdrawAt',{link:r.withdrawUrl,vouchId:r.vouchId})];
    sendPage(res,200,donePage({messages,lang,sampleMode}));
  }

  // ---- Organisation referral (spec 7.5, plan Task 13) ----
  async function apiAccept(req,res,vouchId){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},cardId=field(p.cardId),cardToken=field(p.cardToken);
    const r=service.acceptReferral(vouchId,cardId,cardToken,field(p.answer));
    if(form)return r.ok?redirect(res,'/my/'+cardId+'/'+cardToken+(field(p.answer)==='yes'?'?n=referral':'')):sendPage(res,r.status,notFound());
    return r.ok?sendPrivateJSON(res,200,{ok:true,message:r.message}):sendError(res,r.status,r.code,r.message);
  }
  function orgGet(res,requestId){
    const rq=system.requestStore.get(requestId);
    if(!rq||rq.kind!=='referral')return sendPage(res,404,notFound());
    if(rq.usedAt)return sendPage(res,409,errorPage({message:t('requestUsed'),sampleMode}));
    sendPage(res,200,orgKeyPage({requestId,sampleMode}));
  }
  function orgFailed(res,form,requestId,r){
    if(!form)return sendError(res,r.status,r.code,r.message);
    if(r.code==='forbidden')return sendPage(res,403,orgKeyPage({requestId,error:r.message,sampleMode}));
    sendPage(res,r.status,r.status===404?notFound():errorPage({message:r.message,sampleMode}));
  }
  async function orgOpenPost(req,res,requestId){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{},id=requestId||field(p.requestId);
    const r=service.orgOpen(id,field(p.orgKey));
    if(!r.ok)return orgFailed(res,form,id,r);
    if(form)return sendPage(res,200,orgPage({view:r.view,referToken:r.referToken,sampleMode}));
    sendPrivateJSON(res,200,{referToken:r.referToken,view:r.view});
  }
  async function orgSendPost(req,res,referToken){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    // The view is read before the send: the send marks the request used, after which orgViewFor gives null.
    const p=isPlainObject(payload)?payload:{},view=service.orgViewFor(referToken),r=service.orgSend(referToken,field(p.statement));
    if(!r.ok){
      if(form&&view&&r.code==='invalid_input')return sendPage(res,400,orgPage({view,referToken,error:r.message,sampleMode}));
      return form?sendPage(res,r.status,errorPage({message:r.message,sampleMode})):sendError(res,r.status,r.code,r.message);
    }
    // The sent page keeps the withdrawReferral form with this refer token (spec 7.5: only the organisation withdraws).
    if(form)return sendPage(res,200,orgPage({view,referToken,sent:true,sampleMode}));
    sendPrivateJSON(res,200,{vouchId:r.vouchId});
  }
  async function orgWithdrawPost(req,res,requestId){
    const form=isForm(req),payload=await readBody(req,res);
    if(payload===undefined)return;
    const r=service.withdrawReferral(field(isPlainObject(payload)?payload.referToken:''),requestId);
    if(!r.ok)return form?sendPage(res,404,notFound()):sendError(res,404,'not_found','No referral for this token.');
    if(form)return sendPage(res,200,errorPage({message:t('referralWithdrawnOrg'),sampleMode}));
    sendPrivateJSON(res,200,{vouchId:r.vouchId,ok:true});
  }

  // ---- Gateways (spec 9.5): the production webhook and the simulator drive the same SMS handler ----
  const gatewaySecret=String(system.yv?.gatewaySecret||'');
  const simOn=Boolean(system.yv?.sim)&&!gatewaySecret;
  // GET /demo/beat3 (plan Task 18): the prepared extraction scripts/seed-demo.js wrote to demo.json; 404 before a seed.
  function beat3(res){
    let demo=null;
    try{demo=JSON.parse(fs.readFileSync(path.join(system.store.dir,'demo.json'),'utf8'));}catch{demo=null;}
    if(!isPlainObject(demo?.beat3))return sendPage(res,404,errorPage({message:'No prepared demo. Run node scripts/seed-demo.js first.',sampleMode}));
    return sendPage(res,200,beat3Page({beat3:demo.beat3,sampleMode}));
  }
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
    if(form)return sendPage(res,200,demoPhonePage({from:field(p.from),thread:system.sms.thread(field(p.from)),sampleMode}));
    sendPrivateJSON(res,200,r);
  }

  // The WhatsApp chat (plan Task 16): the same handler behind the gateway and the simulator.
  async function waWebhook(req,res){
    if(!gatewaySecretOk(String(req.headers['x-yovouch-gateway-secret']||''),gatewaySecret))return sendError(res,403,'forbidden','Unknown gateway.');
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{};
    sendPrivateJSON(res,200,await system.wa.handle({from:field(p.from),text:field(p.text)}));
  }
  async function simWa(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    const p=isPlainObject(payload)?payload:{};
    sendPrivateJSON(res,200,await system.wa.handle({from:field(p.from),text:field(p.text)},{sim:true}));
  }


  // ---- The simulated call-back (spec 7.3, plan Task 17). The page walks the section 17 call prompts in order and
  // drives the same open, setChips, setDisclose and confirm a real IVR would. Prompts are in the worker's vouch.lang
  // once the card is known. A wrong code and an unknown card get the same ivrWrong. 9 at the start reads back the
  // caller's most recent live vouch; 9 again withdraws it; a further 9 moves to the next one. ----
  const ivrCalls=new Map();
  function ivrPrune(){const at=now();for(const [id,c] of ivrCalls)if(at-c.at>IVR_MS)ivrCalls.delete(id);}
  const yvCountry=()=>system.yv?.smsCountry;
  const ivrEnd=(res,call,prompt,status=200)=>{ivrCalls.delete(call.id);return sendPage(res,status,ivrPage({prompt,from:call.from,lang:call.lang,sampleMode}));};
  function ivrShow(res,call){
    const L=(k,v)=>t(k,call.lang,v),entry=call.cardId?store.get(call.cardId):null,f=firstOf(entry);
    const P={start:()=>L('ivrStart'),code:()=>L('ivrCode'),
      intro:()=>L('ivrIntro',{first:f,trade:String(entry.record.trade||'').toLowerCase()}),adult:()=>L('ivrAdult'),
      chips:()=>{const [chip1=NO_CHIP,chip2=NO_CHIP,chip3=NO_CHIP]=call.chips.map(c=>c.toLowerCase());
        return L('ivrChips',{first:f,chip1,chip2,chip3}).replace(new RegExp(', \\d for '+NO_CHIP,'g'),'');},
      two_words:()=>L('smsTwoWords',{first:f}),when:()=>L('ivrWhen'),howOften:()=>L('ivrHowOften'),hireAgain:()=>L('ivrHireAgain',{first:f}),
      clip:()=>L('ivrClip',{first:f}),name:()=>L('ivrShowName'),
      readback:()=>L('ivrReadback',{first:f,line:String(service.preview(call.vouchToken)?.line||'').replace(/\.$/,'')}),
      remove_q:()=>L('ivrRemoveQ',{first:firstOf(store.get(vouchStore.get(call.removeId)?.record?.cardId))}),removed:()=>L('smsRemoved')};
    sendPage(res,200,ivrPage({prompt:P[call.step](),s:call.id,keyed:call.step==='start'||call.step==='code'?call.buf:'',lang:call.lang,
      clip:call.step==='clip',words:call.step==='two_words',sampleMode}));
  }
  // The caller's live vouches, newest first; a hidden one counts, as on STOP.
  function ivrVouches(call){
    const key=keyedHash(system.hashKey,call.e164),nowMs=now();
    return vouchStore.listByVoucherKey(key).filter(f=>vouchStore.isLive({...f,private:{...f.private,hiddenAt:null}},nowMs))
      .sort((a,b)=>(Date.parse(b.record.confirmedAt)||0)-(Date.parse(a.record.confirmedAt)||0));
  }
  function ivrNextRemoval(res,call){
    const [file]=ivrVouches(call);
    if(!file)return ivrEnd(res,call,t('smsNothing',call.lang));
    call.removeId=file.record.vouchId;call.step='remove_q';
    ivrShow(res,call);
  }
  async function ivrOpen(res,call){
    const ref=normaliseCardRef(call.cardRef),cardId=ref?codes.resolveCard(ref):null,entry=cardId?store.get(cardId):null;
    const callerKey=keyedHash(system.hashKey,call.e164);
    if(codes.senderBlocked(callerKey))return ivrEnd(res,call,t('ivrWrong'));
    if(!entry?.record){codes.recordSenderWrong(callerKey);return ivrEnd(res,call,t('ivrWrong'));}
    // A local caller ID is read in the card's country first, as the SMS sender is (Review Focus 2).
    const e164=normalisePhone(call.from,entry.record.user?.country)||call.e164,lang=LANGS.includes(entry.vouch?.lang)?entry.vouch.lang:'en';
    const r=await service.open({cardId,proof:{method:'code',code:call.buf.slice(0,6)},voucher:{kind:'customer'},
      voucherKey:keyedHash(system.hashKey,e164),phoneLast3:e164.slice(-3),channel:'ivr',lang});
    if(!r.ok){
      if(IVR_WRONG.has(r.code)){if(IVR_SENDER_WRONG.has(r.code))codes.recordSenderWrong(callerKey);return ivrEnd(res,call,t('ivrWrong',lang));}
      return ivrEnd(res,call,r.message);
    }
    Object.assign(call,{cardId,lang,vouchToken:r.vouchToken,step:'intro',buf:'',chips:chipsFor(entry.record.tradeId).filter(c=>c!=='Other').slice(0,3),answers:{}});
    ivrShow(res,call);
  }
  // One key press (or a run of digits for the card number and the code). Anything a step does not take repeats it.
  async function ivrKey(res,call,key,{words='',clip=null}={}){
    const n=/^\d$/.test(key)?Number(key):0,a=call.answers,token=call.vouchToken,L=k=>t(k,call.lang);
    const stopCall=prompt=>{if(token)sessions.delete(token);return ivrEnd(res,call,prompt);};
    const sessionOver=r=>stopCall(r.message||t('sessionEnded',call.lang,{first:firstOf(store.get(call.cardId))}));
    switch(call.step){
      case 'start':
        if(!call.buf&&key==='9')return ivrNextRemoval(res,call);
        call.buf+=key.replace(/\D/g,'');
        if(call.buf.length>=5){call.cardRef=call.buf.slice(0,5);call.buf=call.buf.slice(5);call.step='code';}
        if(call.step!=='code'||call.buf.length<6)return ivrShow(res,call);
        return ivrOpen(res,call);
      case 'code':
        call.buf+=key.replace(/\D/g,'');
        return call.buf.length<6?ivrShow(res,call):ivrOpen(res,call);
      case 'intro':
        if(n===2)return stopCall(L('smsCancelled'));
        if(n===1)call.step='adult';
        break;
      case 'adult':
        if(n===2)return stopCall(L('adultsOnly'));
        if(n===1)call.step='chips';
        break;
      case 'chips':
        if(n===4)call.step='two_words';
        else if(n>=1&&n<=call.chips.length){a.work=call.chips[n-1];a.other=undefined;call.step='when';}
        break;
      case 'two_words':
        if(words.trim()){a.work='Other';a.other=words.trim();call.step='when';}
        break;
      case 'when':if(n>=1&&n<=3){a.when=IVR_WHEN[n-1];call.step='howOften';}break;
      case 'howOften':if(n>=1&&n<=4){a.howOften=IVR_HOW[n-1];call.step='hireAgain';}break;
      case 'hireAgain':{
        if(!(n>=1&&n<=2))break;
        const r=service.setChips(token,{...a,hireAgain:IVR_HIRE[n-1]});
        if(!r.ok&&!r.fields)return sessionOver(r);
        call.step=r.ok?'clip':'chips';
        break;
      }
      case 'clip':{
        if(clip){const r=service.setClip(token,clip);if(!r.ok)return sessionOver(r);call.hasClip=true;}
        call.step='name';
        break;
      }
      case 'name':{
        if(!(n>=1&&n<=2))break;
        const r=service.setDisclose(token,{showMe:n===1?'digits':'customer',attachClip:call.hasClip===true});
        if(!r.ok)return sessionOver(r);
        call.step='readback';
        break;
      }
      case 'readback':{
        if(n===2)return stopCall(L('smsCancelled'));
        if(n!==1)break;
        const r=service.confirm(token,{adult:true,consent:true});
        return r.ok&&r.vouchId?ivrEnd(res,call,L('ivrPublished')):sessionOver(r);
      }
      case 'remove_q':{
        if(key!=='9')break;
        const file=vouchStore.get(call.removeId);
        if(file?.record&&!withdrawnAtOf(file,now())&&vouchStore.withdrawAs(call.removeId,'now'))
          events.log('vouch_withdrawn',{vouchId:call.removeId,...cardFields(store.get(file.record.cardId)||{cardId:file.record.cardId}),mode:'now',by:'ivr'});
        call.step='removed';
        break;
      }
      case 'removed':
        if(key==='9')return ivrNextRemoval(res,call);
        break;
    }
    ivrShow(res,call);
  }
  async function ivrPost(req,res){
    let p,clip=null;
    if(/^multipart\/form-data\b/i.test(String(req.headers['content-type']||''))){
      let body;
      try{body=await readRawBody(req,MAX_AUDIO_BYTES+16384);}
      catch(err){if(err?.code==='invalid_input'||err?.name==='InputError')return sendPage(res,400,ivrPage({sampleMode}));throw err;}
      const mp=parseMultipart(body,req.headers['content-type']),f=mp.files.clip,type=f?audioType(f.contentType):null;
      p=mp.fields;
      if(f&&type&&f.data.length)clip={audio:Buffer.from(f.data),contentType:type,seconds:IVR_CLIP_SECONDS};
    }else{
      p=await readBody(req,res);
      if(p===undefined)return;
      if(!isPlainObject(p))p={};
    }
    ivrPrune();
    const call=ivrCalls.get(field(p.s));
    if(call){call.at=now();return ivrKey(res,call,field(p.k).trim(),{words:field(p.words),clip});}
    const from=field(p.from).trim(),e164=normalisePhone(from,yvCountry());
    if(!e164)return sendPage(res,400,ivrPage({from,sampleMode}));
    const id=system.random(12).toString('hex');
    const fresh={id,at:now(),from,e164,lang:'en',step:'start',buf:'',cardId:null,vouchToken:null};
    ivrCalls.set(id,fresh);
    ivrShow(res,fresh);
  }

  function handle(req,res,url){
    const pathname=url.pathname,method=req.method;
    const wrap=p=>Promise.resolve(p).then(()=>true);
    const notAllowed=()=>wrap(sendError(res,405,'method_not_allowed','Method not allowed.'));
    if(pathname==='/qr-browser.js'){
      if(method!=='GET'&&method!=='HEAD')return notAllowed();
      return wrap(send(res,200,qrBrowser(),'text/javascript; charset=utf-8',{'cache-control':'max-age=86400'}));
    }
    if(pathname==='/mic.js'){
      if(method!=='GET'&&method!=='HEAD')return notAllowed();
      return wrap(send(res,200,micScript(),'text/javascript; charset=utf-8',{'cache-control':'max-age=86400'}));
    }
    if(pathname==='/api/vouch/codes')return method==='POST'?wrap(apiCodes(req,res)):notAllowed();
    if(pathname==='/api/vouch/open')return method==='POST'?wrap(apiOpen(req,res)):notAllowed();
    const acc=ACCEPT_PATH.exec(pathname);
    if(acc)return method==='POST'?wrap(apiAccept(req,res,acc[1])):notAllowed();
    if(pathname==='/api/refer/open')return method==='POST'?wrap(orgOpenPost(req,res,null)):notAllowed();
    if(pathname==='/api/request/create')return method==='POST'?wrap(apiRequestCreate(req,res)):notAllowed();
    if(pathname.startsWith('/a/')){
      const m=REQUEST_PATH.exec(pathname);
      if(!m||!validId(m[1]))return wrap(sendPage(res,404,notFound()));
      if(method==='GET'||method==='HEAD')return wrap(requestGet(res,m[1],url));
      return method==='POST'?wrap(requestPost(req,res,m[1])):notAllowed();
    }
    const rs=REFER_SEND.exec(pathname);
    if(rs)return method==='POST'?wrap(orgSendPost(req,res,rs[1])):notAllowed();
    if(pathname.startsWith('/o/')){
      const m=ORG_PATH.exec(pathname);
      if(!m||!validId(m[1]))return wrap(sendPage(res,404,notFound()));
      if(m[2])return method==='POST'?wrap(orgWithdrawPost(req,res,m[1])):notAllowed();
      if(method==='GET'||method==='HEAD')return wrap(orgGet(res,m[1]));
      return method==='POST'?wrap(orgOpenPost(req,res,m[1])):notAllowed();
    }
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
    if(pathname==='/api/wa/webhook'&&gatewaySecret)return method==='POST'?wrap(waWebhook(req,res)):notAllowed();
    if(pathname==='/api/sim/wa'&&simOn)return method==='POST'?wrap(simWa(req,res)):notAllowed();
    if(pathname==='/demo/ivr'&&simOn)return method==='GET'||method==='HEAD'?wrap(sendPage(res,200,ivrPage({sampleMode}))):method==='POST'?wrap(ivrPost(req,res)):notAllowed();
    if(pathname==='/demo/beat3'&&simOn)return method==='GET'||method==='HEAD'?wrap(beat3(res)):notAllowed();
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
      if(!suffix)return method==='GET'||method==='HEAD'?wrap(myPage(res,entry,m[2],url)):notAllowed();
      if(suffix==='/vouch')return method==='GET'||method==='HEAD'?wrap(workerVouch(res,entry,m[2])):method==='POST'?wrap(workerRequest(req,res,entry,m[2])):notAllowed();
      if(suffix==='/request')return method==='POST'?wrap(myRequest(req,res,entry,m[2])):notAllowed();
      if(suffix==='/withdraw-given')return method==='POST'?wrap(withdrawGiven(req,res,entry,m[2])):notAllowed();
      if(suffix==='/referral')return method==='POST'?wrap(referralRequest(req,res,entry,m[2])):notAllowed();
      if(suffix==='/link')return method==='POST'?wrap(linkWhatsapp(req,res,entry,m[2])):notAllowed();
      if(suffix==='/lang')return method==='POST'?wrap(setLang(req,res,entry,m[2])):notAllowed();
      if(suffix==='/vouches')return method==='GET'||method==='HEAD'?wrap(myVouches(res,entry,m[2],url)):notAllowed();
      if(suffix==='/status.json')return method==='GET'||method==='HEAD'?wrap(myStatus(res,entry)):notAllowed();
      if(suffix==='/hide'||suffix==='/show'||suffix==='/show-words')return method==='POST'?wrap(myAction(req,res,entry,m[2],suffix.slice(1))):notAllowed();
      return wrap(sendPage(res,404,notFound()));
    }
    return false;
  }

  return {handle};
}

module.exports={createVouchRouter,sendPage,sendPrivateJSON,readForm,gatewaySecretOk,gatewayConfigured,MY_PATH,VOUCH_PATH};
