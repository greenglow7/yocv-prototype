'use strict';
/* YoVouch sessions (spec 4.3): in memory like the draft sessions in routes.js, 30 minutes, at most 500 (the
   oldest goes first). A session opens at the 18-or-older POST, under a 24-hex vouchToken, and holds the
   chips, words, disclosure and phone binding until confirm. The form nonce maps a double tap back to the
   session it opened. A restart ends every session; the customer starts again from the worker's code. */
const crypto=require('node:crypto');

const SESSION_TTL_MS=30*60*1000;
const MAX_SESSIONS=500;
const TOKEN=/^[0-9a-f]{24}$/;
const NONCE=/^[0-9a-f]{16}$/;

function createVouchSessions({now=Date.now,random=crypto.randomBytes}={}){
  const sessions=new Map(),nonces=new Map(),nonceOf=new Map();

  function drop(token){
    sessions.delete(token);
    const nonce=nonceOf.get(token);
    if(nonce!==undefined){nonceOf.delete(token);if(nonces.get(nonce)===token)nonces.delete(nonce);}
  }
  function prune(){
    const t=now();
    for(const [token,s] of sessions)if(t-s.createdAt>SESSION_TTL_MS)drop(token);
    while(sessions.size>MAX_SESSIONS)drop(sessions.keys().next().value);
  }

  function open(data={}){
    let vouchToken;
    do vouchToken=random(12).toString('hex');while(sessions.has(vouchToken));
    const session={vouchToken,cardId:data.cardId??null,proof:data.proof??null,voucher:data.voucher??null,onWorkerPhone:data.onWorkerPhone===true,
      channel:data.channel||'web',lang:data.lang||'en',step:'chips',adult:data.adult===true,createdAt:now(),
      chips:null,words:null,clip:null,disclose:null,bind:null,demo:null,recentVouchId:null};
    sessions.set(vouchToken,session);
    if(typeof data.formNonce==='string'&&NONCE.test(data.formNonce)){nonces.set(data.formNonce,vouchToken);nonceOf.set(vouchToken,data.formNonce);}
    prune();
    return {vouchToken,session};
  }
  function get(token){
    prune();
    return typeof token==='string'&&TOKEN.test(token)?sessions.get(token)||null:null;
  }
  function byNonce(nonce){
    prune();
    return typeof nonce==='string'&&NONCE.test(nonce)?nonces.get(nonce)??null:null;
  }
  function bySessionCode(code){
    prune();
    if(typeof code!=='string'||!code)return null;
    for(const s of sessions.values())if(s.bind?.sessionCode===code)return s;
    return null;
  }
  function size(){prune();return sessions.size;}

  return {open,get,byNonce,bySessionCode,delete:drop,size};
}

module.exports={createVouchSessions,SESSION_TTL_MS,MAX_SESSIONS};
