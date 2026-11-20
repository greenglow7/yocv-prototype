const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');
const {createLocalProvider}=require('../server/providers/local.js');
const {ProviderError}=require('../server/providers/errors.js');
const {draftEntry,draftEntries,MAX_BULLETS}=require('../server/cv/draft.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const {entry}=JSON.parse(read('tests/fixtures/cv-thandi.json'));
const MENU=[{id:'h1',name:'Hairstyling',infoURL:'https://x/h'},{id:'c1',name:'Customer Service',infoURL:'https://x/c'}];
const fake=output=>{const calls=[];return {name:'azure-openai',model:'gpt-4.1-mini',calls,async cvBullets(input){calls.push(JSON.parse(JSON.stringify(input)));return output;}};};
test('a grounded model bullet is kept with its quote, checks and highlight',async()=>{
  const p=fake({bullets:[{text:'Braided hair at home for about 40 customers a week since March 2025.',usedNumbers:['40','2025'],sourceFields:['what','number','months'],sourceQuote:'braid hair at home'}],skills:[{name:'Hairstyling',sourceQuote:'braid hair at home'}]});
  const r=await draftEntry({role:'Hairdresser',entry,index:0,provider:p,menu:MENU});
  assert.equal(r.proposals[0].origin,'model'); assert.equal(r.proposals[0].templateWording,false);
  assert.equal(r.proposals[0].text.slice(...r.proposals[0].highlight),'about 40');
  assert.deepEqual(r.skills,[{name:'Hairstyling',yomaSkill:MENU[0],sourceQuote:'braid hair at home'}]);
});
test('when every model bullet is refused the template wording is shown and the refusal recorded',async()=>{
  const p=fake({bullets:[{text:'Braided hair for over 50 customers a week since March 2025.',usedNumbers:['50'],sourceFields:['what'],sourceQuote:'braid hair at home'}],skills:[]});
  const r=await draftEntry({role:'Hairdresser',entry,index:0,provider:p,menu:MENU});
  assert.deepEqual(r.rejected,[{kind:'bullet',text:'Braided hair for over 50 customers a week since March 2025.',reason:'invented_number'}]);
  assert.equal(r.proposals[0].origin,'template'); assert.equal(r.proposals[0].templateWording,true);
});
const KNOWN=['Thandi','Thandi','Mokoena','Khayelitsha','Cape','Town']; // firstName, displayName words, city words (Task 12)
test('Review Focus 2 (model half): the model never sees names, contacts or the place, and names come back restored',async()=>{
  const e={...entry,what:"I braid hair at Mama Joy's salon for women in my street, orders on 071 000 0000 or orders2@example.org"};
  const p=fake({bullets:[{text:"Braided hair at [name1] [name2]'s salon for about 40 customers a week.",usedNumbers:['40'],sourceFields:['what','number'],sourceQuote:"braid hair at [name1] [name2]'s salon"}],skills:[]});
  const r=await draftEntry({role:'Hairdresser',entry:e,index:0,provider:p,menu:MENU,known:KNOWN});
  const sent=JSON.stringify(p.calls[0]);
  assert.ok(!/Mama|Joy|Khayelitsha|Thandi|Mokoena|071|example\.org|"place"|"confirm"/.test(sent)&&sent.includes('[name1]')&&sent.includes('[contact1]'));
  assert.equal(r.proposals[0].text,"Braided hair at Mama Joy's salon for about 40 customers a week.");
});
test('Review Focus 2: a town as the first word of the answer never reaches the model',async()=>{
  const e={...entry,what:'Khayelitsha is where I braid hair at home for women in my street.'};
  const p=fake({bullets:[{text:'Braided hair at home for about 40 customers a week since March 2025.',usedNumbers:['40','2025'],sourceFields:['what','number','months'],sourceQuote:'braid hair at home'}],skills:[]});
  await draftEntry({role:'Hairdresser',entry:e,index:0,provider:p,menu:MENU,known:KNOWN});
  assert.ok(!/Khayelitsha/.test(JSON.stringify(p.calls[0])));
});
test('a contact placeholder from the model is refused, never restored',async()=>{
  const e={...entry,what:'I braid hair at home for women in my street, orders on 071 000 0000.'};
  const p=fake({bullets:[{text:'Braided hair at home for about 40 customers a week, orders on [contact1].',usedNumbers:['40'],sourceFields:['what','number'],sourceQuote:'braid hair at home'}],skills:[]});
  const r=await draftEntry({role:'Hairdresser',entry:e,index:0,provider:p,menu:MENU,known:KNOWN});
  assert.equal(r.rejected[0].reason,'contact_detail');
  assert.ok(!r.proposals.some(x=>x.text.includes('071')));
});
test('an invented placeholder or a new proper noun is refused as invented_name',async()=>{
  const a='Braided hair at [name7] for about 40 customers a week since March 2025.',b='Braided hair at Sunrise Salon for about 40 customers a week since March 2025.';
  const p=fake({bullets:[{text:a,usedNumbers:['40','2025'],sourceFields:['what','number','months'],sourceQuote:'braid hair at home'},{text:b,usedNumbers:['40','2025'],sourceFields:['what','number','months'],sourceQuote:'braid hair at home'}],skills:[]});
  const r=await draftEntry({role:'Hairdresser',entry,index:0,provider:p,menu:MENU});
  assert.deepEqual(r.rejected,[{kind:'bullet',text:a,reason:'invented_name'},{kind:'bullet',text:b,reason:'invented_name'}]);
  assert.equal(r.proposals.length,1); assert.equal(r.proposals[0].origin,'template'); assert.equal(r.proposals[0].templateWording,true);
  assert.equal(r.needsDetail,false);
});
test('a third bullet is over_limit; an off-menu skill and an unquoted skill are refused',async()=>{
  const b1='Braided hair at home for about 40 customers a week since March 2025.',b2='Braided box braids and cornrows for about 40 customers a week.',b3='Braided hair at home for women in my street a few times a week.';
  const bullet=(text,sourceQuote)=>({text,usedNumbers:[],sourceFields:['what'],sourceQuote});
  const menu=[...MENU,{id:'a1',name:'Advanced Braiding',infoURL:'https://x/a'}];
  const p=fake({bullets:[bullet(b1,'braid hair at home'),bullet(b2,'mostly box braids and cornrows'),bullet(b3,'braid hair at home')],skills:[{name:'Braiding',sourceQuote:'braid hair at home'},{name:'Customer Service',sourceQuote:'serve customers well'},{name:'Advanced Braiding',sourceQuote:'braid hair at home'},{name:'Hairstyling',sourceQuote:'braid hair at home'}]});
  const r=await draftEntry({role:'Hairdresser',entry,index:0,provider:p,menu});
  assert.equal(MAX_BULLETS,2);
  assert.deepEqual(r.proposals.map(x=>[x.text,x.origin]),[[b1,'model'],[b2,'model']]);
  assert.deepEqual(r.proposals[0].checks,['numbers','names','overstatement','opening','length','quote']);
  assert.deepEqual(r.rejected,[{kind:'bullet',text:b3,reason:'over_limit'},{kind:'skill',text:'Braiding',reason:'skill_not_in_menu'},{kind:'skill',text:'Customer Service',reason:'quote_not_found'},{kind:'skill',text:'Advanced Braiding',reason:'overstated'}]);
  assert.deepEqual(r.skills.map(s=>s.name),['Hairstyling']);
});
test('sample mode runs the local provider through the same checks',async()=>{
  const r=await draftEntries({role:'Hairdresser',entries:[entry],provider:createLocalProvider(core),menu:MENU,now:()=>Date.parse('2025-11-19T10:00:00Z')});
  assert.equal(r.generation.mode,'sample'); assert.equal(r.generation.provider,'local');
  assert.equal(r.entries[0].proposals[0].origin,'template'); assert.equal(r.entries[0].proposals[0].templateWording,false);
});
test('an entry whose template also fails asks for more detail',async()=>{
  const r=await draftEntries({role:'Hairdresser',entries:[{...entry,what:'I was the certified braider at home for many women'}],provider:createLocalProvider(core),menu:MENU});
  assert.deepEqual(r.entries[0].proposals,[]); assert.equal(r.entries[0].needsDetail,true);
});
test('a ProviderError propagates',async()=>{
  const err=new ProviderError('provider_timeout',undefined,{retryable:true});
  const p={name:'azure-openai',model:'gpt-4.1-mini',async cvBullets(){throw err;}};
  await assert.rejects(draftEntry({role:'Hairdresser',entry,index:0,provider:p,menu:MENU}),e=>e===err);
  await assert.rejects(draftEntries({role:'Hairdresser',entries:[entry],provider:p,menu:MENU}),e=>e===err);
});
