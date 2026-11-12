'use strict';
/* YoCard routes (spec §3.4), mounted by server.js. handle(req,res,url) returns false synchronously when the
   request is not a card route, otherwise a promise that resolves to true once the response is sent.
     GET  /api/card/status                 account source, model mode, personas, trades
     POST /api/card/account                read a snapshot (persona or token), age gate, returns a draftToken
     POST /api/card/draft                  AI or template draft on the stored snapshot
     POST /api/card/publish                validate, build the public record, sign, store
     POST /api/card/:id/check              re-read the account, compare, JSON signals
     POST /api/card/:id/withdraw           owner secret, marks the card withdrawn
     GET  /c/:id | /c/:id.svg | /c/:id.json  public page, image, signed record
     POST /c/:id/check                     the no-JavaScript check form, renders the page with the result
     GET  /.well-known/jwks.json           the signing key
   Draft sessions live in memory for 30 minutes keyed by a 24-hex draftToken; they hold the full snapshot
   (with the real phone number and date of birth) so the browser only ever sees the masked copy. */

const crypto=require('node:crypto');
const {ageAt}=require('./account.js');
const {runDraft,validateSelfDeclared,validateConfirms,MAX_DESCRIPTION}=require('./draft.js');
const {signRecord,jwks}=require('./sign.js');
const {validId}=require('./store.js');
const {publicPage,notFoundPage,withdrawnPage,cardSvg,maskPhone}=require('./render.js');
const {qrSvg}=require('../qr.js');
const {ProviderError}=require('../providers/errors.js');
const {noBannedClaims}=require('../validate.js');

const SESSION_TTL_MS=30*60*1000;
const MAX_SESSIONS=500;
const TOKEN_PATTERN=/^[0-9a-f]{24}$/;
const CODE_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH=6;
const MAX_TRADE=40;
const MAX_IN_FLIGHT=4;
const E164=/^\+[1-9]\d{6,14}$/;
const CARD_PATH=/^\/c\/([A-Z2-9]{10})(\.svg|\.json|\/check)?$/;
const API_CARD_PATH=/^\/api\/card\/([A-Z2-9]{10})\/(check|withdraw)$/;

// Trade grid from spec §3.7: id -> label shown on the card.
const TRADES=[
  {id:'hair',label:'Hairdresser'},{id:'nails',label:'Nail technician'},{id:'boda',label:'Boda boda or taxi driver'},
  {id:'tailor',label:'Tailor'},{id:'mechanic',label:'Mechanic'},{id:'electrician',label:'Electrician'},
  {id:'plumber',label:'Plumber'},{id:'cleaner',label:'Cleaner'},{id:'cook',label:'Cook or food seller'},
  {id:'market',label:'Market seller'},{id:'mobile-money',label:'Mobile money agent'},{id:'labourer',label:'General labourer'},
  {id:'other',label:'Other'}
];
const TRADE_LABELS=new Map(TRADES.map(t=>[t.id,t.label]));

const MESSAGES={
  body:'Send a JSON object.',
  persona:'Choose one of the sample accounts.',
  under18:"YoCard is for adults. This account's date of birth is self-declared on Yoma and shows under 18.",
  session:'Your account session expired. Connect your Yoma account again.',
  trade:'Choose a trade or type a short trade name (under '+MAX_TRADE+' characters, no credential claims).',
  description:'Describe your work in one message, under '+MAX_DESCRIPTION+' characters.',
  descriptionShort:'Describe your work in a few words.',
  consent:'Tick the consent box to publish: the card is public to anyone with the link.',
  disclose:'The disclosed items must be completions and skills from this account.',
  selfDeclared:'Some fields could not be kept. Numbers must appear in your description and the card cannot claim certifications or name organisations.',
  confirms:'Some confirms lines could not be kept: each line must cite evidence from this account.',
  yomaUnavailable:'Yoma could not be reached. Try again in a moment.',
  busy:'The server is busy, try again in a moment.',
  notFound:'Not found.',
  noCard:'No card with this code.',
  withdrawn:'This card was withdrawn by its owner.',
  forbidden:'That owner secret does not match this card.',
  methodNotAllowed:'Method not allowed.',
  mode:'mode must be "live" or "sample".',
  bodyTooLarge:'The request body must be under 64 KB.'
};

function isPlainObject(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function str(value){return value==null?'':String(value);}
function list(value){return Array.isArray(value)?value:[];}
function isUnavailable(err){return err?.code==='yoma_unavailable'||err?.name==='YomaUnavailable';}
function isProviderError(err){return err instanceof ProviderError||(err&&typeof err.code==='string'&&err.code.startsWith('provider_'));}

function send(res,status,body,type,extra={}){
  const data=Buffer.isBuffer(body)?body:Buffer.from(body);
  res.writeHead(status,{'content-type':type,'content-length':data.length,'cache-control':'no-store','x-content-type-options':'nosniff',...extra});
  res.end(data);
}
function sendJSON(res,status,payload,extra){send(res,status,JSON.stringify(payload),'application/json; charset=utf-8',extra);}
function sendError(res,status,code,message,retryable=false,details={}){sendJSON(res,status,{error:{code,message,retryable:Boolean(retryable),...details}});}
function sendHtml(res,status,html){send(res,status,html,'text/html; charset=utf-8');}
function sendSvg(res,status,svg){send(res,status,svg,'image/svg+xml; charset=utf-8');}

// The same body reader server.js uses, loaded lazily so the two modules can require each other.
function defaultReadJSONBody(req){return require('../../server.js').readJSONBody(req);}

function drain(req){return new Promise(resolve=>{req.on('end',resolve);req.on('error',resolve);req.resume();});}

function tradeLabel(trade){
  const raw=str(trade).trim();
  if(TRADE_LABELS.has(raw))return TRADE_LABELS.get(raw);
  const lower=raw.toLowerCase();
  const byLabel=TRADES.find(t=>t.label.toLowerCase()===lower);
  if(byLabel)return byLabel.label;
  if(!raw||raw.length>MAX_TRADE||!/\p{L}/u.test(raw)||!noBannedClaims(raw).ok)return null;
  return raw;
}

// The public record (spec §3.5). Built from the snapshot and the worker's choices; never carries the
// date of birth, the email flag, or the phone number unless WhatsApp is enabled.
function buildRecord({snapshot,trade,selfDeclared,confirms,disclose={},code,generation=null,now=Date.now,personaId=null}={}){
  const user=snapshot?.user||{};
  const wantCompletions=new Set(list(disclose.completions).map(str));
  const wantSkills=new Set(list(disclose.skills).map(str));
  const completions=list(snapshot?.completions).filter(c=>wantCompletions.has(str(c?.evidenceId))).map(c=>({
    evidenceId:str(c.evidenceId),
    opportunityId:c.opportunityId??null,
    title:c.title??null,
    organizationName:c.organizationName??null,
    organizationLogoURL:c.organizationLogoURL??null,
    dateCompleted:c.dateCompleted??null,
    opportunityType:c.opportunityType??null,
    skills:list(c.skills).map(s=>({id:s?.id??null,name:s?.name??null,infoURL:s?.infoURL??null})),
    evidenceTypes:list(c.evidenceTypes).map(str),
    live:c.live&&typeof c.live==='object'?{
      verificationMethod:c.live.verificationMethod??null,
      verificationTypes:list(c.live.verificationTypes).map(t=>({type:t?.type??null,displayName:t?.displayName??null,description:t?.description??null})),
      participantCountCompleted:c.live.participantCountCompleted??0,
      yomaInfoURL:c.live.yomaInfoURL??null,
      published:c.live.published===true
    }:null
  }));
  const skills=list(snapshot?.skills).filter(s=>wantSkills.has(str(s?.evidenceId))).map(s=>({
    evidenceId:str(s.evidenceId),id:s.id??null,name:s.name??null,infoURL:s.infoURL??null,
    organizations:list(s.organizations).map(o=>({id:o?.id??null,name:o?.name??null,logoURL:o?.logoURL??null}))
  }));
  const phone=str(user.phoneNumber).trim();
  const phoneOk=user.phoneNumberConfirmed===true&&E164.test(phone);
  const whatsapp=disclose.whatsapp===true&&phoneOk?{enabled:true,number:phone}:{enabled:false};
  const digits=phone.replace(/\D/g,'');
  const record={
    cardId:null,
    code:str(code),
    publishedAt:new Date(now()).toISOString(),
    trade:tradeLabel(trade)||str(trade).trim(),
    selfDeclared:{
      headline:str(selfDeclared?.headline),
      services:list(selfDeclared?.services).map(s=>({name:str(s?.name),priceFrom:s?.priceFrom??null,priceTo:s?.priceTo??null,currency:str(s?.currency)})),
      area:str(selfDeclared?.area),hours:str(selfDeclared?.hours),
      languages:list(selfDeclared?.languages).map(str),notes:str(selfDeclared?.notes)
    },
    confirms:list(confirms).map(l=>({text:str(l?.text),evidenceIds:list(l?.evidenceIds).map(str)})),
    disclosed:{completions,skills},
    user:{
      id:user.id??null,
      displayName:user.displayName??null,
      firstName:user.firstName??null,
      photoURL:disclose.photo===true&&user.photoURL?String(user.photoURL):null,
      country:user.country??null,
      city:user.city??null,
      dateYoIDOnboarded:user.dateYoIDOnboarded??null,
      dateCreated:user.dateCreated??null,
      phoneNumberConfirmed:user.phoneNumberConfirmed===true,
      phoneLast3:digits.length>=3?digits.slice(-3):null,
      opportunityCountCompleted:Number.isInteger(user.opportunityCountCompleted)?user.opportunityCountCompleted:list(snapshot?.completions).length
    },
    whatsapp,
    accountSource:snapshot?.source==='token'?'token':'sample',
    personaId:snapshot?.source==='token'?null:(personaId??null),
    snapshotReadAt:snapshot?.readAt??null,
    generation:generation&&typeof generation==='object'?generation:null
  };
  return record;
}

// What the browser gets after the account step: the snapshot with the phone masked and no date of birth.
function maskSnapshot(snapshot,now){
  const user=snapshot?.user||{};
  const {phoneNumber,dateOfBirth,...rest}=user;
  return {...snapshot,user:{...rest,phoneNumber:maskPhone(phoneNumber),phoneMaskedOnly:true,age:ageAt(dateOfBirth,now)}};
}

function createCardRouter({config,accountSource,provider,store,key,yoma,publicUrl,now=Date.now,random=crypto.randomBytes,readJSONBody=defaultReadJSONBody,maxInFlight=MAX_IN_FLIGHT}={}){
  if(!accountSource||!store||!key)throw new Error('createCardRouter needs accountSource, store and key');
  const base=str(publicUrl||('http://'+(config?.host||'127.0.0.1')+':'+(config?.port||4173))).replace(/\/+$/,'');
  const sessions=new Map();
  let inFlight=0;
  const liveModel=Boolean(provider)&&typeof provider.complete==='function';

  function prune(){
    const t=now();
    for(const [token,session] of sessions)if(t-session.createdAt>SESSION_TTL_MS)sessions.delete(token);
    while(sessions.size>MAX_SESSIONS)sessions.delete(sessions.keys().next().value);
  }
  function newToken(){return random(12).toString('hex');}
  function newCode(){const bytes=random(CODE_LENGTH);let out='';for(let i=0;i<CODE_LENGTH;i++)out+=CODE_ALPHABET[bytes[i]%CODE_ALPHABET.length];return out;}
  function sessionOf(token){
    prune();
    if(typeof token!=='string'||!TOKEN_PATTERN.test(token))return null;
    return sessions.get(token)||null;
  }
  function cardUrl(cardId){return base+'/c/'+cardId;}

  async function readBody(req,res){
    try{return await readJSONBody(req);}
    catch(err){
      if(err?.code==='invalid_input'||err?.name==='InputError'){sendError(res,400,'invalid_input',err.message,false);return undefined;}
      throw err;
    }
  }

  // ---- /api/card/status ----
  function status(res){
    sendJSON(res,200,{
      accountSource:accountSource.kind,
      model:{mode:liveModel?'live':'sample',provider:liveModel?str(provider.name):'local',model:liveModel?(provider.model??null):null},
      personas:accountSource.kind==='sample'?accountSource.listPersonas().map(p=>({id:p.id,displayName:p.displayName,trade:p.trade,city:p.city??null})):[],
      trades:TRADES,
      adultsOnly:true,
      publicUrl:base
    });
  }

  // Reads the account for a selector; maps the source errors to responses. Resolves the snapshot or null.
  async function readAccount(res,selector){
    try{return await accountSource.read(selector);}
    catch(err){
      if(err?.code==='unknown_persona'){sendError(res,400,'invalid_input',MESSAGES.persona,false);return null;}
      if(err?.code==='yoma_auth'){sendError(res,502,'yoma_auth',err.message,false);return null;}
      if(isUnavailable(err)){sendError(res,502,'yoma_unavailable',MESSAGES.yomaUnavailable,true);return null;}
      throw err;
    }
  }

  // ---- /api/card/account ----
  async function account(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!isPlainObject(payload))return sendError(res,400,'invalid_input',MESSAGES.body,false);
    const selector=accountSource.kind==='sample'?{persona:payload.persona}:{};
    if(accountSource.kind==='sample'&&typeof payload.persona!=='string')return sendError(res,400,'invalid_input',MESSAGES.persona,false);
    const snapshot=await readAccount(res,selector);
    if(!snapshot)return;
    const age=ageAt(snapshot.user?.dateOfBirth,now);
    if(age!==null&&age<18)return sendError(res,403,'under_18',MESSAGES.under18,false);
    prune();
    const draftToken=newToken();
    sessions.set(draftToken,{snapshot,selector,createdAt:now(),generation:null});
    sendJSON(res,200,{draftToken,snapshot:maskSnapshot(snapshot,now),expiresInMs:SESSION_TTL_MS});
  }

  function validateDescription(value){
    if(typeof value!=='string')return {error:MESSAGES.description};
    const text=value.trim();
    if(!text||(text.match(/\p{L}{2,}/gu)||[]).length<2)return {error:MESSAGES.descriptionShort};
    if(text.length>MAX_DESCRIPTION)return {error:MESSAGES.description};
    return {text};
  }

  // ---- /api/card/draft ----
  async function draft(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!isPlainObject(payload))return sendError(res,400,'invalid_input',MESSAGES.body,false);
    const session=sessionOf(payload.draftToken);
    if(!session)return sendError(res,400,'session_expired',MESSAGES.session,false);
    const trade=tradeLabel(payload.trade);
    if(!trade)return sendError(res,400,'invalid_input',MESSAGES.trade,false);
    const desc=validateDescription(payload.description);
    if(desc.error)return sendError(res,400,'invalid_input',desc.error,false);
    const mode=payload.mode??null;
    if(mode!==null&&mode!=='live'&&mode!=='sample')return sendError(res,400,'invalid_input',MESSAGES.mode,false);
    if(mode==='live'&&!liveModel)return sendError(res,502,'provider_not_configured',new ProviderError('provider_not_configured').message,false);
    const chosen=mode==='sample'?null:(liveModel?provider:null);
    if(inFlight>=maxInFlight)return sendError(res,503,'busy',MESSAGES.busy,true);
    inFlight++;
    try{
      const result=await runDraft({snapshot:session.snapshot,trade,description:desc.text,provider:chosen,now});
      session.generation=result.generation;
      session.trade=trade;
      sendJSON(res,200,result);
    }catch(err){
      if(isProviderError(err))return sendError(res,502,err.code,err.message,err.retryable);
      throw err;
    }finally{inFlight--;}
  }

  // ---- /api/card/publish ----
  async function publish(req,res){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    if(!isPlainObject(payload))return sendError(res,400,'invalid_input',MESSAGES.body,false);
    const session=sessionOf(payload.draftToken);
    if(!session)return sendError(res,400,'session_expired',MESSAGES.session,false);
    if(payload.consent!==true)return sendError(res,400,'invalid_input',MESSAGES.consent,false);
    const trade=tradeLabel(payload.trade);
    if(!trade)return sendError(res,400,'invalid_input',MESSAGES.trade,false);
    const desc=validateDescription(payload.description);
    if(desc.error)return sendError(res,400,'invalid_input',desc.error,false);
    const snapshot=session.snapshot;
    const disclose=isPlainObject(payload.disclose)?payload.disclose:{};
    const knownCompletions=new Set(list(snapshot.completions).map(c=>str(c?.evidenceId)));
    const knownSkills=new Set(list(snapshot.skills).map(s=>str(s?.evidenceId)));
    const wantCompletions=list(disclose.completions),wantSkills=list(disclose.skills);
    if(!Array.isArray(disclose.completions??[])||!Array.isArray(disclose.skills??[]))return sendError(res,400,'invalid_input',MESSAGES.disclose,false);
    if(wantCompletions.some(id=>typeof id!=='string'||!knownCompletions.has(id))||wantSkills.some(id=>typeof id!=='string'||!knownSkills.has(id)))return sendError(res,400,'invalid_input',MESSAGES.disclose,false);
    if(!isPlainObject(payload.selfDeclared))return sendError(res,400,'invalid_input',MESSAGES.selfDeclared,false);
    // Spec §3.3: organisation names from the account snapshot must not appear in the
    // self-declared text. The draft applies this from the snapshot; the worker may edit the fields after
    // the draft, so publish applies the same list again.
    const organisationNames=[...new Set([
      ...list(snapshot.completions).map(c=>str(c?.organizationName).trim()),
      ...list(snapshot.skills).flatMap(s=>list(s?.organizations).map(o=>str(o?.name).trim()))
    ].filter(Boolean))];
    const self=validateSelfDeclared(payload.selfDeclared,{description:desc.text,organisationNames});
    if(self.rejected.length)return sendError(res,400,'invalid_input',MESSAGES.selfDeclared,false,{rejected:self.rejected});
    if(!Array.isArray(payload.confirms))return sendError(res,400,'invalid_input',MESSAGES.confirms,false);
    const disclosedSnapshot={...snapshot,completions:list(snapshot.completions).filter(c=>wantCompletions.includes(str(c?.evidenceId))),skills:list(snapshot.skills).filter(s=>wantSkills.includes(str(s?.evidenceId)))};
    const confirms=validateConfirms(payload.confirms,disclosedSnapshot);
    if(confirms.rejected.length)return sendError(res,400,'invalid_input',MESSAGES.confirms,false,{rejected:confirms.rejected});
    const code=newCode();
    const record=buildRecord({snapshot,trade,selfDeclared:self.value,confirms:confirms.lines,disclose:{completions:wantCompletions,skills:wantSkills,photo:disclose.photo===true,whatsapp:disclose.whatsapp===true},code,generation:session.generation,now,personaId:session.selector?.persona??null});
    const {cardId,ownerSecret}=store.create(record);
    sessions.delete(payload.draftToken);
    sendJSON(res,200,{cardId,url:cardUrl(cardId),svgUrl:cardUrl(cardId)+'.svg',code,ownerSecret});
  }

  // ---- check ----
  function signalsFor(record,fresh){
    const signals=[];
    const push=(key,label,ok,detail='')=>signals.push({key,label,ok:Boolean(ok),detail});
    const sameAccount=Boolean(fresh)&&(record.user?.id==null||fresh.user?.id==null||str(fresh.user.id)===str(record.user.id));
    push('account_exists','Yoma account exists',sameAccount,sameAccount?'':'The account could not be matched');
    push('yoid_onboarded','Yo-ID onboarded',sameAccount&&fresh.user?.yoIDOnboarded===true);
    const digits=str(fresh?.user?.phoneNumber).replace(/\D/g,'');
    const phoneOk=sameAccount&&fresh.user?.phoneNumberConfirmed===true&&(!record.user?.phoneLast3||digits.slice(-3)===str(record.user.phoneLast3));
    push('phone_confirmed','Phone confirmed by Yoma (not an ID check)',phoneOk,phoneOk?'':'Phone no longer confirmed on the account');
    const freshCompletions=list(fresh?.completions);
    for(const c of list(record.disclosed?.completions)){
      const hit=sameAccount&&freshCompletions.find(f=>str(f?.opportunityId)===str(c.opportunityId)&&(f?.verificationStatus==null||f.verificationStatus==='Completed'));
      push('completion:'+c.evidenceId,str(c.title)||'Completion',Boolean(hit),hit?str(c.organizationName):'Not found on the account any more');
    }
    const freshSkills=list(fresh?.skills);
    for(const s of list(record.disclosed?.skills)){
      const hit=sameAccount&&freshSkills.some(f=>str(f?.id)===str(s.id)||(s.id==null&&str(f?.name)===str(s.name)));
      push('skill:'+s.evidenceId,str(s.name)||'Skill',Boolean(hit),hit?'':'Not on the account any more');
    }
    return signals;
  }

  async function runCheck(entry){
    const record=entry.record;
    const checkedAt=new Date(now()).toISOString();
    const selector=record.accountSource==='sample'?{persona:record.personaId}:{};
    let fresh=null;
    try{fresh=await accountSource.read(selector);}
    catch(err){
      if(isUnavailable(err)||err?.code==='yoma_auth'||err?.code==='unknown_persona'){
        const result={checkedAt,unavailable:true,simulated:record.accountSource==='sample'};
        store.touchCheck(record.cardId,result);
        return result;
      }
      throw err;
    }
    const result={checkedAt,signals:signalsFor(record,fresh),simulated:record.accountSource==='sample',unavailable:false};
    store.touchCheck(record.cardId,result);
    return result;
  }

  // ---- public card routes ----
  async function publicCard(req,res,cardId,suffix){
    const entry=store.get(cardId);
    if(!entry||!entry.record){
      if(suffix==='.json')return sendError(res,404,'not_found',MESSAGES.noCard,false);
      if(suffix==='.svg')return sendError(res,404,'not_found',MESSAGES.noCard,false);
      return sendHtml(res,404,notFoundPage());
    }
    const record={...entry.record,cardId};
    const withdrawn=entry.withdrawnAt?{withdrawnAt:entry.withdrawnAt}:null;
    if(suffix==='/check'){
      if(req.method!=='POST')return sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false);
      await drain(req);
      if(withdrawn)return sendHtml(res,410,withdrawnPage(record,withdrawn));
      // Same concurrency guard as the draft route (spec §3.4): a check re-reads the account.
      if(inFlight>=maxInFlight)return sendHtml(res,503,publicPage({record,status:'ok',notice:MESSAGES.busy,publicUrl:base}));
      inFlight++;
      try{
        const check=await runCheck(entry);
        return sendHtml(res,200,publicPage({record,status:'ok',check,publicUrl:base}));
      }finally{inFlight--;}
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false);
    if(suffix==='.svg'){
      return sendSvg(res,withdrawn?410:200,cardSvg({record,publicUrl:base,qrSvgFn:qrSvg,withdrawn:Boolean(withdrawn)}));
    }
    if(suffix==='.json'){
      if(withdrawn)return sendJSON(res,410,{error:{code:'withdrawn',message:MESSAGES.withdrawn,retryable:false},withdrawnAt:entry.withdrawnAt});
      const jwt=signRecord(key,record,{now:()=>Date.parse(record.publishedAt)||now()});
      return sendJSON(res,200,{record,jwt,jwksUrl:base+'/.well-known/jwks.json'});
    }
    if(withdrawn)return sendHtml(res,410,withdrawnPage(record,withdrawn));
    return sendHtml(res,200,publicPage({record,status:'ok',publicUrl:base}));
  }

  async function apiCheck(req,res,cardId){
    const entry=store.get(cardId);
    if(!entry||!entry.record)return sendError(res,404,'not_found',MESSAGES.noCard,false);
    await drain(req);
    if(entry.withdrawnAt)return sendError(res,410,'withdrawn',MESSAGES.withdrawn,false);
    if(inFlight>=maxInFlight)return sendError(res,503,'busy',MESSAGES.busy,true);
    inFlight++;
    try{sendJSON(res,200,await runCheck({...entry,record:{...entry.record,cardId}}));}
    finally{inFlight--;}
  }

  async function apiWithdraw(req,res,cardId){
    const payload=await readBody(req,res);
    if(payload===undefined)return;
    const entry=store.get(cardId);
    if(!entry)return sendError(res,404,'not_found',MESSAGES.noCard,false);
    const secret=isPlainObject(payload)?payload.ownerSecret:null;
    if(typeof secret!=='string'||!store.withdraw(cardId,secret))return sendError(res,403,'forbidden',MESSAGES.forbidden,false);
    sendJSON(res,200,{cardId,withdrawnAt:store.get(cardId)?.withdrawnAt??new Date(now()).toISOString()});
  }

  function handle(req,res,url){
    const pathname=url.pathname;
    const method=req.method;
    const post=(fn)=>method==='POST'?fn():Promise.resolve(sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false));
    const wrap=(p)=>Promise.resolve(p).then(()=>true);
    if(pathname==='/api/card/status'){
      if(method!=='GET'&&method!=='HEAD')return wrap(sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false));
      return wrap(status(res));
    }
    if(pathname==='/api/card/account')return wrap(post(()=>account(req,res)));
    if(pathname==='/api/card/draft')return wrap(post(()=>draft(req,res)));
    if(pathname==='/api/card/publish')return wrap(post(()=>publish(req,res)));
    if(pathname==='/.well-known/jwks.json'){
      if(method!=='GET'&&method!=='HEAD')return wrap(sendError(res,405,'method_not_allowed',MESSAGES.methodNotAllowed,false));
      return wrap(sendJSON(res,200,jwks(key),{'cache-control':'public, max-age=300'}));
    }
    const api=API_CARD_PATH.exec(pathname);
    if(api){
      const [,cardId,action]=api;
      if(!validId(cardId))return wrap(sendError(res,404,'not_found',MESSAGES.noCard,false));
      return wrap(post(()=>action==='check'?apiCheck(req,res,cardId):apiWithdraw(req,res,cardId)));
    }
    if(pathname.startsWith('/c/')){
      const m=CARD_PATH.exec(pathname);
      if(!m||!validId(m[1]))return wrap(sendHtml(res,404,notFoundPage()));
      return wrap(publicCard(req,res,m[1],m[2]||''));
    }
    return false;
  }

  return {handle,sessions,buildRecord,TRADES};
}

module.exports={createCardRouter,buildRecord,tradeLabel,maskSnapshot,TRADES,SESSION_TTL_MS,MESSAGES};
