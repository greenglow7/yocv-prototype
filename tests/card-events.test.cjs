const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {bootVouch,publishPersona,NOW}=require('./helpers/vouch-boot.cjs');
let events={}; try {events=require('../server/card/events.js')}catch{}
const {createEventLog,cardFields}=events;

test('events carry no numbers and mark demo cards',async()=>{
 const {base,store}=await bootVouch();
 const {cardId:id}=await publishPersona(base,'thandi',{trade:'hair'});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yovouch-events-'));
 const log=createEventLog(dir,{now:()=>NOW});
 log.log('code_refused',{reason:'code_wrong',channel:'web',...cardFields(store.get(id))});
 assert.throws(()=>log.log('vouch_opened',{from:'+27825550131'}));
 assert.throws(()=>log.log('vouch_opened',{note:'27825550131'}));
 assert.throws(()=>log.log('vouch_opened',{phone:'x'}));
 assert.throws(()=>log.log('vouch_opened',{name:'Nomsa'}));
 assert.equal(log.read().length,1);
 assert.equal(log.read()[0].type,'code_refused'); assert.equal(log.read()[0].demo,true);
 assert.deepEqual(log.read()[0],{at:'2026-11-16T14:40:12.000Z',type:'code_refused',reason:'code_wrong',channel:'web',cardId:id,demo:true});
 assert.ok(fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').endsWith('\n'));
});
test('publishing the same confirmed number twice logs number_index_replaced',async()=>{
 const {base,store,vouch}=await bootVouch();
 const a=await publishPersona(base,'thandi',{trade:'hair'});
 const b=await publishPersona(base,'thandi',{trade:'hair'});
 assert.equal(store.indexGet('numbers',store.get(b.cardId).ownerPhoneHash),b.cardId);
 const ev=vouch.events.read().filter(e=>e.type==='number_index_replaced');
 assert.equal(ev.length,1); assert.equal(ev[0].cardId,b.cardId); assert.equal(ev[0].replacedCardId,a.cardId); assert.equal(ev[0].demo,true);
});
