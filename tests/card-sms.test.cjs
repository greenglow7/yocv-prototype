const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spokenCode,formatSpoken,counterAt}=require('../server/card/vouchcode.js');
const {keyedHash}=require('../server/card/vouchers.js');
const {tierLabel}=require('../server/card/vouch-lines.js');
const {assertHonestPage}=require('./helpers/honesty.cjs');
const {bootVouch,publishPersona,post,form}=require('./helpers/vouch-boot.cjs');

// One simulator boot with Sipho, run in order. Every outbound is checked against the inbound history.
let B=null;
const ins=[],outs=[];
async function boot(){
 if(B)return B;
 const b=await bootVouch({env:{sim:true}});
 const p=await publishPersona(b.base,'sipho',{trade:'labourer',area:'Umlazi'});
 const ob=b.vouch.outbox,inbound=ob.inbound.bind(ob),send=ob.send.bind(ob);
 ob.inbound=e164=>{ins.push({e164,at:b.clock.t});return inbound(e164);};
 ob.send=(to,text)=>{const r=send(to,text);outs.push({to,text,at:b.clock.t});return r;};
 B={...b,p,id:p.cardId,smsId:p.smsId};
 return B;
}
const sms=async(from,text)=>post(B.base,'/api/sim/sms',{from,text});
const step=()=>{B.clock.t+=90000;};
const current=()=>{const c=spokenCode(B.store.get(B.id).vouch.secret,counterAt(B.clock.t));return {code:c,fmt:formatSpoken(c)};};
const failed=()=>(B.store.get(B.id).vouch.failedAttempts||[]).length;
const isGsm=s=>/^[A-Za-z0-9 @£$¥\n\r_!"#%&'()*+,\-./:;<=>?¡¿ÄÖÑÜ§äöñüà]*$/.test(s);

test('four-message SMS vouch (scene 7.3)',async()=>{
 await boot();
 const {code,fmt}=current(),{smsId}=B;
 const w=await sms('0825550131','CODE');                        // Sipho, local format, no card context (Review Focus 2)
 assert.equal(w.replies[0],`Your code: ${fmt}, valid about 4 min by SMS or call, 3 min on a scan page. Card ${smsId}. Your customer texts VOUCH ${smsId} ${code} to 12345 (1 SMS) or flashes 0800 000 000 for a free call. Reply L to change language.`);
 const before=failed();
 const a=await sms('0821110191',`vouch ${smsId} ${fmt}`);       // Review Focus 1: lower case, spaced code
 assert.ok(a.replies[0].startsWith("Vouch for Sipho, general labourer. A matched code shows you had Sipho's code in about the last four minutes."),a.replies[0]);
 assert.ok(a.replies[0].includes('Q1 did: 1 paving 2 plastering 3 painting 4 other.'));
 assert.ok(a.replies[0].endsWith('Reply L to change language.'));
 assert.ok(a.replies[0].length<=459&&isGsm(a.replies[0]),'menu fits 3 GSM-7 segments');
 assert.equal(failed(),before,'an accepted code is never counted toward the lock');
 assert.deepEqual(await sms('0821110191','1 1 2 1'),{replies:['Show your first name with the last 3 digits of your number? Reply your first name, or NONE.']});
 const c=await sms('0821110191','Nomsa');
 assert.ok(c.replies[0].startsWith('On Sipho\'s card: "Paving, November 2026, a few times. Would hire again: yes." Said by Nomsa ···191, code matched by SMS.'),c.replies[0]);
 assert.ok(c.replies[0].endsWith('Reply YES to publish, NO to cancel.'));
 const d=await sms('0821110191','YES');
 assert.match(d.replies[0],/^Published\. To remove it, text REMOVE [A-Z2-9]{10} [A-Z2-9]{6} any time\. Nobody will message you again\.$/);
 const list=B.vouch.vouchStore.listForCard(B.id);
 assert.equal(list.length,1);
 const rec=list[0].record;
 assert.equal(tierLabel(rec,'Sipho'),'Said by a customer · code matched by SMS on 16 November 2026 · confirmed by them, not by Yoma');
 assert.equal(rec.voucher.phoneConfirmedBy,'sms_origin'); assert.equal(rec.voucher.label,'Nomsa ···191');
 assert.deepEqual({method:rec.proof.method,channel:rec.proof.channel,onWorkerPhone:rec.proof.onWorkerPhone},{method:'code',channel:'sms',onWorkerPhone:false});
 assert.equal(rec.proof.step,counterAt(B.clock.t));
 assert.equal(list[0].private.voucherKey,keyedHash(B.vouch.hashKey,'+27821110191'));
 assert.deepEqual(await sms('0821110191','YES'),{replies:[]},'the conversation ended');
 B.removeSecret=/REMOVE ([A-Z2-9]{10}) ([A-Z2-9]{6})/.exec(d.replies[0]).slice(1);
});

test('a code typed with a dash or as V is accepted; a used step reads as wrong',async()=>{
 await boot(); step();
 const {code}=current(),dashed=code.slice(0,3)+'-'+code.slice(3),before=failed();
 const a=await sms('0821110195',`V ${B.smsId} ${dashed}.`);
 assert.ok(a.replies[0].startsWith('Vouch for Sipho'),a.replies[0]);
 assert.equal(failed(),before);
 const again=await sms('0821110196',`VOUCH ${B.smsId} ${code}`);
 assert.equal(again.replies[0],'This code is wrong or has expired. Ask the worker to text CODE for a new one.');
 step();
 const card=await sms('0821110197',`vouch ${B.p.code.toLowerCase()} ${current().fmt}`);
 assert.ok(card.replies[0].startsWith('Vouch for Sipho'),'a lower-case card code reaches the same card');
 assert.equal(failed(),before);
});

test('the wrong-code reply never tells a known card from an unknown one',async()=>{
 await boot(); step();
 const x=await sms('0821110192','VOUCH 99999 123456'),y=await sms('0821110193',`VOUCH ${B.smsId} 000000`);
 assert.equal(x.replies[0],'This code is wrong or has expired. Ask the worker to text CODE for a new one.');
 assert.equal(y.replies[0],x.replies[0]);
 assert.equal(B.vouch.voucherFiles.read(keyedHash(B.vouch.hashKey,'+27821110192')).wrongCodes.length,1);
 assert.equal(B.vouch.voucherFiles.read(keyedHash(B.vouch.hashKey,'+27821110193')).wrongCodes.length,1);
});

test('Q1 other asks for two words; NO cancels',async()=>{
 await boot(); step();
 const {code}=current();
 await sms('0821110194',`VOUCH ${B.smsId} ${code}`);
 assert.deepEqual(await sms('0821110194','hello'),{replies:['I did not understand. Reply with four numbers, for example 1 1 2 1.']});
 assert.deepEqual(await sms('0821110194','5 1 1 1'),{replies:['I did not understand. Reply with four numbers, for example 1 1 2 1.']});
 assert.deepEqual(await sms('0821110194','4,1,1,1'),{replies:['Say in two words what Sipho did.']});
 assert.deepEqual(await sms('0821110194','yard clearing'),{replies:['Show your first name with the last 3 digits of your number? Reply your first name, or NONE.']});
 const r=await sms('0821110194','none');
 assert.ok(r.replies[0].startsWith('On Sipho\'s card: "yard clearing, November 2026, once. Would hire again: yes." Said by a customer, code matched by SMS.'),r.replies[0]);
 assert.deepEqual(await sms('0821110194','No.'),{replies:['Cancelled. Nothing was recorded. Nobody will message you again.']});
 assert.equal(B.vouch.vouchStore.listForCard(B.id).length,1);
 assert.deepEqual(await sms('0821110194','YES'),{replies:[]});
});

test('a second vouch this month offers a visit',async()=>{
 await boot(); step();
 const {code}=current();
 const r=await sms('0821110191',`VOUCH ${B.smsId} ${code}`);
 assert.equal(r.replies[0],'You already vouched for Sipho this month. Add a visit instead?');
 assert.deepEqual(await sms('0821110191','YES'),{replies:['Added a visit to your vouch for Sipho. Nobody will message you again.']});
 const [file]=B.vouch.vouchStore.listForCard(B.id);
 assert.equal(file.record.visits,2);
 const other=await sms('0821110198',`VOUCH ${B.smsId} ${code}`);
 assert.ok(other.replies[0].startsWith('Vouch for Sipho'),'the step was not consumed by the visit offer');
});

test('REMOVE needs the secret and the same number',async()=>{
 await boot();
 const [vouchId,secret]=B.removeSecret;
 assert.deepEqual(await sms('0821110191',`REMOVE ${vouchId} WRONGX`),{replies:['Nothing to remove for this number.']});
 assert.deepEqual(await sms('0821110192',`REMOVE ${vouchId} ${secret}`),{replies:['Nothing to remove for this number.']});
 assert.deepEqual(await sms('+27821110191',`remove ${vouchId.toLowerCase()} ${secret.toLowerCase()}`),{replies:['Removed. Nobody will message you again.']});
 assert.ok(B.vouch.vouchStore.get(vouchId).private.withdrawnAt);
 assert.ok(B.vouch.events.read().some(e=>e.type==='vouch_withdrawn'&&e.vouchId===vouchId&&e.by==='sms'));
 assert.deepEqual(await sms('0821110191',`REMOVE ${vouchId} ${secret}`),{replies:['Nothing to remove for this number.']});
});

test('L changes the language and repeats the prompt',async()=>{
 await boot(); step();
 const {code}=current();
 const menu=(await sms('0821110190',`VOUCH ${B.smsId} ${code}`)).replies[0];
 assert.deepEqual(await sms('0821110190','L'),{replies:['1 English 2 isiZulu 3 isiXhosa 4 Kiswahili 5 Pidgin']});
 assert.deepEqual(await sms('0821110190','2'),{replies:[menu]},'the last prompt again (English fallback)');
 assert.deepEqual(await sms('0821110190','1 1 2 1'),{replies:['Show your first name with the last 3 digits of your number? Reply your first name, or NONE.']});
 const owner=(await sms('+27825550131','CODE')).replies[0];
 await sms('+27825550131','l');
 assert.deepEqual(await sms('+27825550131','2'),{replies:[owner]});
 assert.equal(B.store.get(B.id).vouch.lang,'zu','the card owner sets vouch.lang');
 await sms('+27825550131','L'); await sms('+27825550131','1');
 assert.equal(B.store.get(B.id).vouch.lang,'en');
});

test('CODE from a number without a card',async()=>{
 await boot();
 assert.deepEqual(await sms('0821110199','CODE'),{replies:['No card is linked to this number. Make your card at https://yocard.example/card.html on any phone, then text CODE again.']});
 assert.deepEqual(await sms('0821110199','hello'),{replies:[]},'any other text with no state gets no reply');
});

test('Review Focus 2: the worker texting VOUCH for their own card from 27825550131 is refused as self',async()=>{
 await boot(); step();
 const {code}=current(),n=B.vouch.vouchStore.listForCard(B.id).length;
 const r=await sms('27825550131',`VOUCH ${B.smsId} ${code}`);
 assert.equal(r.replies[0],"This is the number on Sipho's own card.");
 assert.equal(B.vouch.vouchStore.listForCard(B.id).length,n);
 const ok=await sms('0821110189',`VOUCH ${B.smsId} ${code}`);
 assert.ok(ok.replies[0].startsWith('Vouch for Sipho'),'the self refusal did not consume the step');
});

test('a blocked sender gets no reply',async()=>{
 await boot();
 for(let i=0;i<10;i++){const r=await sms('0821110188','VOUCH 99999 123456');assert.equal(r.replies.length,1);}
 assert.deepEqual(await sms('0821110188','VOUCH 99999 123456'),{replies:[]});
 assert.deepEqual(await sms('0821110188',`VOUCH ${B.smsId} ${current().code}`),{replies:[]});
});

test('the day cap answers with its message and consumes nothing',async()=>{
 await boot(); step();
 // 0821110191 reached confirm twice today (the vouch and the visit); its vouch was removed, so a third one is new.
 await sms('0821110191',`VOUCH ${B.smsId} ${current().code}`);
 await sms('0821110191','2 1 1 1'); await sms('0821110191','NONE');
 assert.match((await sms('0821110191','YES')).replies[0],/^Published\./);
 step();
 const {code}=current();
 assert.deepEqual(await sms('0821110191',`VOUCH ${B.smsId} ${code}`),{replies:['This number has vouched three times today. Try again tomorrow.']});
 assert.ok((await sms('0821110186',`VOUCH ${B.smsId} ${code}`)).replies[0].startsWith('Vouch for Sipho'));
});

test('the simulated phone shows the thread for the typed number',async()=>{
 await boot();
 const html=await form(B.base,'/api/sim/sms',{from:'0821110187',text:'CODE'});
 assertHonestPage(html);
 assert.ok(html.includes('CODE')&&html.includes('No card is linked to this number.'));
 assert.ok(html.indexOf('Simulated SMS. No message was sent.',html.indexOf('</h1>'))>0,'each reply is labelled');
 const next=await form(B.base,'/api/sim/sms',{from:'0821110187',text:'hello'});
 assert.ok(next.indexOf('No card is linked')<next.indexOf('hello'),'newest last');
});

test('no outbound without inbound across the whole flow',async()=>{
 await boot();
 assert.ok(outs.length>10);
 for(const m of outs)assert.ok(ins.some(i=>i.e164===m.to&&i.at<=m.at&&m.at-i.at<=15*60000),m.text);
});
