'use strict';
/* YoVouch retention sweep (spec 9.7). runSweep is the one owner of retention: createCardRouter runs it every
   hour and tests call it directly. A withdrawal already holds at read time (isLive); the sweep only reduces and
   deletes files afterwards. Later tasks add their branches here (posts, requests, replies, link codes).
   This task's branches:
   - a clip is deleted at withdrawal (a quiet one once its withdrawAfter passes, which is then stored as withdrawnAt);
   - a vouch withdrawn over 30 days ago is reduced to {vouchId, cardId, withdrawnAt};
   - a card withdrawn over 24 hours ago: every vouch on it becomes that tombstone, its clips go, its index entries
     go (codes.json, smsids.json, numbers/) and entry.vouch and entry.cardTokenHash are set to null;
   - a clip older than 12 months is deleted and the record keeps clip: {expired: true};
   - voucher-file entries older than 12 months are dropped, and a file left empty is deleted;
   - a job post is deleted 60 days after createdAt (Task 9);
   - a card withdrawn over 24 hours ago loses its replies and replies/clips/<replyId>.* (Task 10);
   - a request is deleted past its expiresAt, and every request of a card withdrawn over 24 hours ago (Task 13). */
const fs=require('node:fs');
const path=require('node:path');
const {withdrawnAtOf}=require('./vouches.js');
const {POST_TTL_MS}=require('./reply.js');

const DAY_MS=86400000;
const CARD_GRACE_MS=DAY_MS;
const TOMBSTONE_AFTER_MS=30*DAY_MS;
const KEEP_MS=365*DAY_MS;
const VOUCHER_KEY=/^[0-9a-f]{64}\.json$/;
const VOUCHER_LISTS=['sessions','binds','otpSentAt','wrongCodes'];

const ms=v=>{const n=Date.parse(v);return Number.isNaN(n)?null:n;};
const older=(at,nowMs,span)=>{const n=ms(at);return n!==null&&nowMs-n>span;};

function sweepCards(system,nowMs,out){
  const {store,vouchStore}=system;
  const cleared=new Map();
  for(const cardId of store.list()){
    const entry=store.get(cardId);
    if(!entry?.withdrawnAt||!older(entry.withdrawnAt,nowMs,CARD_GRACE_MS))continue;
    cleared.set(cardId,entry.withdrawnAt);
    if(entry.vouch===null&&entry.cardTokenHash===null)continue;
    store.indexDeleteCard(cardId);
    store.update(cardId,e=>{e.vouch=null;e.cardTokenHash=null;});
    out.cardsCleared++;
  }
  for(const file of vouchStore.listAll()){
    if(!file.record||!cleared.has(file.record.cardId))continue;
    vouchStore.tombstone(file.record.vouchId,withdrawnAtOf(file,nowMs)||cleared.get(file.record.cardId));
    out.reduced++;
  }
}

function sweepVouches(system,nowMs,out){
  const {vouchStore}=system;
  for(const file of vouchStore.listAll()){
    if(!file.record)continue;
    const id=file.record.vouchId,gone=withdrawnAtOf(file,nowMs);
    if(gone){
      if(!file.private.withdrawnAt)vouchStore.update(id,f=>{f.private.withdrawnAt=gone;});
      if(vouchStore.deleteClip(id))out.deleted++;
      if(older(gone,nowMs,TOMBSTONE_AFTER_MS)){vouchStore.tombstone(id,gone);out.reduced++;}
      continue;
    }
    if(!older(file.record.confirmedAt,nowMs,KEEP_MS))continue;
    const shown=file.record.clip&&!file.record.clip.expired,held=file.held?.clip&&!file.held.clip.expired;
    if(!shown&&!held)continue;
    vouchStore.deleteClip(id);
    vouchStore.update(id,f=>{if(shown)f.record.clip={expired:true};if(held)f.held.clip={expired:true};});
    out.clipsExpired++;
  }
}

// Voucher files are read and written here directly: vouchers.js has no list or delete, and only the sweep needs them.
function sweepVoucherFiles(system,nowMs,out){
  const root=path.join(system.store.dir,'vouchers');
  let names=[];
  try{names=fs.readdirSync(root);}catch(err){if(err?.code!=='ENOENT')throw err;}
  for(const name of names.filter(n=>VOUCHER_KEY.test(n))){
    const file=path.join(root,name);
    let data;
    try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
    let changed=false,left=0;
    for(const key of VOUCHER_LISTS){
      const list=Array.isArray(data?.[key])?data[key]:[];
      const keep=list.filter(item=>!older(typeof item==='string'?item:item?.at,nowMs,KEEP_MS));
      if(keep.length!==list.length)changed=true;
      data[key]=keep;left+=keep.length;
    }
    if(!left){fs.rmSync(file,{force:true});out.deleted++;continue;}
    if(changed){fs.writeFileSync(file+'.tmp',JSON.stringify(data));fs.renameSync(file+'.tmp',file);}
  }
}

function sweepPosts(system,nowMs,out){
  if(!system.postStore)return;
  for(const post of system.postStore.listAll())if(older(post.createdAt,nowMs,POST_TTL_MS)&&system.postStore.remove(post.jobPostId))out.deleted++;
}

function sweepReplies(system,nowMs,out){
  if(!system.replyStore)return;
  for(const reply of system.replyStore.listAll()){
    const entry=system.store.get(reply.cardId);
    if(entry?.withdrawnAt&&older(entry.withdrawnAt,nowMs,CARD_GRACE_MS)&&system.replyStore.remove(reply.replyId))out.deleted++;
  }
}

function sweepRequests(system,nowMs,out){
  if(!system.requestStore)return;
  for(const rq of system.requestStore.listAll()){
    const entry=system.store.get(rq.cardId),expires=ms(rq.expiresAt);
    const gone=expires===null||expires<=nowMs||(entry?.withdrawnAt&&older(entry.withdrawnAt,nowMs,CARD_GRACE_MS));
    if(gone&&system.requestStore.remove(rq.requestId))out.deleted++;
  }
}

function runSweep(system){
  const nowMs=system.now();
  const out={reduced:0,deleted:0,clipsExpired:0,cardsCleared:0};
  sweepCards(system,nowMs,out);
  sweepVouches(system,nowMs,out);
  sweepVoucherFiles(system,nowMs,out);
  sweepPosts(system,nowMs,out);
  sweepReplies(system,nowMs,out);
  sweepRequests(system,nowMs,out);
  return out;
}

module.exports={runSweep};
