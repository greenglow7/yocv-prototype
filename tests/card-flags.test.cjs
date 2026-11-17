const {test}=require('node:test');
const assert=require('node:assert/strict');
const {STRINGS}=require('../server/card/render.js');
const {qrTag,counterAt}=require('../server/card/vouchcode.js');
const {bootVouch,publishPersona,post,page}=require('./helpers/vouch-boot.cjs');
const {computeFlags,burstHeld,workerEdges}=require('../server/card/flags.js');

const DAY=86400000,N=Date.parse('2026-11-16T12:00:00Z'),HOUR=3600000;
const iso=ms=>new Date(ms).toISOString();
const e=(id,from,to,daysAgo)=>({vouchId:id,from,to,at:N-daysAgo*DAY});

test('reciprocal within 14 days',()=>{
 const f=computeFlags([e('v1','A','B',10),e('v2','B','A',1)],N);
 assert.deepEqual(f.get('v1'),['reciprocal']); assert.deepEqual(f.get('v2'),['reciprocal']);
 assert.equal(computeFlags([e('v1','A','B',20),e('v2','B','A',5)],N).get('v1'),undefined);   // 15 days apart
 assert.equal(computeFlags([e('v1','A','B',31),e('v2','B','A',25)],N).size,0);             // the older edge is past 30 days
});
test('triangle and square fire ring on every edge',()=>{
 const tri=computeFlags([e('a','A','B',3),e('b','B','C',2),e('c','C','A',1)],N);
 for(const id of ['a','b','c'])assert.deepEqual(tri.get(id),['ring']);
 const sq=computeFlags([e('a','A','B',4),e('b','B','C',3),e('c','C','D',2),e('d','D','A',1)],N);
 for(const id of ['a','b','c','d'])assert.deepEqual(sq.get(id),['ring']);
 // An edge can carry both flags; an edge off the cycle carries none.
 const both=computeFlags([e('a','A','B',3),e('b','B','C',2),e('c','C','A',1),e('r','B','A',1),e('x','A','D',1)],N);
 assert.deepEqual(both.get('a'),['reciprocal','ring']); assert.deepEqual(both.get('r'),['reciprocal']); assert.equal(both.get('x'),undefined);
});
test('a one-way chain, a 31-day-spaced cycle and a 5-cycle fire nothing',()=>{
 assert.equal(computeFlags([e('a','A','B',3),e('b','A','C',2),e('c','B','C',1)],N).size,0);
 assert.equal(computeFlags([e('a','A','B',62),e('b','B','C',31),e('c','C','A',0)],N).size,0);
 assert.equal(computeFlags([e('a','A','B',5),e('b','B','C',4),e('c','C','D',3),e('d','D','E',2),e('f','E','A',1)],N).size,0);
});

// A customer file confirmed at ms; withdrawn sets withdrawnAt.
const cf=(id,at,{withdrawn=false,kind='customer'}={})=>({record:{vouchId:id,cardId:'ABCDEFGHJK',kind,confirmedAt:iso(at)},held:null,
 private:{withdrawnAt:withdrawn?iso(at+60000):null,withdrawAfter:null,hiddenAt:null}});
test('burst hold counts live lines only',()=>{
 const C=N-10*HOUR;
 // 6 customer vouches in the card's first 24 h -> the 6th is held; at +7 days it is not
 const six=Array.from({length:6},(_,i)=>cf('F'+i,C+i*HOUR));
 assert.deepEqual([...burstHeld(six,C,N)],['F5']);
 assert.equal(burstHeld(six,C,C+5*HOUR+7*DAY).size,0);
 assert.equal(burstHeld(six.slice(0,5),C,N).size,0);
 // A worker line and a withdrawn line do not count toward the first-day five.
 assert.equal(burstHeld([...six.slice(0,4),cf('W',C+4*HOUR,{kind:'worker'}),cf('F5',C+5*HOUR)],C,N).size,0);
 assert.equal(burstHeld([cf('X',C,{withdrawn:true}),...six.slice(1)],C,N).size,0);
 // 11 in 7 days -> the 11th is held; withdraw one of the first 10 -> the 11th is not held
 const start=Date.parse('2026-10-01T08:00:00Z'),at=i=>N-6*DAY+i*12*HOUR;
 const eleven=Array.from({length:11},(_,i)=>cf('S'+i,at(i)));
 assert.deepEqual([...burstHeld(eleven,start,N)],['S10']);
 const one=eleven.map((f,i)=>i===3?cf('S3',at(3),{withdrawn:true}):f);
 assert.equal(burstHeld(one,start,N).size,0);
});

// A worker vouch record from card `from` (first name fromName) for card `to`, confirmed daysAgo days before the clock.
function workerRecord(from,fromName,to,nowMs,daysAgo){
 const at=iso(nowMs-daysAgo*DAY);
 return {vouchId:null,cardId:to,kind:'worker',proof:{method:'qr',step:1,provedAt:at,channel:'web',onWorkerPhone:false},
  voucher:{label:fromName+"'s card",firstName:fromName,phoneLast3:null,phoneConfirmedBy:'sms_bind',cardId:from,showCard:true,orgName:null,orgId:null,adultSelfDeclared:true},
  fields:{work:'Paving',words:null,wordsSource:null,when:'2026-11',howOften:'once',hireAgain:'yes'},
  line:'Paving, November 2026, once. Would work together again: yes.',lang:'en',wordsShownAt:null,clip:null,restsOn:null,statement:null,acceptedAt:null,
  jobPostId:null,flags:[],visits:1,confirmedAt:at,expiresAt:null,generation:{mode:'sample',transcription:'none'}};
}
test('the card page shows the flag label on each triangle line',async()=>{
 const {base,vouch,clock}=await bootVouch();
 const A=(await publishPersona(base,'thandi',{trade:'hair'})).cardId;
 const B=(await publishPersona(base,'sipho')).cardId;
 const C=(await publishPersona(base,'bongani')).cardId;
 vouch.vouchStore.create({record:workerRecord(A,'Thandi',B,clock.t,3)});
 vouch.vouchStore.create({record:workerRecord(B,'Sipho',C,clock.t,2)});
 vouch.vouchStore.create({record:workerRecord(C,'Bongani',A,clock.t,1)});
 assert.equal(workerEdges(vouch.vouchStore,clock.t).length,3);
 for(const id of [A,B,C]){
  const html=await page(base,'/c/'+id);
  assert.ok(html.includes('Part of a group that vouched for each other'),id);
  assert.ok(html.includes('confirmed by them, not by Yoma · Part of a group that vouched for each other'));
 }
 // The stored record keeps its confirmation-time flags; the page shows the current ones.
 assert.deepEqual(vouch.vouchStore.listForCard(B)[0].record.flags,[]);
 // 31 days on, the cycle is out of the window and the label is gone.
 clock.t+=31*DAY;
 assert.ok(!(await page(base,'/c/'+B)).includes(STRINGS.flagRing));
});
test('hiding a line does not clear the flags on the others',async()=>{
 const {base,vouch,clock}=await bootVouch();
 const A=(await publishPersona(base,'thandi',{trade:'hair'})).cardId,B=(await publishPersona(base,'sipho')).cardId;
 const {vouchId}=vouch.vouchStore.create({record:workerRecord(A,'Thandi',B,clock.t,2)});
 vouch.vouchStore.create({record:workerRecord(B,'Sipho',A,clock.t,1)});
 assert.ok(vouch.vouchStore.hide(vouchId,B));
 assert.ok((await page(base,'/c/'+A)).includes('confirmed by them, not by Yoma · Vouched for each other'));
 assert.ok(!(await page(base,'/c/'+B)).includes('Paving'));
});
test('confirm writes held for the 6th first-day line; the card holds it back with the notice',async()=>{
 const {base,vouch,clock,store}=await bootVouch({env:{sim:true}});
 const id=(await publishPersona(base,'thandi',{trade:'hair'})).cardId;
 const make=(i,line)=>({record:{vouchId:null,cardId:id,kind:'customer',proof:{method:'qr',step:1,provedAt:iso(clock.t),channel:'web',onWorkerPhone:false},
  voucher:{label:'a customer',firstName:null,phoneLast3:null,phoneConfirmedBy:'sms_bind',cardId:null,showCard:false,orgName:null,orgId:null,adultSelfDeclared:true},
  fields:{work:'Braids',words:null,wordsSource:null,when:'2026-11',howOften:'once',hireAgain:'yes'},line,lang:'en',wordsShownAt:null,clip:null,restsOn:null,
  statement:null,acceptedAt:null,jobPostId:null,flags:[],visits:1,confirmedAt:iso(clock.t+i*60000),expiresAt:null,generation:{mode:'sample',transcription:'none'}}});
 for(let i=0;i<5;i++)vouch.vouchStore.create(make(i,'Braids, November 2026, once. Line '+i+'.'));
 clock.t+=10*60000;
 const secret=store.get(id).vouch.secret,step=counterAt(clock.t);
 const o=await post(base,'/api/vouch/open',{cardId:id,proof:{method:'qr',t:String(step),k:qrTag(secret,step)},voucher:{kind:'customer'}});
 const s=o.vouchToken,CH={work:'Braids',when:'this month',howOften:'regularly',hireAgain:'yes'};
 await post(base,`/api/vouch/${s}/chips`,CH);
 const bind=await post(base,`/api/vouch/${s}/bind`,{});
 await post(base,'/api/sim/sms',{from:'+27821110191',text:'YES '+bind.sessionCode});
 const r=await post(base,`/api/vouch/${s}/confirm`,{fields:CH,adult:true,consent:true});
 assert.match(r.vouchId,/^[A-Z2-9]{10}$/);
 assert.deepEqual(vouch.vouchStore.get(r.vouchId).record.flags,['held']);
 let html=await page(base,'/c/'+id);
 assert.ok(html.includes(STRINGS.burstNotice)); assert.ok(!html.includes(r.line));
 assert.ok(html.includes('Line 4.'));
 assert.ok(!(await page(base,'/c/'+id+'/vouches')).includes(r.line));
 assert.ok(!(await (await fetch(base+'/c/'+id+'/vouches.json')).json()).vouches.some(v=>v.vouchId===r.vouchId));
 clock.t+=7*DAY;
 html=await page(base,'/c/'+id);
 assert.ok(html.includes(r.line)); assert.ok(!html.includes(STRINGS.burstNotice));
});
