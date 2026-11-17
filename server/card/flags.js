'use strict';
/* YoVouch flags (spec 5.4 burst row, 5.5). Worker-to-worker vouches form a small directed graph: a pair that
   vouched for each other within 14 days is `reciprocal`, a cycle through 3 or 4 cards is `ring`, both over the
   last 30 days. A card's customer lines past 5 in its first 24 hours, or past 10 in any 7 days, are held for
   7 days. Flags never delete or hide a vouch: confirm stores them on the record (the signed JSON shows them
   as they were), the page and Check now recompute them. They catch the careless ring, not a patient one.
   Hiding a line does not change the flags or holds on the others; only a withdrawal does. */
const {withdrawnAtOf}=require('./vouches.js');

const DAY=86400000;
const WINDOW_MS=30*DAY,PAIR_MS=14*DAY,FIRST_DAY_MS=DAY,WEEK_MS=7*DAY,HOLD_MS=7*DAY;
const FIRST_DAY_MAX=5,WEEK_MAX=10,RING_MIN=3,RING_MAX=4;
const ORDER=['reciprocal','ring'];

// edges = [{vouchId, from, to, at}]: from the voucher card, to the vouched card, at in ms.
function computeFlags(edges,nowMs){
  const live=(Array.isArray(edges)?edges:[]).filter(e=>e&&e.vouchId&&e.from&&e.to&&e.from!==e.to&&Number.isFinite(e.at)&&nowMs-e.at<=WINDOW_MS);
  const marks=new Map(),mark=(id,f)=>{if(!marks.has(id))marks.set(id,new Set());marks.get(id).add(f);};
  const out=new Map();
  for(const e of live){
    out.set(e.from,[...(out.get(e.from)||[]),e]);
    for(const back of live)if(back.from===e.to&&back.to===e.from&&Math.abs(back.at-e.at)<=PAIR_MS){mark(e.vouchId,'reciprocal');mark(back.vouchId,'reciprocal');}
  }
  // Depth-first from each card over distinct cards; a path of 3 or 4 edges back to its start marks every edge on it.
  const walk=(start,card,seen,path)=>{
    for(const e of out.get(card)||[]){
      if(e.to===start&&path.length+1>=RING_MIN){for(const p of [...path,e])mark(p.vouchId,'ring');continue;}
      if(seen.has(e.to)||path.length+1>=RING_MAX)continue;
      seen.add(e.to);walk(start,e.to,seen,[...path,e]);seen.delete(e.to);
    }
  };
  for(const card of out.keys())walk(card,card,new Set([card]),[]);
  return new Map([...marks].map(([id,set])=>[id,ORDER.filter(f=>set.has(f))]));
}

// The vouchIds of a card's customer lines held back now. Only lines not withdrawn count (a hidden one still does).
function burstHeld(customerFiles,cardCreatedAtMs,nowMs){
  const at=f=>Date.parse(f.record.confirmedAt);
  const files=(Array.isArray(customerFiles)?customerFiles:[])
    .filter(f=>f?.record?.kind==='customer'&&Number.isFinite(at(f))&&!withdrawnAtOf(f,nowMs)).sort((a,b)=>at(a)-at(b));
  const held=new Set(),created=Number.isFinite(cardCreatedAtMs)?cardCreatedAtMs:null;
  files.forEach((f,i)=>{
    const t=at(f);
    if(nowMs>=t+HOLD_MS)return;
    const upTo=files.slice(0,i+1);
    const firstDay=created!==null&&t>=created&&t<=created+FIRST_DAY_MS&&upTo.filter(g=>at(g)>=created&&at(g)<=created+FIRST_DAY_MS).length>FIRST_DAY_MAX;
    const week=upTo.filter(g=>at(g)>t-WEEK_MS).length>WEEK_MAX;
    if(firstDay||week)held.add(f.record.vouchId);
  });
  return held;
}

// Live worker vouches as edges. A hidden line stays an edge, so hiding one cannot clear the flags on the rest.
function workerEdges(vouchStore,nowMs){
  return vouchStore.listAll().filter(f=>f.record?.kind==='worker'&&f.record.voucher?.cardId&&
    vouchStore.isLive({...f,private:{...f.private,hiddenAt:null}},nowMs))
    .map(f=>({vouchId:f.record.vouchId,from:f.record.voucher.cardId,to:f.record.cardId,at:Date.parse(f.record.confirmedAt)}));
}

// The flags a new record is stored with at confirm: the graph flags for a worker line, `held` for a burst-held
// customer line. record.vouchId is not allocated yet, so the new line stands in as NEW_ID.
const NEW_ID='__new__';
function flagsAtConfirm(vouchStore,record,cardCreatedAtMs,nowMs){
  const self={record:{...record,vouchId:NEW_ID},held:null,private:{}};
  if(record?.kind==='worker'&&record.voucher?.cardId){
    const edge={vouchId:NEW_ID,from:record.voucher.cardId,to:record.cardId,at:Date.parse(record.confirmedAt)};
    return computeFlags([...workerEdges(vouchStore,nowMs),edge],nowMs).get(NEW_ID)||[];
  }
  if(record?.kind!=='customer')return [];
  return burstHeld([...vouchStore.listForCard(record.cardId),self],cardCreatedAtMs,nowMs).has(NEW_ID)?['held']:[];
}

// The card's first moment for the first-day rule: the store's createdAt, else the record's publishedAt.
const cardCreatedMs=entry=>{const n=Date.parse(entry?.createdAt||entry?.record?.publishedAt);return Number.isNaN(n)?null:n;};

// Spec 5.3: a card may vouch for another worker when it is live, its phone is confirmed by Yoma, and it has one
// disclosed completion, or one live, unhidden customer vouch with no flag (stored or held now), confirmed more than
// 7 days and less than 24 months ago. Liveness is read now, so a quiet withdrawal past withdrawAfter no longer counts.
const ELIGIBLE_AFTER_MS=7*DAY,ELIGIBLE_MONTHS=24;
function eligibility(entry,{vouchStore,nowMs=Date.now()}={}){
  const record=entry?.record;
  if(!record||entry.withdrawnAt||record.user?.phoneNumberConfirmed!==true)return {ok:false};
  const at=new Date(nowMs).toISOString();
  if((Array.isArray(record.disclosed?.completions)?record.disclosed.completions:[]).length)return {ok:true,rule:'completion',at};
  if(!vouchStore)return {ok:false};
  const cut=new Date(nowMs);cut.setUTCMonth(cut.getUTCMonth()-ELIGIBLE_MONTHS);
  const files=vouchStore.listForCard(entry.cardId),held=burstHeld(files,cardCreatedMs(entry),nowMs);
  const hit=files.find(f=>{
    const t=Date.parse(f.record.confirmedAt);
    return f.record.kind==='customer'&&vouchStore.isLive(f,nowMs)&&!(f.record.flags||[]).length&&!held.has(f.record.vouchId)&&
      Number.isFinite(t)&&nowMs-t>ELIGIBLE_AFTER_MS&&t>cut.getTime();
  });
  return hit?{ok:true,rule:'customer_vouch',at}:{ok:false};
}

module.exports={eligibility,computeFlags,burstHeld,workerEdges,flagsAtConfirm,cardCreatedMs,WINDOW_MS,PAIR_MS,HOLD_MS};
