'use strict';
/* YoVouch wiring (plan Task 3). buildVouchSystem builds every YoVouch service from store.dir and returns the
   shared `system` object; later tasks add fields to it. issueVouchFields gives a card its YoVouch fields at
   publish, or lazily on rotate-token for a card published before YoVouch (spec 9.6). */
const crypto=require('node:crypto');
const {createCodeService,newSecret}=require('./vouchcode.js');
const {normalisePhone,keyedHash,createVoucherFiles}=require('./vouchers.js');
const {loadOrCreateHashKey,createVouchStore}=require('./vouches.js');
const {hashSecret}=require('./store.js');
const {createEventLog,cardFields}=require('./events.js');
const {createVouchSessions}=require('./vouch-sessions.js');
const {createVouchService}=require('./vouch-service.js');

const YV_DEFAULTS={sim:false,gatewaySecret:'',shortcode:'12345',callbackNumber:'0800 000 000',smsCountry:'South Africa',orgKeys:{}};
const SMS_ID_ATTEMPTS=20;

function buildVouchSystem({config,store,key,accountSource,provider,publicUrl,now=Date.now,random=crypto.randomBytes,outbox=null,transcriber}={}){
  if(!store?.dir)throw new Error('buildVouchSystem needs a store with a directory');
  const yv={...YV_DEFAULTS,...(config?.yovouch&&typeof config.yovouch==='object'?config.yovouch:{})};
  const liveModel=Boolean(provider)&&typeof provider.complete==='function'&&provider.name!=='local';
  const hashKey=loadOrCreateHashKey(store.dir,{random});
  const voucherFiles=createVoucherFiles(store.dir,{now});
  const codes=createCodeService({store,voucherFiles,now});
  void outbox;void transcriber; // wired in by the tasks that send messages and transcribe clips
  const events=createEventLog(store.dir,{now});
  const sessions=createVouchSessions({now,random});
  const vouchStore=createVouchStore(store.dir,{now,random,cardStore:store});
  const system={yv,store,key,accountSource,provider,liveModel,publicUrl:String(publicUrl||'').replace(/\/+$/,''),now,random,hashKey,voucherFiles,codes,events,sessions,vouchStore};
  system.service=createVouchService(system);
  return system;
}

function myUrl(system,cardId,cardToken){return system.publicUrl+'/my/'+cardId+'/'+cardToken;}
function newCardToken(system){return system.random(8).toString('hex');}

// A 5-digit smsId not yet in smsids.json.
function allocateSmsId(system){
  for(let i=0;i<SMS_ID_ATTEMPTS;i++){
    const id=String(10000+system.random(4).readUInt32BE(0)%90000);
    if(!system.store.indexGet('smsids',id))return id;
  }
  throw new Error('could not allocate an smsId');
}

// The keyed hash of the account's phone, or null when it does not read as a number.
function phoneHashOf(system,user){
  const e164=normalisePhone(String(user?.phoneNumber??''),user?.country);
  return e164?keyedHash(system.hashKey,e164):null;
}

// Card entry fields for a new YoVouch card. The card token is returned once; only its hash is stored.
function issueVouchFields(system,{user}={}){
  const cardToken=newCardToken(system),smsId=allocateSmsId(system);
  const fields={smsId,cardTokenHash:hashSecret(cardToken),ownerPhoneHash:phoneHashOf(system,user),linkedPhoneHash:null,
    vouch:{secret:newSecret(system.random),usedSteps:[],failedAttempts:[],lockedUntil:null,lang:'en',linkCode:null,createdAt:new Date(system.now()).toISOString()}};
  return {cardToken,smsId,fields};
}

// smsids.json always; numbers/<hash>.json only for a phone Yoma confirmed. The newest live card replaces an
// existing number entry and the replacement is logged as number_index_replaced (spec 9.6).
function indexCard(system,cardId,entry,{phoneConfirmed}){
  const {store}=system;
  store.indexSet('smsids',entry.smsId,cardId);
  if(/^[A-Z2-9]{6}$/.test(String(entry.record?.code??'')))store.indexSet('codes',entry.record.code,cardId);
  if(phoneConfirmed===true&&entry.ownerPhoneHash){
    const before=store.indexGet('numbers',entry.ownerPhoneHash);
    store.indexSet('numbers',entry.ownerPhoneHash,cardId);
    if(before&&before!==cardId)system.events?.log('number_index_replaced',{...cardFields(entry),replacedCardId:before});
  }
}

module.exports={YV_DEFAULTS,buildVouchSystem,issueVouchFields,indexCard,allocateSmsId,phoneHashOf,newCardToken,myUrl};
