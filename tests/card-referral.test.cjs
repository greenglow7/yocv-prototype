const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {tierLabel}=require('../server/card/vouch-lines.js');
const {STRINGS}=require('../server/card/render.js');
const {createAccountSource}=require('../server/card/account.js');
const {buildRecord}=require('../server/card/routes.js');
const {loadConfig}=require('../server/config.js');
const {runSweep}=require('../server/card/sweep.js');
const personas=require('../server/card/personas.json');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {NOW,bootVouch,publishPersona,post,page}=require('./helpers/vouch-boot.cjs');
let orgs={}; try {orgs=require('../server/card/orgs.js')}catch{}
let requests={}; try {requests=require('../server/card/requests.js')}catch{}

const DAY=86400000;
const KEY='demo-sample-skills-trust';
const ENV={sim:true,YOVOUCH_ORG_KEY_SAMPLE_SKILLS_TRUST:KEY};
const POST_TEXT='Hardware shop needs a counter assistant, Trans Ekulu, must have valid ID, start Monday, call 08031234567';
const LABEL='Referred by Sample Skills Trust for counter assistant on 16 November 2026 · rests on Customer Care Basics · confirmed by them, not by Yoma';
const SENTENCE='She ran our help desk in 2026 and was calm with every caller.';
const AMARA_PHONE='+2348035550162';

async function boot(){
 const b=await bootVouch({env:ENV});
 const am=await publishPersona(b.base,'amara',{trade:'tailor'});
 return {...b,am};
}
async function rawForm(base,route,fields){
 return fetch(base+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(fields).toString(),redirect:'manual'});
}
const myPath=c=>`/my/${c.cardId}/${c.cardToken}`;
async function requestReferral(b,card=b.am,evidenceId='c3'){
 const html=await (await rawForm(b.base,myPath(card)+'/referral',{post:POST_TEXT,evidenceId})).text();
 const m=/Forward this to Sample Skills Trust: "Please refer me for this post: (https:\/\/yocard\.example\/o\/([A-Z2-9]{10}))"/.exec(html);
 assert.ok(m,html.slice(0,600));
 return {html,url:m[1],requestId:m[2]};
}
async function openOrg(b,requestId,orgKey=KEY){return rawForm(b.base,'/o/'+requestId,{orgKey});}
const referTokenIn=html=>(/action="\/api\/refer\/([0-9a-f]{24})\/send"/.exec(html)||[])[1];
// The whole flow to the worker's YES; returns the referral's vouchId, requestId and referToken.
async function referred(b){
 const {requestId}=await requestReferral(b);
 const token=referTokenIn(await (await openOrg(b,requestId)).text());
 const sent=await post(b.base,`/api/refer/${token}/send`,{statement:SENTENCE});
 const r=await post(b.base,`/api/vouch/${sent.vouchId}/accept`,{cardId:b.am.cardId,cardToken:b.am.cardToken,answer:'yes'});
 assert.equal(r.ok,true);
 return {vouchId:sent.vouchId,requestId,token};
}

test('orgs.js and requests.js keep the pinned shapes',()=>{
 const os=require('node:os');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yovouch-orgs-'));
 assert.equal(orgs.orgKeyOf('  Sample Skills Trust '),'sample skills trust');
 const store=orgs.createOrgStore(dir,{now:()=>NOW});
 const org=store.ensure('Sample Skills Trust',KEY);
 assert.deepEqual(Object.keys(org).sort(),['createdAt','orgId','orgKeyHash','orgName']);
 assert.equal(org.orgId,null); assert.ok(!JSON.stringify(org).includes(KEY));
 assert.ok(fs.existsSync(path.join(dir,'orgs','sample-skills-trust.json')));
 assert.equal(store.check('Sample Skills Trust',KEY),true); assert.equal(store.check('sample skills trust',KEY),true);
 assert.equal(store.check('Sample Skills Trust','nope'),false); assert.equal(store.check('Atingi',KEY),false);
 assert.equal(store.get('Atingi'),null);
 const rq=requests.createRequestStore(dir,{now:()=>NOW});
 const {requestId,expiresAt}=rq.create({kind:'referral',cardId:'ABCDEFGHJK',ttlMs:DAY,jobPostId:'JPJPJPJPJP',evidenceId:'c3',orgName:'Sample Skills Trust'});
 assert.match(requestId,/^[A-Z2-9]{10}$/); assert.equal(expiresAt,new Date(NOW+DAY).toISOString());
 assert.equal(rq.get(requestId).orgName,'Sample Skills Trust');
 assert.equal(rq.listOpen('ABCDEFGHJK','referral').length,1);
 const used=rq.markUsed(requestId);
 assert.deepEqual(Object.keys(used).sort(),['cardId','expiresAt','kind','requestId','usedAt']);
 assert.equal(rq.markUsed(requestId),null,'a used request cannot be used again');
 assert.equal(rq.listOpen('ABCDEFGHJK','referral').length,0);
});

test('config.yovouch.orgKeys reads every YOVOUCH_ORG_KEY_<NAME>',()=>{
 const cfg=loadConfig({env:{YOVOUCH_ORG_KEY_SAMPLE_SKILLS_TRUST:KEY,YOVOUCH_ORG_KEY_EMPTY:''},cwd:path.join(__dirname,'fixtures')});
 assert.deepEqual(cfg.yovouch.orgKeys,{'Sample Skills Trust':KEY});
 assert.ok(fs.readFileSync(path.join(__dirname,'..','.env.example'),'utf8').includes('YOVOUCH_ORG_KEY_SAMPLE_SKILLS_TRUST=demo-sample-skills-trust'));
});

test('referral from the fictional organisation, accepted by the worker',async()=>{
 const b=await boot(),{base,am,dir}=b;
 assert.ok(fs.existsSync(path.join(dir,'orgs','sample-skills-trust.json')));
 const my=await page(base,myPath(am));
 assert.ok(my.includes('Request a referral')&&my.includes('Paste the post here'));
 assert.ok(my.includes('Ask Sample Skills Trust to refer me for this post')&&my.includes('name="evidenceId" value="c3"'));
 assert.ok(Buffer.byteLength(my)<=13312,'worker page '+Buffer.byteLength(my));
 const {html,requestId}=await requestReferral(b);
 assertHonestPage(html);
 assert.ok(b.vouch.requestStore.get(requestId).expiresAt===new Date(NOW+30*DAY).toISOString(),'expires with the post');
 const refused=await (await rawForm(base,myPath(am)+'/referral',{post:'Pay R250 for training before you start, call 0821234567',evidenceId:'c3'})).text();
 assert.ok(refused.includes('This post asks for money'),'a parser refusal shows its message');
 // The key page: a password field, the demo label, and the key in no link.
 const keyRes=await fetch(base+'/o/'+requestId);
 assertPrivateHeaders(keyRes);
 const keyPage=await keyRes.text();
 assertHonestPage(keyPage);
 assert.match(keyPage,/<input[^>]*type="password"[^>]*name="orgKey"[^>]*autocomplete="off"/);
 assert.ok(keyPage.includes(STRINGS.demoOrgKey)&&!keyPage.includes(KEY)&&!/href="[^"]*orgKey/.test(keyPage));
 const wrong=await openOrg(b,requestId,'not-the-key');
 assert.equal(wrong.status,403);
 assert.ok((await wrong.text()).includes('That organisation key does not match.'));
 const orgRes=await openOrg(b,requestId);
 assert.equal(orgRes.status,200); assertPrivateHeaders(orgRes);
 const org=await orgRes.text();
 assertHonestPage(org);
 assert.ok(org.includes('Demo organisation key. A real key needs Yoma.')&&org.includes('Fictional organisation, not on Yoma'));
 assert.ok(org.includes('Amara')&&org.includes('Customer Care Basics')&&org.includes('27 February 2026')&&org.includes('counter assistant')&&org.includes('Trans Ekulu'));
 assert.ok(org.includes('Write one sentence about Amara in your own words (under 160 characters). It will appear on their card as written, labelled "'+LABEL+'".'));
 assert.ok(org.includes('maxlength="160"')&&org.includes('Send to Amara to accept')&&org.includes('Withdraw referral'));
 const token=referTokenIn(org);
 assert.match(token,/^[0-9a-f]{24}$/);
 for(const statement of ['She is a certified tailor','She ran our help desk in 2019.','She was kind. '.repeat(12).slice(0,161),''])
  assert.equal((await post(base,`/api/refer/${token}/send`,statement?{statement}:{})).error?.message,'Say what you saw, not a credential.',statement);
 const sent=await post(base,`/api/refer/${token}/send`,{statement:SENTENCE});
 assert.match(sent.vouchId,/^[A-Z2-9]{10}$/);
 assert.equal((await openOrg(b,requestId)).status,409,'the request is used');
 assert.equal((await fetch(base+`/v/${sent.vouchId}.json`)).status,410,'not live before the YES');
 assert.ok(!(await page(base,'/c/'+am.cardId)).includes('Referred by'));
 assert.ok(!b.vouch.outbox.all().length,'Amara had not texted, so nothing was sent');
 const pending=await page(base,myPath(am));
 assert.ok(pending.includes('Sample Skills Trust wrote: "'+SENTENCE+'". Reply YES to put this on your card for this post, NO to decline. It will say "'+LABEL+'".'));
 assert.ok(pending.includes(`action="/api/vouch/${sent.vouchId}/accept"`));
 assert.equal((await post(base,`/api/vouch/${sent.vouchId}/accept`,{cardId:am.cardId,cardToken:am.ownerSecret,answer:'yes'})).error.code,'not_found','never the owner secret');
 const yes=await rawForm(base,`/api/vouch/${sent.vouchId}/accept`,{cardId:am.cardId,cardToken:am.cardToken,answer:'yes'});
 assert.equal(yes.status,303);
 assert.ok(yes.headers.get('location').startsWith(myPath(am)));
 const back=await page(base,yes.headers.get('location'));
 assert.ok(back.includes('Done. It is on your card. Forward your reply again if you already sent it, so the employer sees the referral.'));
 const file=b.vouch.vouchStore.get(sent.vouchId),rec=file.record;
 assert.deepEqual({kind:rec.kind,label:rec.voucher.label,orgName:rec.voucher.orgName,orgId:rec.voucher.orgId,by:rec.voucher.phoneConfirmedBy},
  {kind:'organisation',label:'Sample Skills Trust',orgName:'Sample Skills Trust',orgId:null,by:'org_key'});
 assert.deepEqual(rec.restsOn,{evidenceId:'c3',opportunityId:null,title:'Customer Care Basics'});
 assert.deepEqual(rec.jobPost,{work:'counter assistant',area:'Trans Ekulu',postedAt:new Date(NOW).toISOString()});
 assert.equal(rec.statement,SENTENCE); assert.equal(rec.expiresAt,new Date(NOW+30*DAY).toISOString());
 assert.equal(rec.line,'Referred for counter assistant at Trans Ekulu, 16 November 2026, resting on Customer Care Basics. "'+SENTENCE+'"');
 assert.equal(tierLabel(rec,'Amara',[],{nowMs:NOW}),LABEL);
 assert.ok(b.vouch.events.read().some(e=>e.type==='vouch_confirmed'&&e.kind==='organisation'&&e.vouchId===sent.vouchId));
 assert.equal((await fetch(base+`/v/${sent.vouchId}.json`)).status,200);
 const card=await page(base,'/c/'+am.cardId);
 assert.ok(card.includes(LABEL)&&card.includes(STRINGS.demoOrgKey)&&card.includes(STRINGS.fineReferral('Amara')));
 assert.ok(!(await (await fetch(base+'/c/'+am.cardId+'.svg')).text()).includes('Vouched for Amara'),'a referral alone draws no strip');
 assert.ok(tierLabel(rec,'Amara',[],{nowMs:NOW+31*DAY}).startsWith('Referred by Sample Skills Trust for a counter assistant post, November 2026 (post closed)'));
 // The JSON open is the spec 4.3 shape, with the refer token and no bind.
 const second=await requestReferral(b);
 const jobPostId=b.vouch.requestStore.get(second.requestId).jobPostId;
 const j=await post(base,'/api/vouch/open',{voucher:{kind:'organisation',orgKey:KEY,jobPostId},proof:{method:'request',requestId:second.requestId}});
 assert.match(j.vouchToken,/^[0-9a-f]{24}$/); assert.equal(j.proof.method,'request'); assert.equal(j.bind,undefined);
 assert.equal(j.worker.firstName,'Amara');
 const no=await post(base,`/api/refer/${j.vouchToken}/send`,{statement:SENTENCE});
 assert.equal((await post(base,`/api/vouch/${no.vouchId}/accept`,{cardId:am.cardId,cardToken:am.cardToken,answer:'no'})).ok,true);
 assert.equal(b.vouch.vouchStore.get(no.vouchId),null,'NO deletes the draft');
});

test('the organisation withdraws; the worker is told only in an open chat',async()=>{
 const b=await boot(),{base,am}=b;
 await post(base,'/api/sim/sms',{from:AMARA_PHONE,text:'CODE'});
 const {vouchId,requestId,token}=await referred(b);
 const sent=b.vouch.outbox.all().filter(m=>m.to===AMARA_PHONE).map(m=>m.text);
 assert.ok(sent.some(s=>s.startsWith('Sample Skills Trust wrote: "'+SENTENCE+'".')),JSON.stringify(sent));
 assert.ok((await page(base,'/c/'+am.cardId)).includes(LABEL));
 const w=await rawForm(base,`/o/${requestId}/withdraw`,{referToken:token});
 assert.equal(w.status,200); assertHonestPage(await w.text());
 assert.ok(!(await page(base,'/c/'+am.cardId)).includes(LABEL));
 assert.equal((await fetch(base+`/v/${vouchId}.json`)).status,410);
 assert.ok(b.vouch.outbox.all().some(m=>m.to===AMARA_PHONE&&m.text==='Sample Skills Trust withdrew its referral. It is no longer on your card.'));
 assert.ok(b.vouch.events.read().some(e=>e.type==='vouch_withdrawn'&&e.vouchId===vouchId&&e.by==='org'));
 assert.equal((await rawForm(base,`/o/${requestId}/withdraw`,{referToken:'0'.repeat(24)})).status,404);
});

test('Amara\'s card is honest about the fictional organisation',async()=>{
 const b=await boot(),{base,am}=b;
 const before=await page(base,'/c/'+am.cardId);
 assert.ok(before.includes('Fictional organisation, not on Yoma')&&before.includes(STRINGS.sampleAccountFictional));
 assert.ok(!before.includes(STRINGS.sampleAccount));
 assert.ok(!before.includes(STRINGS.liveMissing));
 const {vouchId}=await referred(b);
 const j=await post(base,`/api/card/${am.cardId}/check`,{vouchIds:[vouchId]});
 const of=label=>j.signals.find(s=>s.key==='referral:'+vouchId&&s.label===label);
 assert.deepEqual([of('Organisation still on Yoma').ok,of('Organisation still on Yoma').detail],[false,'Fictional organisation, not on Yoma']);
 assert.equal(of('Completion still on the account').ok,true);
 assert.ok(j.signals.some(s=>s.key==='vouch:'+vouchId&&s.ok));
});

test('an organisation that is not on a disclosed completion cannot refer',async()=>{
 const b=await boot(),{base}=b;
 const th=await publishPersona(base,'thandi',{trade:'hair'});
 const r=await rawForm(base,myPath(th)+'/referral',{post:POST_TEXT,evidenceId:'c9'});
 assert.equal(r.status,403);
 const html=await (await rawForm(base,myPath(th)+'/referral',{post:POST_TEXT,evidenceId:'c1'})).text();
 const requestId=(/\/o\/([A-Z2-9]{10})/.exec(html)||[])[1];
 assert.ok(requestId,'Alison Learning is on a disclosed completion, so the request exists');
 assert.equal((await openOrg(b,requestId)).status,403,'the Sample Skills Trust key does not open an Alison Learning request');
 const j=await post(base,'/api/refer/open',{orgKey:KEY,requestId});
 assert.equal(j.error.code,'forbidden');
 // The sweep deletes requests past expiry.
 b.clock.t+=31*DAY;
 runSweep(b.vouch);
 assert.equal(b.vouch.requestStore.get(requestId),null);
});

test('organizationId is captured when the info item carries one',async()=>{
 const amara=personas.find(p=>p.id==='amara');
 const asked=[];
 const yoma={async opportunityInfo(id){asked.push(id);return {item:{id,title:'T '+id,organizationName:'Org',organizationId:'org-1',published:true,verificationTypes:[]}};}};
 const src=createAccountSource({config:{},yoma,now:()=>NOW});
 const snap=await src.read({persona:'amara'});
 assert.deepEqual(snap.completions.map(c=>c.organizationId),['org-1','org-1',null]);
 assert.equal(snap.completions[2].opportunityId,null); assert.equal(snap.completions[2].organizationName,'Sample Skills Trust');
 assert.equal(asked.length,2,'no opportunityInfo call for a null opportunityId');
 assert.ok(!asked.includes(null));
 const rec=buildRecord({snapshot:snap,trade:'tailor',selfDeclared:{},confirms:[],disclose:{completions:['c1','c3'],skills:[]},code:'ABCDEF',now:()=>NOW});
 assert.deepEqual(rec.disclosed.completions.map(c=>c.organizationId),['org-1',null]);
 const plain=createAccountSource({config:{},yoma:{async opportunityInfo(id){return {item:{id,title:'x',published:true}};}},now:()=>NOW});
 assert.deepEqual((await plain.read({persona:'amara'})).completions.map(c=>c.organizationId),[null,null,null]);
 void amara;
});
