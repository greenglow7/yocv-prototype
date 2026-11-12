const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../core.js');
const {YomaUnavailable}=require('../server/yoma.js');
const {ProviderError,createLocalProvider}=require('../server/providers/index.js');
let generation={}; try {generation=require('../server/generation.js')}catch{}
const {buildSkillMenu,runGeneration}=generation;

const experience='I helped customers find products and packed orders at my aunt’s shop.\nI counted the cash at the end of the day.';
const input={role:'Retail assistant',experience,context:'Family shop',dates:'School holidays, 2025'};
const roleSkills={'Retail assistant':{skillNames:['Customer Service','Cash Handling','Customer Service Certification','Teamwork'],opportunityQueries:['retail']}};
const table={
 'Customer Service':{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/skills/customer-service'},
 'Cash Handling':{id:'cash-1',name:'Cash Handling',infoURL:'https://lightcast.io/skills/cash-handling'},
 'Customer Service Certification':{id:'cert-1',name:'Customer Service Certification',infoURL:'https://lightcast.io/skills/csc'}
};
function fakeYoma({source='live',table:t=table,fail=false}={}){
 const calls=[];
 return {calls,async skillByName(name){calls.push(name);if(fail)throw new YomaUnavailable();return {item:t[name]?{...t[name]}:null,source};}};
}
function fakeProvider(output,{name='azure-openai',model='gpt-4.1-mini'}={}){
 const calls=[];
 return {name,model,calls,async generate(i,opts){calls.push({input:i,opts});if(output instanceof Error)throw output;return {output:typeof output==='function'?output(i):output};}};
}
const good={
 experience:[
  {text:'Helped customers find products in a family shop.',sourceQuote:'helped customers find products',reason:'Reworded from your text; check it still fits.'},
  {text:'Packed customer orders.',sourceQuote:"packed orders at my aunt's shop",reason:'Based on your words about packing orders.'}
 ],
 skills:[
  {name:'Customer Service',sourceQuote:'I helped customers find products',reason:'You described helping customers.'},
  {name:'Cash Handling',sourceQuote:'counted the cash',reason:'You described counting cash.'}
 ]
};
const bullet=(n,quote='helped customers find products')=>({text:'Did task number '+'x'.repeat(n)+'.',sourceQuote:quote,reason:'r'});

test('buildSkillMenu keeps exact Yoma matches, drops credential-style names and unmatched names',async()=>{
 assert.equal(typeof buildSkillMenu,'function');
 const yoma=fakeYoma();
 const {menu,source}=await buildSkillMenu('Retail assistant',{yoma,roleSkills});
 assert.deepEqual(menu,[table['Customer Service'],table['Cash Handling']]);
 assert.equal(source,'live');
 assert.deepEqual(yoma.calls.sort(),['Cash Handling','Customer Service','Customer Service Certification','Teamwork']);
 assert.ok(menu.every(entry=>!/certif|licens|diploma|degree/i.test(entry.name)));
});
test('buildSkillMenu reports cache when any lookup came from cache',async()=>{
 const {menu,source}=await buildSkillMenu('Retail assistant',{yoma:fakeYoma({source:'cache'}),roleSkills});
 assert.equal(menu.length,2);
 assert.equal(source,'cache');
});
test('buildSkillMenu returns an empty menu with source none when Yoma is unavailable',async()=>{
 const {menu,source}=await buildSkillMenu('Retail assistant',{yoma:fakeYoma({fail:true}),roleSkills});
 assert.deepEqual(menu,[]);
 assert.equal(source,'none');
});
test('buildSkillMenu lets a Yoma bad request (programming error) propagate',async()=>{
 const yoma={async skillByName(){const err=new Error('bad');err.code='yoma_bad_request';throw err;}};
 await assert.rejects(buildSkillMenu('Retail assistant',{yoma,roleSkills}),{code:'yoma_bad_request'});
});

test('runGeneration shapes grounded output into claims with Yoma skills attached',async()=>{
 assert.equal(typeof runGeneration,'function');
 const provider=fakeProvider(good);
 let t=1000;
 const {claims,generation:g}=await runGeneration({input,provider,yoma:fakeYoma(),roleSkills,core,now:()=>{t+=250;return t;}});
 assert.equal(claims.length,4);
 assert.deepEqual(claims.map(c=>c.kind),['experience','experience','skill','skill']);
 assert.deepEqual(claims.map(c=>c.id),['experience-0','experience-1','skill-0','skill-1']);
 const first=claims[0];
 assert.equal(first.text,'Helped customers find products in a family shop.');
 assert.equal(first.originalText,first.text);
 assert.equal(first.sourceQuote,'helped customers find products');
 assert.equal(first.sourceId,'experience');
 assert.equal(first.sourceLabel,'Family shop');
 assert.equal(first.sourceText,experience);
 assert.equal(first.category,'self');
 assert.equal(first.originalCategory,'self');
 assert.equal(first.context,'Family shop');
 assert.equal(first.dates,'School holidays, 2025');
 assert.equal(first.decision,'pending');
 assert.equal(first.edited,false);
 assert.equal(first.generated,'model');
 assert.equal(first.reason,'Reworded from your text; check it still fits.');
 const skill=claims[2];
 assert.equal(skill.text,'Customer Service');
 assert.equal(skill.originalText,'Customer Service');
 assert.deepEqual(skill.yomaSkill,table['Customer Service']);
 assert.equal(skill.sourceQuote,'I helped customers find products');
 assert.equal(skill.sourceId,'experience');
 assert.equal(skill.sourceText,experience);
 assert.equal(skill.category,'self');
 assert.equal(skill.generated,'model');
 assert.equal(skill.reason,'You described helping customers.');
 assert.equal(g.mode,'live');
 assert.equal(g.provider,'azure-openai');
 assert.equal(g.model,'gpt-4.1-mini');
 assert.equal(g.skillMenuSize,2);
 assert.equal(g.skillMenuSource,'live');
 assert.deepEqual(g.rejected,[]);
 assert.match(g.generatedAt,/^\d{4}-\d{2}-\d{2}T/);
 assert.equal(typeof g.durationMs,'number');
 assert.ok(g.durationMs>0);
});
test('runGeneration uses "Your experience" as the source label when context is empty',async()=>{
 const {claims}=await runGeneration({input:{...input,context:''},provider:fakeProvider(good),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims[0].sourceLabel,'Your experience');
 assert.equal(claims[0].context,'');
});
test('runGeneration passes the skill menu to the provider',async()=>{
 const provider=fakeProvider(good);
 await runGeneration({input,provider,yoma:fakeYoma(),roleSkills,core});
 const sent=provider.calls[0].input;
 assert.deepEqual(sent.skillMenu,[table['Customer Service'],table['Cash Handling']]);
 assert.deepEqual(sent.menuNames,['Customer Service','Cash Handling']);
 assert.equal(sent.role,'Retail assistant');
 assert.equal(sent.experience,experience);
 assert.equal(sent.context,'Family shop');
 assert.equal(sent.dates,'School holidays, 2025');
});
test('an ungrounded bullet is dropped and listed as quote_not_in_source',async()=>{
 const output={...good,experience:[good.experience[0],{text:'Managed the till.',sourceQuote:'managed the till every day',reason:'r'}]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.deepEqual(claims.filter(c=>c.kind==='experience').map(c=>c.text),['Helped customers find products in a family shop.']);
 assert.deepEqual(g.rejected,[{kind:'experience',text:'Managed the till.',reason:'quote_not_in_source'}]);
});
test('a bullet with an invented number is dropped, while numbers from dates are allowed',async()=>{
 const output={experience:[
  {text:'Served 50 customers a day.',sourceQuote:'helped customers find products',reason:'r'},
  {text:'Helped customers during the 2025 holidays.',sourceQuote:'helped customers find products',reason:'r'}
 ],skills:[]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.deepEqual(claims.map(c=>c.text),['Helped customers during the 2025 holidays.']);
 assert.deepEqual(g.rejected,[{kind:'experience',text:'Served 50 customers a day.',reason:'invented_number'}]);
});
test('a bullet asserting a credential is dropped as asserts_credential',async()=>{
 const output={experience:[{text:'Certified customer helper.',sourceQuote:'helped customers find products',reason:'r'}],skills:[]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims.length,0);
 assert.deepEqual(g.rejected,[{kind:'experience',text:'Certified customer helper.',reason:'asserts_credential'}]);
});
test('an over-long bullet is dropped as length',async()=>{
 const output={experience:[{text:'Helped '+'customers '.repeat(30),sourceQuote:'helped customers find products',reason:'r'}],skills:[]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims.length,0);
 assert.equal(g.rejected.length,1);
 assert.equal(g.rejected[0].reason,'length');
});
test('six bullets are truncated to four with two over_limit entries',async()=>{
 const output={experience:[1,2,3,4,5,6].map(n=>bullet(n)),skills:[]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims.length,4);
 assert.deepEqual(claims.map(c=>c.id),['experience-0','experience-1','experience-2','experience-3']);
 assert.deepEqual(g.rejected,[{kind:'experience',text:bullet(5).text,reason:'over_limit'},{kind:'experience',text:bullet(6).text,reason:'over_limit'}]);
});
test('four skills are truncated to three with one over_limit entry',async()=>{
 const t={...table,'Teamwork':{id:'team-1',name:'Teamwork',infoURL:'https://lightcast.io/skills/teamwork'},'Stock Control':{id:'stock-1',name:'Stock Control',infoURL:'https://lightcast.io/skills/stock'}};
 const rs={'Retail assistant':{skillNames:['Customer Service','Cash Handling','Teamwork','Stock Control'],opportunityQueries:[]}};
 const output={experience:[],skills:['Customer Service','Cash Handling','Teamwork','Stock Control'].map(name=>({name,sourceQuote:'helped customers find products',reason:'r'}))};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma({table:t}),roleSkills:rs,core});
 assert.deepEqual(claims.map(c=>c.text),['Customer Service','Cash Handling','Teamwork']);
 assert.deepEqual(g.rejected,[{kind:'skill',text:'Stock Control',reason:'over_limit'}]);
});
test('a duplicate bullet is dropped as duplicate',async()=>{
 const output={experience:[good.experience[0],{...good.experience[0],text:'  helped customers find products in a family shop. '}],skills:[]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims.length,1);
 assert.equal(g.rejected.length,1);
 assert.equal(g.rejected[0].reason,'duplicate');
 assert.equal(g.rejected[0].kind,'experience');
});
test('a skill outside the menu is dropped as skill_not_in_menu and a skill with no quote as quote_not_in_source',async()=>{
 const output={experience:[],skills:[
  {name:'Customer Service',sourceQuote:'helped customers find products',reason:'r'},
  {name:'Leadership',sourceQuote:'helped customers find products',reason:'r'},
  {name:'Cash Handling',sourceQuote:'ran the whole store alone',reason:'r'}
 ]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.deepEqual(claims.map(c=>c.text),['Customer Service']);
 assert.deepEqual(g.rejected,[{kind:'skill',text:'Leadership',reason:'skill_not_in_menu'},{kind:'skill',text:'Cash Handling',reason:'quote_not_in_source'}]);
});
test('a skill name resolves case-insensitively and the claim takes the Yoma spelling',async()=>{
 const output={experience:[],skills:[{name:'customer service',sourceQuote:'helped customers find products',reason:'r'}]};
 const {claims}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims[0].text,'Customer Service');
 assert.equal(claims[0].yomaSkill.id,table['Customer Service'].id);
});
test('the menu never contains credential-style skills even if the provider names one',async()=>{
 const output={experience:[],skills:[{name:'Customer Service Certification',sourceQuote:'helped customers find products',reason:'r'}]};
 const provider=fakeProvider(output);
 const {claims,generation:g}=await runGeneration({input,provider,yoma:fakeYoma(),roleSkills,core});
 assert.ok(provider.calls[0].input.menuNames.every(n=>!/certif/i.test(n)));
 assert.equal(claims.length,0);
 assert.deepEqual(g.rejected,[{kind:'skill',text:'Customer Service Certification',reason:'skill_not_in_menu'}]);
});
test('when Yoma is unavailable the provider gets an empty menu and the response records it',async()=>{
 const output={experience:[good.experience[0]],skills:[{name:'Customer Service',sourceQuote:'helped customers find products',reason:'r'}]};
 const provider=fakeProvider(output);
 const {claims,generation:g}=await runGeneration({input,provider,yoma:fakeYoma({fail:true}),roleSkills,core});
 assert.deepEqual(provider.calls[0].input.skillMenu,[]);
 assert.deepEqual(provider.calls[0].input.menuNames,[]);
 assert.equal(g.skillMenuSource,'none');
 assert.equal(g.skillMenuSize,0);
 assert.deepEqual(claims.map(c=>c.kind),['experience']);
 assert.equal(g.rejected.filter(r=>r.reason==='yoma_skill_menu_unavailable').length,1);
 assert.ok(g.rejected.some(r=>r.kind==='skill'&&r.text===''&&r.reason==='yoma_skill_menu_unavailable'));
 assert.ok(g.rejected.some(r=>r.kind==='skill'&&r.text==='Customer Service'&&r.reason==='skill_not_in_menu'));
});
test('the provider never receives profile fields',async()=>{
 const provider=fakeProvider(good);
 const withProfile={...input,profile:{name:'Amina Dlamini',email:'amina@example.com',phone:'0821234567',city:'Durban'},name:'Amina Dlamini',email:'amina@example.com',phone:'0821234567',city:'Durban',credential:true,document:{name:'letter.pdf',statement:'secret'}};
 await runGeneration({input:withProfile,provider,yoma:fakeYoma(),roleSkills,core});
 const sent=provider.calls[0].input;
 assert.deepEqual(Object.keys(sent).sort(),['context','dates','experience','menuNames','role','skillMenu']);
 const serialised=JSON.stringify(sent);
 for(const leak of ['Amina','amina@example.com','0821234567','Durban','letter.pdf','secret','profile'])assert.doesNotMatch(serialised,new RegExp(leak));
});
test('a ProviderError from the provider propagates untouched',async()=>{
 const err=new ProviderError('provider_timeout',undefined,{retryable:true});
 await assert.rejects(runGeneration({input,provider:fakeProvider(err),yoma:fakeYoma(),roleSkills,core}),e=>e===err);
});
test('a provider output that is not an object is a provider_bad_output error',async()=>{
 await assert.rejects(runGeneration({input,provider:fakeProvider('nonsense'),yoma:fakeYoma(),roleSkills,core}),e=>e instanceof ProviderError&&e.code==='provider_bad_output');
 await assert.rejects(runGeneration({input,provider:fakeProvider({skills:[]}),yoma:fakeYoma(),roleSkills,core}),e=>e instanceof ProviderError&&e.code==='provider_bad_output');
});
test('malformed items are dropped as malformed rather than crashing',async()=>{
 const output={experience:[good.experience[0],null,{sourceQuote:'helped customers find products'},'text'],skills:[{name:'Customer Service'}]};
 const {claims,generation:g}=await runGeneration({input,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims.length,1);
 assert.equal(g.rejected.length,4);
 assert.ok(g.rejected.every(r=>r.reason==='malformed'));
 assert.deepEqual(g.rejected.map(r=>r.kind),['experience','experience','experience','skill']);
});
test('Review Focus 1: a numbers-only experience yields zero claims without throwing',async()=>{
 const numbers={role:'Retail assistant',experience:'2024 2025 2026 2027 2028 2029 2030 2031',context:'',dates:''};
 const output={experience:[{text:'Helped customers in the shop.',sourceQuote:'helped customers in the shop',reason:'r'}],skills:[{name:'Customer Service',sourceQuote:'helped customers',reason:'r'}]};
 const {claims,generation:g}=await runGeneration({input:numbers,provider:fakeProvider(output),yoma:fakeYoma(),roleSkills,core});
 assert.equal(claims.length,0);
 assert.deepEqual(g.rejected.map(r=>r.reason),['quote_not_in_source','quote_not_in_source']);
});
test('the local provider runs through the same pipeline in sample mode',async()=>{
 const provider=createLocalProvider(core);
 const {claims,generation:g}=await runGeneration({input,provider,yoma:fakeYoma(),roleSkills,core});
 assert.equal(g.mode,'sample');
 assert.equal(g.provider,'local');
 assert.equal(g.model,null);
 const exp=claims.filter(c=>c.kind==='experience');
 assert.equal(exp.length,2);
 assert.equal(exp[0].sourceQuote,'I helped customers find products and packed orders at my aunt’s shop.');
 assert.equal(exp[0].text,'Helped customers find products and packed orders at my aunt’s shop.');
 assert.ok(claims.every(c=>c.generated==='local'));
 const skill=claims.find(c=>c.kind==='skill');
 assert.ok(skill,'the rule skill "Customer communication" is mapped to the Yoma skill "Customer Service" present in the menu');
 assert.equal(skill.text,'Customer Service');
 assert.equal(skill.yomaSkill.name,'Customer Service');
 assert.deepEqual(g.rejected,[]);
});
test('the local provider skill is rejected when no Yoma alias is in the menu',async()=>{
 const rs={'Retail assistant':{skillNames:['Cash Handling'],opportunityQueries:['retail']}};
 const {claims,generation:g}=await runGeneration({input,provider:createLocalProvider(core),yoma:fakeYoma(),roleSkills:rs,core});
 assert.equal(claims.filter(c=>c.kind==='skill').length,0);
 assert.deepEqual(g.rejected,[{kind:'skill',text:'Customer communication',reason:'skill_not_in_menu'}]);
});
test('the local provider skill is attached when its name is in the menu',async()=>{
 const t={'Customer Communication':{id:'cc-1',name:'Customer Communication',infoURL:'https://lightcast.io/skills/cc'}};
 const rs={'Retail assistant':{skillNames:['Customer Communication'],opportunityQueries:[]}};
 const {claims,generation:g}=await runGeneration({input,provider:createLocalProvider(core),yoma:fakeYoma({table:t}),roleSkills:rs,core});
 const skill=claims.find(c=>c.kind==='skill');
 assert.ok(skill);
 assert.equal(skill.text,'Customer Communication');
 assert.equal(skill.yomaSkill.id,'cc-1');
 assert.equal(skill.generated,'local');
 assert.deepEqual(g.rejected,[]);
});
