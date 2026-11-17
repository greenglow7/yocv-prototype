'use strict';
/* YoVouch routes (spec 9.5), delegated from createCardRouter. handle(req,res,url) returns false when the
   request is not a YoVouch route, otherwise a promise that resolves to true once the response is sent.
     GET  /my/:cardId/:cardToken           the worker's code page (works without JavaScript)
     POST /my/:cardId/:cardToken/lang      stores vouch.lang
     POST /api/vouch/codes                 {cardId, cardToken} -> the next 10 codes and the server time
     GET  /qr-browser.js                   server/qr.js for the browser, cached a day
   Every response that carries a live code or the card token is private: no-store and no-referrer. A form
   post (application/x-www-form-urlencoded) gets HTML back; JSON gets JSON. */
const fs=require('node:fs');
const path=require('node:path');
const {validId,secretsMatch}=require('./store.js');
const {codeBatch}=require('./vouchcode.js');
const {LANGS,t}=require('./copy.js');
const {STRINGS}=require('./render.js');
const {flowPage,workerPage}=require('./pages.js');
const {myUrl}=require('./vouch-system.js');

const MY_PATH=/^\/my\/([A-Z2-9]{10})\/([0-9a-f]{16})(\/[a-z-]+(?:\.json)?)?$/;
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
  const {store,codes,now}=system;
  const readJSONBody=req=>require('../../server.js').readJSONBody(req);
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
    sendPage(res,200,workerPage({entry,record:entry.record,batch:codeBatch(entry.vouch.secret,nowMs),locked:codes.lockState(entry.cardId),lang,
      publicUrl:system.publicUrl,myUrl:myUrl(system,entry.cardId,cardToken),nowMs,sampleMode,yv:system.yv}));
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

  function handle(req,res,url){
    const pathname=url.pathname,method=req.method;
    const wrap=p=>Promise.resolve(p).then(()=>true);
    const notAllowed=()=>wrap(sendError(res,405,'method_not_allowed','Method not allowed.'));
    if(pathname==='/qr-browser.js'){
      if(method!=='GET'&&method!=='HEAD')return notAllowed();
      return wrap(send(res,200,qrBrowser(),'text/javascript; charset=utf-8',{'cache-control':'max-age=86400'}));
    }
    if(pathname==='/api/vouch/codes')return method==='POST'?wrap(apiCodes(req,res)):notAllowed();
    if(pathname.startsWith('/my/')){
      const m=MY_PATH.exec(pathname),entry=m?cardFor(m[1],m[2]):null;
      if(!entry)return wrap(sendPage(res,404,notFound()));
      const suffix=m[3]||'';
      if(!suffix)return method==='GET'||method==='HEAD'?wrap(myPage(res,entry,m[2])):notAllowed();
      if(suffix==='/lang')return method==='POST'?wrap(setLang(req,res,entry,m[2])):notAllowed();
      return wrap(sendPage(res,404,notFound()));
    }
    return false;
  }

  return {handle};
}

module.exports={createVouchRouter,sendPage,sendPrivateJSON,readForm,MY_PATH};
