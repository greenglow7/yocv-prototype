'use strict';
/* YoCV HTTP server (spec §4): serves the buildless frontend from a static allowlist and exposes three
   JSON routes. Dependency free: node:http, node:fs, node:path only.
     GET  /api/status                      mode, provider, model, Yoma reachability
     POST /api/generate                    grounded claim generation (live or sample)
     GET  /api/yoma/opportunities?role=    Yoma learning opportunities for a role
   YoCard (Phase 2) routes live in server/card/routes.js and are mounted when createApp receives `card` deps:
     GET  /api/card/status, POST /api/card/account|draft|publish, POST /api/card/:id/check|withdraw,
     GET  /c/:id[.svg|.json], POST /c/:id/check, GET /.well-known/jwks.json
   Everything the browser gets is listed in STATIC; dotfiles, server/, tests/, docs/, data/cards/ and .env
   are never served. Model keys never reach this file: config is passed through to the provider factory and
   never logged. */

const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const {runGeneration}=require('./server/generation.js');
const {ProviderError}=require('./server/providers/errors.js');
const {createLocalProvider}=require('./server/providers/local.js');
const {createCardRouter}=require('./server/card/routes.js');

const MAX_BODY_BYTES=64*1024;
const MAX_CONTEXT=120;
const MAX_DATES=100;
const MAX_OPPORTUNITIES=4;
const MODES=new Set(['live','sample']);

// Static allowlist: URL path -> file relative to rootDir. Exact matches only.
const STATIC={
  '/':'index.html',
  '/index.html':'index.html',
  '/styles.css':'styles.css',
  '/core.js':'core.js',
  '/app.js':'app.js',
  '/card.html':'card.html',
  '/card.js':'card.js',
  '/card.css':'card.css',
  '/data/sample-credential.json':'data/sample-credential.json'
};
const CONTENT_TYPES={
  '.html':'text/html; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8'
};

const MESSAGES={
  role:'Choose one of the listed roles.',
  experienceShort:'Tell us one concrete responsibility, such as who you helped and what you did.',
  experienceLong:'Keep your experience under 4,000 characters for this demo.',
  context:'Keep the context under '+MAX_CONTEXT+' characters.',
  dates:'Keep the dates under '+MAX_DATES+' characters.',
  mode:'mode must be "live" or "sample".',
  body:'Send a JSON object with role, experience, context and dates.',
  bodyTooLarge:'The request body must be under 64 KB.',
  busy:'The server is busy, try again in a moment.',
  notFound:'Not found.',
  methodNotAllowed:'Method not allowed.',
  internal:'Something went wrong on the server. You can retry or continue in sample mode.'
};

class InputError extends Error{
  constructor(message){super(message);this.name='InputError';this.code='invalid_input';}
}

function sendJSON(res,status,payload,extraHeaders={}){
  const body=JSON.stringify(payload);
  res.writeHead(status,{
    'content-type':'application/json; charset=utf-8',
    'content-length':Buffer.byteLength(body),
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    ...extraHeaders
  });
  res.end(body);
}
function sendError(res,status,code,message,retryable,extraHeaders){
  sendJSON(res,status,{error:{code,message,retryable:Boolean(retryable)}},extraHeaders);
}
function isPlainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function isUnavailable(err){return err?.code==='yoma_unavailable'||err?.name==='YomaUnavailable';}

// Reads a JSON body of at most MAX_BODY_BYTES. Resolves the parsed value; rejects with InputError when
// the body is too large or not JSON. An oversized body is drained rather than left to hang the socket.
function readJSONBody(req){
  return new Promise((resolve,reject)=>{
    const declared=Number.parseInt(req.headers['content-length']??'',10);
    if(Number.isInteger(declared)&&declared>MAX_BODY_BYTES){
      req.resume();
      reject(new InputError(MESSAGES.bodyTooLarge));
      return;
    }
    const chunks=[];
    let size=0,tooLarge=false;
    req.on('data',chunk=>{
      if(tooLarge)return;
      size+=chunk.length;
      if(size>MAX_BODY_BYTES){tooLarge=true;chunks.length=0;reject(new InputError(MESSAGES.bodyTooLarge));return;}
      chunks.push(chunk);
    });
    req.on('error',err=>reject(err));
    req.on('end',()=>{
      if(tooLarge)return;
      let parsed;
      try{parsed=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      catch{reject(new InputError(MESSAGES.body));return;}
      resolve(parsed);
    });
  });
}

// Validates the generate request. `role` must equal a roleSkills key exactly (no trimming, no case folding).
// Experience uses the same rule and wording as core.localExperienceClaims.
function validateGenerateInput(payload,roleKeys){
  if(!isPlainObject(payload))throw new InputError(MESSAGES.body);
  const {role,experience,context,dates,mode}=payload;
  if(typeof role!=='string'||!roleKeys.includes(role))throw new InputError(MESSAGES.role);
  if(typeof experience!=='string')throw new InputError(MESSAGES.experienceShort);
  const trimmed=experience.trim();
  if(trimmed.length<12||trimmed.split(/\s+/).length<3)throw new InputError(MESSAGES.experienceShort);
  if((trimmed.match(/\p{L}{2,}/gu)||[]).length<3)throw new InputError(MESSAGES.experienceShort); // numbers or symbols alone are not a responsibility
  if(trimmed.length>4000)throw new InputError(MESSAGES.experienceLong);
  if(context!==undefined&&context!==null&&typeof context!=='string')throw new InputError(MESSAGES.context);
  if(dates!==undefined&&dates!==null&&typeof dates!=='string')throw new InputError(MESSAGES.dates);
  const ctx=String(context??'').trim(),dt=String(dates??'').trim();
  if(ctx.length>MAX_CONTEXT)throw new InputError(MESSAGES.context);
  if(dt.length>MAX_DATES)throw new InputError(MESSAGES.dates);
  if(mode!==undefined&&mode!==null&&!MODES.has(mode))throw new InputError(MESSAGES.mode);
  return {input:{role,experience:trimmed,context:ctx,dates:dt},mode:mode??null};
}

// `card` = {accountSource, store, key} mounts the YoCard routes (main() builds them from config; tests
// inject fakes). Without it the card routes are absent and only the Phase 1 routes answer.
function createApp({config,provider,yoma,roleSkills,core,rootDir=__dirname,maxInFlight=4,card=null,publicUrl=null,now=Date.now}={}){
  if(!config)throw new Error('createApp needs a config');
  if(!roleSkills||typeof roleSkills!=='object')throw new Error('createApp needs roleSkills');
  const roleKeys=Object.keys(roleSkills);
  const liveConfigured=config.provider!=='local';
  const cardBase=String(publicUrl||config.publicUrl||('http://'+config.host+':'+config.port)).replace(/\/+$/,'');
  const cardRouter=card?createCardRouter({config,accountSource:card.accountSource,provider,store:card.store,key:card.key,yoma,publicUrl:cardBase,now,readJSONBody,maxInFlight}):null;
  let localProvider=provider&&provider.name==='local'?provider:null;
  const getLocalProvider=()=>{
    if(!localProvider)localProvider=createLocalProvider(core);
    return localProvider;
  };
  let inFlight=0;

  async function status(res){
    let reachable=false;
    try{reachable=Boolean(await yoma?.reachable?.());}catch{reachable=false;}
    sendJSON(res,200,{
      mode:liveConfigured?'live':'sample',
      provider:liveConfigured?String(provider?.name??config.provider):'local',
      model:liveConfigured?(provider?.model??config.model??null):null,
      yoma:{reachable,baseUrl:String(config.yomaBase??yoma?.baseUrl??''),checkedAt:new Date().toISOString()}
    });
  }

  async function generate(req,res){
    let validated;
    try{
      const payload=await readJSONBody(req);
      validated=validateGenerateInput(payload,roleKeys);
    }catch(err){
      if(err instanceof InputError)return sendError(res,400,'invalid_input',err.message,false);
      throw err;
    }
    const {input,mode}=validated;
    let chosen;
    if(mode==='sample')chosen=getLocalProvider();
    else if(mode==='live'&&!liveConfigured)return sendError(res,502,'provider_not_configured',new ProviderError('provider_not_configured').message,false);
    else chosen=liveConfigured?provider:getLocalProvider();

    if(inFlight>=maxInFlight)return sendError(res,503,'busy',MESSAGES.busy,true);
    inFlight++;
    try{
      const result=await runGeneration({input,provider:chosen,yoma,roleSkills,core});
      sendJSON(res,200,result);
    }catch(err){
      if(err instanceof ProviderError||(err&&typeof err.code==='string'&&err.code.startsWith('provider_'))){
        return sendError(res,502,err.code,err.message,err.retryable);
      }
      throw err;
    }finally{
      inFlight--;
    }
  }

  async function opportunities(res,url){
    const role=url.searchParams.get('role');
    if(typeof role!=='string'||!roleKeys.includes(role))return sendError(res,400,'invalid_input',MESSAGES.role,false);
    const phrases=Array.isArray(roleSkills[role].opportunityQueries)?roleSkills[role].opportunityQueries:[];
    let fromCache=false;
    try{
      for(const phrase of phrases){
        const result=await yoma.searchLearningOpportunities(phrase);
        const items=Array.isArray(result?.items)?result.items:[];
        if(result?.source==='cache')fromCache=true;
        if(!items.length)continue;
        const completable=items.filter(item=>item&&item.isCompletable===true).slice(0,MAX_OPPORTUNITIES);
        return sendJSON(res,200,{
          items:completable,
          matchedQuery:phrase,
          totalCount:Number.isFinite(result.totalCount)?result.totalCount:items.length,
          source:result.source==='cache'?'cache':'live',
          unavailable:false
        });
      }
      return sendJSON(res,200,{items:[],matchedQuery:null,totalCount:0,source:fromCache?'cache':'live',unavailable:false});
    }catch(err){
      if(isUnavailable(err))return sendJSON(res,200,{items:[],matchedQuery:null,totalCount:0,source:null,unavailable:true});
      throw err;
    }
  }

  async function serveStatic(req,res,pathname){
    const relative=STATIC[pathname];
    if(!relative)return sendError(res,404,'not_found',MESSAGES.notFound,false);
    if(req.method!=='GET'&&req.method!=='HEAD')return sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false,{allow:'GET, HEAD'});
    let data;
    try{data=await fs.readFile(path.join(rootDir,relative));}
    catch{return sendError(res,404,'not_found',MESSAGES.notFound,false);}
    res.writeHead(200,{
      'content-type':CONTENT_TYPES[path.extname(relative)]||'application/octet-stream',
      'content-length':data.length,
      'cache-control':'no-cache',
      'x-content-type-options':'nosniff'
    });
    res.end(req.method==='HEAD'?undefined:data);
  }

  async function route(req,res){
    const url=new URL(req.url||'/','http://localhost');
    const pathname=url.pathname;
    if(pathname==='/api/status'){
      if(req.method!=='GET'&&req.method!=='HEAD')return sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false,{allow:'GET, HEAD'});
      return status(res);
    }
    if(pathname==='/api/generate'){
      if(req.method!=='POST')return sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false,{allow:'POST'});
      return generate(req,res);
    }
    if(pathname==='/api/yoma/opportunities'){
      if(req.method!=='GET'&&req.method!=='HEAD')return sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false,{allow:'GET, HEAD'});
      return opportunities(res,url);
    }
    if(cardRouter){
      const handled=cardRouter.handle(req,res,url);
      if(handled){await handled;return;}
    }
    if(pathname.startsWith('/api/'))return sendError(res,404,'not_found',MESSAGES.notFound,false);
    return serveStatic(req,res,pathname);
  }

  const server=http.createServer((req,res)=>{
    route(req,res).catch(err=>{
      // Log the code and message only: provider and Yoma errors carry static messages, never secrets.
      console.error('[yocv] '+req.method+' '+req.url+' failed: '+(err?.code?err.code+' ':'')+(err?.message||'unknown error'));
      if(res.headersSent){res.destroy();return;}
      sendError(res,500,'internal_error',MESSAGES.internal,true);
    });
  });
  return server;
}

function banner(config,provider,card){
  const mode=config.provider==='local'?'sample':'live';
  return 'YoCV server on http://'+config.host+':'+config.port+' · mode: '+mode+' · provider: '+provider.name+' · Yoma: '+config.yomaBase+
    (card?' · YoCard: '+card.accountSource.kind+' accounts, cards in '+card.store.dir:'');
}

function main(){
  const {loadConfig}=require('./server/config.js');
  const {createYomaClient}=require('./server/yoma.js');
  const {createProvider}=require('./server/providers/index.js');
  const core=require('./core.js');
  const roleSkills=require('./data/role-skills.json');
  const config=loadConfig();
  const yoma=createYomaClient({baseUrl:config.yomaBase});
  const provider=createProvider(config,core);
  const {createAccountSource}=require('./server/card/account.js');
  const {createCardStore}=require('./server/card/store.js');
  const {loadOrCreateKey}=require('./server/card/sign.js');
  const cardDir=path.join(__dirname,'data','cards');
  const card={accountSource:createAccountSource({config,yoma}),store:createCardStore(cardDir),key:loadOrCreateKey(cardDir)};
  const server=createApp({config,provider,yoma,roleSkills,core,rootDir:__dirname,card});
  server.on('error',err=>{
    if(err&&err.code==='EADDRINUSE')console.error('Port '+config.port+' on '+config.host+' is already in use. Set PORT in .env to use another port.');
    else console.error('YoCV server failed to start: '+(err?.message||err));
    process.exit(1);
  });
  server.listen(config.port,config.host,()=>{
    console.log(banner(config,provider,card));
  });
  const shutdown=()=>{server.close(()=>process.exit(0));server.closeAllConnections();};
  process.on('SIGINT',shutdown);
  process.on('SIGTERM',shutdown);
}

module.exports={createApp,validateGenerateInput,readJSONBody,STATIC,MAX_BODY_BYTES};

if(require.main===module)main();
