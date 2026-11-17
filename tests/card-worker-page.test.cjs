const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {qrSvg}=require('../server/qr.js');
const {formatSpoken,spokenCode}=require('../server/card/vouchcode.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {bootVouch,publishPersona,post,form,page}=require('./helpers/vouch-boot.cjs');
let pages={}; try {pages=require('../server/card/pages.js')}catch{}
const {localTime}=pages;
const personas=require('../server/card/personas.json');
const byId=Object.fromEntries(personas.map(p=>[p.id,p]));

// A fresh server and a published Thandi (hairdresser) for each test that changes card state.
async function fresh(){
 const boot=await bootVouch();
 const p=await publishPersona(boot.base,'thandi',{trade:'hair'});
 return {...boot,p,id:p.cardId,token:p.cardToken,secret:boot.store.get(p.cardId).vouch.secret};
}

test('publish returns the card token, smsId and /my link',async()=>{
 const {base,store}=await bootVouch();
 const p=await publishPersona(base,'thandi',{trade:'hair'});
 assert.match(p.cardToken,/^[0-9a-f]{16}$/); assert.match(p.smsId,/^\d{5}$/);
 assert.equal(p.myUrl,'https://yocard.example/my/'+p.cardId+'/'+p.cardToken);
 const entry=store.get(p.cardId);
 assert.match(entry.vouch.secret,/^[0-9a-f]{40}$/); assert.equal(entry.record.tradeId,'hair');
 assert.ok(!JSON.stringify(entry).includes(p.cardToken));          // only the hash
 assert.equal(store.indexGet('smsids',p.smsId),p.cardId);
 assert.equal(store.indexGet('numbers',entry.ownerPhoneHash),p.cardId);
 assert.equal(store.indexGet('codes',p.code),p.cardId);
 assert.equal(entry.linkedPhoneHash,null);
 assert.deepEqual({...entry.vouch,secret:null,createdAt:null},{secret:null,usedSteps:[],failedAttempts:[],lockedUntil:null,lang:'en',linkCode:null,createdAt:null});
 const json=await (await fetch(base+'/c/'+p.cardId+'.json')).text();
 assert.ok(!json.includes('secret')&&!json.includes(p.cardToken));
});
test('Review Focus 3: worker page at the spec clock, in local time',async()=>{
 const {base,p,id,token,secret}=await fresh();
 const res=await fetch(base+'/my/'+id+'/'+token);
 assert.equal(res.status,200);
 assertPrivateHeaders(res); const html=await res.text(); assertHonestPage(html);
 assert.ok(html.includes('Show this to your customer.'));
 assert.ok(html.includes('Code '+formatSpoken(spokenCode(secret,19942666))+' · valid until 16:42:00'));
 assert.ok(html.includes('<svg')&&html.includes(p.code)&&html.includes(p.smsId));
 assert.ok(html.includes('No vouches yet? A customer can vouch at the end of a job by scanning this code.'));
 assert.ok(html.includes('Ask: "Can you vouch for the work I did today?"'));
 assert.ok(html.includes('<details><summary>Customer has no data</summary>'));
 assert.ok(html.includes('they text VOUCH '+p.smsId+' '+spokenCode(secret,19942666)+' to 12345'));
 assert.ok(html.includes('Sample mode: template extraction, no model call'));
 assert.ok(html.includes('Do not print this code. It changes every 90 seconds.'));
 assert.ok(!html.includes('fonts.googleapis.com')&&!html.includes(secret));
 assert.ok(Buffer.byteLength(html)<=13312,'worker page is '+Buffer.byteLength(html)+' bytes');
 assert.equal(localTime(Date.parse('2026-11-16T14:42:00Z'),'Mars'),'14:42:00 UTC');
 assert.equal(localTime(Date.parse('2026-11-16T14:42:00Z'),'Kenya',{seconds:false}),'17:42');
});
test('locked card shows the lock line in local time',async()=>{
 const {base,vouch,id,token}=await fresh();
 for(let i=0;i<6;i++)vouch.codes.verify(id,{method:'code',code:'000000'});
 const html=await page(base,'/my/'+id+'/'+token);
 assert.ok(html.includes('Locked after wrong codes. Opens again at 16:50. Scanning still works.'));
 assert.ok(Buffer.byteLength(html)<=13312);
});
test('wrong token is 404 and the owner secret never opens /my',async()=>{
 const {base,p,id}=await fresh();
 const wrong=await fetch(base+'/my/'+id+'/'+'0'.repeat(16));
 assert.equal(wrong.status,404); assertPrivateHeaders(wrong);
 assert.ok((await wrong.text()).includes('No card with this code'));
 assert.equal((await fetch(base+'/my/'+id+'/'+p.ownerSecret)).status,404);
});
test('codes batch',async()=>{
 const {base,id,token}=await fresh();
 const res=await fetch(base+'/api/vouch/codes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:id,cardToken:token})});
 assertPrivateHeaders(res); const j=await res.json();
 assert.equal(j.stepSeconds,90); assert.equal(j.fromCounter,19942666); assert.equal(j.codes.length,10);
 assert.equal(j.serverNow,'2026-11-16T14:40:12.000Z'); assert.equal(j.locked,null);
 assert.equal((await fetch(base+'/api/vouch/codes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId:id,cardToken:'0'.repeat(16)})})).status,404);
});
test('qr-browser.js draws the same QR as the server',async()=>{
 const {base}=await bootVouch();
 const res=await fetch(base+'/qr-browser.js');
 assert.equal(res.headers.get('cache-control'),'max-age=86400');
 const win={}; vm.runInNewContext(await res.text(),{window:win,TextEncoder});
 const u='https://yocard.example/s/ABCDEFGHJK?t=19942666&k=CEX8WJKP';
 assert.equal(win.qrSvg(u),qrSvg(u));
});
test('rotate-token: new token works, old one stops; wrong secret 403',async()=>{
 const {base,p,id,token}=await fresh();
 const res=await fetch(base+'/api/card/'+id+'/rotate-token',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ownerSecret:p.ownerSecret})});
 assertPrivateHeaders(res); const r=await res.json();
 assert.notEqual(r.cardToken,token); assert.equal(r.smsId,p.smsId);
 assert.equal(r.myUrl,'https://yocard.example/my/'+id+'/'+r.cardToken);
 assert.equal((await fetch(base+'/my/'+id+'/'+token)).status,404);
 assert.equal((await fetch(base+'/my/'+id+'/'+r.cardToken)).status,200);
 assert.equal((await fetch(base+'/api/card/'+id+'/rotate-token',{method:'POST',headers:{'content-type':'application/json'},body:'{"ownerSecret":"x"}'})).status,403);
});
test('rotate-token gives a pre-YoVouch card the vouch block, smsId and indexes',async()=>{
 const {base,store,p,id}=await fresh();
 store.update(id,e=>{for(const k of ['smsId','cardTokenHash','ownerPhoneHash','linkedPhoneHash','vouch'])delete e[k];delete e.record.tradeId;});
 store.indexDeleteCard(id);
 const r=await post(base,'/api/card/'+id+'/rotate-token',{ownerSecret:p.ownerSecret});
 assert.match(r.cardToken,/^[0-9a-f]{16}$/); assert.match(r.smsId,/^\d{5}$/);
 const entry=store.get(id);
 assert.match(entry.vouch.secret,/^[0-9a-f]{40}$/); assert.equal(entry.record.tradeId,'hair');
 assert.equal(store.indexGet('smsids',r.smsId),id); assert.equal(store.indexGet('codes',p.code),id);
 assert.equal(store.indexGet('numbers',entry.ownerPhoneHash),id);
 assert.equal((await fetch(base+'/my/'+id+'/'+r.cardToken)).status,200);
});
test('language choice is stored',async()=>{
 const {base,store,id,token}=await fresh();
 const html=await form(base,'/my/'+id+'/'+token+'/lang',{lang:'zu'});
 assert.ok(html.includes('Show this to your customer.'));
 assert.equal(store.get(id).vouch.lang,'zu');
});
test('card withdrawal removes the number index entry at once',async()=>{
 const {base,store,p,id}=await fresh();
 await post(base,'/api/card/'+id+'/withdraw',{ownerSecret:p.ownerSecret});
 assert.equal(store.indexGet('numbers',store.get(id).ownerPhoneHash),null);
});
test('Sipho is a labourer with a confirmed phone; Bongani has one completion',()=>{
 assert.deepEqual(personas.map(x=>x.id),['thandi','brian','amara','sipho','lerato','bongani']);
 assert.equal(byId.sipho.trade,'labourer'); assert.equal(byId.sipho.phoneNumberConfirmed,true);
 assert.equal(byId.bongani.completions.length,1);
});
