const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spokenCode,qrTag,counterAt}=require('../server/card/vouchcode.js');
const {keyedHash}=require('../server/card/vouchers.js');
const {tierLabel,finePrint}=require('../server/card/vouch-lines.js');
const {STRINGS}=require('../server/card/render.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {NOW,bootVouch,publishPersona,post,form,page,get}=require('./helpers/vouch-boot.cjs');
let flags={}; try {flags=require('../server/card/flags.js')}catch{}

const DAY=86400000;
const NOT_ELIGIBLE='Your card needs one completed Yoma opportunity or one customer vouch at least a week old before it can vouch for others.';
const LINE_NOTE='Your line will show your first name and that you have a YoCard, not your number.';
const RECIPROCAL='This will be marked "Vouched for each other" on both cards.';
const SIPHO_PHONE='+27825550131',BONGANI_LOCAL='0715550164';

async function boot(opts={env:{sim:true}}){
 const b=await bootVouch(opts);
 const bo=await publishPersona(b.base,'bongani',{trade:'labourer',area:'Umlazi'});
 const si=await publishPersona(b.base,'sipho',{trade:'labourer',area:'Umlazi'});
 return {...b,bo,si};
}
const codeOf=(b,cardId)=>spokenCode(b.store.get(cardId).vouch.secret,counterAt(b.clock.t));
const tokenIn=html=>(/action="\/api\/vouch\/([0-9a-f]{24})\/chips"/.exec(html)||[])[1];
async function rawForm(base,route,fields,{cookie}={}){
 const headers={'content-type':'application/x-www-form-urlencoded'};
 if(cookie)headers.cookie=cookie;
 return fetch(base+route,{method:'POST',headers,body:new URLSearchParams(fields).toString(),redirect:'manual'});
}
// The typed worker path: POST /s with the card number, the six digits and the voucher's hidden vc and vt.
async function typedWorker(b,from,to){
 return rawForm(b.base,'/s',{ref:to.smsId,code:codeOf(b,to.cardId),adult:'yes',vc:from.cardId,vt:from.cardToken});
}
// Through chips, disclosure and the read-back; returns {token, readback}.
async function toReadback(b,from,to,{words='he arrived before me both days',showCard='yes'}={}){
 const res=await typedWorker(b,from,to);
 const html=await res.text();
 const s=tokenIn(html);
 assert.ok(s,'no worker session: '+html.slice(0,400));
 await form(b.base,`/api/vouch/${s}/chips`,{work:'Paving',when:'this month',howOften:'once',hireAgain:'yes',...(words?{words}:{})});
 await form(b.base,`/s/t/${s}`,{step:'disclose',showCard});
 return {token:s,readback:await page(b.base,`/s/t/${s}`),chips:html};
}
// A stored vouch with no flow behind it, for the eligibility and cap set-ups.
function stored(b,{kind='customer',cardId,voucherCardId=null,confirmedAt,flags:fl=[],priv={}}){
 const record={cardId,kind,proof:{method:'code',step:1,provedAt:confirmedAt,channel:'web',onWorkerPhone:false},
  voucher:{label:kind==='worker'?'X\'s card':'a customer',firstName:kind==='worker'?'X':null,phoneLast3:null,phoneConfirmedBy:kind==='worker'?'card':'demo',cardId:voucherCardId,showCard:false,orgName:null,orgId:null,adultSelfDeclared:true},
  fields:{work:'Paving',words:null,wordsSource:null,when:'2026-11',howOften:'once',hireAgain:'yes'},line:'Paving, November 2026, once. Would hire again: yes.',
  lang:'en',wordsShownAt:null,clip:null,restsOn:null,statement:null,acceptedAt:null,jobPostId:null,flags:fl,visits:1,confirmedAt,expiresAt:null,generation:{mode:'sample',transcription:'none'}};
 return b.vouch.vouchStore.create({record,private:{voucherKey:kind==='customer'?'a'.repeat(64):null,...priv}}).vouchId;
}

test('Bongani (one completion) vouches for Sipho by typed card number',async()=>{
 const b=await boot(),{base,bo,si}=b;
 const my=await page(base,`/my/${bo.cardId}/${bo.cardToken}`);
 assert.ok(my.includes('Vouch for another worker')&&my.includes(`href="/my/${bo.cardId}/${bo.cardToken}/vouch"`));
 const vp=await fetch(base+`/my/${bo.cardId}/${bo.cardToken}/vouch`);
 assertPrivateHeaders(vp);
 const vh=await vp.text();
 assertHonestPage(vh); assert.ok(Buffer.byteLength(vh)<=4096);
 assert.ok(vh.includes('Scan their code, or type their card code or card number and the six digits.'));
 assert.ok(vh.includes(`name="vc" value="${bo.cardId}"`)&&vh.includes(`name="vt" value="${bo.cardToken}"`)&&vh.includes('action="/s"'));
 const {token,readback,chips}=await toReadback(b,bo,si);
 assert.ok(chips.includes('Would you work with Sipho again?')&&!chips.includes('Would you hire Sipho again?'));
 assertHonestPage(readback); assert.ok(Buffer.byteLength(readback)<=4096);
 assert.ok(readback.includes(LINE_NOTE));
 assert.ok(readback.includes("Vouched by another worker · Bongani's card · code matched on 16 November 2026 · confirmed by them, not by Yoma"));
 assert.ok(readback.includes('Paving, November 2026, once. Would work together again: yes.'));
 assert.ok(!readback.includes(RECIPROCAL));
 const done=await form(base,`/api/vouch/${token}/confirm`,{consent:'yes'});
 assertHonestPage(done);
 assert.ok(done.includes('Your vouch for Sipho is on their card. Remove it any time from this page.'),done);
 const [file]=b.vouch.vouchStore.listForCard(si.cardId),rec=file.record;
 assert.equal(rec.kind,'worker');
 assert.deepEqual({cardId:rec.voucher.cardId,firstName:rec.voucher.firstName,showCard:rec.voucher.showCard,label:rec.voucher.label,by:rec.voucher.phoneConfirmedBy},
  {cardId:bo.cardId,firstName:'Bongani',showCard:true,label:"Bongani's card",by:'card'});
 assert.equal(rec.eligibility.rule,'completion'); assert.ok(rec.eligibility.at);
 assert.equal(file.private.voucherKey,null);
 assert.equal(tierLabel(rec,'Sipho'),"Vouched by another worker · Bongani's card · code matched on 16 November 2026 · confirmed by them, not by Yoma");
 assert.deepEqual(finePrint(rec,'Sipho'),[STRINGS.fineWorker]);
 assert.ok(!b.vouch.outbox.all().some(m=>m.text.includes('vouched for you')),'Sipho had not texted, so nothing was sent');
 const card=await page(base,`/c/${si.cardId}`);
 assert.ok(card.includes("Bongani's card · code matched on 16 November 2026"));
 const mine=await page(base,`/my/${bo.cardId}/${bo.cardToken}`);
 assert.ok(mine.includes('Your vouch for Sipho is on their card. Remove it any time from this page.')&&mine.includes('Withdraw now'));
 assert.ok(mine.includes(`value="${rec.vouchId}"`)&&mine.includes('withdraw-given'));
 const w=await rawForm(base,`/my/${bo.cardId}/${bo.cardToken}/withdraw-given`,{vouchId:rec.vouchId});
 assert.equal(w.status,303);
 assert.equal((await fetch(base+`/v/${rec.vouchId}.json`)).status,410);
 assert.ok(b.vouch.events.read().some(e=>e.type==='vouch_withdrawn'&&e.vouchId===rec.vouchId&&e.by==='voucher_card'));
 assert.ok(!(await page(base,`/my/${bo.cardId}/${bo.cardToken}`)).includes('Your vouch for Sipho is on their card.'));
});

test('a camera scan from the vouching worker\'s browser opens the worker path',async()=>{
 const b=await boot(),{base,bo,si}=b;
 const res=await fetch(base+`/my/${bo.cardId}/${bo.cardToken}/vouch`),cookie=res.headers.get('set-cookie');
 assert.match(cookie,/^yv_worker=[A-Z2-9]{10}\.[0-9a-f]{16}; Path=\/s; HttpOnly; SameSite=Lax; Max-Age=900/);
 assert.ok(cookie.includes('; Secure'),'https public URL');
 const secret=b.store.get(si.cardId).vouch.secret,t=counterAt(b.clock.t),k=qrTag(secret,t);
 const n=(/name="f" value="([0-9a-f]{16})"/.exec(await page(base,`/s/${si.cardId}?t=${t}&k=${k}`))||[])[1];
 assert.ok((await form(base,'/s/'+si.cardId,{t,k,adult:'yes',f:n},{cookie})).includes('Would you work with Sipho again?'));
 // Without the cookie, or on the worker's own card (the customer filling in on the worker's phone), it stays the customer path.
 b.clock.t+=90000;
 const t2=counterAt(b.clock.t),k2=qrTag(secret,t2);
 assert.ok((await form(base,'/s/'+si.cardId,{t:t2,k:k2,adult:'yes'})).includes('Would you hire Sipho again?'));
 const own=(await fetch(base+`/my/${si.cardId}/${si.cardToken}/vouch`)).headers.get('set-cookie');
 b.clock.t+=90000;
 const t3=counterAt(b.clock.t),k3=qrTag(secret,t3);
 assert.ok((await form(base,'/s/'+si.cardId,{t:t3,k:k3,adult:'yes',w:'1'},{cookie:own})).includes('Would you hire Sipho again?'));
});

test('a new card cannot vouch yet; the owner secret is never accepted',async()=>{
 const b=await boot(),{base,bo,si}=b;
 const r=await typedWorker(b,si,bo);
 assert.equal(r.status,403);
 const html=await r.text();
 assert.ok(html.includes(NOT_ELIGIBLE)); assertHonestPage(html);
 assert.ok(html.includes(`name="vc" value="${si.cardId}"`),'the worker can try again from the same form');
 const owner=await rawForm(base,'/s',{ref:bo.smsId,code:codeOf(b,bo.cardId),adult:'yes',vc:bo.cardId,vt:bo.ownerSecret});
 assert.equal(owner.status,404);
 assert.equal((await fetch(base+`/my/${bo.cardId}/${bo.ownerSecret}/vouch`)).status,404);
 const j=await (await fetch(base+'/api/vouch/open',{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({cardId:si.cardId,voucher:{kind:'worker',cardId:bo.cardId,cardToken:bo.ownerSecret},proof:{method:'code',code:codeOf(b,si.cardId)}})})).json();
 assert.equal(j.error.code,'not_found');
 const ok=await post(base,'/api/vouch/open',{cardId:bo.cardId,voucher:{kind:'worker',cardId:si.cardId,cardToken:si.cardToken},proof:{method:'code',code:codeOf(b,bo.cardId)}});
 assert.deepEqual([ok.error.code,ok.error.message],['not_eligible',NOT_ELIGIBLE]);
 const self=await post(base,'/api/vouch/open',{cardId:bo.cardId,voucher:{kind:'worker',cardId:bo.cardId,cardToken:bo.cardToken},proof:{method:'code',code:codeOf(b,bo.cardId)}});
 assert.equal(self.error.code,'self_vouch');
 const opened=await post(base,'/api/vouch/open',{cardId:si.cardId,voucher:{kind:'worker',cardId:bo.cardId,cardToken:bo.cardToken},proof:{method:'code',code:codeOf(b,si.cardId)}});
 assert.match(opened.vouchToken,/^[0-9a-f]{24}$/); assert.equal(opened.bind,null);
});

test('reciprocal notice on the read-back',async()=>{
 const b=await boot(),{bo,si}=b;
 stored(b,{cardId:si.cardId,confirmedAt:new Date(NOW-8*DAY).toISOString()});            // Sipho: a customer vouch over a week old
 stored(b,{kind:'worker',cardId:si.cardId,voucherCardId:bo.cardId,confirmedAt:new Date(NOW-2*DAY).toISOString()});
 const {readback}=await toReadback(b,si,bo);
 assert.ok(readback.includes(RECIPROCAL),readback);
 assert.ok(readback.includes("Sipho's card"));
});

test('worker cap',async()=>{
 const b=await boot(),{base,bo,si}=b;
 for(let i=0;i<5;i++)stored(b,{kind:'worker',cardId:'ABCDEFGHJ'+'KLMNP'[i],voucherCardId:bo.cardId,confirmedAt:new Date(NOW-(10+i)*DAY).toISOString()});
 const r=await typedWorker(b,bo,si);
 assert.equal(r.status,429);
 assert.ok((await r.text()).includes('You have vouched for 5 workers in the last 90 days.'));
 const j=await post(base,'/api/vouch/open',{cardId:si.cardId,voucher:{kind:'worker',cardId:bo.cardId,cardToken:bo.cardToken},proof:{method:'code',code:codeOf(b,si.cardId)}});
 assert.deepEqual([j.error.code,j.error.message],['voucher_cap_cards','You have vouched for 5 workers in the last 90 days.']);
});

test('Sipho is told only if he texted CODE minutes earlier',async()=>{
 const b=await boot(),{base,bo,si}=b;
 await post(base,'/api/sim/sms',{from:'0825550131',text:'CODE'});
 b.clock.t+=5*60000;
 const {token}=await toReadback(b,bo,si);
 await form(base,`/api/vouch/${token}/confirm`,{consent:'yes'});
 const sent=b.vouch.outbox.all().filter(m=>m.to===SIPHO_PHONE).map(m=>m.text);
 assert.ok(sent.includes('Bongani vouched for you. It is on your card.'),JSON.stringify(sent));
});

test('worker SMS variant from the Yoma-confirmed number',async()=>{
 const b=await boot(),{base,bo,si}=b;
 const sms=text=>post(base,'/api/sim/sms',{from:BONGANI_LOCAL,text});
 const a=await sms(`VOUCH ${si.smsId} ${codeOf(b,si.cardId)}`);
 assert.ok(a.replies[0].includes('Q4 work together again: 1 yes 2 rather not say'),a.replies[0]);
 assert.ok(a.replies[0].includes('Q1 did: 1 paving 2 plastering 3 painting 4 other.'));
 const c=await sms('1 1 1 1');
 assert.ok(c.replies[0].startsWith('On Sipho\'s card: "Paving, November 2026, once. Would work together again: yes." Said by Bongani\'s card, code matched by SMS.'),c.replies[0]);
 const d=await sms('YES');
 assert.match(d.replies[0],/^Published\. To remove it, text REMOVE [A-Z2-9]{10} [A-Z2-9]{6} any time\./);
 const [file]=b.vouch.vouchStore.listForCard(si.cardId),rec=file.record;
 assert.equal(rec.kind,'worker'); assert.equal(rec.voucher.cardId,bo.cardId); assert.equal(rec.voucher.phoneConfirmedBy,'sms_origin');
 assert.equal(rec.proof.channel,'sms'); assert.equal(rec.eligibility.rule,'completion');
 assert.equal(file.private.voucherKey,keyedHash(b.vouch.hashKey,'+27715550164'));
 assert.equal(tierLabel(rec,'Sipho'),"Vouched by another worker · Bongani's card · code matched by SMS on 16 November 2026 · confirmed by them, not by Yoma");
 const fine=finePrint(rec,'Sipho');
 assert.ok(fine.includes('Number taken from the SMS sender (not confirmed by a code, not by Yoma)')&&fine.includes(STRINGS.fineWorker));
 // REMOVE works for a worker line too.
 const [,id,secret]=/REMOVE ([A-Z2-9]{10}) ([A-Z2-9]{6})/.exec(d.replies[0]);
 assert.deepEqual(await sms(`REMOVE ${id} ${secret}`),{replies:['Removed. Nobody will message you again.']});
 // Sipho's card is new: his VOUCH for Bongani is refused before any question.
 b.clock.t+=90000;
 const s=await post(base,'/api/sim/sms',{from:'0825550131',text:`VOUCH ${bo.smsId} ${codeOf(b,bo.cardId)}`});
 assert.deepEqual(s.replies,[NOT_ELIGIBLE]);
});

test('Review Focus 4: eligibility ignores a quiet-withdrawn customer vouch',async()=>{
 const b=await boot(),{si,bo}=b,{eligibility}=flags;
 assert.equal(typeof eligibility,'function');
 const vs=b.vouch.vouchStore,entry=()=>b.store.get(si.cardId);
 assert.deepEqual(eligibility(entry(),{vouchStore:vs,nowMs:NOW}),{ok:false});
 const bong=eligibility(b.store.get(bo.cardId),{vouchStore:vs,nowMs:NOW});
 assert.equal(bong.ok,true); assert.equal(bong.rule,'completion');
 const young=stored(b,{cardId:si.cardId,confirmedAt:new Date(NOW-3*DAY).toISOString()});
 assert.equal(eligibility(entry(),{vouchStore:vs,nowMs:NOW}).ok,false,'not a week old yet');
 const flagged=stored(b,{cardId:si.cardId,confirmedAt:new Date(NOW-9*DAY).toISOString(),flags:['held']});
 assert.equal(eligibility(entry(),{vouchStore:vs,nowMs:NOW}).ok,false,'a flagged line does not count');
 void young; void flagged;
 const old=stored(b,{cardId:si.cardId,confirmedAt:new Date(NOW-25*30*DAY).toISOString()});
 assert.equal(eligibility(entry(),{vouchStore:vs,nowMs:NOW}).ok,false,'older than 24 months does not count');
 void old;
 const quiet=stored(b,{cardId:si.cardId,confirmedAt:new Date(NOW-10*DAY).toISOString()});
 const e=eligibility(entry(),{vouchStore:vs,nowMs:NOW});
 assert.deepEqual([e.ok,e.rule],[true,'customer_vouch']);
 vs.update(quiet,f=>{f.private.withdrawAfter=new Date(NOW-60000).toISOString();});
 assert.deepEqual(eligibility(entry(),{vouchStore:vs,nowMs:NOW}),{ok:false});
 vs.update(quiet,f=>{f.private.withdrawAfter=null;f.private.hiddenAt=new Date(NOW).toISOString();});
 assert.deepEqual(eligibility(entry(),{vouchStore:vs,nowMs:NOW}),{ok:false},'a hidden line does not count');
 vs.update(quiet,f=>{f.private.hiddenAt=null;});
 assert.equal(eligibility({...entry(),record:{...entry().record,user:{...entry().record.user,phoneNumberConfirmed:false}}},{vouchStore:vs,nowMs:NOW}).ok,false);
 assert.equal(eligibility({...entry(),withdrawnAt:new Date(NOW).toISOString()},{vouchStore:vs,nowMs:NOW}).ok,false);
});

test('Check now marks every voucher card it cannot read as simulated, in token mode too',async()=>{
 const b=await boot(),{base,bo,si}=b;
 const {token}=await toReadback(b,bo,si);
 await form(base,`/api/vouch/${token}/confirm`,{consent:'yes'});
 const id=b.vouch.vouchStore.listForCard(si.cardId)[0].record.vouchId;
 const src=b.vouch.accountSource,read=src.read.bind(src);
 const thandi=await read({persona:'thandi'}),bongani=await read({persona:'bongani'});
 src.kind='token';
 src.read=async()=>thandi;
 let j=await post(base,`/api/card/${si.cardId}/check`,{vouchIds:[id]});
 let sig=j.signals.find(s=>s.key==='voucherCard:'+id);
 assert.deepEqual([sig.label,sig.ok,sig.simulated],["Voucher's card still live",true,true]);
 src.read=async()=>bongani;
 j=await post(base,`/api/card/${si.cardId}/check`,{vouchIds:[id]});
 assert.equal(j.signals.find(s=>s.key==='voucherCard:'+id).simulated,false,'the one account the token reads');
 src.kind='sample';src.read=read;
 await post(base,`/api/card/${bo.cardId}/withdraw`,{ownerSecret:bo.ownerSecret});
 j=await post(base,`/api/card/${si.cardId}/check`,{vouchIds:[id]});
 sig=j.signals.find(s=>s.key==='voucherCard:'+id);
 assert.ok(sig&&sig.ok===false&&sig.simulated===true);
 void get;
});
