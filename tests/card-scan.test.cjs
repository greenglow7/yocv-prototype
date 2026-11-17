const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {qrTag,spokenCode,formatSpoken}=require('../server/card/vouchcode.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {bootVouch,publishPersona,post,form,page}=require('./helpers/vouch-boot.cjs');
let service={}; try {service=require('../server/card/vouch-service.js')}catch{}
let sessionsMod={}; try {sessionsMod=require('../server/card/vouch-sessions.js')}catch{}
const {chipsFor}=service,{createVouchSessions}=sessionsMod;

const STEP=19942666;
// A fresh server and a published Thandi (hairdresser) for each test that changes card state.
async function fresh(opts){
 const boot=await bootVouch(opts);
 const p=await publishPersona(boot.base,'thandi',{trade:'hair'});
 const secret=boot.store.get(p.cardId).vouch.secret;
 return {...boot,p,id:p.cardId,secret,TAG:qrTag(secret,STEP)};
}
const nonceOf=html=>(/name="f" value="([0-9a-f]{16})"/.exec(html)||[])[1];
const tokenIn=html=>(/action="\/api\/vouch\/([0-9a-f]{24})\/chips"/.exec(html)||[])[1];
async function formRes(base,route,fields){
 return fetch(base+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields).toString()});
}
function fakeLiveProvider(){return {name:'azure-openai',model:'test',async complete(){throw new Error('not called');}};}

test('scan landing page, consumes nothing',async()=>{
 const {base,store,id,TAG}=await fresh();
 const res=await fetch(base+'/s/'+id+'?t='+STEP+'&k='+TAG);
 assert.equal(res.status,200);
 assertPrivateHeaders(res); const html=await res.text(); assertHonestPage(html);
 assert.ok(html.includes('Vouch for Thandi, hairdresser')&&html.includes('>Vouch for Thandi<'));
 assert.ok(html.includes("A matched code shows you had Thandi's code in the last three minutes. It does not show the work was done."));
 assert.ok(html.includes('Are you 18 or older?')&&html.includes('1 English 2 isiZulu 3 isiXhosa 4 Kiswahili 5 Pidgin'));
 assert.match(nonceOf(html)||'',/^[0-9a-f]{16}$/);
 assert.notEqual(nonceOf(await page(base,'/s/'+id+'?t='+STEP+'&k='+TAG)),nonceOf(html));
 assert.ok(Buffer.byteLength(html)<=4096,'scan page is '+Buffer.byteLength(html)+' bytes');
 assert.deepEqual(store.get(id).vouch.usedSteps,[]);
});
test('template mode says so on every flow page',async()=>{
 const {base,id,TAG}=await fresh();
 assert.ok((await page(base,'/s/'+id+'?t='+STEP+'&k='+TAG)).includes('Sample mode: template extraction, no model call'));
 assert.ok((await page(base,'/s')).includes('Sample mode: template extraction, no model call'));
 const live=await fresh({provider:fakeLiveProvider()});
 assert.ok(!(await page(live.base,'/s/'+live.id+'?t='+STEP+'&k='+live.TAG)).includes('Sample mode'));
});
test('the 18-or-older POST consumes the step and renders the chips page',async()=>{
 const {base,store,vouch,id,TAG}=await fresh();
 const res=await formRes(base,'/s/'+id,{t:STEP,k:TAG,adult:'yes',f:'a'.repeat(16)});
 assert.equal(res.status,200); assertPrivateHeaders(res);
 const html=await res.text(); assertHonestPage(html);
 assert.ok(html.includes('What did Thandi do?')&&html.includes('Braids')&&html.includes('Relaxer'));
 assert.ok(html.includes('When:')&&html.includes('How often:')&&html.includes('Would you hire Thandi again?'));
 assert.ok(html.includes('type="month" name="month"')&&html.includes('maxlength="120"'));
 assert.ok(Buffer.byteLength(html)<=4096,'chips page is '+Buffer.byteLength(html)+' bytes');
 assert.deepEqual(store.get(id).vouch.usedSteps,[STEP]);
 assert.match(html,/action="\/api\/vouch\/[0-9a-f]{24}\/chips"/);
 const s=vouch.sessions.get(tokenIn(html));
 assert.equal(s.cardId,id); assert.equal(s.step,'chips'); assert.equal(s.adult,true); assert.equal(s.onWorkerPhone,false);
 assert.deepEqual(s.proof,{method:'qr',step:STEP,provedAt:'2026-11-16T14:40:12.000Z',channel:'web',onWorkerPhone:false});
 assert.equal(vouch.events.read().at(-1).type,'vouch_opened');
});
test('Review Focus: a double tap re-opens the same session',async()=>{
 const {base,id,TAG}=await fresh();
 const nonce=nonceOf(await page(base,'/s/'+id+'?t='+STEP+'&k='+TAG)),otherNonce='b'.repeat(16);
 const a=await form(base,'/s/'+id,{t:STEP,k:TAG,adult:'yes',f:nonce});
 const b=await form(base,'/s/'+id,{t:STEP,k:TAG,adult:'yes',f:nonce});
 assert.ok(tokenIn(a)); assert.equal(tokenIn(a),tokenIn(b)); assert.ok(!b.includes('This code was already used.'));
 assert.ok((await form(base,'/s/'+id,{t:STEP,k:TAG,adult:'yes',f:otherNonce})).includes('This code was already used.'));
});
test('No ends the flow',async()=>{
 const {base,store,id,TAG}=await fresh();
 assert.ok((await form(base,'/s/'+id,{t:STEP,k:TAG,adult:'no',f:'a'.repeat(16)})).includes('YoVouch is for adults. Thank you anyway.'));
 assert.deepEqual(store.get(id).vouch.usedSteps,[]);
});
test('every refusal string',async()=>{
 const {base,vouch,p,id,secret}=await fresh();
 let res=await formRes(base,'/s/'+id,{t:STEP-2,k:qrTag(secret,STEP-2),adult:'yes',f:'1'.repeat(16)});
 assert.equal(res.status,400); assertPrivateHeaders(res);
 assert.ok((await res.text()).includes('This code is older than 3 minutes. Ask Thandi to show the current one.'));
 assert.ok((await page(base,'/s/'+id+'?t='+(STEP-2)+'&k='+qrTag(secret,STEP-2))).includes('This code is older than 3 minutes.'));
 res=await formRes(base,'/s',{ref:p.smsId,code:'000000',adult:'yes',f:'2'.repeat(16)});
 assert.equal(res.status,400);
 assert.ok((await res.text()).includes('This code did not match. Check the six digits with Thandi.'));
 assert.equal(vouch.events.read().at(-1).type,'code_refused'); assert.equal(vouch.events.read().at(-1).reason,'code_wrong');
 res=await formRes(base,'/s',{ref:'00000',code:'000000',adult:'yes',f:'3'.repeat(16)});
 assert.equal(res.status,404); assert.ok((await res.text()).includes('No card with this code'));
 for(let i=0;i<5;i++)await form(base,'/s/'+id,{code:'000000',adult:'yes'});
 res=await formRes(base,'/s/'+id,{code:spokenCode(secret,STEP),adult:'yes'});
 assert.equal(res.status,429); assert.ok((await res.text()).includes('Typing codes is paused for this card. Scan the code instead.'));
 await post(base,'/api/card/'+id+'/withdraw',{ownerSecret:p.ownerSecret});
 res=await formRes(base,'/s/'+id,{t:STEP,k:qrTag(secret,STEP),adult:'yes',f:'4'.repeat(16)});
 assert.equal(res.status,410); assert.ok((await res.text()).includes('This card was withdrawn by its owner.'));
 assert.equal((await fetch(base+'/s/'+id)).status,410);
 assert.equal((await fetch(base+'/s/ABCDEFGHJK')).status,404);
});
test('typed path accepts the 5-digit card number and the code with a space',async()=>{
 const {base,p,id,secret}=await fresh();
 const typed=await page(base,'/s');
 assert.ok(typed.includes('Card code (6 characters) or card number (5 digits)')&&typed.includes('The 6 digits'));
 assert.ok(Buffer.byteLength(typed)<=4096);
 const known=await page(base,'/s/'+id);
 assert.ok(known.includes('Vouch for Thandi, hairdresser')&&known.includes('The 6 digits')&&!known.includes('Card code (6 characters)'));
 assert.ok((await form(base,'/s',{ref:p.smsId,code:formatSpoken(spokenCode(secret,STEP)),adult:'yes',f:'a'.repeat(16)})).includes('What did Thandi do?'));
});
test('typed path accepts a lower-case card code on /s and the digits alone on /s/:cardId',async()=>{
 const {base,p,id,secret}=await fresh();
 assert.ok((await form(base,'/s',{ref:p.code.toLowerCase(),code:spokenCode(secret,STEP),adult:'yes'})).includes('What did Thandi do?'));
 assert.ok((await form(base,'/s/'+id,{code:spokenCode(secret,STEP-1),adult:'yes'})).includes('What did Thandi do?'));
});
test('on the worker phone',async()=>{
 const {base,vouch,id,TAG}=await fresh();
 const html=await page(base,'/s/'+id+'?t='+STEP+'&k='+TAG+'&w=1');
 assert.ok(html.includes("You are using Thandi's phone. You will text from your own phone."));
 assert.ok(html.includes('name="w" value="1"'));
 const chips=await form(base,'/s/'+id,{t:STEP,k:TAG,adult:'yes',w:'1',f:'c'.repeat(16)});
 const s=vouch.sessions.get(tokenIn(chips));
 assert.equal(s.onWorkerPhone,true); assert.equal(s.proof.onWorkerPhone,true);
});
test('open JSON form',async()=>{
 const {base,vouch,p,id,TAG,secret}=await fresh();
 const r=await post(base,'/api/vouch/open',{cardId:id,proof:{method:'qr',t:STEP,k:TAG},voucher:{kind:'customer'},onWorkerPhone:false,channel:'web',lang:'xh'});
 assert.match(r.vouchToken,/^[0-9a-f]{24}$/);
 assert.deepEqual(r.worker,{firstName:'Thandi',trade:'Hairdresser'});
 assert.deepEqual(r.proof,{method:'qr',step:STEP,provedAt:'2026-11-16T14:40:12.000Z'});
 assert.equal(r.bind,'demo'); assert.equal(r.expiresInMs,1800000);
 assert.equal(vouch.sessions.get(r.vouchToken).lang,'xh');
 const again=await fetch(base+'/api/vouch/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:id,proof:{method:'qr',t:STEP,k:TAG},voucher:{kind:'customer'}})});
 assert.equal(again.status,409); assertPrivateHeaders(again);
 assert.deepEqual((await again.json()).error,{code:'code_used',message:'This code was already used.',retryable:false});
 const typed=await post(base,'/api/vouch/open',{proof:{method:'code',smsId:p.smsId,code:spokenCode(secret,STEP-1)},voucher:{kind:'customer'}});
 assert.equal(typed.proof.method,'code');
 const worker=await fetch(base+'/api/vouch/open',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:id,proof:{method:'qr',t:STEP,k:TAG},voucher:{kind:'worker'}})});
 assert.equal(worker.status,400); assert.equal((await worker.json()).error.code,'invalid_input');
});
test('sessions: TTL 30 minutes, nonce and session code lookups, the 500 cap',()=>{
 const clock={t:0};let n=0;
 const random=size=>{const b=Buffer.alloc(size);b.writeUInt32BE(++n,0);return b;};
 const s=createVouchSessions({now:()=>clock.t,random});
 const {vouchToken,session}=s.open({cardId:'ABCDEFGHJK',proof:{method:'qr'},voucher:{kind:'customer'},onWorkerPhone:false,channel:'web',lang:'en',adult:true,formNonce:'a'.repeat(16)});
 assert.match(vouchToken,/^[0-9a-f]{24}$/);
 assert.deepEqual(Object.keys(session),['vouchToken','cardId','proof','voucher','onWorkerPhone','channel','lang','step','adult','createdAt','chips','words','clip','disclose','bind','demo','recentVouchId']);
 assert.equal(s.byNonce('a'.repeat(16)),vouchToken); assert.equal(s.get(vouchToken),session);
 session.bind={sessionCode:'K7M2PX'}; assert.equal(s.bySessionCode('K7M2PX'),session); assert.equal(s.bySessionCode('ZZZZZZ'),null);
 clock.t=30*60*1000+1; assert.equal(s.get(vouchToken),null); assert.equal(s.byNonce('a'.repeat(16)),null);
 for(let i=0;i<505;i++)s.open({cardId:'ABCDEFGHJK'});
 assert.equal(s.size(),500);
 const last=s.open({cardId:'ABCDEFGHJK'}); s.delete(last.vouchToken); assert.equal(s.get(last.vouchToken),null);
});
test('chips by trade, with a default',()=>{
 assert.deepEqual(chipsFor('hair'),['Braids','Cornrows','Weave','Relaxer','Cut','Other']);
 assert.deepEqual(chipsFor('labourer'),['Paving','Plastering','Painting','Digging','Loading','Other']);
 assert.deepEqual(chipsFor(null),['Work done','Other']); assert.deepEqual(chipsFor('other'),['Work done','Other']);
 const all=require('../data/vouch-chips.json');
 for(const [k,v] of Object.entries(all)){assert.equal(v.at(-1),'Other',k);if(k!=='default')assert.ok(v.length>=4,k);}
});
test('readRawBody returns the bytes and refuses a body over the cap',async()=>{
 const {readRawBody}=require('../server.js');
 const req=(parts,headers={})=>{const r=new EventEmitter();r.headers=headers;r.resume=()=>{};setImmediate(()=>{for(const p of parts)r.emit('data',Buffer.from(p));r.emit('end');});return r;};
 assert.deepEqual(await readRawBody(req(['ab','cd']),10),Buffer.from('abcd'));
 await assert.rejects(readRawBody(req(['abcdef','ghijkl']),10),err=>err.name==='InputError');
 await assert.rejects(readRawBody(req([],{'content-length':'11'}),10),err=>err.name==='InputError');
});
