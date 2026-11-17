const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {STRINGS}=require('../server/card/render.js');
const {verifyJwt}=require('../server/card/sign.js');
const {createCardStore}=require('../server/card/store.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {NOW,bootVouch,publishPersona,post,form,get}=require('./helpers/vouch-boot.cjs');
let lines={}; try {lines=require('../server/card/vouch-lines.js')}catch{}
let vouches={}; try {vouches=require('../server/card/vouches.js')}catch{}
let sweep={}; try {sweep=require('../server/card/sweep.js')}catch{}
const {HOW_OFTEN,HIRE_AGAIN,whenText,buildLine,voucherLabel,numberLabel,tierLabel,finePrint,tierItem}=lines;
const {createVouchStore,capFor,recentFor,isSelfVouch,workerCapReached,capMessage}=vouches;
const {runSweep}=sweep;

const N=NOW,DAY=86400000,iso=ms=>new Date(ms).toISOString();
const D='2026-11-16T14:41:02Z';
const K1='a'.repeat(64),K2='b'.repeat(64);
// A full public record (spec 9.1) with overrides merged one level deep.
function rec(over={}){
 const base={vouchId:null,cardId:'ABCDEFGHJK',kind:'customer',proof:{method:'qr',step:19942666,provedAt:D,channel:'web',onWorkerPhone:false},
  voucher:{label:'a customer',firstName:null,phoneLast3:null,phoneConfirmedBy:'sms_bind',cardId:null,showCard:false,orgName:null,orgId:null,adultSelfDeclared:true},
  fields:{work:'Braids',words:null,wordsSource:null,when:'2026-11',howOften:'a few times',hireAgain:'yes'},
  line:'Braids, November 2026, a few times. Would hire again: yes.',lang:'en',wordsShownAt:null,clip:null,restsOn:null,statement:null,acceptedAt:null,
  jobPostId:null,flags:[],visits:1,confirmedAt:'2026-11-16T14:46:30Z',expiresAt:null,generation:{mode:'sample',transcription:'none'}};
 return {...base,...over,proof:{...base.proof,...over.proof},voucher:{...base.voucher,...over.voucher},fields:{...base.fields,...over.fields}};
}
function tempStore(clock={t:N}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yovouch-store-')),now=()=>clock.t;
 const cardStore=createCardStore(dir,{now});
 return {dir,clock,cardStore,vs:createVouchStore(dir,{now,cardStore})};
}
const fileWith=(n,when)=>({sessions:Array.from({length:n},(_,i)=>({cardId:'C'+(i+1),at:iso(when==='today'?N-(i+1)*3600000:N-40*DAY)})),binds:[],otpSentAt:[],wrongCodes:[],lastSeen:null});
const fileWith3Cards=()=>({sessions:[3,10,20].map((d,i)=>({cardId:'C'+(i+1),at:iso(N-d*DAY)})),binds:[],otpSentAt:[],wrongCodes:[],lastSeen:null});

test('customer line and worker line',()=>{
 assert.equal(buildLine('customer',{work:'Braids',when:'2026-11',howOften:'a few times',hireAgain:'yes',words:'She did my braids three times this year.'}),
  'Braids, November 2026, a few times. Would hire again: yes. "She did my braids three times this year."');
 assert.equal(buildLine('worker',{work:'Paving',when:'earlier',howOften:'once',hireAgain:'not stated',words:null}),
  'Paving, earlier, once. Would work together again: not stated.');
 assert.equal(buildLine('organisation',{},{statement:'Amara completed our customer care programme in 2025 and we refer her for this post.',restsOn:{title:'Customer Care Basics'},jobPost:{work:'counter assistant',area:'Trans Ekulu'},at:'2026-11-16T09:00:00Z'}),
  'Referred for counter assistant at Trans Ekulu, 16 November 2026, resting on Customer Care Basics. "Amara completed our customer care programme in 2025 and we refer her for this post."');
 assert.equal(HOW_OFTEN['rather not say'],'not stated'); assert.equal(HIRE_AGAIN['rather not say'],'not stated');
 assert.equal(HOW_OFTEN['a few times'],'a few times'); assert.equal(HIRE_AGAIN.yes,'yes'); assert.equal(HIRE_AGAIN.no,undefined);
 assert.equal(whenText('2026-11'),'November 2026'); assert.equal(whenText('earlier'),'earlier');
 assert.equal(buildLine('customer',{work:'Cut',when:'2026-10',howOften:'not stated',hireAgain:'not stated',words:null}),'Cut, October 2026, not stated. Would hire again: not stated.');
});

test('tier labels by proof; a flagged label keeps the not-by-Yoma part',()=>{
 assert.equal(tierLabel(rec({kind:'customer',proof:{method:'qr',channel:'web',provedAt:'2026-11-03T10:00:00Z',onWorkerPhone:false}}),'Thandi'),'Said by a customer · code matched on 3 November 2026 · confirmed by them, not by Yoma');
 assert.equal(tierLabel(rec({kind:'customer',proof:{method:'code',channel:'web',onWorkerPhone:true,provedAt:D},voucher:{phoneConfirmedBy:'demo'}}),'Thandi'),"Said by a customer · demo, nothing texted · filled in on Thandi's phone on 16 November 2026 · confirmed by them, not by Yoma");
 assert.equal(tierLabel(rec({kind:'customer',proof:{method:'qr',channel:'web',onWorkerPhone:true,provedAt:D}}),'Thandi'),"Said by a customer · code texted from their phone on 16 November 2026 · filled in on Thandi's phone · confirmed by them, not by Yoma");
 assert.equal(tierLabel(rec({kind:'worker',proof:{method:'code',channel:'sms',provedAt:D},voucher:{firstName:'Bongani'}}),'Sipho'),"Vouched by another worker · Bongani's card · code matched by SMS on 16 November 2026 · confirmed by them, not by Yoma");
 assert.equal(tierLabel(rec({kind:'worker',proof:{method:'qr',channel:'web',provedAt:D},voucher:{firstName:'Bongani'}}),'Sipho'),"Vouched by another worker · Bongani's card · code matched on 16 November 2026 · confirmed by them, not by Yoma");
 assert.equal(tierLabel(rec({proof:{method:'code',channel:'sms',provedAt:D}}),'Sipho'),'Said by a customer · code matched by SMS on 16 November 2026 · confirmed by them, not by Yoma');
 assert.equal(tierLabel(rec({proof:{method:'code',channel:'ivr',provedAt:D}}),'Sipho'),'Said by a customer · code matched on a call on 16 November 2026 · confirmed by them, not by Yoma');
 assert.equal(tierLabel(rec({proof:{method:'request',channel:'web',provedAt:D}}),'Thandi'),STRINGS.labelCustomerRequest);
 assert.equal(tierLabel(rec({kind:'worker',proof:{method:'request',channel:'web',provedAt:D},voucher:{firstName:'Bongani'}}),'Sipho'),STRINGS.labelWorkerRequest('Bongani'));
 const flagged=tierLabel(rec({kind:'customer',proof:{method:'qr',channel:'web',provedAt:D},flags:['reciprocal']}),'X');
 assert.equal(flagged,STRINGS.labelCustomerCode('16 November 2026')+' · Vouched for each other');
 assert.ok(flagged.includes('confirmed by them, not by Yoma'));
 const ring=tierLabel(rec({kind:'worker',voucher:{firstName:'Bongani'}}),'X',['ring','held']);
 assert.ok(ring.endsWith('confirmed by them, not by Yoma · Part of a group that vouched for each other'));
 for(const label of [flagged,ring])for(const bad of ['in person','in the same place','co-presence','You are with'])assert.ok(!label.includes(bad));
});

test('referral label, open and closed',()=>{
 const r=rec({kind:'organisation',proof:{method:'code',channel:'web',provedAt:'2026-11-16T09:00:00Z'},voucher:{label:'Atingi',orgName:'Atingi',phoneConfirmedBy:'org_key'},
  restsOn:{evidenceId:'c3',opportunityId:'x',title:'Customer Care & Complaint Management'},statement:'She ran our front desk.',acceptedAt:'2026-11-16T09:00:00Z',
  jobPost:{work:'counter-assistant',area:'Trans Ekulu',postedAt:'2026-11-15T08:00:00Z'},expiresAt:'2026-12-15T08:00:00Z'});
 assert.equal(tierLabel(r,'Amara',r.flags,{nowMs:N}),'Referred by Atingi for counter-assistant on 16 November 2026 · rests on Customer Care & Complaint Management · confirmed by them, not by Yoma');
 const closed=tierLabel(r,'Amara',r.flags,{nowMs:Date.parse('2026-12-20T00:00:00Z')});
 assert.ok(closed.startsWith('Referred by Atingi for a counter-assistant post, November 2026 (post closed)'));
 assert.ok(closed.includes('confirmed by them, not by Yoma'));
 assert.deepEqual(finePrint(r,'Amara'),[STRINGS.fineReferral('Amara'),STRINGS.demoOrgKey]);
 const item=tierItem(r,'Amara',{nowMs:N});
 assert.equal(item.referral,true); assert.equal(item.demoKey,true);
});

test('voucher label and number label',()=>{
 assert.equal(voucherLabel({voucher:{firstName:'Nomsa',phoneLast3:'191'}}),'Nomsa ···191');
 assert.equal(voucherLabel({voucher:{firstName:null}}),'a customer');
 assert.equal(voucherLabel({kind:'worker',voucher:{firstName:'Bongani'}}),"Bongani's card");
 assert.equal(voucherLabel({kind:'organisation',voucher:{orgName:'Atingi'}}),'Atingi');
 assert.equal(numberLabel('demo'),'Number typed by the voucher, not confirmed (demo)');
 assert.equal(numberLabel('sms_bind'),STRINGS.numberSmsBind); assert.equal(numberLabel('sms_origin'),STRINGS.numberSms);
 assert.equal(numberLabel('caller_id'),STRINGS.numberCall); assert.equal(numberLabel('card'),null);
});

test('fine print and the tier item',()=>{
 assert.deepEqual(finePrint(rec(),'Thandi'),[STRINGS.limitsLong('Thandi','web'),STRINGS.numberSmsBind]);
 assert.deepEqual(finePrint(rec({proof:{method:'code',channel:'sms'},voucher:{phoneConfirmedBy:'sms_origin'}}),'Sipho'),[STRINGS.limitsLong('Sipho','sms'),STRINGS.numberSms]);
 assert.deepEqual(finePrint(rec({proof:{onWorkerPhone:true},voucher:{phoneConfirmedBy:'demo'}}),'Thandi'),[STRINGS.fineTexted,STRINGS.numberDemo]);
 assert.deepEqual(finePrint(rec({proof:{method:'request'}}),'Thandi'),[STRINGS.fineRequest('Thandi'),STRINGS.numberSmsBind]);
 assert.deepEqual(finePrint(rec({kind:'worker',voucher:{phoneConfirmedBy:'card'}}),'Sipho'),[STRINGS.fineWorker]);
 assert.deepEqual(finePrint(rec({kind:'worker',proof:{channel:'sms'},voucher:{phoneConfirmedBy:'sms_origin'}}),'Sipho'),[STRINGS.fineWorker,STRINGS.numberSms]);
 const item=tierItem(rec({vouchId:'Q7M2PX4KLW',visits:3,clip:{url:'/v/Q7M2PX4KLW/clip',contentType:'audio/webm',seconds:9,bytes:18400,sha256:'x'}}),'Thandi');
 assert.equal(item.vouchId,'Q7M2PX4KLW');
 assert.equal(item.line,'Braids, November 2026, a few times. Would hire again: yes. 3 visits.');
 assert.deepEqual(item.clip,{href:'/v/Q7M2PX4KLW/clip',text:'Play 9-second clip (18 KB)'});
 assert.equal(item.window,'web'); assert.equal(item.referral,false); assert.equal(item.demoKey,false);
 assert.equal(item.label,STRINGS.labelCustomerCode('16 November 2026'));
 assert.equal(tierItem(rec({clip:{expired:true}}),'Thandi').clip.text,STRINGS.clipExpired);
 assert.equal(tierItem(rec(),'Thandi').clip,null);
 assert.equal(tierItem(rec({proof:{channel:'ivr'}}),'Thandi').window,'sms');
 assert.equal(tierItem(rec(),'X',{flags:['reciprocal']}).label,STRINGS.labelCustomerCode('16 November 2026')+' · '+STRINGS.flagReciprocal);
});

test('caps and self-vouch',()=>{
 assert.equal(capFor(fileWith(3,'today'),'C4',N),'voucher_cap_day');
 assert.equal(capFor(fileWith(2,'today'),'C4',N),null);
 assert.equal(capFor(fileWith3Cards(),'C4',N),'voucher_cap_cards');
 assert.equal(capFor(fileWith3Cards(),'C2',N),null);
 assert.equal(capFor(fileWith(3,'old'),'C4',N),null);
 assert.equal(isSelfVouch({ownerPhoneHash:K1,linkedPhoneHash:null},K1),true);
 assert.equal(isSelfVouch({ownerPhoneHash:K2,linkedPhoneHash:K1},K1),true);
 assert.equal(isSelfVouch({ownerPhoneHash:K2,linkedPhoneHash:null},K1),false);
 assert.equal(isSelfVouch({ownerPhoneHash:null,linkedPhoneHash:null},null),false);
 const given=n=>Array.from({length:n},(_,i)=>({record:rec({kind:'worker',confirmedAt:iso(N-(i+1)*DAY)}),private:{}}));
 assert.equal(workerCapReached(given(5),N),true); assert.equal(workerCapReached(given(4),N),false);
 assert.equal(workerCapReached(given(5).map(f=>({...f,record:{...f.record,confirmedAt:iso(N-91*DAY)}})),N),false);
 assert.equal(capMessage('voucher_cap_day'),'This number has vouched three times today. Try again tomorrow.');
 assert.equal(capMessage('voucher_cap_cards'),'This number has vouched for three workers this month. Try again next month.');
 assert.equal(capMessage('worker_cap'),'You have vouched for 5 workers in the last 90 days.');
});

test('repeat customer within 30 days is found by recentFor; at 31 days it is not',()=>{
 const {vs}=tempStore();
 const a=vs.create({record:rec({confirmedAt:iso(N-29*DAY)}),private:{voucherKey:K1},channel:'web'});
 vs.create({record:rec({cardId:'BCDEFGHJKL'}),private:{voucherKey:K1},channel:'web'});
 assert.equal(recentFor(vs.listByVoucherKey(K1),'ABCDEFGHJK',N).record.vouchId,a.vouchId);
 assert.equal(recentFor(vs.listByVoucherKey(K2),'ABCDEFGHJK',N),null);
 const {vs:vs2}=tempStore();
 vs2.create({record:rec({confirmedAt:iso(N-31*DAY)}),private:{voucherKey:K1},channel:'web'});
 assert.equal(recentFor(vs2.listByVoucherKey(K1),'ABCDEFGHJK',N),null);
 const w=vs2.create({record:rec({confirmedAt:iso(N-DAY)}),private:{voucherKey:K1},channel:'web'});
 vs2.withdrawAs(w.vouchId,'now');
 assert.equal(recentFor(vs2.listByVoucherKey(K1),'ABCDEFGHJK',N),null);
});

test('the store: ids, secrets, file shape and lists',()=>{
 const {dir,vs}=tempStore();
 const web=vs.create({record:rec(),held:{words:'Kind and quick.',wordsSource:'typed',clip:null},private:{voucherKey:K1,editedFields:['work']},channel:'web'});
 assert.match(web.vouchId,/^[A-Z2-9]{10}$/); assert.match(web.withdrawSecret,/^[0-9a-f]{16}$/);
 const sms=vs.create({record:rec({proof:{channel:'sms'}}),private:{voucherKey:K2},channel:'sms'});
 assert.match(sms.withdrawSecret,/^[A-Z2-9]{6}$/);
 const file=JSON.parse(fs.readFileSync(path.join(dir,'vouches',web.vouchId+'.json'),'utf8'));
 assert.deepEqual(Object.keys(file),['record','held','private']);
 assert.deepEqual(Object.keys(file.private).sort(),['editedFields','hiddenAt','rawTranscript','rejected','voucherKey','withdrawAfter','withdrawSecretHash','withdrawnAt']);
 assert.equal(file.record.vouchId,web.vouchId); assert.deepEqual(file.private.editedFields,['work']);
 assert.ok(!JSON.stringify(file).includes(web.withdrawSecret));
 assert.equal(vs.publicPart(file),file.record); assert.equal(vs.publicPart(file).fields.words,null);
 assert.equal(vs.listForCard('ABCDEFGHJK').length,2); assert.equal(vs.listByVoucherKey(K2)[0].record.vouchId,sms.vouchId);
 assert.equal(vs.get('../../x'),null); assert.equal(vs.get('ZZZZZZZZZZ'),null);
 const by=vs.create({record:rec({kind:'worker',cardId:'BCDEFGHJKL',voucher:{cardId:'ABCDEFGHJK'}}),channel:'web'});
 assert.deepEqual(vs.listByVoucherCard('ABCDEFGHJK').map(f=>f.record.vouchId),[by.vouchId]);
 assert.equal(vs.update(by.vouchId,f=>{f.record.visits=2;}).record.visits,2); assert.equal(vs.get(by.vouchId).record.visits,2);
});

test('withdraw now and quietly; wrong secret refused',()=>{
 const {vs}=tempStore();
 const {vouchId:id,withdrawSecret:secret}=vs.create({record:rec(),channel:'web'});
 const {vouchId:id2,withdrawSecret:secret2}=vs.create({record:rec(),channel:'web'});
 assert.equal(vs.withdraw(id,'WRONG','now').ok,false);
 assert.equal(vs.withdraw(id,secret,'later').ok,false);
 assert.equal(vs.isLive(vs.get(id),N),true);
 const w=vs.withdraw(id,secret,'now');
 assert.equal(w.ok,true); assert.equal(w.file.private.withdrawnAt,iso(N)); assert.equal(vs.isLive(w.file,N),false);
 const q=vs.withdraw(id2,secret2,'quiet').file;
 assert.ok(Date.parse(q.private.withdrawAfter)-N<=72*3600000);
 assert.equal(q.private.withdrawnAt,null);
 assert.equal(vs.isLive(q,N),true); assert.equal(vs.isLive(q,Date.parse(q.private.withdrawAfter)),false);
 const {vouchId:id3,withdrawSecret:s3}=vs.create({record:rec({proof:{channel:'sms'}}),channel:'sms'});
 assert.equal(vs.withdraw(id3,s3.toLowerCase(),'now').ok,true);         // an SMS secret typed in lower case
 const {vouchId:id4}=vs.create({record:rec(),channel:'web'});
 assert.equal(vs.withdrawAs(id4,'now').private.withdrawnAt,iso(N)); assert.equal(vs.withdrawAs('ZZZZZZZZZZ','now'),null);
});

test('isLive: hidden, unaccepted referral and withdrawn card',()=>{
 const {vs,cardStore}=tempStore();
 const {cardId,ownerSecret}=cardStore.create({user:{firstName:'Thandi'}});
 const {vouchId}=vs.create({record:rec({cardId}),channel:'web'});
 assert.equal(vs.isLive(vs.get(vouchId),N),true);
 const ref=vs.create({record:rec({cardId,kind:'organisation',acceptedAt:null}),channel:'web'});
 assert.equal(vs.isLive(vs.get(ref.vouchId),N),false);
 cardStore.withdraw(cardId,ownerSecret);
 assert.equal(vs.isLive(vs.get(vouchId),N),false);
 assert.equal(vs.isLive({vouchId,cardId,withdrawnAt:iso(N)},N),false);
});

test('hide keeps the date and position; show again restores',()=>{
 const {vs}=tempStore();
 const a=vs.create({record:rec({confirmedAt:'2026-11-10T10:00:00Z'}),channel:'web'});
 vs.create({record:rec({confirmedAt:'2026-11-12T10:00:00Z'}),channel:'web'});
 const order=()=>vs.listForCard('ABCDEFGHJK').map(f=>f.record.vouchId);
 const before=order();
 assert.equal(vs.hide(a.vouchId,'BCDEFGHJKL'),false);                     // another card cannot hide it
 assert.equal(vs.hide(a.vouchId,'ABCDEFGHJK'),true);
 assert.equal(vs.isLive(vs.get(a.vouchId),N),false); assert.equal(vs.get(a.vouchId).private.hiddenAt,iso(N));
 assert.equal(vs.show(a.vouchId,'ABCDEFGHJK'),true);
 const back=vs.get(a.vouchId);
 assert.equal(vs.isLive(back,N),true); assert.equal(back.private.hiddenAt,null); assert.equal(back.record.confirmedAt,'2026-11-10T10:00:00Z');
 assert.deepEqual(order(),before);
});

test('showWords moves the held words and clip into the public part',()=>{
 const {vs}=tempStore();
 const clip={url:'/v/X/clip',contentType:'audio/webm',seconds:9,bytes:18400,sha256:'x'};
 const {vouchId}=vs.create({record:rec(),held:{words:'She did my braids three times this year.',wordsSource:'typed',clip},channel:'web'});
 assert.equal(vs.showWords(vouchId,'BCDEFGHJKL'),null);
 const f=vs.showWords(vouchId,'ABCDEFGHJK');
 assert.equal(f.held,null); assert.equal(f.record.wordsShownAt,iso(N)); assert.equal(f.record.fields.words,'She did my braids three times this year.');
 assert.equal(f.record.fields.wordsSource,'typed'); assert.deepEqual(f.record.clip,clip);
 assert.equal(f.record.line,'Braids, November 2026, a few times. Would hire again: yes. "She did my braids three times this year."');
 assert.equal(f.record.confirmedAt,'2026-11-16T14:46:30Z');
});

test('GET /v/:id.json signs the public part with sub vouchId; held words stay out',async()=>{
 const {base,key,vouch}=await bootVouch();
 const p=await publishPersona(base,'thandi',{trade:'hair'});
 const {vouchId}=vouch.vouchStore.create({record:rec({cardId:p.cardId}),held:{words:'Lovely work.',wordsSource:'typed',clip:null},channel:'web'});
 const res=await fetch(base+'/v/'+vouchId+'.json');
 assert.equal(res.status,200); assertPrivateHeaders(res);
 const j=await res.json();
 assert.deepEqual(Object.keys(j),['record','jwt','jwksUrl','held']);
 assert.deepEqual(j.held,['words','clip']); assert.equal(j.record.fields.words,null); assert.ok(!JSON.stringify(j).includes('Lovely work.'));
 assert.equal(j.jwksUrl,'https://yocard.example/.well-known/jwks.json');
 const payload=verifyJwt(key,j.jwt);
 assert.equal(payload.sub,vouchId); assert.equal(payload.record.cardId,p.cardId);
 assert.equal(payload.iat,Math.floor(Date.parse('2026-11-16T14:46:30Z')/1000));
 assert.equal((await fetch(base+'/v/ZZZZZZZZZZ.json')).status,404);
 assert.equal((await fetch(base+'/v/'+vouchId+'/clip')).status,404);                // clip storage arrives with Task 11
});

test('Review Focus 4: a withdrawn card makes its vouches 410 at once',async()=>{
 const {base,vouch}=await bootVouch();
 const p=await publishPersona(base,'thandi',{trade:'hair'});
 const {vouchId:vid}=vouch.vouchStore.create({record:rec({cardId:p.cardId}),channel:'web'});
 assert.equal((await fetch(base+'/v/'+vid+'.json')).status,200);
 await post(base,'/api/card/'+p.cardId+'/withdraw',{ownerSecret:p.ownerSecret});
 assert.equal((await fetch(base+'/v/'+vid+'.json')).status,410);   // no sweep has run
 assert.equal((await fetch(base+'/v/'+vid+'/clip')).status,410);
});

test('Review Focus 4: a quiet withdrawal holds at read time once withdrawAfter passes',async()=>{
 const {base,vouch,clock}=await bootVouch();
 const p=await publishPersona(base,'thandi',{trade:'hair'});
 const {vouchId:vid,withdrawSecret}=vouch.vouchStore.create({record:rec({cardId:p.cardId}),channel:'web'});
 assert.ok((await form(base,'/v/'+vid+'/withdraw',{w:withdrawSecret,mode:'quiet'})).includes('Your vouch will be removed within 3 days.'));
 assert.equal((await fetch(base+'/v/'+vid+'.json')).status,200);
 clock.t=Date.parse(vouch.vouchStore.get(vid).private.withdrawAfter);
 assert.equal((await fetch(base+'/v/'+vid+'.json')).status,410);
 assert.equal(vouch.vouchStore.listForCard(p.cardId).filter(f=>vouch.vouchStore.isLive(f,clock.t)).length,0);
 assert.equal(vouch.events.read().at(-1).mode,'quiet');
});

test('withdraw page GET renders, POST acts and logs',async()=>{
 const {base,vouch}=await bootVouch();
 const p=await publishPersona(base,'thandi',{trade:'hair'});
 const {vouchId:vid,withdrawSecret:secret}=vouch.vouchStore.create({record:rec({cardId:p.cardId}),channel:'web'});
 const res=await fetch(base+'/v/'+vid+'/withdraw?w='+secret); assertPrivateHeaders(res);
 const html=await res.text(); assertHonestPage(html);
 assert.ok(html.includes('Withdraw your vouch for Thandi? It will be removed from the card.'));
 assert.ok(html.includes('Withdraw now')&&html.includes('Withdraw quietly')); assert.ok(Buffer.byteLength(html)<=4096);
 assert.ok(html.includes('name="w" value="'+secret+'"'));
 const bad=await fetch(base+'/v/'+vid+'/withdraw',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'w=0000000000000000&mode=now'});
 assert.equal(bad.status,403); assert.ok((await bad.text()).includes('Withdraw quietly'));
 assert.equal(vouch.vouchStore.get(vid).private.withdrawnAt,null);
 const done=await form(base,'/v/'+vid+'/withdraw',{w:secret,mode:'now'});
 assert.ok(done.includes('Your vouch was withdrawn.')); assertHonestPage(done);
 const ev=vouch.events.read().at(-1);
 assert.equal(ev.type,'vouch_withdrawn'); assert.deepEqual({vouchId:ev.vouchId,cardId:ev.cardId,mode:ev.mode,by:ev.by,demo:ev.demo},{vouchId:vid,cardId:p.cardId,mode:'now',by:'voucher',demo:true});
 assert.equal((await fetch(base+'/v/'+vid+'.json')).status,410);
 assert.equal((await fetch(base+'/v/ZZZZZZZZZZ/withdraw?w='+secret)).status,404);
 const json=await post(base,'/v/'+vid+'/withdraw',{w:secret,mode:'later'});
 assert.equal(json.error.code,'invalid_input');
});

test('sweep: a card withdrawn 25 hours ago loses vouches, indexes and secret; a vouch withdrawn 31 days ago is a tombstone',async()=>{
 const {base,store,dir,vouch,clock}=await bootVouch();
 const vs=vouch.vouchStore,clips=path.join(dir,'vouches','clips');
 const a=await publishPersona(base,'thandi',{trade:'hair'}),b=await publishPersona(base,'brian');
 const clipOf=id=>({url:'/v/'+id+'/clip',contentType:'audio/webm',seconds:9,bytes:18400,sha256:'x'});
 const putClip=id=>{fs.mkdirSync(clips,{recursive:true});fs.writeFileSync(path.join(clips,id+'.webm'),'audio');};
 const {vouchId:vid}=vs.create({record:rec({cardId:a.cardId}),channel:'web'});
 const {vouchId:vb}=vs.create({record:rec({cardId:b.cardId}),channel:'web'});
 vs.update(vb,f=>{f.record.clip=clipOf(vb);}); putClip(vb);
 vs.withdrawAs(vb,'now');
 assert.ok(!fs.existsSync(path.join(clips,vb+'.webm')),'the clip goes at withdrawal');
 const {vouchId:vc}=vs.create({record:rec({cardId:b.cardId,confirmedAt:iso(N-366*DAY)}),channel:'web'});
 vs.update(vc,f=>{f.record.clip=clipOf(vc);}); putClip(vc);
 const {vouchId:vd}=vs.create({record:rec({cardId:b.cardId}),channel:'web'});
 vs.update(vd,f=>{f.record.clip=clipOf(vd);}); putClip(vd);
 const smsId=a.smsId,code=store.get(a.cardId).record.code;
 vouch.voucherFiles.update(K1,f=>{f.sessions.push({cardId:a.cardId,at:iso(N-400*DAY)});});
 vouch.voucherFiles.update(K2,f=>{f.sessions.push({cardId:a.cardId,at:iso(N-400*DAY)},{cardId:b.cardId,at:iso(N-DAY)});f.binds.push({at:iso(N-400*DAY)});});
 await post(base,'/api/card/'+a.cardId+'/withdraw',{ownerSecret:a.ownerSecret});
 clock.t=N+23*3600000;
 const r0=runSweep(vouch);
 assert.equal(r0.cardsCleared,0); assert.equal(r0.reduced,0);           // under 24 hours: not yet
 assert.equal(r0.clipsExpired,1); assert.equal(r0.deleted,1);           // the 12-month clip and the empty voucher file
 clock.t=N+25*3600000;
 const r=runSweep(vouch);
 assert.deepEqual(Object.keys(vs.get(vid)),['vouchId','cardId','withdrawnAt']);
 assert.equal(vs.get(vid).withdrawnAt,store.get(a.cardId).withdrawnAt);
 assert.equal(store.get(a.cardId).vouch,null); assert.equal(store.get(a.cardId).cardTokenHash,null);
 assert.equal(store.indexGet('smsids',smsId),null); assert.equal(store.indexGet('codes',code),null);
 assert.equal(r.cardsCleared,1); assert.equal(r.reduced,1);
 assert.equal(r.clipsExpired,0);
 assert.deepEqual(vs.get(vc).record.clip,{expired:true}); assert.ok(!fs.existsSync(path.join(clips,vc+'.webm')));
 assert.deepEqual(vs.get(vd).record.clip,clipOf(vd)); assert.ok(fs.existsSync(path.join(clips,vd+'.webm')));
 assert.ok(vs.get(vb).record,'withdrawn 25 hours ago: not yet a tombstone');
 assert.ok(!fs.existsSync(path.join(dir,'vouchers',K1+'.json')),'an empty voucher file is deleted');
 assert.deepEqual(vouch.voucherFiles.read(K2).sessions,[{cardId:b.cardId,at:iso(N-DAY)}]); assert.deepEqual(vouch.voucherFiles.read(K2).binds,[]);
 assert.equal((await fetch(base+'/my/'+a.cardId+'/'+a.cardToken)).status,404);
 clock.t=N+31*DAY;
 const r2=runSweep(vouch);
 assert.deepEqual(vs.get(vb),{vouchId:vb,cardId:b.cardId,withdrawnAt:iso(N)});
 assert.equal(r2.reduced,1); assert.equal(r2.cardsCleared,0);
 assert.equal((await fetch(base+'/v/'+vb+'.json')).status,410);
 const r3=runSweep(vouch);
 assert.deepEqual(r3,{reduced:0,deleted:0,clipsExpired:0,cardsCleared:0});
});

test('a quiet withdrawal is swept as withdrawn from its withdrawAfter',()=>{
 const {vs,cardStore,dir,clock}=tempStore();
 const system={store:cardStore,vouchStore:vs,now:()=>clock.t};
 const {vouchId}=vs.create({record:rec(),channel:'web'});
 const after=Date.parse(vs.withdrawAs(vouchId,'quiet').private.withdrawAfter);
 clock.t=after+DAY; runSweep(system);
 assert.equal(vs.get(vouchId).private.withdrawnAt,iso(after));
 clock.t=after+31*DAY;
 assert.equal(runSweep(system).reduced,1);
 assert.deepEqual(vs.get(vouchId),{vouchId,cardId:'ABCDEFGHJK',withdrawnAt:iso(after)});
 void dir;
});

test('the router runs the sweep every hour without holding the process open',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','server','card','routes.js'),'utf8');
 assert.ok(/setInterval\([\s\S]{0,120}runSweep\(system\)[\s\S]{0,120}SWEEP_EVERY_MS\)/.test(src)&&/SWEEP_EVERY_MS=60\*60\*1000;/.test(src),'hourly runSweep(system) in routes.js');
 assert.ok(/\.unref\(\)/.test(src),'the sweep timer is unref()');
});
