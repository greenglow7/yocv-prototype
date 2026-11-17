const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spokenCode,counterAt}=require('../server/card/vouchcode.js');
const {bootVouch,publishPersona,post}=require('./helpers/vouch-boot.cjs');

// Plan Task 17: the one-question fallback, STOP and REPLY. One simulator boot with Sipho and Bongani, run in order.
let B=null;
async function boot(){
 if(B)return B;
 const b=await bootVouch({env:{sim:true}});
 const sipho=await publishPersona(b.base,'sipho',{trade:'labourer',area:'Umlazi'});
 const bongani=await publishPersona(b.base,'bongani',{trade:'labourer',area:'Umlazi'});
 B={...b,sipho,bongani};
 return B;
}
const sms=async(from,text)=>post(B.base,'/api/sim/sms',{from,text});
const step=()=>{B.clock.t+=90000;};
const codeOf=cardId=>spokenCode(B.store.get(cardId).vouch.secret,counterAt(B.clock.t));
const Q1='Q1 What did Sipho do? Reply 1 paving 2 plastering 3 painting 4 other';
const Q2='Q2 When? Reply 1 this month 2 last month 3 earlier';
const Q3='Q3 How often? Reply 1 once 2 a few times 3 regularly 4 rather not say';
const NAME='Show your first name with the last 3 digits of your number? Reply your first name, or NONE.';
// The four-message vouch from one number, ending with the published reply.
async function vouchBySms(from,card,answers='1 1 2 1'){
 step();
 const menu=await sms(from,`VOUCH ${card.smsId} ${codeOf(card.cardId)}`);
 assert.ok(menu.replies[0].startsWith('Vouch for'),menu.replies[0]);
 await sms(from,answers); await sms(from,'NONE');
 const d=await sms(from,'YES');
 assert.match(d.replies[0],/^Published\./);
 return /REMOVE ([A-Z2-9]{10})/.exec(d.replies[0])[1];
}

test('one-question fallback and earlier',async()=>{
 await boot(); step();
 await sms('0821110171',`VOUCH ${B.sipho.smsId} ${codeOf(B.sipho.cardId)}`);
 assert.deepEqual(await sms('0821110171','I did not understand.'),{replies:[Q1]});
 assert.deepEqual(await sms('0821110171','7'),{replies:[Q1]},'a digit out of range asks again');
 assert.deepEqual(await sms('0821110171','1'),{replies:[Q2]});
 assert.deepEqual(await sms('0821110171','3'),{replies:[Q3]});
 assert.deepEqual(await sms('0821110171','1'),{replies:['Q4 Would you hire Sipho again? Reply 1 yes 2 rather not say']});
 assert.deepEqual(await sms('0821110171','1'),{replies:[NAME]});
 const r=await sms('0821110171','none');
 assert.ok(r.replies[0].startsWith('On Sipho\'s card: "Paving, earlier, once. Would hire again: yes." Said by a customer, code matched by SMS.'),r.replies[0]);
 const d=await sms('0821110171','YES');
 assert.match(d.replies[0],/^Published\. To remove it, text REMOVE [A-Z2-9]{10} [A-Z2-9]{6} any time\./);
 const [file]=B.vouch.vouchStore.listForCard(B.sipho.cardId);
 assert.equal(file.record.fields.when,'earlier'); assert.equal(file.record.line,'Paving, earlier, once. Would hire again: yes.');
});

test('a second answer that is not four numbers starts the fallback; four out-of-range numbers do not count',async()=>{
 await boot(); step();
 await sms('0821110172',`VOUCH ${B.sipho.smsId} ${codeOf(B.sipho.cardId)}`);
 const again='I did not understand. Reply with four numbers, for example 1 1 2 1.';
 assert.deepEqual(await sms('0821110172','hello'),{replies:[again]});
 assert.deepEqual(await sms('0821110172','5 1 1 1'),{replies:[again]});
 assert.deepEqual(await sms('0821110172','what?'),{replies:[Q1]});
 assert.deepEqual(await sms('0821110172','4'),{replies:[Q2]});
 await sms('0821110172','2'); await sms('0821110172','4');
 assert.deepEqual(await sms('0821110172','2'),{replies:['Say in two words what Sipho did.']});
 assert.deepEqual(await sms('0821110172','yard clearing'),{replies:[NAME]});
 const r=await sms('0821110172','NONE');
 assert.ok(r.replies[0].includes('"yard clearing, October 2026, not stated. Would hire again: not stated."'),r.replies[0]);
 assert.deepEqual(await sms('0821110172','NO'),{replies:['Cancelled. Nothing was recorded. Nobody will message you again.']});
});

test('STOP confirms first',async()=>{
 await boot();
 const a=await vouchBySms('0821110173',B.sipho),b=await vouchBySms('0821110173',B.bongani);
 assert.deepEqual(await sms('0821110173','stop'),{replies:['Remove all 2 of your vouches? Reply YES.']});
 assert.deepEqual(await sms('0821110173','YES'),{replies:['Removed. Nobody will message you again.']});
 for(const id of [a,b])assert.equal((await fetch(B.base+'/v/'+id+'.json')).status,410);
 const ev=B.vouch.events.read().filter(e=>e.type==='vouch_withdrawn'&&e.by==='stop');
 assert.deepEqual(ev.map(e=>e.vouchId).sort(),[a,b].sort());
 assert.deepEqual(await sms('0821110173','STOP'),{replies:['Nothing to remove for this number.']});
 assert.deepEqual(await sms('0821110174','STOP'),{replies:['Nothing to remove for this number.']});
});

test('STOP then anything but YES removes nothing',async()=>{
 await boot();
 const id=await vouchBySms('0821110175',B.sipho);
 assert.deepEqual(await sms('0821110175','STOP'),{replies:['Remove all 1 of your vouches? Reply YES.']});
 assert.deepEqual(await sms('0821110175','NO'),{replies:[]});
 assert.equal((await fetch(B.base+'/v/'+id+'.json')).status,200);
});

test('REPLY gives the one-SMS reply to the owner only',async()=>{
 await boot();
 const r=await sms('0825550131','REPLY');
 assert.equal(r.replies.length,1);
 assert.ok(r.replies[0].startsWith('Sipho, general labourer, Umlazi. '),r.replies[0]);
 assert.ok(r.replies[0].endsWith('code '+B.store.get(B.sipho.cardId).record.code+'. Lines not checked by Yoma'),r.replies[0]);
 assert.ok(Buffer.byteLength(r.replies[0])<=160);
 assert.deepEqual(await sms('0821110176','REPLY'),{replies:['No card is linked to this number. Make your card at https://yocard.example/card.html on any phone, then text CODE again.']});
});
