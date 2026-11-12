'use strict';
/* File-backed card store (spec section 3.5). One JSON file per card under <dir>/<cardId>.json.
   Card ids are 10 characters from an alphabet without 0/O/1/I (50 bits from crypto.randomBytes);
   the owner secret is 32 hex characters and only its SHA-256 is written to disk. Every id is
   validated against ^[A-Z2-9]{10}$ before any path is built, so a request can never read outside
   the card directory (and never the .keys.json next to the cards). */

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH=10;
const ID_PATTERN=/^[A-Z2-9]{10}$/;
const SECRET_BYTES=16;
const MAX_ID_ATTEMPTS=20;

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
  function write(entry){
    const file=fileOf(entry.cardId),tmp=file+'.tmp';
    fs.writeFileSync(tmp,JSON.stringify(entry,null,2));
    fs.renameSync(tmp,file);
  }

  function create(record){
    let cardId=null;
    for(let attempt=0;attempt<MAX_ID_ATTEMPTS&&cardId===null;attempt++){
      const candidate=newId();
      if(!fs.existsSync(fileOf(candidate)))cardId=candidate;
    }
    if(cardId===null)throw new Error('could not allocate a card id');
    const ownerSecret=random(SECRET_BYTES).toString('hex');
    const entry={
      cardId,
      record:{...(record&&typeof record==='object'?record:{}),cardId},
      ownerSecretHash:hashSecret(ownerSecret),
      createdAt:new Date(now()).toISOString(),
      withdrawnAt:null,
      lastCheck:null
    };
    write(entry);
    return {cardId,ownerSecret};
  }

  function get(cardId){return read(cardId);}

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

  return {dir,create,get,withdraw,touchCheck,list};
}

module.exports={ALPHABET,ID_PATTERN,createCardStore,validId,hashSecret};
