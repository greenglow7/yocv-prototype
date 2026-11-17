const {test}=require('node:test');
const assert=require('node:assert/strict');
const {tierLabel,finePrint}=require('../server/card/vouch-lines.js');
const {STRINGS}=require('../server/card/render.js');
const {runSweep}=require('../server/card/sweep.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {bootVouch,publishPersona,post,form,page}=require('./helpers/vouch-boot.cjs');

const DAY=86400000;
const CUSTOMER='0821110191';
const REQUEST_URL=/^https:\/\/yocard\.example\/a\/([A-Z2-9]{10})$/;
const YES_SCAN=/Text YES ([A-Z2-9]{6}) to 12345 from your phone\. We never send the first message\./;
const CAP='You already have 10 open requests. Wait for a reply or for one to expire.';
const forward=(first,url)=>'Forward this to a past customer: "'+first+' asks you to vouch for work they did for you. It takes one minute: '+url+'"';

async function rawForm(base,route,fields){
 return fetch(base+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields).toString(),redirect:'manual'});
}
const tokenIn=html=>(/action="\/api\/vouch\/([0-9a-f]{24})\/chips"/.exec(html)||[])[1];
const nonceIn=html=>(/name="f" value="([0-9a-f]{16})"/.exec(html)||[])[1];
const create=(b,c)=>post(b.base,'/api/request/create',{cardId:c.cardId,cardToken:c.cardToken});

test('create, open once, label',async()=>{
 const b=await bootVouch({env:{sim:true}}),{base,vouch}=b;
 const th=await publishPersona(base,'thandi',{trade:'hair'});
 const r=await create(b,th);
 assert.match(r.url,REQUEST_URL);
 assert.equal(r.text,forward('Thandi',r.url));
 assert.equal(r.text,'Forward this to a past customer: "Thandi asks you to vouch for work they did for you. It takes one minute: '+r.url+'"');
 const rq=r.requestId,landing=await fetch(base+'/a/'+rq);
 assert.equal(landing.status,200);
 assertPrivateHeaders(landing);
 const html=await landing.text();
 assertHonestPage(html); assert.ok(Buffer.byteLength(html)<=4096);
 assert.ok(html.includes('Thandi asked you to vouch for work they did for you. This vouch is marked "by request, from a link sent later".'));
 assert.ok(html.includes('Are you 18 or older?')&&html.includes('action="/a/'+rq+'"'));
 assert.ok(vouch.requestStore.get(rq).usedAt===null,'the landing GET consumes nothing');
 const f=nonceIn(html);
 assert.ok(f);
 // "No" ends the flow and consumes nothing.
 assert.ok((await form(base,'/a/'+rq,{adult:'no',f})).includes('YoVouch is for adults. Thank you anyway.'));
 assert.equal(vouch.requestStore.get(rq).usedAt,null);
 const chips=await form(base,'/a/'+rq,{adult:'yes',f});
 const s=tokenIn(chips);
 assert.ok(s,'no session: '+chips.slice(0,300));
 assert.ok(chips.includes('Would you hire Thandi again?'));
 // A double tap posts the same nonce and re-opens the same session.
 assert.equal(tokenIn(await form(base,'/a/'+rq,{adult:'yes',f})),s);
 await form(base,`/api/vouch/${s}/chips`,{work:'Braids',when:'last month',howOften:'regularly',hireAgain:'yes'});
 await form(base,`/s/t/${s}`,{step:'disclose',showMe:'name',firstName:'Nomsa'});
 const bind=await form(base,`/api/vouch/${s}/bind`,{});
 await post(base,'/api/sim/sms',{from:CUSTOMER,text:'YES '+bind.match(YES_SCAN)[1]});
 const rb=await page(base,`/s/t/${s}`);
 const label='Said by a customer · by request, from a link sent later · confirmed by them, not by Yoma';
 assert.ok(rb.includes(label),rb);
 const done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'});
 assert.ok(done.includes('Thanks. Your vouch for Thandi is on their card.'),done);
 const [file]=vouch.vouchStore.listForCard(th.cardId),rec=file.record;
 assert.equal(rec.kind,'customer');
 assert.deepEqual({method:rec.proof.method,requestId:rec.proof.requestId,step:rec.proof.step,channel:rec.proof.channel,onWorkerPhone:rec.proof.onWorkerPhone},
  {method:'request',requestId:rq,step:null,channel:'web',onWorkerPhone:false});
 assert.ok(rec.proof.provedAt);
 assert.equal(rec.voucher.phoneConfirmedBy,'sms_bind');
 assert.equal(tierLabel(rec,'Thandi'),label);
 assert.deepEqual(finePrint(rec,'Thandi'),[STRINGS.fineRequest('Thandi'),STRINGS.numberSmsBind]);
 assert.ok(vouch.events.read().some(e=>e.type==='vouch_confirmed'&&e.vouchId===rec.vouchId&&e.requestId===rq&&e.method==='request'));
 // Used: a new nonce, the landing page and the JSON open all read requestUsed.
 const again=await rawForm(base,'/a/'+rq,{adult:'yes',f:'0123456789abcdef'});
 assert.equal(again.status,409);
 assert.ok((await again.text()).includes('This request was already used.'));
 const gone=await fetch(base+'/a/'+rq);
 assert.equal(gone.status,409); assert.ok((await gone.text()).includes('This request was already used.'));
 const j=await post(base,'/api/vouch/open',{proof:{method:'request',requestId:rq},voucher:{kind:'customer'}});
 assert.deepEqual([j.error.code,j.error.message],['request_used','This request was already used.']);
 // Expired: a fresh request read 15 days later.
 const r2=await create(b,th);
 b.clock.t+=15*DAY;
 const exp=await fetch(base+'/a/'+r2.requestId);
 assert.equal(exp.status,410);
 assert.ok((await exp.text()).includes('This request has expired. Ask Thandi for a new one.'));
 const ex2=await rawForm(base,'/a/'+r2.requestId,{adult:'yes',f:'fedcba9876543210'});
 assert.equal(ex2.status,410);
 assert.ok((await ex2.text()).includes('This request has expired. Ask Thandi for a new one.'));
 // A missing request, and a request for another card, give not_found.
 assert.equal((await fetch(base+'/a/ABCDEFGHJK')).status,404);
 const si=await publishPersona(base,'sipho',{trade:'labourer',area:'Umlazi'});
 const r3=await create(b,si);
 const other=await post(base,'/api/vouch/open',{cardId:th.cardId,proof:{method:'request',requestId:r3.requestId},voucher:{kind:'customer'}});
 assert.equal(other.error.code,'not_found');
 assert.equal(vouch.requestStore.get(r3.requestId).usedAt,null);
 // The JSON form of the open step.
 const ok=await post(base,'/api/vouch/open',{proof:{method:'request',requestId:r3.requestId},voucher:{kind:'customer'}});
 assert.match(ok.vouchToken,/^[0-9a-f]{24}$/);
 assert.deepEqual([ok.proof.method,ok.proof.step,ok.bind,ok.worker.firstName],['request',null,'sms','Sipho']);
});

test('a worker answers a request from their own page',async()=>{
 const b=await bootVouch({env:{sim:true}}),{base,vouch}=b;
 const bo=await publishPersona(base,'bongani',{trade:'labourer',area:'Umlazi'});
 const si=await publishPersona(base,'sipho',{trade:'labourer',area:'Umlazi'});
 const r=await create(b,si);
 const vp=await fetch(base+`/my/${bo.cardId}/${bo.cardToken}/vouch`);
 assertPrivateHeaders(vp);
 const vh=await vp.text();
 assertHonestPage(vh); assert.ok(Buffer.byteLength(vh)<=4096);
 assert.ok(vh.includes('Or paste the request link you were sent'));
 assert.ok(vh.includes(`action="/my/${bo.cardId}/${bo.cardToken}/vouch"`)&&vh.includes('name="request"'));
 const chips=await form(base,`/my/${bo.cardId}/${bo.cardToken}/vouch`,{request:' '+r.url+' ',adult:'yes',f:nonceIn(vh)});
 const s=tokenIn(chips);
 assert.ok(s,'no worker session: '+chips.slice(0,400));
 assert.ok(chips.includes('Would you work with Sipho again?'));
 await form(base,`/api/vouch/${s}/chips`,{work:'Paving',when:'this month',howOften:'once',hireAgain:'yes'});
 await form(base,`/s/t/${s}`,{step:'disclose',showCard:'yes'});
 const label="Vouched by another worker · Bongani's card · by request, from a link sent later · confirmed by them, not by Yoma";
 const rb=await page(base,`/s/t/${s}`);
 assert.ok(rb.includes(label),rb);
 const done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'});
 assert.ok(done.includes('Your vouch for Sipho is on their card.'),done);
 const [file]=vouch.vouchStore.listForCard(si.cardId),rec=file.record;
 assert.equal(rec.kind,'worker');
 assert.deepEqual([rec.proof.method,rec.proof.requestId,rec.voucher.cardId,rec.voucher.phoneConfirmedBy],['request',r.requestId,bo.cardId,'card']);
 assert.equal(tierLabel(rec,'Sipho'),label);
 assert.ok(vouch.events.read().some(e=>e.type==='vouch_confirmed'&&e.vouchId===rec.vouchId&&e.requestId===r.requestId&&e.method==='request'&&e.kind==='worker'));
 // The bare id works too; a used one comes back to the form with its message.
 const r2=await create(b,si);
 assert.ok(tokenIn(await form(base,`/my/${bo.cardId}/${bo.cardToken}/vouch`,{request:r2.requestId.toLowerCase(),adult:'yes'})));
 const used=await rawForm(base,`/my/${bo.cardId}/${bo.cardToken}/vouch`,{request:r2.requestId,adult:'yes'});
 assert.equal(used.status,409);
 const usedHtml=await used.text();
 assert.ok(usedHtml.includes('This request was already used.')&&usedHtml.includes('name="request"'));
 // Not a request link; the worker's own request; the owner secret never opens the page.
 assert.equal((await rawForm(base,`/my/${bo.cardId}/${bo.cardToken}/vouch`,{request:'hello',adult:'yes'})).status,404);
 const own=await create(b,bo);
 const self=await rawForm(base,`/my/${bo.cardId}/${bo.cardToken}/vouch`,{request:own.url,adult:'yes'});
 assert.equal(self.status,403);
 assert.equal(vouch.requestStore.get(own.requestId).usedAt,null);
 assert.equal((await rawForm(base,`/my/${bo.cardId}/${bo.ownerSecret.slice(0,16)}/vouch`,{request:r2.url,adult:'yes'})).status,404);
 // A new card that is not eligible yet is refused, and the request stays open.
 const r3=await create(b,bo);
 const ne=await rawForm(base,`/my/${si.cardId}/${si.cardToken}/vouch`,{request:r3.url,adult:'yes'});
 assert.equal(ne.status,403);
 assert.equal(vouch.requestStore.get(r3.requestId).usedAt,null);
});

test('the eleventh open request is refused; referral requests do not count',async()=>{
 const b=await bootVouch({env:{sim:true}}),{base,vouch}=b;
 const th=await publishPersona(base,'thandi',{trade:'hair'});
 vouch.requestStore.create({kind:'referral',cardId:th.cardId,ttlMs:30*DAY,jobPostId:'ABCDEFGHJK',evidenceId:'c1',orgName:'Alison Learning'});
 const my=await page(base,`/my/${th.cardId}/${th.cardToken}`);
 assert.ok(my.includes('Request a vouch from a past customer')&&my.includes(`action="/my/${th.cardId}/${th.cardToken}/request"`));
 const made=await rawForm(base,`/my/${th.cardId}/${th.cardToken}/request`,{});
 assert.equal(made.status,200);
 assertPrivateHeaders(made);
 const madeHtml=await made.text();
 assertHonestPage(madeHtml);
 const url=(/https:\/\/yocard\.example\/a\/[A-Z2-9]{10}/.exec(madeHtml)||[])[0];
 assert.ok(url&&madeHtml.includes(forward('Thandi',url)),madeHtml);
 for(let i=0;i<9;i++)assert.ok((await create(b,th)).requestId);
 assert.equal(vouch.requestStore.listOpen(th.cardId,'vouch').length,10);
 const res=await fetch(base+'/api/request/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:th.cardId,cardToken:th.cardToken})});
 assert.equal(res.status,429);
 assertPrivateHeaders(res);
 assert.deepEqual((await res.json()).error,{code:'request_cap',message:CAP,retryable:false});
 const capped=await rawForm(base,`/my/${th.cardId}/${th.cardToken}/request`,{});
 assert.equal(capped.status,429);
 assert.ok((await capped.text()).includes(CAP));
 // A used request is no longer open, so one more can be made.
 const [first]=vouch.requestStore.listOpen(th.cardId,'vouch');
 vouch.requestStore.markUsed(first.requestId);
 assert.ok((await create(b,th)).requestId);
 // Wrong token, the owner secret and a withdrawn card.
 assert.equal((await post(base,'/api/request/create',{cardId:th.cardId,cardToken:'0'.repeat(16)})).error.code,'not_found');
 assert.equal((await post(base,'/api/request/create',{cardId:th.cardId,cardToken:th.ownerSecret})).error.code,'not_found');
});

test('REQUEST by SMS from the confirmed number in local format',async()=>{
 const b=await bootVouch({env:{sim:true}}),{base,vouch}=b;
 const th=await publishPersona(base,'thandi',{trade:'hair'});
 const r=await post(base,'/api/sim/sms',{from:'0735550147',text:'request'});
 assert.equal(r.replies.length,1);
 const url=(/https:\/\/yocard\.example\/a\/[A-Z2-9]{10}/.exec(r.replies[0])||[])[0];
 assert.ok(url,r.replies[0]);
 assert.equal(r.replies[0],forward('Thandi',url));
 const [open]=vouch.requestStore.listOpen(th.cardId,'vouch');
 assert.equal(open.requestId,url.slice(-10));
 assert.deepEqual((await post(base,'/api/sim/sms',{from:'0821110199',text:'REQUEST'})).replies,
  ['No card is linked to this number. Make your card at https://yocard.example/card.html on any phone, then text CODE again.']);
 for(let i=0;i<9;i++)await create(b,th);
 assert.deepEqual((await post(base,'/api/sim/sms',{from:'+27735550147',text:'Request.'})).replies,[CAP]);
});

test('events: request_created and request_opened carry ids only',async()=>{
 const b=await bootVouch({env:{sim:true}}),{base,vouch}=b;
 const th=await publishPersona(base,'thandi',{trade:'hair'});
 const r=await create(b,th);
 const html=await page(base,'/a/'+r.requestId);
 await form(base,'/a/'+r.requestId,{adult:'yes',f:nonceIn(html)});
 const ev=vouch.events.read().filter(e=>e.type==='request_created'||e.type==='request_opened');
 assert.deepEqual(ev.map(e=>e.type),['request_created','request_opened']);
 for(const e of ev){
  assert.deepEqual(Object.keys(e).sort(),['at','cardId','demo','kind','requestId','type']);
  assert.deepEqual([e.requestId,e.cardId,e.demo,e.kind],[r.requestId,th.cardId,true,'vouch']);
  assert.ok(!/\+?\d{9,}/.test(JSON.stringify(e)),'no phone-like value');
 }
 assert.ok(vouch.events.read().some(e=>e.type==='vouch_opened'&&e.method==='request'&&e.cardId===th.cardId));
});

test('sweep deletes expired requests',async()=>{
 const b=await bootVouch({env:{sim:true}}),{base,vouch}=b;
 const th=await publishPersona(base,'thandi',{trade:'hair'});
 const r=await create(b,th);
 assert.equal(Date.parse(vouch.requestStore.get(r.requestId).expiresAt),b.clock.t+14*DAY);
 b.clock.t+=13*DAY;
 runSweep(vouch);
 assert.ok(vouch.requestStore.get(r.requestId));
 b.clock.t+=2*DAY;
 runSweep(vouch);
 assert.equal(vouch.requestStore.get(r.requestId),null);
 assert.equal((await fetch(base+'/a/'+r.requestId)).status,404);
});
