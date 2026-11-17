'use strict';
/* The SMS handler (spec 7.3, 9.5). One entry point for the gateway webhook and the simulator. Every call
   normalises the sender (a + number needs no country; a local one is read with yovouch.smsCountry), tells the
   outbox it texted first, and passes every reply through outbox.send. This task handles YES <session code>
   (it binds a web vouch session and sends no reply); CODE, VOUCH, L, REMOVE and the rest arrive with Task 12. */
const {normalisePhone}=require('./vouchers.js');

// Trim, collapse spaces, upper-case and drop a trailing . ! or , so "yes k7m2px." reads "YES K7M2PX".
function normaliseText(text){return String(text??'').trim().replace(/\s+/g,' ').toUpperCase().replace(/[.!,]+$/,'').trim();}

function createSmsHandler(system){
  const {yv,outbox,service}=system;
  // The replies for one inbound text; e164 is the sender. YES <session code> binds and gets no reply.
  function route(e164,text){
    const yes=/^YES ([A-Z2-9]{6})$/.exec(text);
    if(yes){service.bindBySms(e164,yes[1]);return [];}
    return [];
  }
  async function handle({from,text,channel='sms'}={}){
    void channel; // the WhatsApp handler (Task 16) reuses this entry point
    const e164=normalisePhone(String(from??''),yv?.smsCountry);
    if(!e164)return {replies:[]};
    outbox.inbound(e164);
    const replies=route(e164,normaliseText(text));
    for(const msg of replies)outbox.send(e164,msg);
    return {replies};
  }
  return {handle};
}

module.exports={createSmsHandler,normaliseText};
