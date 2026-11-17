'use strict';
/* File-backed card store (spec section 3.5). One JSON file per card under <dir>/<cardId>.json.
   Card ids are 10 characters from an alphabet without 0/O/1/I (50 bits from crypto.randomBytes);
   the owner secret is 32 hex characters and only its SHA-256 is written to disk. Every id is
   validated against ^[A-Z2-9]{10}$ before any path is built, so a request can never read outside
   the card directory (and never the .keys.json next to the cards).
   YoVouch indexes (spec 9.6): codes.json maps a card code to its cardId, smsids.json an smsId to its cardId,
   and numbers/<keyed phone hash>.json holds {cardId}. Every index key is checked against its pattern first. */

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH=10;
const ID_PATTERN=/^[A-Z2-9]{10}$/;
const SECRET_BYTES=16;
const MAX_ID_ATTEMPTS=20;
const INDEX_KEYS={codes:/^[A-Z2-9]{6}$/,smsids:/^\d{5}$/,numbers:/^[0-9a-f]{64}$/};

function validId(cardId){return typeof cardId==='string'&&ID_PATTERN.test(cardId)&&[...cardId].every(ch=>ALPHABET.includes(ch));}
function hashSecret(secret){return crypto.createHash('sha256').update(String(secret)).digest('hex');}
function secretsMatch(hash,secret){
  if(typeof secret!=='string'||!secret)return false;
  const a=Buffer.from(hashSecret(secret),'hex'),b=Buffer.from(String(hash??''),'hex');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function createCardStore(dir,{random=crypto.randomBytes,now=Date.now}={}){
  if(!dir)throw new Error('createCardStore needs a directory');
  fs.mkdirSync(dir,{recursive:true});

  function fileOf(cardId){return path.join(dir,cardId+'.json');}
  function newId(){const bytes=random(ID_LENGTH);let id='';for(let i=0;i<ID_LENGTH;i++)id+=ALPHABET[bytes[i]%ALPHABET.length];return id;}
  function read(cardId){
    if(!validId(cardId))return null;
    let text;
    try{text=fs.readFileSync(fileOf(cardId),'utf8');}catch(err){if(err?.code==='ENOENT')return null;throw err;}
    try{return JSON.parse(text);}catch{return null;}
  }
  function writeJSON(file,data,space){
    fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,space));
    fs.renameSync(file+'.tmp',file);
  }
  function write(entry){writeJSON(fileOf(entry.cardId),entry,2);}
  function readJSON(file){
    try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(err){if(err?.code&&err.code!=='ENOENT')throw err;return null;}
  }

  function indexKey(name,key){return Object.hasOwn(INDEX_KEYS,name)&&typeof key==='string'&&INDEX_KEYS[name].test(key);}
  function mapFile(name){return path.join(dir,name+'.json');}
  function numberFile(key){return path.join(dir,'numbers',key+'.json');}
  function readMap(name){const m=readJSON(mapFile(name));return m&&typeof m==='object'&&!Array.isArray(m)?m:{};}
  function indexGet(name,key){
    if(!indexKey(name,key))return null;
    const m=name==='numbers'?readJSON(numberFile(key)):readMap(name),id=name==='numbers'?m?.cardId:(Object.hasOwn(m,key)?m[key]:null);
    return validId(id)?id:null;
  }
  function indexSet(name,key,cardId){
    if(!indexKey(name,key)||!validId(cardId))throw new TypeError('bad index entry: '+name);
    if(name==='numbers'){fs.mkdirSync(path.join(dir,'numbers'),{recursive:true});writeJSON(numberFile(key),{cardId});return;}
    const m=readMap(name);m[key]=cardId;writeJSON(mapFile(name),m,2);
  }
  function indexDelete(name,key){
    if(!indexKey(name,key))return;
    if(name==='numbers'){fs.rmSync(numberFile(key),{force:true});return;}
    const m=readMap(name);
    if(Object.hasOwn(m,key)){delete m[key];writeJSON(mapFile(name),m,2);}
  }
  function indexDeleteCard(cardId){
    for(const name of ['codes','smsids']){
      const m=readMap(name),keys=Object.keys(m).filter(k=>m[k]===cardId);
      if(keys.length){for(const k of keys)delete m[k];writeJSON(mapFile(name),m,2);}
    }
    let names=[];
    try{names=fs.readdirSync(path.join(dir,'numbers'));}catch(err){if(err?.code!=='ENOENT')throw err;}
    for(const file of names){
      const key=file.slice(0,-5);
      if(file.endsWith('.json')&&indexKey('numbers',key)&&readJSON(numberFile(key))?.cardId===cardId)fs.rmSync(numberFile(key),{force:true});
    }
  }

  function create(record,extra={}){
    let cardId=null;
    for(let attempt=0;attempt<MAX_ID_ATTEMPTS&&cardId===null;attempt++){
      const candidate=newId();
      if(!fs.existsSync(fileOf(candidate)))cardId=candidate;
    }
    if(cardId===null)throw new Error('could not allocate a card id');
    const ownerSecret=random(SECRET_BYTES).toString('hex');
    const base={
      cardId,
      record:{...(record&&typeof record==='object'?record:{}),cardId},
      ownerSecretHash:hashSecret(ownerSecret),
      createdAt:new Date(now()).toISOString(),
      withdrawnAt:null,
      lastCheck:null
    };
    const entry={...base,...(extra&&typeof extra==='object'?extra:{}),cardId,record:base.record,ownerSecretHash:base.ownerSecretHash};
    write(entry);
    if(indexKey('codes',entry.record.code))indexSet('codes',entry.record.code,cardId);
    return {cardId,ownerSecret};
  }

  function get(cardId){return read(cardId);}
  function update(cardId,mutate){
    const entry=read(cardId);
    if(!entry)return null;
    const next=mutate(entry)??entry;
    next.cardId=entry.cardId;
    write(next);
    return next;
  }

  function withdraw(cardId,ownerSecret){
    const entry=read(cardId);
    if(!entry||!secretsMatch(entry.ownerSecretHash,ownerSecret))return false;
    if(!entry.withdrawnAt){entry.withdrawnAt=new Date(now()).toISOString();write(entry);}
    return true;
  }

  function touchCheck(cardId,result){
    const entry=read(cardId);
    if(!entry)return false;
    entry.lastCheck=result??null;
    write(entry);
    return true;
  }

  function list(){
    return fs.readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>name.slice(0,-5)).filter(validId);
  }

  return {dir,create,get,update,withdraw,touchCheck,list,indexGet,indexSet,indexDelete,indexDeleteCard};
}

module.exports={ALPHABET,ID_PATTERN,createCardStore,validId,hashSecret,secretsMatch};
