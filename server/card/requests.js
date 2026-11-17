'use strict';
/* YoVouch requests (spec 5.1, 9.6, 9.7): <dir>/requests/<requestId>.json, single use. A referral request
   (kind 'referral', plan Task 13) carries jobPostId, evidenceId and orgName and expires with the post; the
   request path (kind 'vouch', Task 14) adds its own. markUsed reduces the file to
   {requestId, cardId, kind, usedAt, expiresAt}, so a second open reads requestUsed. The sweep deletes a request
   at expiry and every request of a card withdrawn over 24 hours. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {ALPHABET,validId}=require('./store.js');

function createRequestStore(dir,{now=Date.now,random=crypto.randomBytes}={}){
  if(!dir)throw new Error('createRequestStore needs a directory');
  const root=path.join(dir,'requests'),fileOf=id=>path.join(root,id+'.json');
  function write(rec){
    fs.mkdirSync(root,{recursive:true});
    fs.writeFileSync(fileOf(rec.requestId)+'.tmp',JSON.stringify(rec));
    fs.renameSync(fileOf(rec.requestId)+'.tmp',fileOf(rec.requestId));
  }
  function newId(){
    for(let i=0;i<20;i++){
      const bytes=random(10);let id='';
      for(let j=0;j<10;j++)id+=ALPHABET[bytes[j]%ALPHABET.length];
      if(!fs.existsSync(fileOf(id)))return id;
    }
    throw new Error('could not allocate a request id');
  }
  function create({kind,cardId,ttlMs,...fields}={}){
    if(typeof kind!=='string'||!validId(cardId)||!(Number(ttlMs)>0))throw new Error('create needs kind, cardId and ttlMs');
    const at=now(),requestId=newId(),expiresAt=new Date(at+Number(ttlMs)).toISOString();
    write({...fields,requestId,cardId,kind,createdAt:new Date(at).toISOString(),expiresAt,usedAt:null});
    return {requestId,expiresAt};
  }
  function get(id){
    if(!validId(id))return null;
    try{return JSON.parse(fs.readFileSync(fileOf(id),'utf8'));}
    catch(err){if(err?.code&&err.code!=='ENOENT')throw err;return null;}
  }
  function markUsed(id){
    const rec=get(id);
    if(!rec||rec.usedAt)return null;
    const used={requestId:rec.requestId,cardId:rec.cardId,kind:rec.kind,usedAt:new Date(now()).toISOString(),expiresAt:rec.expiresAt};
    write(used);
    return used;
  }
  function listAll(){
    let names=[];
    try{names=fs.readdirSync(root);}catch(err){if(err?.code!=='ENOENT')throw err;}
    return names.filter(n=>/^[A-Z2-9]{10}\.json$/.test(n)).map(n=>get(n.slice(0,10))).filter(Boolean);
  }
  const open=(rec,at)=>!rec.usedAt&&Date.parse(rec.expiresAt)>at;
  const listOpen=(cardId,kind)=>{const at=now();return listAll().filter(r=>r.cardId===cardId&&r.kind===kind&&open(r,at));};
  function remove(id){if(!validId(id))return false;try{fs.rmSync(fileOf(id));return true;}catch{return false;}}
  return {create,get,markUsed,listOpen,listAll,remove};
}

module.exports={createRequestStore};
