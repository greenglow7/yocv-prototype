const {test}=require('node:test');
const assert=require('node:assert/strict');
const {ProviderError}=require('../server/providers/errors.js');
let draft={};
try{draft=require('../server/card/draft.js');}catch{}
const {evidenceList,selfDeclaredSchema,confirmsSchema,localDraft,validateSelfDeclared,validateConfirms,runDraft}=draft;

// Snapshot in the spec §3.1 shape (fictional adult persona; built inline so this suite does not depend on account.js).
const thandi={
 source:'sample',readAt:'2026-11-12T10:00:00.000Z',apiBase:'https://api.yoma.world/api/v3',
 user:{id:'u-thandi',displayName:'Thandi Mokoena',firstName:'Thandi',photoURL:'https://cdn.example.test/thandi.jpg',country:'South Africa',city:'Cape Town',dateOfBirth:'2002-03-14',dateCreated:'2024-02-01T00:00:00Z',yoIDOnboarded:true,dateYoIDOnboarded:'2024-02-03T00:00:00Z',phoneNumberConfirmed:true,phoneNumber:'+27821234567',emailConfirmed:false,opportunityCountCompleted:3,opportunityCountPending:0,opportunityCountRejected:0},
 completions:[
  {evidenceId:'c1',myOpportunityId:'m1',opportunityId:'019e6f89-b66b-798e-a380-cbf33d634de5',title:'Hair Styling',organizationName:'Alison',organizationLogoURL:null,dateCompleted:'2025-06-10T00:00:00Z',verificationStatus:'Completed',opportunityType:'Learning',skills:[{id:'sk1',name:'Hairdressing',infoURL:null}],evidenceTypes:['FileUpload'],live:{verificationMethod:'Manual',verificationTypes:[{type:'FileUpload',displayName:'File upload',description:''}],participantCountCompleted:120,yomaInfoURL:'https://app.yoma.world/opportunities/019e6f89-b66b-798e-a380-cbf33d634de5',published:true}},
  {evidenceId:'c2',myOpportunityId:'m2',opportunityId:'019e6f11-51ae-7a56-bbdd-9ee548b58cda',title:'Customer Care Skills',organizationName:'Alison',organizationLogoURL:null,dateCompleted:'2025-09-02T00:00:00Z',verificationStatus:'Completed',opportunityType:'Learning',skills:[{id:'sk2',name:'Customer Service',infoURL:null}],evidenceTypes:[],live:{verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:40,yomaInfoURL:'https://app.yoma.world/opportunities/019e6f11-51ae-7a56-bbdd-9ee548b58cda',published:true}},
  {evidenceId:'c3',myOpportunityId:'m3',opportunityId:'019a1062-2518-756d-bc33-1b68b8f67d96',title:'Financial Literacy for Gig Workers',organizationName:'UNICEF Kenya',organizationLogoURL:null,dateCompleted:'2026-01-15T00:00:00Z',verificationStatus:'Completed',opportunityType:'Learning',skills:[],evidenceTypes:['FileUpload'],live:null}
 ],
 skills:[
  {evidenceId:'s1',id:'sk1',name:'Hairdressing',infoURL:'https://lightcast.io/skills/hairdressing',organizations:[{id:'o1',name:'Alison',logoURL:null}]},
  {evidenceId:'s2',id:'sk2',name:'Customer Service',infoURL:null,organizations:[{id:'o1',name:'Alison',logoURL:null}]}
 ]
};
const sipho={
 ...thandi,
 user:{...thandi.user,id:'u-sipho',displayName:'Sipho Dlamini',firstName:'Sipho',photoURL:null,city:'Durban',dateOfBirth:'2007-05-20',phoneNumber:'+27831112223',opportunityCountCompleted:0},
 completions:[],skills:[]
};
const description='I do braids and cornrows in Khayelitsha, R150-R400, Mon-Sat. I speak isiXhosa and English.';
const goodSelf={headline:'Braids and cornrows in Khayelitsha',services:[{name:'Braids',priceFrom:150,priceTo:400,currency:'ZAR'},{name:'Cornrows',priceFrom:150,priceTo:null,currency:'ZAR'}],area:'Khayelitsha',hours:'Mon-Sat',languages:['isiXhosa','English'],notes:''};
const goodConfirms={lines:[
 {text:'Completed Hair Styling with Alison in June 2025; Alison checked a file upload.',evidenceIds:['c1']},
 {text:'Completed Customer Care Skills with Alison in September 2025, checked automatically.',evidenceIds:['c2']}
]};

function fakeProvider(outputs,{name='azure-openai',model='gpt-4.1-mini'}={}){
 const calls=[];
 return {name,model,calls,
  async generate(){throw new Error('generate must not be used by the draft pipeline');},
  async complete(request,opts){
   calls.push({request,opts});
   const out=outputs[request.schemaName];
   if(out===undefined)throw new Error('no fake output for '+request.schemaName);
   if(out instanceof Error)throw out;
   return typeof out==='function'?out(request):out;
  }};
}
const outputs=(self=goodSelf,confirms=goodConfirms)=>({yocard_self_declared:self,yocard_confirms:confirms});
const USER_FIELDS=/Thandi|Mokoena|Sipho|Dlamini|\+27|2002-03-14|2007-05-20|displayName|phoneNumber|dateOfBirth|photoURL|thandi\.jpg|emailConfirmed/;

test('evidenceList maps completions and skills with ids and never includes user fields',()=>{
 assert.equal(typeof evidenceList,'function');
 const list=evidenceList(thandi);
 assert.deepEqual(list.map(e=>e.evidenceId),['c1','c2','c3','s1','s2']);
 assert.deepEqual(list.map(e=>e.kind),['completion','completion','completion','skill','skill']);
 assert.equal(list[0].title,'Hair Styling');
 assert.equal(list[0].organizationName,'Alison');
 assert.equal(list[0].dateCompleted,'2025-06-10T00:00:00Z');
 assert.deepEqual(list[0].evidenceTypes,['FileUpload']);
 assert.equal(list[0].verificationMethod,'Manual');
 assert.deepEqual(list[0].skills,['Hairdressing']);
 assert.equal(list[2].verificationMethod,null);
 assert.equal(list[2].organizationName,'UNICEF Kenya');
 assert.equal(list[3].title,'Hairdressing');
 assert.equal(list[3].organizationName,'Alison');
 assert.doesNotMatch(JSON.stringify(list),USER_FIELDS);
 assert.deepEqual(evidenceList(sipho),[]);
});

test('schemas are strict, use no maxItems and put the evidence ids in an enum',()=>{
 const self=selfDeclaredSchema();
 assert.doesNotMatch(JSON.stringify(self),/maxItems|minItems/);
 assert.equal(self.additionalProperties,false);
 assert.deepEqual(self.required.slice().sort(),['area','headline','hours','languages','notes','services']);
 assert.deepEqual(self.properties.services.items.required.slice().sort(),['currency','name','priceFrom','priceTo']);
 assert.equal(self.properties.services.items.additionalProperties,false);
 const confirms=confirmsSchema(['c1','c2']);
 assert.doesNotMatch(JSON.stringify(confirms),/maxItems|minItems/);
 assert.deepEqual(confirms.required,['lines']);
 assert.deepEqual(confirms.properties.lines.items.properties.evidenceIds.items.enum,['c1','c2']);
 assert.deepEqual(confirms.properties.lines.items.required.slice().sort(),['evidenceIds','text']);
});

test('runDraft keeps good model output and reports live generation',async()=>{
 assert.equal(typeof runDraft,'function');
 const provider=fakeProvider(outputs());
 let t=1000;
 const result=await runDraft({snapshot:thandi,trade:'hair',description,provider,now:()=>{t+=120;return t;}});
 assert.deepEqual(result.selfDeclared,goodSelf);
 assert.equal(result.confirms.length,2);
 assert.deepEqual(result.confirms.map(l=>l.evidenceIds),[['c1'],['c2']]);
 assert.equal(result.confirms[0].text,goodConfirms.lines[0].text);
 assert.equal(result.generation.mode,'live');
 assert.equal(result.generation.provider,'azure-openai');
 assert.equal(result.generation.model,'gpt-4.1-mini');
 assert.equal(result.generation.generatedAt,new Date(1240).toISOString());
 assert.equal(result.generation.durationMs,120);
 assert.deepEqual(result.generation.rejected,[]);
 assert.equal(provider.calls.length,2);
 assert.equal(provider.calls[0].request.schemaName,'yocard_self_declared');
 assert.equal(provider.calls[1].request.schemaName,'yocard_confirms');
});

test('model input contains trade, description, country and the evidence list but never user fields',async()=>{
 const provider=fakeProvider(outputs());
 await runDraft({snapshot:thandi,trade:'hair',description,provider});
 const all=JSON.stringify(provider.calls.map(c=>c.request));
 assert.doesNotMatch(all,USER_FIELDS);
 const first=provider.calls[0].request;
 assert.equal(first.messages[0].role,'system');
 assert.equal(first.messages[1].role,'user');
 assert.match(first.messages[1].content,/<<<DESCRIPTION>>>[\s\S]*braids and cornrows[\s\S]*<<<END>>>/);
 assert.match(first.messages[1].content,/hair/);
 assert.match(first.messages[1].content,/South Africa/);
 assert.doesNotMatch(first.messages[1].content,/Hair Styling|Alison/);
 const second=provider.calls[1].request;
 assert.match(second.messages[1].content,/"c1"[\s\S]*"c2"[\s\S]*"c3"[\s\S]*"s1"/);
 assert.match(second.messages[1].content,/Hair Styling/);
 assert.match(second.messages[1].content,/UNICEF Kenya/);
 assert.deepEqual(second.schema.properties.lines.items.properties.evidenceIds.items.enum,['c1','c2','c3','s1','s2']);
});

test('confirms lines are dropped when uncited, citing unknown ids, naming the wrong organisation, too long or over the limit',async()=>{
 const lines=[
  {text:'Completed Hair Styling with Alison in June 2025.',evidenceIds:['c1']},
  {text:'Completed a course on Yoma.',evidenceIds:['c9']},
  {text:'Completed something somewhere.',evidenceIds:[]},
  {text:'Completed Hair Styling with UNICEF Kenya.',evidenceIds:['c1']},
  {text:'Completed Financial Literacy for Gig Workers with UNICEF Kenya in January 2026; UNICEF Kenya checked a file upload.',evidenceIds:['c3']},
  {text:'Holds the skills Hairdressing and Customer Service awarded by Alison.',evidenceIds:['s1','s2']},
  {text:'Completed Customer Care Skills with Alison. '+'x'.repeat(120),evidenceIds:['c2']}
 ];
 const provider=fakeProvider(outputs(goodSelf,{lines}));
 const result=await runDraft({snapshot:thandi,trade:'hair',description,provider});
 // Truncation to four lines happens before the per-line checks (as in Phase 1), so only the first line survives.
 assert.deepEqual(result.confirms.map(l=>l.evidenceIds),[['c1']]);
 const reasons=result.generation.rejected.filter(r=>r.kind==='confirm').map(r=>r.reason);
 assert.deepEqual(reasons,['over_limit','over_limit','over_limit','unknown_evidence','uncited_evidence','wrong_organisation']);
 const direct=validateConfirms(lines.slice(0,4),thandi);
 assert.deepEqual(direct.lines.map(l=>l.evidenceIds),[['c1']]);
 assert.deepEqual(direct.rejected.map(r=>r.reason),['unknown_evidence','uncited_evidence','wrong_organisation']);
 const long=validateConfirms([lines[6]],thandi);
 assert.deepEqual(long.lines,[]);
 assert.deepEqual(long.rejected.map(r=>r.reason),['length']);
});

test('self-declared fields are dropped for invented numbers, credential claims, organisation names and over the limit',async()=>{
 const self={
  headline:'Certified stylist',
  services:[
   {name:'Braids',priceFrom:150,priceTo:400,currency:'ZAR'},
   {name:'Wash',priceFrom:50,priceTo:null,currency:'ZAR'},
   {name:'Cornrows',priceFrom:null,priceTo:null,currency:''},
   {name:'Twists',priceFrom:null,priceTo:null,currency:''},
   {name:'Locs',priceFrom:null,priceTo:null,currency:''},
   {name:'Weaves',priceFrom:null,priceTo:null,currency:''},
   {name:'Colour',priceFrom:null,priceTo:null,currency:''}
  ],
  area:'Khayelitsha',
  hours:'Mon-Sat',
  languages:['isiXhosa','English','Afrikaans','Zulu','Sesotho'],
  notes:'Trained with Alison.'
 };
 const provider=fakeProvider(outputs(self));
 const result=await runDraft({snapshot:thandi,trade:'hair',description,provider});
 assert.equal(result.selfDeclared.headline,'');
 assert.deepEqual(result.selfDeclared.services.map(s=>s.name),['Braids','Cornrows','Twists','Locs','Weaves']);
 assert.deepEqual(result.selfDeclared.languages,['isiXhosa','English','Afrikaans','Zulu']);
 assert.equal(result.selfDeclared.notes,'');
 const rejected=result.generation.rejected.filter(r=>r.kind==='self');
 assert.deepEqual(rejected.map(r=>r.reason).sort(),['asserts_credential','invented_number','organisation_name','over_limit','over_limit']);
 assert.deepEqual(rejected.find(r=>r.reason==='invented_number'),{kind:'self',field:'services',text:'Wash',reason:'invented_number'});
 assert.deepEqual(rejected.find(r=>r.reason==='asserts_credential'),{kind:'self',field:'headline',text:'Certified stylist',reason:'asserts_credential'});
 assert.equal(rejected.find(r=>r.field==='services'&&r.reason==='over_limit').text,'Colour');
 assert.equal(rejected.find(r=>r.field==='languages').text,'Sesotho');
 // Direct call with an organisation from the live list.
 const direct=validateSelfDeclared({...goodSelf,notes:'Trained by Digify Africa.'},{description,organisationNames:['Digify Africa']});
 assert.equal(direct.value.notes,'');
 assert.deepEqual(direct.rejected,[{kind:'self',field:'notes',text:'Trained by Digify Africa.',reason:'organisation_name'}]);
 assert.deepEqual(validateSelfDeclared(null,{description}).value,{headline:'',services:[],area:'',hours:'',languages:[],notes:''});
});

test('local draft parses prices, area, hours and languages from the description and writes one confirms line per completion',()=>{
 assert.equal(typeof localDraft,'function');
 const {selfDeclared,confirms}=localDraft({snapshot:thandi,trade:'hair',description:'I do braids and cornrows in Khayelitsha, R150-R400, Mon-Sat'});
 assert.equal(selfDeclared.services.length,1);
 assert.equal(selfDeclared.services[0].priceFrom,150);
 assert.equal(selfDeclared.services[0].priceTo,400);
 assert.equal(selfDeclared.services[0].currency,'ZAR');
 assert.match(selfDeclared.services[0].name,/braids and cornrows/i);
 assert.equal(selfDeclared.area,'Khayelitsha');
 assert.match(selfDeclared.hours,/Mon-Sat/);
 assert.ok(selfDeclared.headline.length>0&&selfDeclared.headline.length<=80);
 assert.doesNotMatch(selfDeclared.headline,/^I do/);
 assert.deepEqual(selfDeclared.languages,[]);
 for(const id of ['c1','c2','c3'])assert.equal(confirms.filter(l=>l.evidenceIds.includes(id)).length,1);
 const first=confirms.find(l=>l.evidenceIds.includes('c1'));
 assert.match(first.text,/Completed Hair Styling with Alison on June 2025; Alison checked/);
 assert.match(first.text,/file upload/i);
 const third=confirms.find(l=>l.evidenceIds.includes('c3'));
 assert.match(third.text,/UNICEF Kenya/);
 for(const line of confirms)assert.ok(line.text.length<=120,line.text);
 const spoken=localDraft({snapshot:thandi,trade:'hair',description:'Braids from KSh 500. I speak Swahili and English. Open daily 8am-6pm.'});
 assert.equal(spoken.selfDeclared.services[0].priceFrom,500);
 assert.equal(spoken.selfDeclared.services[0].currency,'KES');
 assert.deepEqual(spoken.selfDeclared.languages,['Swahili','English']);
 assert.match(spoken.selfDeclared.hours,/8am-6pm/);
});

test('runDraft without provider.complete uses the local draft in sample mode and passes the validators',async()=>{
 const local={name:'local',model:null,async generate(){return {output:{experience:[],skills:[]}};}};
 const result=await runDraft({snapshot:thandi,trade:'hair',description,provider:local});
 assert.equal(result.generation.mode,'sample');
 assert.equal(result.generation.provider,'local');
 assert.equal(result.generation.model,null);
 assert.equal(result.selfDeclared.services[0].priceFrom,150);
 assert.equal(result.selfDeclared.services[0].currency,'ZAR');
 assert.equal(result.confirms.length,3);
 assert.deepEqual(result.generation.rejected,[]);
 const none=await runDraft({snapshot:thandi,trade:'hair',description});
 assert.equal(none.generation.mode,'sample');
 assert.equal(none.generation.provider,'local');
});

test('a snapshot with no completions or skills yields no confirms lines and skips the second model call',async()=>{
 const provider=fakeProvider(outputs());
 const live=await runDraft({snapshot:sipho,trade:'cleaner',description:'I clean houses and gardens in Durban. R200 a day.',provider});
 assert.deepEqual(live.confirms,[]);
 assert.equal(provider.calls.length,1);
 const sample=localDraft({snapshot:sipho,trade:'cleaner',description:'I clean houses and gardens in Durban. R200 a day.'});
 assert.deepEqual(sample.confirms,[]);
 assert.equal(sample.selfDeclared.services[0].priceFrom,200);
});

test('ProviderError from the model propagates and malformed output maps to provider_bad_output',async()=>{
 const failing=fakeProvider({yocard_self_declared:new ProviderError('provider_timeout',undefined,{retryable:true})});
 await assert.rejects(runDraft({snapshot:thandi,trade:'hair',description,provider:failing}),err=>{assert.ok(err instanceof ProviderError);assert.equal(err.code,'provider_timeout');return true;});
 const shape=fakeProvider({yocard_self_declared:'not an object',yocard_confirms:goodConfirms});
 await assert.rejects(runDraft({snapshot:thandi,trade:'hair',description,provider:shape}),err=>{assert.ok(err instanceof ProviderError);assert.equal(err.code,'provider_bad_output');return true;});
});

test('local draft does not mistake "mobile money" or "monthly" for opening hours',()=>{
 const snapshot={user:{country:'KE'},completions:[],skills:[]};
 const out=draft.localDraft({snapshot,trade:'boda',description:'Boda boda rides in Kisumu, KSh 50 per trip, mobile money accepted, monthly contracts possible. Mon-Sat 6am-8pm.'});
 assert.doesNotMatch(out.selfDeclared.hours,/mobile|monthly/i);
 assert.match(out.selfDeclared.hours,/Mon-Sat/);
});
