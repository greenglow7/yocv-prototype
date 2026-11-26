'use strict';
// YoCV QR verification (spec docs/superpowers/specs/2026-11-25-yocv-qr-verify-design.md).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {NOW,PUBLIC_URL,bootVouch,raw,ok,skillYoma}=require('./helpers/vouch-boot.cjs');
const {assertHonestPage}=require('./helpers/honesty.cjs');
const {seedDemo}=require('../scripts/seed-demo.js');
const {verifyJwt}=require('../server/card/sign.js');
const copy=require('../cv-copy.js').en;
const {role,entry}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','cv-thandi.json'),'utf8'));
const include={completions:['c1','c2'],credentials:['w1','w2'],selfAttested:[]};
const DAY=24*3600*1000;

// Thandi's record and review, and the CV the page would build from them: every bullet and skill accepted.
async function reviewed(){
  const booted=await bootVouch({yoma:skillYoma(),env:{sim:true}});
  await seedDemo({dir:booted.dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const {sessionId,record}=await ok(await raw(booted.base,'/api/cv/record',{persona:'thandi'}));
  const r=await ok(await raw(booted.base,'/api/cv/review',{sessionId,role,include,entries:[entry]}));
  const cv={name:'Thandi Mokoena',contact:{phone:'+27 73 555 0147',email:'thandi@example.org',town:'Khayelitsha'},profile:null,
    experience:[{title:entry.title,place:entry.place,months:'March 2025 to now',bullets:r.entries[0].proposals.map(p=>p.text)}],
    skills:r.skills.map(s=>({name:s.name,label:s.label})),learning:[],education:'',
    optional:{photo:'',dateOfBirth:'2001-04-02',idNumber:'0104025555088',stateOfOrigin:''},sample:true};
  return {...booted,sessionId,record,review:r,cv};
}
const verify=(base,body)=>raw(base,'/api/cv/verify',body);
const pageOf=async(base,id)=>{const res=await fetch(base+'/cv-check/'+id);return {status:res.status,html:await res.text(),res};};
const section=(html,heading)=>{const i=html.indexOf('>'+heading+'<');assert.ok(i>0,'section '+heading);const j=html.indexOf('<h2',i+1);return html.slice(i,j<0?undefined:j);};

test('verify makes a signed check with a code, a public URL and a QR',async()=>{
  const {base,sessionId,cv,key}=await reviewed();
  const v=await ok(await verify(base,{sessionId,cv}));
  assert.match(v.checkId,/^[0-9a-f]{16}$/);
  assert.equal(v.code,v.checkId.slice(0,4).toUpperCase()+'-'+v.checkId.slice(4,8).toUpperCase());
  assert.equal(v.url,PUBLIC_URL+'/cv-check/'+v.checkId);
  assert.match(v.qrSvg,/^<svg[^>]*role="img"/);
  assert.equal(Date.parse(v.expiresAt),NOW+90*DAY);
  const j=await ok(await fetch(base+'/cv-check/'+v.checkId+'.json'));
  const payload=verifyJwt(key,j.jwt);
  assert.ok(payload,'the stored check verifies with the server key');
  assert.equal(payload.sub,v.checkId); assert.equal(j.jwksUrl,'/.well-known/jwks.json');
});

test('the employer page sorts each line by who confirmed it, from the server record, not the browser',async()=>{
  const {base,sessionId,cv,record,review}=await reviewed();
  // The browser claims every skill is confirmed from Yoma: the page must not believe it.
  const claimed={...cv,skills:cv.skills.map(s=>({name:s.name,label:copy.labelYoma}))};
  const v=await ok(await verify(base,{sessionId,cv:claimed}));
  const {status,html}=await pageOf(base,v.checkId);
  assert.equal(status,200);
  assertHonestPage(html);
  assert.ok(html.includes('Thandi Mokoena')); assert.ok(html.includes(v.code));
  assert.ok(html.includes(copy.cvSampleFooter),'sample line');
  const yoma=section(html,copy.checkConfirmed),vouched=section(html,copy.checkVouched),self=section(html,copy.checkSelf);
  const ticked=record.credentials.filter(c=>include.credentials.includes(c.id)),unticked=record.credentials.filter(c=>!include.credentials.includes(c.id));
  for(const c of ticked)assert.ok(yoma.includes(c.title),'confirmed: '+c.title);
  for(const c of unticked)assert.ok(!html.includes(c.title),'not ticked, not shown: '+c.title);
  const by=n=>review.skills.find(s=>s.name===n);
  assert.equal(by('Customer Service').level,'S1'); assert.ok(yoma.includes('Customer Service'));
  assert.equal(by('Hairstyling').level,'S2'); assert.ok(vouched.includes('Hairstyling')&&!yoma.includes('Hairstyling'));
  assert.ok(vouched.includes(by('Hairstyling').label));
  for(const b of cv.experience[0].bullets)assert.ok(self.includes(b),'self-declared: '+b);
  assert.ok(self.includes(copy.checkSelfNote));
});

test('the employer page never shows contact or optional fields',async()=>{
  const {base,sessionId,cv}=await reviewed();
  const v=await ok(await verify(base,{sessionId,cv}));
  const {html}=await pageOf(base,v.checkId);
  for(const s of ['555 0147','5550147','thandi@example.org','2001-04-02','0104025555088','Khayelitsha'])assert.ok(!html.includes(s),'leaks '+s);
  const j=await (await fetch(base+'/cv-check/'+v.checkId+'.json')).json();
  const decoded=Buffer.from(j.jwt.split('.')[1],'base64url').toString('utf8');
  for(const s of ['5550147','thandi@example.org','0104025555088','Khayelitsha'])assert.ok(!decoded.includes(s),'json leaks '+s);
});

test('the browser cannot set the dates, the place or a name with a number in it',async()=>{
  const {base,sessionId,cv}=await reviewed();
  const forged=structuredClone(cv);forged.experience[0].months='2012 to now (12 years)';forged.experience[0].place='Khayelitsha, call 073 555 0100';
  const v=await ok(await verify(base,{sessionId,cv:forged}));
  const {html}=await pageOf(base,v.checkId);
  assert.ok(html.includes('March 2025 to now'),'months come from the session entry');
  for(const s of ['2012','12 years','073 555 0100','Khayelitsha'])assert.ok(!html.includes(s),'forged '+s);
  const named=await verify(base,{sessionId,cv:{...cv,name:'Thandi call 073 555 0100'}});
  assert.equal(named.status,400); assert.deepEqual((await named.json()).error.fields,['cv.name']);
});

test('repeated lines, a second use of one entry and too many checks are refused',async()=>{
  const {base,sessionId,cv}=await reviewed();
  const twice=structuredClone(cv);twice.experience[0].bullets=[...twice.experience[0].bullets,...twice.experience[0].bullets];
  const r1=await verify(base,{sessionId,cv:twice});
  assert.equal(r1.status,400); assert.match((await r1.json()).error.fields[0],/^cv\.experience\.0\.bullets\.\d$/);
  const again=structuredClone(cv);again.experience=[cv.experience[0],cv.experience[0]];
  const r2=await verify(base,{sessionId,cv:again});
  assert.equal(r2.status,400); assert.deepEqual((await r2.json()).error.fields,['cv.experience.1']);
  for(let i=0;i<5;i++)await ok(await verify(base,{sessionId,cv}));
  const r3=await verify(base,{sessionId,cv});
  assert.equal(r3.status,429); assert.equal((await r3.json()).error.code,'too_many_checks');
});

test('a bullet that fails the checks or a skill the session never returned is refused',async()=>{
  const {base,sessionId,cv}=await reviewed();
  const bad=structuredClone(cv);bad.experience[0].bullets=['Braided hair at home for about 45 customers a week since March 2025.'];
  const r1=await verify(base,{sessionId,cv:bad});
  assert.equal(r1.status,400); assert.deepEqual((await r1.json()).error.fields,['cv.experience.0.bullets.0']);
  const other=structuredClone(cv);other.experience[0].title='Manager at a big salon';
  const r2=await verify(base,{sessionId,cv:other});
  assert.equal(r2.status,400); assert.deepEqual((await r2.json()).error.fields,['cv.experience.0']);
  const skill={...cv,skills:[...cv.skills,{name:'Brain Surgery',label:copy.labelYoma}]};
  const r3=await verify(base,{sessionId,cv:skill});
  assert.equal(r3.status,400); assert.deepEqual((await r3.json()).error.fields,['cv.skills.'+cv.skills.length]);
});

test('no session gives 410, a session with no review gives 409',async()=>{
  const {base,cv}=await reviewed();
  assert.equal((await verify(base,{sessionId:'0'.repeat(24),cv})).status,410);
  const {sessionId}=await ok(await raw(base,'/api/cv/record',{persona:'thandi'}));
  assert.equal((await verify(base,{sessionId,cv})).status,409);
});

test('a changed stored check, an expired one and an unknown id each say so and show nothing',async()=>{
  const {base,sessionId,cv,dir,clock}=await reviewed();
  const v=await ok(await verify(base,{sessionId,cv}));
  const file=path.join(dir,'cv-checks',v.checkId+'.json');
  const stored=JSON.parse(fs.readFileSync(file,'utf8'));
  const [h,p,s]=stored.jwt.split('.'),body=JSON.parse(Buffer.from(p,'base64url'));
  body.record.skills.push({name:'Brain Surgery',level:'S1',label:copy.labelYoma});
  fs.writeFileSync(file,JSON.stringify({jwt:h+'.'+Buffer.from(JSON.stringify(body)).toString('base64url')+'.'+s}));
  let r=await pageOf(base,v.checkId);
  assert.equal(r.status,200); assert.ok(r.html.includes(copy.checkBad)); assert.ok(!r.html.includes('Brain Surgery')); assertHonestPage(r.html);
  const v2=await ok(await verify(base,{sessionId,cv}));
  clock.t=NOW+91*DAY;
  r=await pageOf(base,v2.checkId);
  assert.equal(r.status,410); assert.ok(r.html.includes(copy.checkExpired)); assert.ok(!r.html.includes('Thandi'));
  assert.equal((await fetch(base+'/cv-check/'+v2.checkId+'.json')).status,410,'the JSON expires with the page');
  assert.equal((await fetch(base+'/cv-check/'+v.checkId+'.json')).status,404,'a changed record is not served as JSON');
  r=await pageOf(base,'0123456789abcdef');
  assert.equal(r.status,404); assert.ok(r.html.includes(copy.checkMissing));
  assert.equal((await fetch(base+'/cv-check/not-an-id')).status,404);
});

test('a hand-added skill reaches the check only once the skills call has stored it, as the page replays it after a lost session',async()=>{
  const {base,sessionId,cv,review}=await reviewed();
  const extra=(review.menu||[]).map(m=>m.name).find(n=>!review.skills.some(s=>s.name===n));
  assert.ok(extra,'the menu has a skill the review did not return');
  const withExtra={...cv,skills:[...cv.skills,{name:extra,label:copy.labelSelf}]};
  const s=await ok(await raw(base,'/api/cv/skills',{sessionId,include,handAdded:[{name:extra}]}));
  assert.equal(s.skills.find(k=>k.name===extra).level,'S4');
  const v=await ok(await verify(base,{sessionId,cv:withExtra}));
  const {html}=await pageOf(base,v.checkId);
  assert.ok(section(html,copy.checkSelf).includes(extra),'self-declared: '+extra);
  assert.ok(!section(html,copy.checkConfirmed).includes(extra));
  // A fresh session after expiry: record and review alone do not hold the hand-added skill, the replayed skills call does.
  const {sessionId:fresh}=await ok(await raw(base,'/api/cv/record',{persona:'thandi'}));
  await ok(await raw(base,'/api/cv/review',{sessionId:fresh,role,include,entries:[entry]}));
  const lost=await verify(base,{sessionId:fresh,cv:withExtra});
  assert.equal(lost.status,400); assert.deepEqual((await lost.json()).error.fields,['cv.skills.'+cv.skills.length]);
  await ok(await raw(base,'/api/cv/skills',{sessionId:fresh,include,handAdded:[{name:extra}]}));
  assert.equal((await verify(base,{sessionId:fresh,cv:withExtra})).status,200);
});

// Withdrawing a check (spec docs/superpowers/specs/2026-11-25-yocv-journey-close-design.md, section 1).
const withdraw=(base,id,body)=>raw(base,'/api/cv/verify/'+id+'/withdraw',body);

test('verify returns a withdraw secret and stores only its hash',async()=>{
  const {base,sessionId,cv,dir}=await reviewed();
  const v=await ok(await verify(base,{sessionId,cv}));
  assert.match(v.withdrawSecret,/^[0-9a-f]{32}$/);
  const stored=fs.readFileSync(path.join(dir,'cv-checks',v.checkId+'.json'),'utf8');
  assert.ok(!stored.includes(v.withdrawSecret),'the secret itself is not stored');
  const payload=Buffer.from(JSON.parse(stored).jwt.split('.')[1],'base64url').toString('utf8');
  assert.ok(!payload.includes('withdraw'),'the signed record does not change');
});

test('the person withdraws a check, after which the page and the JSON say so and show nothing',async()=>{
  const {base,sessionId,cv}=await reviewed();
  const v=await ok(await verify(base,{sessionId,cv}));
  assert.equal((await withdraw(base,v.checkId,{withdrawSecret:'0'.repeat(32)})).status,403,'a wrong secret');
  assert.equal((await withdraw(base,v.checkId,{})).status,403,'no secret');
  assert.equal((await pageOf(base,v.checkId)).status,200,'still open after a refused withdrawal');
  const w=await ok(await withdraw(base,v.checkId,{withdrawSecret:v.withdrawSecret}));
  assert.equal(w.checkId,v.checkId); assert.equal(Date.parse(w.withdrawnAt),NOW);
  const r=await pageOf(base,v.checkId);
  assert.equal(r.status,410); assertHonestPage(r.html);
  for(const part of copy.checkWithdrawn.split('{date}'))assert.ok(r.html.includes(part),'withdrawn notice: '+part);
  assert.ok(!r.html.includes('Thandi'),'no content once withdrawn');
  const j=await fetch(base+'/cv-check/'+v.checkId+'.json');
  assert.equal(j.status,410); assert.equal((await j.json()).error.code,'withdrawn');
  assert.equal((await withdraw(base,v.checkId,{withdrawSecret:v.withdrawSecret})).status,410,'already withdrawn');
});

test('withdrawing needs no live session, and an unknown or malformed check id is refused',async()=>{
  const {base,sessionId,cv,clock}=await reviewed();
  const v=await ok(await verify(base,{sessionId,cv}));
  clock.t=NOW+2*DAY;
  assert.equal((await verify(base,{sessionId,cv})).status,410,'the CV session has expired');
  await ok(await withdraw(base,v.checkId,{withdrawSecret:v.withdrawSecret}));
  assert.equal((await withdraw(base,'0123456789abcdef',{withdrawSecret:v.withdrawSecret})).status,404);
  assert.equal((await withdraw(base,'not-an-id',{withdrawSecret:v.withdrawSecret})).status,404);
});

test('the config carries the shared journey: the listing, the handoff names and Halima\'s YoID',async()=>{
  const {base}=await reviewed();
  const cfg=await (await fetch(base+'/api/cv/config')).json();
  const l=cfg.journey?.listing;
  assert.ok(l,'journey.listing in the config');
  for(const k of ['id','title','organisation','place','asks'])assert.equal(typeof l[k],'string',k);
  assert.equal(l.sample,true);
  // The team's shared mock data (2026-11-25): the same ids and names on every slide and in every prototype.
  assert.equal(l.id,'opp-job-001'); assert.equal(l.title,'Solar Installation Assistant (Trainee)'); assert.equal(l.organisation,'Sunrise Solar Ltd');
  assert.deepEqual(cfg.journey.incoming,{name:'Skill Credential',id:'cred-002',from:'SkillLens'});
  assert.deepEqual(cfg.journey.outgoing,{name:'Job Application',id:'app-001'});
  assert.deepEqual(cfg.journey.person,{personaId:'halima',yoid:'yoid-ng-7f3a0123'});
});
