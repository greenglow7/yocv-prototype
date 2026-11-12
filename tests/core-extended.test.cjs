const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','sample-credential.json'),'utf8'));
const care={role:'Customer support assistant',experience:'I looked after my younger siblings after school.\nI planned their meals and helped them with homework.',context:'Family caregiving',dates:'',credential:false,document:null};
const shop={role:'Retail assistant',experience:'I helped customers find products and packed orders at my aunt’s shop.',context:'Family shop',dates:'',credential:true,document:{name:'letter.pdf',statement:'I volunteered at a community garden.'}};

test('localExperienceClaims keeps the original sentence as sourceQuote and marks claims as local',()=>{
 assert.equal(typeof core.localExperienceClaims,'function');
 const claims=core.localExperienceClaims(care);
 assert.equal(claims[0].kind,'experience');
 assert.equal(claims[0].sourceQuote,'I looked after my younger siblings after school.');
 assert.equal(claims[0].text,'Cared for my younger siblings after school.');
 assert.equal(claims[0].generated,'local');
 const skill=claims.find(c=>c.kind==='skill');
 assert.ok(skill);
 assert.equal(skill.generated,'local');
 assert.ok(claims.every(c=>c.sourceId==='experience'&&c.category==='self'&&c.decision==='pending'));
 assert.equal(claims.filter(c=>['learning'].includes(c.kind)||c.sourceId==='document-demo').length,0);
});
test('localExperienceClaims keeps the input guard and its wording',()=>{
 assert.throws(()=>core.localExperienceClaims({...care,experience:'too short'}),/responsibility/i);
 assert.throws(()=>core.localExperienceClaims({...care,experience:'word '.repeat(1000)}),/4,000 characters/);
});
test('evidenceClaims returns only credential and document claims',()=>{
 assert.equal(typeof core.evidenceClaims,'function');
 assert.deepEqual(core.evidenceClaims(care),[]);
 const withCredential=core.evidenceClaims({...care,credential:true});
 assert.equal(withCredential.length,1);
 assert.equal(withCredential[0].kind,'learning');
 assert.equal(withCredential[0].category,'verified');
 assert.equal(withCredential[0].sourceId,core.credential.id);
 const both=core.evidenceClaims(shop);
 assert.deepEqual(both.map(c=>c.id),['credential-0','document-0']);
 assert.equal(both[1].category,'document');
});
test('generateClaims is the concatenation of local experience claims and evidence claims',()=>{
 assert.deepEqual(core.generateClaims(shop),core.localExperienceClaims(shop).concat(core.evidenceClaims(shop)));
 assert.deepEqual(core.generateClaims(care),core.localExperienceClaims(care));
});
test('labels.verified names the representative Yoma sample',()=>{
 assert.equal(core.labels.verified,'Issuer-recorded achievement · representative Yoma sample');
});
test('shortQuote truncates long quotes for display and leaves short ones alone',()=>{
 assert.equal(typeof core.shortQuote,'function');
 const long='a'.repeat(300);
 const short=core.shortQuote(long);
 assert.equal(short.length,241);
 assert.equal(short,'a'.repeat(240)+'…');
 assert.equal(core.shortQuote('short quote'),'short quote');
 assert.equal(core.shortQuote('abcdef',3),'abc…');
 assert.equal(core.shortQuote(undefined),'');
});
test('buildEvidence without generation is unchanged',()=>{
 const claims=[{id:'1',text:'Helped customers.',sourceText:'I helped customers.',category:'self',decision:'accepted',kind:'experience'}];
 const evidence=core.buildEvidence({name:'Demo'},'Retail assistant',claims);
 assert.equal(evidence.generationMode,'Local sample templates; no live AI call');
 assert.equal('generation' in evidence,false);
});
test('buildEvidence with generation records the mode, provider, model and rejected count',()=>{
 const claims=[{id:'1',text:'Helped customers.',sourceText:'I helped customers.',category:'self',decision:'accepted',kind:'experience'}];
 const generation={mode:'live',provider:'azure-openai',model:'gpt-4.1-mini',rejected:[{}]};
 const evidence=core.buildEvidence({},'Retail assistant',claims,generation);
 assert.equal(evidence.generationMode,'Live AI generation (azure-openai, gpt-4.1-mini); 1 suggestion rejected by grounding checks');
 assert.deepEqual(evidence.generation,generation);
 const clean=core.buildEvidence({},'Retail assistant',claims,{mode:'live',provider:'openai-compatible',model:'m',rejected:[]});
 assert.equal(clean.generationMode,'Live AI generation (openai-compatible, m)');
 const many=core.buildEvidence({},'Retail assistant',claims,{mode:'live',provider:'azure-openai',model:'gpt-4.1-mini',rejected:[{},{}]});
 assert.equal(many.generationMode,'Live AI generation (azure-openai, gpt-4.1-mini); 2 suggestions rejected by grounding checks');
 const sample=core.buildEvidence({},'Retail assistant',claims,{mode:'sample',provider:'local',model:null,rejected:[{}]});
 assert.equal(sample.generationMode,'Local sample templates; no live AI call; 1 suggestion rejected by grounding checks');
 const offline=core.buildEvidence({},'Retail assistant',claims,{mode:'sample',provider:'browser-local'});
 assert.equal(offline.generationMode,'Local sample templates; no live AI call');
});
test('buildTextCV with live generation states it in the footer and appends Yoma skill names',()=>{
 const claims=[
  {id:'1',text:'Helped customers.',kind:'experience',context:'',dates:'',decision:'accepted'},
  {id:'2',text:'Customer communication',kind:'skill',decision:'accepted',yomaSkill:{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://example.test/skill'}},
  {id:'3',text:'Teamwork',kind:'skill',decision:'accepted',yomaSkill:{id:'x',name:'Teamwork',infoURL:''}},
  {id:'4',text:'Organisation',kind:'skill',decision:'accepted'}
 ];
 const live=core.buildTextCV({},'Retail assistant',claims,{mode:'live',provider:'azure-openai',model:'gpt-4.1-mini',rejected:[]});
 assert.match(live,/YoCV prototype · Live AI generation/);
 assert.doesNotMatch(live,/Sample generation/);
 assert.match(live,/Customer communication \(Yoma skill: Customer Service\)/);
 assert.match(live,/Teamwork · Organisation/);
 assert.doesNotMatch(live,/Teamwork \(Yoma skill/);
 const sample=core.buildTextCV({},'Retail assistant',claims,{mode:'sample',provider:'local',model:null,rejected:[]});
 assert.match(sample,/YoCV prototype · Sample generation/);
 const legacy=core.buildTextCV({},'Retail assistant',claims);
 assert.match(legacy,/YoCV prototype · Sample generation · Synthetic demonstration record/);
});
test('setCredential maps the Yoma-shaped fixture into the exported credential',()=>{
 assert.equal(typeof core.setCredential,'function');
 const ref=core.credential;
 try{
  core.setCredential(fixture);
  assert.equal(core.credential,ref,'credential export stays the same object');
  assert.equal(core.credential.id,'sample-credential-atingi-digital-skills');
  assert.equal(core.credential.title,'Digital Skills Foundations');
  assert.equal(core.credential.issuer,'Yoma (Youth Agency Marketplace)');
  assert.equal(core.credential.sourceLabel,'Atingi via Yoma');
  assert.equal(core.credential.date,'2026-09-12');
  assert.equal(core.credential.dates,'September 2026');
  assert.equal(core.credential.statement,'Completed Digital Skills Foundations.');
  assert.deepEqual(core.credential.sourceMeta,{artifactType:'JWS',schemaType:'Opportunity'});
  assert.equal(core.credential.synthetic,false);
  assert.equal(core.credential.sample,true);
  const [claim]=core.evidenceClaims({...care,credential:true});
  assert.equal(claim.kind,'learning');
  assert.equal(claim.sourceId,'sample-credential-atingi-digital-skills');
  assert.equal(claim.sourceLabel,'Atingi via Yoma');
  assert.equal(claim.context,'Digital Skills Foundations');
  assert.equal(claim.dates,'September 2026');
  assert.equal(claim.text,'Completed Digital Skills Foundations.');
  assert.deepEqual(claim.sourceMeta,{artifactType:'JWS',schemaType:'Opportunity'});
  assert.equal(claim.category,'verified');
  assert.throws(()=>core.setCredential({title:'No id'}),/credential/i);
  assert.equal(core.credential.id,'sample-credential-atingi-digital-skills','a rejected fixture leaves the current credential untouched');
  assert.throws(()=>core.setCredential('str'),/credential/i);
  assert.equal(core.credential.title,'Digital Skills Foundations','a non-object fixture leaves the current credential untouched');
  core.setCredential({id:'x',title:'T',dateIssued:'not a date'});
  assert.equal(core.credential.date,'','an unparseable dateIssued gives an empty date');
  assert.equal(core.credential.dates,'','an unparseable dateIssued gives an empty dates');
 }finally{core.setCredential(null);}
 assert.equal(core.credential.id,'credential-demo');
 assert.equal(core.credential.synthetic,true);
});
