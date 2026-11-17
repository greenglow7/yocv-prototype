const {test}=require('node:test');
const assert=require('node:assert/strict');
const {qrTag,counterAt}=require('../server/card/vouchcode.js');
const {keyedHash}=require('../server/card/vouchers.js');
const {verifyJwt}=require('../server/card/sign.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {NOW,bootVouch,publishPersona,post,form,page,get}=require('./helpers/vouch-boot.cjs');
let lines={}; try {lines=require('../server/card/vouch-lines.js')}catch{}
let routesMod={}; try {routesMod=require('../server/card/vouch-routes.js')}catch{}
let outboxMod={}; try {outboxMod=require('../server/card/outbox.js')}catch{}
const {checkWords,parseChips,finePrint,tierItem}=lines,{gatewaySecretOk}=routesMod,{createOutbox}=outboxMod;
const draft=require('../server/card/draft.js');

const CUSTOMER='0821110191',CUSTOMER_E164='+27821110191';
const YES_SCAN=/Text YES ([A-Z2-9]{6}) to 12345 from your phone\. We never send the first message\./;
const YES_PHONE=/Text YES ([A-Z2-9]{6}) to 12345 from your own phone, not this one\./;
const WITHDRAW_AT=/Withdraw any time: https:\/\/yocard\.example\/v\/[A-Z2-9]{10}\/withdraw\?w=[0-9a-f]{16}\. Vouch ([A-Z2-9]{10})\./;

async function fresh(opts){
 const boot=await bootVouch(opts);
 const p=await publishPersona(boot.base,'thandi',{trade:'hair'});
 return {...boot,p,id:p.cardId,token:p.cardToken};
}
// The scan GET and the 18-or-older POST at the current clock step; returns the vouch token.
async function openScan(b,{w=false}={}){
 const secret=b.store.get(b.id).vouch.secret,step=counterAt(b.clock.t),k=qrTag(secret,step);
 const html=await page(b.base,'/s/'+b.id+'?t='+step+'&k='+k+(w?'&w=1':''));
 const f=(/name="f" value="([0-9a-f]{16})"/.exec(html)||[])[1];
 const chips=await form(b.base,'/s/'+b.id,{t:step,k,adult:'yes',f,...(w?{w:'1'}:{})});
 const token=(/action="\/api\/vouch\/([0-9a-f]{24})\/chips"/.exec(chips)||[])[1];
 assert.ok(token,'no vouch session opened');
 return token;
}
const CHIPS={work:'Braids',when:'this month',howOften:'a few times',hireAgain:'yes'};
// Chips, disclosure and the bind page; returns the bind page HTML.
async function toBind(b,s,{words,showMe='name',firstName='Nomsa'}={}){
 await form(b.base,'/api/vouch/'+s+'/chips',{...CHIPS,...(words?{words}:{})});
 await form(b.base,'/s/t/'+s,{step:'disclose',showMe,firstName});
 return form(b.base,'/api/vouch/'+s+'/bind',{});
}
async function textYes(b,html,from=CUSTOMER,re=YES_SCAN){
 const code=html.match(re)[1];
 return post(b.base,'/api/sim/sms',{from,text:'YES '+code});
}
const nextStep=b=>{b.clock.t+=90000;};

// ---- One shared simulator boot for the scan path and Show words ----
let S=null,vid=null;
async function shared(){if(!S)S=await fresh({env:{sim:true}});return S;}

test('scan path end to end with the simulator binding',async()=>{
 const b=await shared(),{base,vouch,key}=b;
 const s=await openScan(b);
 await form(base,`/api/vouch/${s}/chips`,{work:'Braids',when:'this month',howOften:'a few times',hireAgain:'yes',words:'She did my braids three times this year.'});
 const disclose=await page(base,`/s/t/${s}`);
 assert.ok(disclose.includes("On Thandi's card show me as:")&&disclose.includes('Attach my 15-second clip. A clip makes the vouch stronger.'));
 assert.ok(!/name="attachClip"[^>]*checked/.test(disclose)); assertHonestPage(disclose); assert.ok(Buffer.byteLength(disclose)<=4096);
 await form(base,`/s/t/${s}`,{step:'disclose',showMe:'name',firstName:'Nomsa'});
 const bindRes=await fetch(base+`/api/vouch/${s}/bind`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:''});
 assertPrivateHeaders(bindRes);
 const bindHtml=await bindRes.text(); assertHonestPage(bindHtml); assert.ok(Buffer.byteLength(bindHtml)<=4096,'bind page '+Buffer.byteLength(bindHtml));
 const code=bindHtml.match(YES_SCAN)[1];
 assert.ok(bindHtml.includes('Waiting for your text. Nothing has been recorded yet.'));
 assert.ok(bindHtml.includes('I have sent it')&&bindHtml.includes(`href="/s/t/${s}"`));
 assert.deepEqual(await get(base,`/api/vouch/${s}/bind`),{bound:false,phoneLast3:null,error:null});
 assert.deepEqual(await post(base,'/api/sim/sms',{from:'0821110191',text:'yes '+code.toLowerCase()+'.'}),{replies:[]});   // Review Focus 1
 assert.deepEqual(await get(base,`/api/vouch/${s}/bind`),{bound:true,phoneLast3:'191',error:null});
 assert.deepEqual(await post(base,'/api/sim/sms',{from:'0829990000',text:'YES '+code}),{replies:[]});   // later texts are ignored
 assert.equal((await get(base,`/api/vouch/${s}/bind`)).phoneLast3,'191');
 const rb=await page(base,`/s/t/${s}`);
 assertHonestPage(rb); assert.ok(Buffer.byteLength(rb)<=4096,'read-back page '+Buffer.byteLength(rb));
 assert.ok(rb.includes("Read it. This is exactly what will be on Thandi's card:"));
 assert.ok(rb.includes('Got it. Your number ends in ···191.'));
 assert.ok(rb.includes('Braids, November 2026, a few times. Would hire again: yes.'));
 assert.ok(rb.includes('Said by a customer · code matched on 16 November 2026 · confirmed by them, not by Yoma'));
 assert.ok(rb.includes('Your choices show at once. Your words and clip show once Thandi has seen them.'));
 assert.ok(rb.includes('You can withdraw it any time.')&&rb.includes('Publish this line')&&rb.includes('Change something'));
 assert.ok(rb.includes('name="consent" value="yes"'));
 const done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'});
 assertHonestPage(done); assert.ok(Buffer.byteLength(done)<=4096);
 assert.ok(done.includes('Thanks. Your vouch for Thandi is on their card.'));
 [,vid]=done.match(WITHDRAW_AT);
 assert.equal(vouch.outbox.all().length,0);                         // the scan path sends nothing
 const v=await get(base,'/v/'+vid+'.json');
 assert.deepEqual(v.held,['words','clip']); assert.equal(v.record.fields.words,null);
 assert.equal(v.record.line,'Braids, November 2026, a few times. Would hire again: yes.');
 assert.equal(v.record.voucher.phoneConfirmedBy,'sms_bind'); assert.equal(v.record.voucher.label,'Nomsa ···191');
 assert.equal(v.record.voucher.adultSelfDeclared,true); assert.equal(v.record.lang,'en');
 assert.deepEqual(v.record.generation,{mode:'sample',transcription:'typed'});
 assert.equal(v.record.visits,1); assert.equal(v.record.confirmedAt,new Date(b.clock.t).toISOString());
 assert.equal(verifyJwt(key,v.jwt).sub,vid);
 assert.ok(!JSON.stringify(v).includes('She did my braids'));
 const file=vouch.vouchStore.get(vid);
 assert.equal(file.held.words,'She did my braids three times this year.'); assert.equal(file.held.wordsSource,'typed');
 assert.equal(file.private.voucherKey,keyedHash(vouch.hashKey,CUSTOMER_E164));
 assert.equal(vouch.voucherFiles.read(file.private.voucherKey).sessions.length,1);
 assert.equal(vouch.voucherFiles.read(file.private.voucherKey).binds.length,1);
 assert.equal(vouch.sessions.get(s),null);
 const ev=vouch.events.read().find(e=>e.type==='vouch_confirmed');
 assert.deepEqual({...ev,at:null},{at:null,type:'vouch_confirmed',vouchId:vid,cardId:b.id,demo:true,channel:'web',method:'qr',kind:'customer',onWorkerPhone:false});
 assert.ok(!JSON.stringify(vouch.events.read()).includes('0821110191'));
});
test('Show words re-signs with the words',async()=>{
 const b=await shared(),{base,key,id,token}=b;
 assert.ok(vid,'needs the first test');
 const status=await fetch(base+`/my/${id}/${token}/status.json`);
 assertPrivateHeaders(status);
 assert.deepEqual(await status.json(),{vouchCount:1,lastVouchAt:new Date(b.clock.t).toISOString(),wordsWaiting:1});
 const my=await page(base,`/my/${id}/${token}`);
 assert.ok(my.includes('Your vouches')&&my.includes('Show words and clip')&&my.includes('1 lines have words waiting for you.'));
 assert.ok(my.includes('A vouch is on your card.')&&my.includes('Workers with one customer vouch got far more requests (Biscate, World Bank 2021).'));
 assert.ok(my.includes('"She did my braids three times this year."'),'the worker reads the held words on their own page before Show (spec 5.7)');
 assertPrivateHeaders(await fetch(base+`/my/${id}/${token}`)); assert.ok(Buffer.byteLength(my)<=13312,'worker page '+Buffer.byteLength(my));
 const before=await get(base,'/v/'+vid+'.json');
 b.clock.t+=60000;                                                    // a later iat needs a later clock
 await form(base,`/my/${id}/${token}/show-words`,{vouchId:vid});
 const v=await get(base,'/v/'+vid+'.json');
 assert.deepEqual(v.held,[]); assert.ok(v.record.line.endsWith('"She did my braids three times this year."'));
 assert.equal(v.record.fields.wordsSource,'typed');
 assert.ok(verifyJwt(key,v.jwt).iat>verifyJwt(key,before.jwt).iat);
 assert.equal((await get(base,`/my/${id}/${token}/status.json`)).wordsWaiting,0);
});
test('chips map to the stored enums',()=>{
 const ctx={chips:['Braids','Cornrows','Weave','Relaxer','Cut','Other'],nowMs:NOW,country:'South Africa'};
 const base={work:'Braids',when:'this month',howOften:'once',hireAgain:'yes'};
 assert.deepEqual(parseChips({work:'Other',other:'Locs',when:'earlier',month:'2026-03',howOften:'rather not say',hireAgain:'rather not say'},ctx).chips,
  {work:'Locs',when:'2026-03',howOften:'not stated',hireAgain:'not stated'});
 assert.equal(parseChips({...base,work:'other',other:'Locs'},ctx).chips.work,'Locs');   // the no-JS form value
 assert.equal(parseChips(base,ctx).chips.when,'2026-11');
 assert.equal(parseChips({...base,when:'last month'},ctx).chips.when,'2026-10');
 assert.equal(parseChips({...base,when:'last month'},{...ctx,nowMs:Date.parse('2026-01-05T10:00:00Z')}).chips.when,'2025-12');
 assert.equal(parseChips({...base,when:'this month'},{...ctx,nowMs:Date.parse('2026-11-30T23:30:00Z')}).chips.when,'2026-12');   // local time, UTC+2
 assert.equal(parseChips({...base,when:'earlier'},ctx).chips.when,'earlier');
 assert.equal(parseChips({...base,when:'earlier',month:''},ctx).chips.when,'earlier');
 assert.deepEqual(parseChips({...base,when:'earlier',month:'2026-10'},ctx).fields,['when']);     // last month is not earlier
 assert.deepEqual(parseChips({...base,when:'earlier',month:'2024-10'},ctx).fields,['when']);     // over 24 months back
 assert.equal(parseChips({...base,when:'earlier',month:'2024-11'},ctx).chips.when,'2024-11');
 assert.deepEqual(parseChips({...base,howOften:'often'},ctx).fields,['howOften']);
 assert.deepEqual(parseChips({...base,hireAgain:'no'},ctx).fields,['hireAgain']);                 // there is no "no"
 assert.deepEqual(parseChips({...base,work:'Dreadlocks'},ctx).fields,['work']);
 assert.deepEqual(parseChips({...base,work:'Other',other:''},ctx).fields,['work']);
 assert.deepEqual(parseChips({...base,work:'Other',other:'x'.repeat(31)},ctx).fields,['work']);
 assert.deepEqual(parseChips({...base,work:'Other',other:'Certified locs'},ctx).fields,['work']);
 assert.deepEqual(parseChips({},ctx).fields,['work','when','howOften','hireAgain']);
});
test('on the worker phone the withdraw link goes by SMS to the phone that texted',async()=>{
 const b=await fresh({env:{sim:true}}),{base,vouch}=b;
 const s=await openScan(b,{w:true});
 const bind=await toBind(b,s);
 assert.ok(bind.includes('from your own phone, not this one'));
 assert.ok(bind.includes('After you publish, one SMS with your withdraw link goes to the phone that texted. Nothing else, ever.'));
 await textYes(b,bind,CUSTOMER,YES_PHONE);
 const rb=await page(base,`/s/t/${s}`);
 assert.ok(rb.includes("Said by a customer · code texted from their phone on 16 November 2026 · filled in on Thandi's phone"));
 const done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'});
 assert.ok(done.includes('Your withdraw link was sent to your phone.')&&!done.includes('/withdraw?w='));
 const sent=vouch.outbox.sent(CUSTOMER_E164);
 assert.equal(sent.length,1);
 assert.match(sent[0],/^Your vouch for Thandi is on their card\. Withdraw any time: .+\. Nobody will message you again\.$/);
 assert.match(sent[0],/https:\/\/yocard\.example\/v\/[A-Z2-9]{10}\/withdraw\?w=[0-9a-f]{16}/);
 const [file]=vouch.vouchStore.listForCard(b.id);
 assert.equal(file.record.proof.onWorkerPhone,true); assert.equal(file.record.voucher.phoneConfirmedBy,'sms_bind');
 assert.equal(file.held,null); assert.deepEqual(file.record.generation,{mode:'sample',transcription:'none'});
});
test('Review Focus: the worker-phone withdraw SMS survives a slow confirm',async()=>{
 const b=await fresh({env:{sim:true}}),{base,vouch}=b;
 const s=await openScan(b,{w:true});
 const bind=await toBind(b,s);
 await textYes(b,bind,CUSTOMER,YES_PHONE);
 const first=bind.match(YES_PHONE)[1];
 b.clock.t=NOW+16*60000;
 const again=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'});
 const second=again.match(YES_PHONE)[1];
 assert.notEqual(second,first);
 assert.equal(vouch.vouchStore.listForCard(b.id).length,0);
 assert.deepEqual(await get(base,`/api/vouch/${s}/bind`),{bound:false,phoneLast3:null,error:null});
 assert.equal(vouch.service.bindBySms('0829990000',second),'ignored');                 // one number per session
 await post(base,'/api/sim/sms',{from:CUSTOMER,text:'YES '+second});
 const done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'});
 assert.ok(done.includes('Your withdraw link was sent to your phone.'));
 assert.equal(vouch.vouchStore.listForCard(b.id).length,1);
 assert.equal(vouch.outbox.sent(CUSTOMER_E164).length,1);
});
test('demo fallback without a gateway, on both paths',async()=>{
 const b=await fresh(),{base,vouch}=b;
 // Scan path in demo mode.
 let s=await openScan(b);
 let bind=await toBind(b,s);
 assert.ok(bind.includes('Demo: no SMS gateway. In production you would text first; nothing is sent to this number.'));
 assert.ok(bind.includes('autocomplete="off"'));
 assert.ok(!YES_SCAN.test(bind)); assertHonestPage(bind);
 let r=await post(base,`/api/vouch/${s}/otp`,{phone:CUSTOMER});
 assert.match(r.demoCode,/^\d{6}$/);
 const rb=await page(base,`/s/t/${s}`);
 assert.ok(rb.includes(r.demoCode)&&rb.includes('name="otp"'));
 assertHonestPage(rb); assert.ok(Buffer.byteLength(rb)<=4096,'demo read-back '+Buffer.byteLength(rb)); assert.ok(Buffer.byteLength(bind)<=4096);
 let done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes',otp:r.demoCode});
 const [,first]=done.match(WITHDRAW_AT);
 const rec=(await get(base,'/v/'+first+'.json')).record;
 assert.equal(rec.voucher.phoneConfirmedBy,'demo');
 assert.ok(finePrint(rec,'Thandi').includes('Number typed by the voucher, not confirmed (demo)'));
 assert.equal(vouch.outbox.all().length,0);
 // Worker's phone in demo mode: the link is printed, labelled, and nothing is sent.
 nextStep(b);
 s=await openScan(b,{w:true});
 await toBind(b,s);
 r=await post(base,`/api/vouch/${s}/otp`,{phone:'0831112222'});
 done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes',otp:r.demoCode});
 assert.ok(done.includes('Demo: no SMS gateway, so the withdraw link is shown here. In production it goes only to the phone that texted.'));
 assert.ok(done.includes('/withdraw?w=')); assert.equal(vouch.outbox.all().length,0);
 const demoLine=vouch.vouchStore.listForCard(b.id).at(-1).record;
 assert.equal(demoLine.voucher.phoneConfirmedBy,'demo'); assert.equal(demoLine.proof.onWorkerPhone,true);
 // Three wrong codes end the session.
 nextStep(b);
 s=await openScan(b);
 await toBind(b,s);
 r=await post(base,`/api/vouch/${s}/otp`,{phone:'0841113333'});
 const wrong=r.demoCode==='000000'?'111111':'000000';
 await form(base,`/api/vouch/${s}/confirm`,{consent:'yes',otp:wrong});
 await form(base,`/api/vouch/${s}/confirm`,{consent:'yes',otp:wrong});
 const ended=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes',otp:wrong});
 assert.ok(ended.includes("That code did not match. Start again from Thandi's code."));
 assert.equal(vouch.sessions.get(s),null);
 // At most 3 codes per typed number per hour.
 for(let i=0;i<3;i++){nextStep(b);const t=await openScan(b);await toBind(b,t);r=await post(base,`/api/vouch/${t}/otp`,{phone:'0851114444'});if(i<2)assert.ok(r.demoCode);}
 nextStep(b);
 const t4=await openScan(b);await toBind(b,t4);
 r=await post(base,`/api/vouch/${t4}/otp`,{phone:'0851114444'});
 assert.equal(r.error?.message,'This number already received 3 codes this hour. Try again later.');
});
test('Review Focus 2: the owner number in local format is refused',async()=>{
 const b=await fresh({env:{sim:true}}),{base,vouch}=b;
 const s=await openScan(b);
 const code=(await toBind(b,s)).match(YES_SCAN)[1];
 assert.equal(vouch.service.bindBySms('0735550147',code),'self');          // Thandi's +27735550147
 assert.ok((await page(base,`/s/t/${s}`)).includes("This is the number on Thandi's own card."));
 assert.equal((await get(base,`/api/vouch/${s}/bind`)).bound,false);
 assert.equal(vouch.service.bindBySms('27735550147',code),'self');
 assert.equal(vouch.service.bindBySms(CUSTOMER,code),'bound');
});
test('caps fire at bind with their strings',async()=>{
 const b=await fresh({env:{sim:true}}),{base,vouch}=b;
 const k=keyedHash(vouch.hashKey,CUSTOMER_E164),iso=ms=>new Date(ms).toISOString();
 vouch.voucherFiles.update(k,f=>{f.sessions=[1,2,3].map(i=>({cardId:'C'+i,at:iso(NOW-(i+1)*3600000)}));});
 let s=await openScan(b);
 let code=(await toBind(b,s)).match(YES_SCAN)[1];
 assert.equal(vouch.service.bindBySms(CUSTOMER,code),'voucher_cap_day');
 assert.ok((await page(base,`/s/t/${s}`)).includes('This number has vouched three times today. Try again tomorrow.'));
 assert.equal((await get(base,`/api/vouch/${s}/bind`)).error,'This number has vouched three times today. Try again tomorrow.');
 vouch.voucherFiles.update(k,f=>{f.sessions=[];f.binds=[1,2,3].map(i=>({at:iso(NOW-i*60000)}));});
 nextStep(b);
 s=await openScan(b);
 code=(await toBind(b,s)).match(YES_SCAN)[1];
 assert.equal(vouch.service.bindBySms(CUSTOMER,code),'cap_binds');
 assert.ok((await page(base,`/s/t/${s}`)).includes('This number has already been used for 3 vouches this hour. Try again later.'));
 vouch.voucherFiles.update(k,f=>{f.binds=[];f.sessions=[1,2,3].map(i=>({cardId:'C'+i,at:iso(NOW-i*5*86400000)}));});
 assert.equal(vouch.service.bindBySms(CUSTOMER,code),'voucher_cap_cards');
 assert.ok((await page(base,`/s/t/${s}`)).includes('This number has vouched for three workers this month. Try again next month.'));
});
test('a repeat customer adds a visit or records nothing',async()=>{
 const b=await fresh({env:{sim:true}}),{base,vouch}=b;
 let s=await openScan(b);
 await textYes(b,await toBind(b,s));
 const [,first]=(await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'})).match(WITHDRAW_AT);
 nextStep(b);
 s=await openScan(b);
 await textYes(b,await toBind(b,s));
 let rb=await page(base,`/s/t/${s}`);
 assert.ok(rb.includes('You already vouched for Thandi this month. Add a visit instead?'));
 assert.ok(rb.includes('name="visit" value="yes"')&&rb.includes('name="visit" value="no"')&&rb.includes('>Yes<')&&rb.includes('>No<'));
 assert.ok(Buffer.byteLength(rb)<=4096);
 let done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes',visit:'yes'});
 assert.ok(done.includes('Added a visit to your vouch for Thandi. Nobody will message you again.'));
 const v=await get(base,'/v/'+first+'.json');
 assert.equal(v.record.visits,2);
 assert.ok(tierItem(v.record,'Thandi').line.endsWith(' 2 visits.'));
 assert.equal(vouch.vouchStore.listForCard(b.id).length,1);
 nextStep(b);
 s=await openScan(b);
 await textYes(b,await toBind(b,s));
 done=await form(base,`/api/vouch/${s}/confirm`,{consent:'yes',visit:'no'});
 assert.ok(done.includes('Nothing was recorded. Your earlier vouch for Thandi stays on their card.'));
 assert.equal(vouch.vouchStore.listForCard(b.id).length,1); assert.equal(vouch.sessions.get(s),null);
 b.clock.t+=61*60000;                                                 // past the 3 binds per hour
 s=await openScan(b);
 await textYes(b,await toBind(b,s));
 const res=await fetch(base+`/api/vouch/${s}/confirm`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({consent:true,adult:true})});
 assert.equal(res.status,409);
 const j=await res.json();
 assert.equal(j.error.code,'voucher_recent'); assert.equal(j.error.existingVouchId,first);
});
test('word checks',()=>{
 assert.equal(checkWords('Call me on 0821234567').reason,'no_numbers');
 assert.equal(checkWords('She is verified by Yoma').reason,'asserts_credential');   // noBannedClaims runs first (spec 5.7)
 assert.equal(checkWords('Certified braider').reason,'asserts_credential');
 assert.equal(checkWords('Trained at Alison Learning',{organisationNames:['Alison Learning']}).reason,'organisation_name');
 assert.equal(checkWords('Did 2 heads').ok,true);
 assert.deepEqual(checkWords('Did 2 heads'),{ok:true,text:'Did 2 heads',source:'typed'});
 assert.equal(checkWords('She is a shit braider').reason,'profanity');
 assert.equal(checkWords('She is a SHIT braider',{lang:'zu'}).reason,'profanity');   // the English list applies in every language
 assert.equal(checkWords('She did 3 heads',{transcript:'she did two heads'}).reason,'invented_number');
 assert.deepEqual(checkWords('She did 120 heads',{transcript:'she did 120 heads'}),{ok:true,text:'She did 120 heads',source:'clip'});
 assert.equal(checkWords('ẹ'.repeat(120)).ok,true); assert.equal(checkWords('ẹ'.repeat(121)).reason,'length');   // code points, not bytes
 assert.ok(draft.BANNED_CONFIRM_PHRASE.test('ID verified')&&typeof draft.namesOrganisation==='function');
 assert.ok(draft.PRICE instanceof RegExp&&draft.AREA instanceof RegExp&&typeof draft.findArea==='function');
});
test('a refused word shows the cannot-keep string',async()=>{
 const b=await fresh({env:{sim:true}}),{base}=b;
 const s=await openScan(b);
 const html=await form(base,`/api/vouch/${s}/chips`,{...CHIPS,words:'Call her on 0821234567'});
 assert.ok(html.includes('I could not keep this part. Type it or leave it out.'));
 const res=await post(base,`/api/vouch/${s}/words`,{text:'Trained at Alison Learning',lang:'en'});
 assert.equal(res.error.code,'organisation_name'); assert.equal(res.error.message,'I could not keep this part. Type it or leave it out.');
 assert.deepEqual(await post(base,`/api/vouch/${s}/words`,{text:'Neat and kind.',lang:'en'}),{text:'Neat and kind.'});
});
test('status.json, hide and show again',async()=>{
 const b=await fresh({env:{sim:true}}),{base,id,token}=b;
 assert.deepEqual(await get(base,`/my/${id}/${token}/status.json`),{vouchCount:0,lastVouchAt:null,wordsWaiting:0});
 const s=await openScan(b);
 await textYes(b,await toBind(b,s,{words:'Neat and kind.'}));
 const [,v]=(await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'})).match(WITHDRAW_AT);
 const res=await fetch(base+`/my/${id}/${token}/status.json`);
 assertPrivateHeaders(res);
 assert.deepEqual(await res.json(),{vouchCount:1,lastVouchAt:new Date(b.clock.t).toISOString(),wordsWaiting:1});
 const my=await page(base,`/my/${id}/${token}`);
 assert.ok(my.includes('>Hide<')); assert.ok(Buffer.byteLength(my)<=13312,'worker page '+Buffer.byteLength(my));
 await form(base,`/my/${id}/${token}/hide`,{vouchId:v});
 assert.equal((await fetch(base+'/v/'+v+'.json')).status,410);
 assert.ok((await page(base,`/my/${id}/${token}`)).includes('>Show again<'));
 assert.equal((await get(base,`/my/${id}/${token}/status.json`)).vouchCount,0);
 await form(base,`/my/${id}/${token}/show`,{vouchId:v});
 assert.equal((await fetch(base+'/v/'+v+'.json')).status,200);
 assert.equal((await fetch(base+`/my/${id}/${'0'.repeat(16)}/status.json`)).status,404);
});
test('Review Focus: gateway secret and route mounting',async()=>{
 assert.equal(gatewaySecretOk('s3cret','s3cret'),true); assert.equal(gatewaySecretOk('s3creX','s3cret'),false);
 assert.equal(gatewaySecretOk(undefined,'s3cret'),false); assert.equal(gatewaySecretOk('','',),false);
 const b=await fresh({env:{gatewaySecret:'s3cret'}}),{base}=b;
 const hook=(h)=>fetch(base+'/api/sms/webhook',{method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify({from:CUSTOMER,text:'HELLO'})});
 assert.equal((await hook({})).status,403);
 assert.equal((await hook({'x-yovouch-gateway-secret':'s3creX'})).status,403);
 const okRes=await hook({'x-yovouch-gateway-secret':'s3cret'});
 assert.equal(okRes.status,200); assert.deepEqual(await okRes.json(),{replies:[]});
 assert.equal((await fetch(base+'/api/sim/sms',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
 assert.equal((await fetch(base+'/demo/phone')).status,404);
 const s=await openScan(b);
 assert.equal((await fetch(base+`/api/vouch/${s}/otp`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:CUSTOMER})})).status,404);
 const demo=await fresh();
 assert.equal((await fetch(demo.base+'/api/sms/webhook',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
 assert.equal((await fetch(demo.base+'/api/sim/sms',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
});
test('the simulated phone page',async()=>{
 const b=await fresh({env:{sim:true}}),{base}=b;
 const res=await fetch(base+'/demo/phone');
 assert.equal(res.status,200); const html=await res.text(); assertHonestPage(html);
 assert.ok(html.includes('Simulated SMS. No message was sent.')&&html.includes('Sample number')&&html.includes('action="/api/sim/sms"'));
 const after=await form(base,'/api/sim/sms',{from:CUSTOMER,text:'hello'});
 assert.ok(after.includes('Simulated SMS. No message was sent.'));
});
test('no outbound without inbound',async()=>{
 const b=await fresh({env:{sim:true}}),{vouch}=b;
 assert.throws(()=>vouch.outbox.send('+27820000000','x'),{code:'unsolicited'});
 const clock={t:NOW},o=createOutbox({now:()=>clock.t,hashKey:Buffer.alloc(32,1)});
 o.inbound('+27820000000'); o.send('+27820000000','hi');
 assert.deepEqual(o.sent('+27820000000'),['hi']);
 assert.equal(o.sendToKey(keyedHash(Buffer.alloc(32,1),'+27820000000'),'again'),true);
 assert.equal(o.sendToKey('c'.repeat(64),'x'),false);
 clock.t+=15*60000+1;
 assert.throws(()=>o.send('+27820000000','late'),{code:'unsolicited'});
 assert.equal(o.sendToKey(keyedHash(Buffer.alloc(32,1),'+27820000000'),'late'),false);
});
test('the worker page QR is the same code, drawn in runs',async()=>{
 const {encodeQr}=require('../server/qr.js');
 const b=await fresh(),{base,id,token}=b;
 const html=await page(base,`/my/${id}/${token}`);
 const secret=b.store.get(id).vouch.secret,step=counterAt(b.clock.t);
 const {size,modules}=encodeQr('https://yocard.example/s/'+id+'?t='+step+'&k='+qrTag(secret,step),{level:'M'});
 const d=html.match(/<div id="q"><svg[^>]*><rect[^>]*\/><path d="([^"]+)"/)[1];
 const cells=new Set();
 for(const [,x,y,n] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g))for(let i=0;i<+n;i++)cells.add((+y-2)+','+(+x-2+i));
 const want=new Set();for(let r=0;r<size;r++)for(let c=0;c<size;c++)if(modules[r][c])want.add(r+','+c);
 assert.deepEqual([...cells].sort(),[...want].sort());
 assert.ok(Buffer.byteLength(html)<=13312);
});
test('the JSON path: open, chips, bind, confirm',async()=>{
 const b=await fresh({env:{sim:true}}),{base,vouch,id}=b;
 const secret=b.store.get(id).vouch.secret,step=counterAt(b.clock.t);
 const o=await post(base,'/api/vouch/open',{cardId:id,proof:{method:'qr',t:String(step),k:qrTag(secret,step)},voucher:{kind:'customer'}});
 assert.equal(o.bind,'sms');
 const s=o.vouchToken;
 assert.deepEqual((await post(base,`/api/vouch/${s}/chips`,{...CHIPS,howOften:'often'})).error.fields,['howOften']);
 assert.equal((await post(base,`/api/vouch/${s}/chips`,CHIPS)).ok,true);
 const bind=await post(base,`/api/vouch/${s}/bind`,{});
 assert.match(bind.sessionCode,/^[A-Z2-9]{6}$/); assert.equal(bind.shortcode,'12345'); assert.equal(bind.bound,false);
 assert.equal((await post(base,`/api/vouch/${s}/bind`,{})).sessionCode,bind.sessionCode);
 await post(base,'/api/sim/sms',{from:'+27821110191',text:'Yes  '+bind.sessionCode+'!'});
 const noAdult=await post(base,`/api/vouch/${s}/confirm`,{consent:true});
 assert.equal(noAdult.error.code,'adult_needed');
 assert.equal((await post(base,`/api/vouch/${s}/confirm`,{adult:true})).error.code,'consent_needed');
 const r=await post(base,`/api/vouch/${s}/confirm`,{fields:{...CHIPS,when:'last month'},disclose:{firstName:'Nomsa',phoneLast3:true,clip:false,showCard:false},adult:true,consent:true});
 assert.match(r.vouchId,/^[A-Z2-9]{10}$/); assert.equal(r.visitAdded,false);
 assert.equal(r.line,'Braids, October 2026, a few times. Would hire again: yes.');
 assert.match(r.withdrawUrl,/^https:\/\/yocard\.example\/v\/[A-Z2-9]{10}\/withdraw\?w=[0-9a-f]{16}$/);
 assert.equal(vouch.vouchStore.get(r.vouchId).record.voucher.label,'Nomsa ···191');
 assert.equal((await post(base,`/api/vouch/${s}/confirm`,{adult:true,consent:true})).error.code,'session_ended');
});
test('changes after the read-back are kept in editedFields',async()=>{
 const b=await fresh({env:{sim:true}}),{base,vouch}=b;
 const s=await openScan(b);
 await textYes(b,await toBind(b,s,{words:'Neat and kind.'}));
 assert.ok((await page(base,`/s/t/${s}`)).includes('Publish this line'));
 const chips=await form(base,`/s/t/${s}`,{step:'change'});
 assert.ok(chips.includes('What did Thandi do?')&&chips.includes('Neat and kind.'));
 await form(base,`/api/vouch/${s}/chips`,{...CHIPS,hireAgain:'rather not say',words:'Neat, kind and on time.'});
 await form(base,`/s/t/${s}`,{step:'disclose',showMe:'customer'});
 const rb=await page(base,`/s/t/${s}`);
 assert.ok(rb.includes('Braids, November 2026, a few times. Would hire again: not stated.'));
 const [,v]=(await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'})).match(WITHDRAW_AT);
 const file=vouch.vouchStore.get(v);
 assert.deepEqual(file.private.editedFields,['hireAgain','words']);
 assert.equal(file.record.voucher.label,'a customer'); assert.equal(file.record.voucher.firstName,null);
});
test('the worker page stays inside 13312 bytes with 20 held lines and links to the full list',async()=>{
 const b=await fresh({env:{sim:true}}),{base,id,token,vouch}=b;
 const s=await openScan(b);
 await textYes(b,await toBind(b,s,{words:'Neat and kind.'}));
 const [,first]=(await form(base,`/api/vouch/${s}/confirm`,{consent:'yes'})).match(WITHDRAW_AT);
 const rec=vouch.vouchStore.get(first).record,W='ẹ'.repeat(120),ids=[first];
 for(let i=1;i<=24;i++){
  const held=i<=19?{words:W,wordsSource:'typed',clip:null}:null;   // 20 held lines in all, then 5 newer lines without words
  ids.push(vouch.vouchStore.create({record:{...rec,confirmedAt:new Date(b.clock.t+i*1000).toISOString()},held,private:{voucherKey:'c'.repeat(64)},channel:'web'}).vouchId);
 }
 const my=await page(base,`/my/${id}/${token}`);
 assert.ok(Buffer.byteLength(my)<=13312,'worker page '+Buffer.byteLength(my));
 assert.ok(my.includes(`<a href="/my/${id}/${token}/vouches">All your vouches</a>`));
 assert.ok(my.includes('20 lines have words waiting for you.'));
 const shown=[...my.matchAll(/formaction="[0-9a-f]{16}\/hide"/g)].length;
 assert.ok(shown>=1&&shown<25,'inline lines '+shown);
 assert.equal([...my.matchAll(/<i>"ẹ+"<\/i>/g)].length,shown);       // lines with words waiting come first
 const res=await fetch(base+`/my/${id}/${token}/vouches`);
 assertPrivateHeaders(res);
 const p1=await res.text();
 assert.equal([...p1.matchAll(/formaction="hide"/g)].length,20); assert.ok(p1.includes('name="page" value="1"'));
 assert.ok(p1.includes(`/my/${id}/${token}/vouches?page=2">Next page<`)); assert.ok(p1.includes(`<a href="/my/${id}/${token}">Back to your code</a>`));
 const p2=await page(base,`/my/${id}/${token}/vouches?page=2`);
 assert.equal([...p2.matchAll(/formaction="hide"/g)].length,5); assert.ok(p2.includes('?page=1">Previous page<'));
 const last=ids.at(-1);
 assert.ok(p2.includes(`value="${last}" formaction="hide"`)||p1.includes(`value="${last}" formaction="hide"`));
 const hid=await fetch(base+`/my/${id}/${token}/hide`,{method:'POST',redirect:'manual',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({vouchId:last,page:'2'}).toString()});
 assert.equal(hid.status,303); assert.equal(hid.headers.get('location'),`/my/${id}/${token}/vouches?page=2`);
 assert.ok((await page(base,`/my/${id}/${token}/vouches?page=2`)).includes(`value="${last}" formaction="show"`));
 assert.equal((await fetch(base+`/my/${id}/${'0'.repeat(16)}/vouches`)).status,404);
});
