'use strict';
// Plan Task 16: the WhatsApp handler, the link code and the simulated thread page.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {keyedHash}=require('../server/card/vouchers.js');
const {spokenCode,counterAt}=require('../server/card/vouchcode.js');
const {runSweep}=require('../server/card/sweep.js');
const {assertHonestPage}=require('./helpers/honesty.cjs');
const {bootVouch,publishPersona,post,form,page}=require('./helpers/vouch-boot.cjs');

const SIM='Simulated WhatsApp. No message was sent.';
const PINETOWN_POST='Need 2 general labourers, Pinetown site, R250/day, training provided, must have own boots, call 0821234567';
const SALON_POST='Salon in Khayelitsha needs a hairdresser for braids, start Monday, call 0821234567';
const LINK=/Your link code: ([A-Z2-9]{6})\. Reply with it in the WhatsApp chat within 10 minutes\./;

// One simulator boot with Sipho, Thandi and Bongani, run in order like the SMS suite.
let B=null;
async function boot(){
 if(B)return B;
 const b=await bootVouch({env:{sim:true}});
 const sipho=await publishPersona(b.base,'sipho',{trade:'labourer',area:'Umlazi'});
 const thandi=await publishPersona(b.base,'thandi',{trade:'hair'});
 const bongani=await publishPersona(b.base,'bongani');
 B={...b,sipho,thandi,bongani,id:sipho.cardId,token:sipho.cardToken};
 return B;
}
const wa=async(from,text)=>post(B.base,'/api/sim/wa',{from,text});
const sms=async(from,text)=>post(B.base,'/api/sim/sms',{from,text});
const linkCode=async(card)=>(await form(B.base,`/my/${card.cardId}/${card.cardToken}/link`,{})).match(LINK)[1];

test('first contact, language, and the number match link the card',async()=>{
 await boot();
 const a=await wa('0825550131','hi');                                   // Sipho's Yoma number, local format
 assert.equal(a.replies[0],'Hi. YoVouch writes a short reply to a job post from your own words. Reply 1 English, 2 isiZulu, 3 isiXhosa, 4 Kiswahili, 5 Pidgin.');
 assert.equal(a.replies.at(-1),SIM);
 assert.ok(!a.replies.some(r=>r.startsWith('Which card is yours?')),'linked by numbers/, no step');
 const b=await wa('0825550131','1');
 assert.deepEqual(b.replies,[SIM]);
 assert.ok(B.vouch.outbox.sent('+27825550131').includes(a.replies[0]),'every reply goes through the outbox');
 assert.ok(!B.vouch.outbox.sent('+27825550131').includes(SIM),'the simulator label is not a message');
});

test('a different number links with the code from Link WhatsApp',async()=>{
 await boot();
 const {base,id,token,store,vouch}=B;
 assert.ok((await page(base,`/my/${id}/${token}`)).includes('>Link WhatsApp<'));
 const res=await fetch(base+`/my/${id}/${token}/link`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:''});
 assert.equal(res.headers.get('referrer-policy'),'no-referrer'); assert.ok(res.headers.get('cache-control').includes('no-store'));
 const html=await res.text(); assertHonestPage(html);
 const code=html.match(LINK)[1];
 const lc=store.get(id).vouch.linkCode;
 assert.ok(lc&&lc.hash&&!JSON.stringify(store.get(id)).includes(code),'only the hash is stored');
 assert.equal(Date.parse(lc.expiresAt),B.clock.t+10*60000);
 const first=await wa('0829990000','post text');
 assert.equal(first.replies[0],'Hi. YoVouch writes a short reply to a job post from your own words. Reply 1 English, 2 isiZulu, 3 isiXhosa, 4 Kiswahili, 5 Pidgin.');
 assert.ok(first.replies.some(r=>r.startsWith('Which card is yours?')));
 assert.equal((await wa('0829990000','ZZZZZZ')).replies[0],'That link code did not match or has expired.');
 assert.ok((await wa('0829990000','a pasted post before linking')).replies[0].startsWith('Which card is yours?'));
 await wa('0829990000',code.toLowerCase());                              // typed in lower case
 const entry=store.get(id);
 assert.equal(entry.linkedPhoneHash,keyedHash(vouch.hashKey,'+27829990000'));
 assert.equal(entry.vouch.linkCode,null,'the code is single use');
 assert.equal(store.indexGet('numbers',entry.linkedPhoneHash),id);
 assert.deepEqual(JSON.parse(require('node:fs').readFileSync(require('node:path').join(B.dir,'numbers',entry.linkedPhoneHash+'.json'),'utf8')),{cardId:id,linked:true});
 // A customer vouch from the linked number is the worker's own.
 const c=spokenCode(entry.vouch.secret,counterAt(B.clock.t));
 assert.equal((await sms('0829990000',`VOUCH ${B.sipho.smsId} ${c}`)).replies[0],"This is the number on Sipho's own card.");
 // JSON gets the code too, never the owner secret.
 const j=await post(base,`/my/${id}/${token}/link`,{});
 assert.match(j.linkCode,/^[A-Z2-9]{6}$/); assert.equal(j.message,`Your link code: ${j.linkCode}. Reply with it in the WhatsApp chat within 10 minutes.`);
 assert.equal((await fetch(base+`/my/${id}/${'0'.repeat(16)}/link`,{method:'POST'})).status,404);
});

test('three wrong link codes close linking for that sender',async()=>{
 await boot();
 const code=await linkCode(B.bongani);
 await wa('0829990002','hello');
 for(let i=0;i<3;i++)assert.equal((await wa('0829990002','ABCDEF')).replies[0],'That link code did not match or has expired.');
 assert.equal((await wa('0829990002',code)).replies[0],'That link code did not match or has expired.');
 assert.equal(B.store.get(B.bongani.cardId).linkedPhoneHash,null);
});

test('post, answers, six lines, menu 1, Send me my words',async()=>{
 await boot();
 const p=await wa('0825550131',PINETOWN_POST);
 assert.ok(p.replies[0].startsWith('This post mentions ')&&p.replies[1].startsWith('Post read.'),p.replies.join('|'));
 assert.ok(p.replies.includes('The post asks for: Own boots. Reply 1 I have it, 2 leave it out.'));
 assert.match(p.jobPostId,/^[A-Z2-9]{10}$/,'the simulator returns the post id for the recorder');
 assert.deepEqual((await wa('0825550131','1')).replies,[SIM]);              // Own boots: I have it
 const d=await wa('0825550131','Two taxis, about an hour. From Monday. Paving.');
 assert.equal(d.replies[0],'Here is your reply. Read every line.');
 assert.ok(d.replies.includes('Own boots: yes (stated by Sipho)'));
 assert.ok(d.replies.includes('Sample mode: template extraction, no model call'));
 assert.match(d.replyId,/^[A-Z2-9]{10}$/); assert.deepEqual(d.rejected,[]);
 const f=await wa('0825550131','1');
 assert.ok(f.replies[0].startsWith('Forward this to the number in the post.'));
 const six=f.replies[1].split('\n');
 assert.equal(six.length,6); assert.equal(f.forward,f.replies[1],'the six lines are one message to forward');
 assert.ok(B.vouch.replyStore.get(d.replyId).confirmedAt);
 assert.equal((await wa('0825550131','Send me my words')).replies[0],'Your words, as heard: Two taxis, about an hour. From Monday. Paving.');
 assert.ok(B.vouch.events.read().some(e=>e.type==='reply_drafted'&&e.channel==='wa'));
});

test('menu 2 edits a line; menu 3 asks for a clip; menu 4 asks the organisation',async()=>{
 await boot();
 await wa('0735550147','hi'); await wa('0735550147','1');               // Thandi, linked by numbers/
 const p=await wa('0735550147',SALON_POST);
 assert.ok(p.replies.some(r=>r.startsWith('Post read.')),p.replies.join('|'));
 const d=await wa('0735550147','I did braids for 10 years, I can start Monday.');
 assert.equal(d.replies[0],'Here is your reply. Read every line.');
 assert.ok(d.replies.includes('Reply 1 to get the English reply to forward, 2 to change a line (like "4 from Tuesday"), 3 to add a 15-second clip about yourself, 4 to ask Alison Learning to refer you.'));
 const e=await wa('0735550147','2 4 from Tuesday');
 assert.ok(e.replies.includes('Available: from Tuesday (stated by Thandi)'),e.replies.join('|'));
 assert.equal(B.vouch.replyStore.get(d.replyId).linesInSourceLang[3],'Available: from Tuesday (stated by Thandi)');
 assert.equal((await wa('0735550147','2 2 anything')).replies[0],'That change was not kept. Only lines 1, 4 and 5 can change, in your own words, with no certificate and no organisation name.');
 assert.equal((await wa('0735550147','3')).replies[0],'Send one voice note of up to 15 seconds about yourself.');
 const r=await wa('0735550147','4');
 assert.match(r.replies[0],/^Forward this to Alison Learning: "Please refer me for this post: https:\/\/yocard\.example\/o\/[A-Z2-9]{10}"$/);
 const rq=B.vouch.requestStore.listAll().find(x=>x.kind==='referral'&&x.cardId===B.thandi.cardId);
 assert.equal(rq.jobPostId,p.jobPostId); assert.equal(rq.orgName,'Alison Learning');
});

test('CODE from a linked number whose Yoma phone is not confirmed',async()=>{
 await boot();
 B.store.update(B.bongani.cardId,e=>{e.record.user.phoneNumberConfirmed=false;});
 const code=await linkCode(B.bongani);
 await wa('0829990001','hi');
 await wa('0829990001',code);
 assert.equal(B.store.get(B.bongani.cardId).linkedPhoneHash,keyedHash(B.vouch.hashKey,'+27829990001'));
 assert.deepEqual((await sms('0829990001','CODE')).replies,['This card has no confirmed phone on Yoma, so it cannot get codes by SMS. Open your card page instead.']);
});

test('YES in the chat accepts a waiting referral',async()=>{
 const KEY='demo-sample-skills-trust',AMARA='+2348035550162';
 const b=await bootVouch({env:{sim:true,YOVOUCH_ORG_KEY_SAMPLE_SKILLS_TRUST:KEY}});
 const am=await publishPersona(b.base,'amara',{trade:'tailor'});
 const say=text=>post(b.base,'/api/sim/wa',{from:AMARA,text});
 await say('hi'); await say('1');
 const html=await form(b.base,`/my/${am.cardId}/${am.cardToken}/referral`,{post:'Hardware shop needs a counter assistant, Trans Ekulu, must have valid ID, start Monday, call 08031234567',evidenceId:'c3'});
 const requestId=/\/o\/([A-Z2-9]{10})/.exec(html)[1];
 const org=await form(b.base,'/o/'+requestId,{orgKey:KEY});
 const token=/action="\/api\/refer\/([0-9a-f]{24})\/send"/.exec(org)[1];
 const sent=await post(b.base,`/api/refer/${token}/send`,{statement:'She ran our help desk in 2026 and was calm with every caller.'});
 assert.ok(b.vouch.outbox.sent(AMARA).some(m=>m.startsWith('Sample Skills Trust wrote: "She ran our help desk')),'orgWrote reaches the open chat');
 const y=await say('YES');
 assert.equal(y.replies[0],'Done. It is on your card. Forward your reply again if you already sent it, so the employer sees the referral.');
 assert.ok(b.vouch.vouchStore.get(sent.vouchId).record.acceptedAt);
});

test('menu 4, the organisation sends, then YES in the chat accepts the referral',async()=>{
 const KEY='demo-alison-learning',THANDI='0735550147';
 const b=await bootVouch({env:{sim:true,YOVOUCH_ORG_KEY_ALISON_LEARNING:KEY}});
 await publishPersona(b.base,'thandi',{trade:'hair'});
 const say=text=>post(b.base,'/api/sim/wa',{from:THANDI,text});
 await say('hi'); await say('1'); await say(SALON_POST);
 await say('I did braids for 10 years, I can start Monday.');
 const r=await say('4');
 assert.equal(r.step,'menu');
 const requestId=/\/o\/([A-Z2-9]{10})/.exec(r.replies[0])[1];
 const org=await form(b.base,'/o/'+requestId,{orgKey:KEY});
 const token=/action="\/api\/refer\/([0-9a-f]{24})\/send"/.exec(org)[1];
 const sent=await post(b.base,`/api/refer/${token}/send`,{statement:'She did braids for our clients for two years and was always on time.'});
 assert.ok(b.vouch.outbox.sent('+27735550147').some(m=>m.startsWith('Alison Learning wrote: "She did braids')),'orgWrote reaches the open chat');
 const y=await say('YES');
 assert.equal(y.replies[0],'Done. It is on your card. Forward your reply again if you already sent it, so the employer sees the referral.');
 assert.ok(b.vouch.vouchStore.get(sent.vouchId).record.acceptedAt);
 assert.equal(y.step,'menu','the chat stays at its menu');
});

test('thread page is static and honest; the routes are gated',async()=>{
 await boot();
 const res=await fetch(B.base+'/thread.html'); assert.equal(res.status,200);
 const html=await res.text(); assertHonestPage(html,{fonts:true});
 assert.ok(html.includes('<meta name="referrer" content="no-referrer">')&&html.includes(SIM));
 assert.ok(!/https?:\/\/(?!yocard)/.test(html.replace(/<footer>[\s\S]*<\/footer>/,'')),'no third-party asset');
 const js=await fetch(B.base+'/thread.js'); assert.equal(js.status,200);
 const src=await js.text();
 for(const s of ['/api/sim/wa','/api/reply/draft','/forwarded','/self-clip','new Blob([','Not kept: ','Start the server with YOVOUCH_SIM=1.','aria-live'])assert.ok(src.includes(s)||html.includes(s),s);
 const plain=await bootVouch();
 assert.equal((await fetch(plain.base+'/api/sim/wa',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({from:'0825550131',text:'hi'})})).status,404);
 assert.equal((await fetch(plain.base+'/api/wa/webhook',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404);
 const gw=await bootVouch({env:{gatewaySecret:'s3cret'}});
 const hook=(h={})=>fetch(gw.base+'/api/wa/webhook',{method:'POST',headers:{'content-type':'application/json',...h},body:JSON.stringify({from:'0825550131',text:'hi'})});
 assert.equal((await hook()).status,403);
 assert.equal((await hook({'x-yovouch-gateway-secret':'wrong'})).status,403);
 const ok=await hook({'x-yovouch-gateway-secret':'s3cret'}); assert.equal(ok.status,200);
 const body=await ok.json();
 assert.ok(body.replies[0].startsWith('Hi. YoVouch')); assert.ok(!body.replies.includes(SIM)); assert.equal(body.replyId,undefined);
 assert.equal((await fetch(gw.base+'/api/sim/wa',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status,404,'no simulator next to a gateway');
});

test('link codes expire',async()=>{
 await boot();
 const card=B.thandi,code=await linkCode(card);
 await wa('0829990003','hi');
 B.clock.t+=11*60000;
 assert.equal((await wa('0829990003',code)).replies[0],'That link code did not match or has expired.');
 assert.ok(B.store.get(card.cardId).vouch.linkCode);
 runSweep(B.vouch);
 assert.equal(B.store.get(card.cardId).vouch.linkCode,null);
});
