const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spokenCode,counterAt,formatSpoken}=require('../server/card/vouchcode.js');
const {keyedHash}=require('../server/card/vouchers.js');
const {tierLabel,finePrint,tierItem}=require('../server/card/vouch-lines.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {bootVouch,publishPersona,form}=require('./helpers/vouch-boot.cjs');

// Plan Task 17: the simulated call-back at /demo/ivr. One simulator boot with Sipho, run in order.
let B=null;
async function boot(){
 if(B)return B;
 const b=await bootVouch({env:{sim:true}});
 const p=await publishPersona(b.base,'sipho',{trade:'labourer',area:'Umlazi'});
 B={...b,p,id:p.cardId,smsId:p.smsId};
 return B;
}
const step=()=>{B.clock.t+=90000;};
const code=()=>spokenCode(B.store.get(B.id).vouch.secret,counterAt(B.clock.t));
const sOf=html=>(/name="s" value="([0-9a-f]{24})"/.exec(html)||[])[1];
const has=(html,text)=>assert.ok(html.includes(text),'missing: '+text+'\n'+html.replace(/<style>[\s\S]*?<\/style>/,''));
// One call: posts the caller ID, then each key in turn; returns every page.
async function call(from,keys){
 const pages=[await form(B.base,'/demo/ivr',{from})];
 for(const k of keys){
  const s=sOf(pages.at(-1));
  assert.ok(s,'no session field on\n'+pages.at(-1));
  pages.push(await form(B.base,'/demo/ivr',{s,k}));
 }
 return pages;
}
const PUBLISHED='Published. To remove it, call this number and press 9. Nobody will call or message you.';
const WRONG='That code has expired or is wrong. Ask the worker to get a new code and call again.';

test('the first page and its keypad',async()=>{
 await boot();
 const res=await fetch(B.base+'/demo/ivr');
 assert.equal(res.status,200); assertPrivateHeaders(res);
 const html=await res.text(); assertHonestPage(html);
 has(html,'Simulated call-back'); has(html,'Sample number'); has(html,'name="from"');
 const start=await form(B.base,'/demo/ivr',{from:'0821110181'});
 assertHonestPage(start); has(start,'This is YoVouch. Key the 5-digit card number.');
 for(let d=0;d<10;d++)has(start,'name="k" value="'+d+'"');
 assert.ok(!start.includes('<audio'),'plays nothing');
});

test('IVR walkthrough records a call vouch',async()=>{
 await boot(); step();
 const pages=await call('0821110181',[B.smsId,formatSpoken(code()),'1','1','1','1','2','1','#','2','1']);
 const want=['This is YoVouch. Key the 5-digit card number.','Now the 6-digit code.',
  "You are vouching for Sipho, general labourer. A matched code shows you had Sipho's code in about the last four minutes. It does not show the work was done. Press 1 to continue, 2 to stop.",
  'Are you 18 or older? Press 1 for yes, 2 for no.','What did Sipho do? Press 1 for paving, 2 for plastering, 3 for painting, 4 for other.',
  'When? 1 this month, 2 last month, 3 earlier.','How often? 1 once, 2 a few times, 3 regularly, 4 rather not say.','Would you hire Sipho again? 1 yes, 2 rather not say.',
  'After the tone, say in 15 seconds what Sipho did. Press any key to skip.','Show your first name and last 3 digits on the card? 1 yes, 2 no.',
  "On Sipho's card it will say: Paving, November 2026, a few times. Would hire again: yes. Press 1 to publish, 2 to stop.",PUBLISHED];
 want.forEach((text,i)=>has(pages[i],text));
 has(pages[8],'Recorded on a call'); has(pages[8],'type="file"');
 for(const p of pages)assertHonestPage(p);
 const [file]=B.vouch.vouchStore.listForCard(B.id);
 const rec=file.record;
 assert.equal(rec.proof.channel,'ivr'); assert.equal(rec.voucher.phoneConfirmedBy,'caller_id'); assert.equal(rec.voucher.label,'a customer');
 assert.equal(tierLabel(rec,'Sipho'),'Said by a customer · code matched on a call on 16 November 2026 · confirmed by them, not by Yoma');
 assert.ok(finePrint(rec,'Sipho').includes('Number taken from the caller ID (not confirmed by a code, not by Yoma)'));
 assert.equal(file.private.voucherKey,keyedHash(B.vouch.hashKey,'+27821110181'));
 assert.equal(file.held,null);
 assert.ok(B.vouch.events.read().some(e=>e.type==='vouch_confirmed'&&e.channel==='ivr'&&e.vouchId===rec.vouchId));
 B.first=rec.vouchId;
});

test('1 yes to the name keeps the last 3 digits only, and an uploaded clip is held',async()=>{
 await boot(); step();
 const pages=await call('0821110182',[B.smsId,code(),'1','1','2','1','1','1']);
 has(pages.at(-1),'After the tone, say in 15 seconds what Sipho did.');
 const fd=new FormData();
 fd.set('s',sOf(pages.at(-1))); fd.set('k','5');
 fd.set('clip',new Blob([Buffer.alloc(2048,1)],{type:'audio/webm'}),'clip.webm');
 const res=await fetch(B.base+'/demo/ivr',{method:'POST',body:fd});
 const name=await res.text();
 has(name,'Show your first name and last 3 digits on the card? 1 yes, 2 no.');
 const read=await form(B.base,'/demo/ivr',{s:sOf(name),k:'1'});
 has(read,"On Sipho's card it will say: Plastering, November 2026, once. Would hire again: yes. Press 1 to publish, 2 to stop.");
 has(await form(B.base,'/demo/ivr',{s:sOf(read),k:'1'}),PUBLISHED);
 const file=B.vouch.vouchStore.listForCard(B.id).find(f=>f.private.voucherKey===keyedHash(B.vouch.hashKey,'+27821110182'));
 assert.equal(file.record.voucher.label,'a customer ···182'); assert.equal(file.record.voucher.firstName,null); assert.equal(file.record.voucher.phoneLast3,'182');
 assert.ok(file.held?.clip?.url,'the clip is held until the worker taps Show'); assert.equal(file.record.clip,null);
 assert.equal(tierItem(file.record,'Sipho').clip,null);
 const shown=B.vouch.vouchStore.showWords(file.record.vouchId,B.id);
 assert.equal(tierItem(shown.record,'Sipho').clip.text,'Recorded on a call · Play 15-second clip (2 KB)');
});

test('wrong code and unknown card read the same',async()=>{
 await boot(); step();
 const bad=String((Number(code())+1)%1000000).padStart(6,'0');
 const a=await call('0821110183',[B.smsId,bad]),b=await call('0821110184',['99999','123456']);
 has(a.at(-1),WRONG); has(b.at(-1),WRONG);
 const strip=h=>h.replace(/value="08211101\d\d"/,'');
 assert.equal(strip(a.at(-1)),strip(b.at(-1)));
 const stop=await call('0821110185',[B.smsId,code(),'2']);
 has(stop.at(-1),'Cancelled. Nothing was recorded.');
 const minor=await call('0821110186',[B.smsId,code()]);
 has(minor.at(-1),WRONG); // the step was used by the call that stopped
 step();
 const young=await call('0821110186',[B.smsId,code(),'1','2']);
 has(young.at(-1),'YoVouch is for adults. Thank you anyway.');
});

test('4 for other asks for two words',async()=>{
 await boot(); step();
 const pages=await call('0821110187',[B.smsId,code(),'1','1','4']);
 has(pages.at(-1),'Say in two words what Sipho did.'); has(pages.at(-1),'name="words"');
 const when=await form(B.base,'/demo/ivr',{s:sOf(pages.at(-1)),k:'#',words:'yard clearing'});
 has(when,'When? 1 this month, 2 last month, 3 earlier.');
 let html=when;
 for(const k of ['1','4','2','#','2'])html=await form(B.base,'/demo/ivr',{s:sOf(html),k});
 has(html,"On Sipho's card it will say: yard clearing, November 2026, not stated. Would hire again: not stated. Press 1 to publish, 2 to stop.");
 has(await form(B.base,'/demo/ivr',{s:sOf(html),k:'2'}),'Cancelled. Nothing was recorded.');
});

test('press 9 removes the most recent vouch from that caller, and a further 9 moves to the next one',async()=>{
 await boot(); step();
 const bongani=await publishPersona(B.base,'bongani',{trade:'labourer',area:'Umlazi'});
 const bcode=spokenCode(B.store.get(bongani.cardId).vouch.secret,counterAt(B.clock.t));
 has((await call('0821110181',[bongani.smsId,bcode,'1','1','3','1','3','2','5','2','1'])).at(-1),PUBLISHED);
 const newest=B.vouch.vouchStore.listForCard(bongani.cardId)[0].record.vouchId;
 const pages=await call('0821110181',['9']);
 has(pages[1],'Your most recent vouch is for Bongani. Press 9 again to remove it.');
 const gone=await form(B.base,'/demo/ivr',{s:sOf(pages[1]),k:'9'});
 has(gone,'Removed.');
 assert.equal((await fetch(B.base+'/v/'+newest+'.json')).status,410);
 assert.equal((await fetch(B.base+'/v/'+B.first+'.json')).status,200,'only the one read back');
 const next=await form(B.base,'/demo/ivr',{s:sOf(gone),k:'9'});
 has(next,'Your most recent vouch is for Sipho. Press 9 again to remove it.');
 const gone2=await form(B.base,'/demo/ivr',{s:sOf(next),k:'9'});
 assert.equal((await fetch(B.base+'/v/'+B.first+'.json')).status,410);
 const ev=B.vouch.events.read().filter(e=>e.type==='vouch_withdrawn'&&e.by==='ivr').map(e=>e.vouchId);
 assert.deepEqual(ev,[newest,B.first]);
 has(await form(B.base,'/demo/ivr',{s:sOf(gone2),k:'9'}),'Nothing to remove for this number.');
 has((await call('0821110189',['9']))[1],'Nothing to remove for this number.');
});

test('the IVR page exists only with YOVOUCH_SIM=1',async()=>{
 const off=await bootVouch();
 assert.equal((await fetch(off.base+'/demo/ivr')).status,404);
 assert.equal((await fetch(off.base+'/demo/ivr',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'from=0821110181'})).status,404);
 const gw=await bootVouch({env:{sim:true,gatewaySecret:'s3cret'}});
 assert.equal((await fetch(gw.base+'/demo/ivr')).status,404);
});
