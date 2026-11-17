'use strict';
/* The outbox (spec 7.2 step 5, Global Constraints): no message goes to a number that did not text first in the
   last 15 minutes, and nothing is ever sent to a typed number. Raw numbers live only in this in-memory map, for
   15 minutes; the files hold keyed hashes. In the prototype this is the simulated gateway: send() records the
   message and the /demo pages list it, labelled. A real gateway would deliver from send(). */
const {keyedHash}=require('./vouchers.js');

const WINDOW_MS=15*60*1000;

function createOutbox({now=Date.now,hashKey}={}){
  const seen=new Map(),log=[];
  function prune(){
    const t=now();
    for(const [e164,at] of seen)if(t-at>WINDOW_MS)seen.delete(e164);
    while(log.length&&t-log[0].at>WINDOW_MS)log.shift();
  }
  const fresh=e164=>seen.has(e164)&&now()-seen.get(e164)<=WINDOW_MS;
  function inbound(e164){
    if(typeof e164!=='string'||!/^\+\d{8,15}$/.test(e164))return;
    prune();
    seen.set(e164,now());
  }
  function send(to,text){
    prune();
    if(!fresh(to)){const err=new Error('No inbound message from this number in the last 15 minutes.');err.code='unsolicited';throw err;}
    log.push({to,text:String(text),at:now()});
  }
  // Sends to the in-memory number whose keyed hash is key, when it texted in the last 15 minutes.
  function sendToKey(key,text){
    prune();
    if(!hashKey||typeof key!=='string')return false;
    for(const e164 of seen.keys())if(keyedHash(hashKey,e164)===key){send(e164,text);return true;}
    return false;
  }
  const iso=ms=>new Date(ms).toISOString();
  return {inbound,send,sendToKey,
    sent:to=>{prune();return log.filter(m=>m.to===to).map(m=>m.text);},
    all:()=>{prune();return log.map(m=>({to:m.to,text:m.text,at:iso(m.at)}));},
    inbounds:()=>{prune();return [...seen].map(([e164,at])=>({e164,at:iso(at)}));}};
}

module.exports={createOutbox,OUTBOX_WINDOW_MS:WINDOW_MS};
