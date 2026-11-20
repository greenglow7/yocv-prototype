const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');
const {templateBullet,monthsBetween,profileLine}=core;
const {RULES}=require('../cv-rules.js');
const {createLocalProvider}=require('../server/providers/local.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const NOW='2025-11-19T10:00:00Z';
const thandi=JSON.parse(read('tests/fixtures/cv-thandi.json')).entry; // created in this step, see Step 3
test('the template keeps her words, adds the chips and names the people once, so the outcome now fits 180',()=>{
  const r=templateBullet(thandi,RULES,{nowIso:NOW});
  assert.equal(r.text,'Braid hair at home for women in my street, mostly box braids and cornrows a few times a week since March 2025, about 40 customers a week; Most of them come back every month.');
  assert.deepEqual(r.sourceFields,['what','frequency','months','number','outcome'],'the clause already names the people, so forWhom is not used');
  assert.equal(r.text.slice(...r.highlight),'about 40');
  assert.equal(core.checkCvText(r.text,{fields:thandi,role:'Hairdresser',kind:'bullet'},RULES).ok,true);
});
test('a leading I was is dropped; a clause with no verb gets the chip opener once',()=>{
  assert.ok(templateBullet({...thandi,what:'I was selling sweets at school break time to other learners',forWhom:'',number:null,outcome:''},RULES,{nowIso:NOW}).text.startsWith('Selling sweets at school'));
  const t=templateBullet({...thandi,what:'the fruit stall at the taxi rank on Saturdays',forWhom:'a family business'},RULES,{nowIso:NOW}).text;
  assert.ok(t.startsWith('Worked in a family business on the fruit stall')&&!t.includes('for a family business'));
});
test('open issue 3: a clause with its own verb gets no opener, the lead-in is stripped, and the people are named once',()=>{
  const t=(what,forWhom='customers')=>templateBullet({...thandi,what,forWhom,number:null,outcome:''},RULES,{nowIso:NOW}).text;
  const check=(what,forWhom)=>core.checkCvText(t(what,forWhom),{fields:{...thandi,what,forWhom,number:null,outcome:''},role:'Hairdresser',kind:'bullet'},RULES);
  assert.ok(t('I am selling sweets at school break time').startsWith('Selling sweets at school break time for customers'));
  assert.ok(t("I'm helping my aunt at the stall").startsWith('Helping my aunt at the stall for customers'));
  assert.ok(t('I help my aunt at the stall every day').startsWith('Help my aunt at the stall every day for customers'));
  assert.ok(t("I've been braiding hair at home").startsWith('Braiding hair at home for customers'));
  assert.ok(t('I used to pack shelves at the shop','an employer').startsWith('Pack shelves at the shop for an employer'));
  assert.ok(t('We sold sweets at school break time').startsWith('Sold sweets at school break time for customers'));
  assert.ok(t('I manage my own braiding table at home').startsWith('Manage my own braiding table at home for customers'));
  assert.ok(t('the fruit stall at the taxi rank','my aunt').startsWith('Worked on the fruit stall at the taxi rank for my aunt'),'a free-text whom is kept with the bare opener');
  assert.ok(t('sold sweets for R5 each at school').startsWith('Sold sweets for R5 each at school a few'),'a clause with its own for gets no second one');
  for(const [what,whom] of [['did hair for free at church events','a community group'],['I got up early to open the shop','an employer']]){
    assert.ok(!/\bon (?:did|got)\b/.test(t(what,whom)),t(what,whom));
    assert.equal(check(what,whom).reason,'weak_opening','the opening check, not a broken opener, asks for an action verb');
  }
  for(const what of ['I am selling sweets at school break time',"I'm helping my aunt at the stall",'I help my aunt at the stall every day','I used to pack shelves at the shop'])assert.equal(check(what,'customers').ok,true,what);
});
test('Review Focus 3: reversed or future months are never printed; one month reads 1 month',()=>{
  assert.ok(!templateBullet({...thandi,months:{start:'2026-04',end:'2025-03'}},RULES,{nowIso:NOW}).text.includes('2026'));
  assert.equal(monthsBetween('2025-11','2025-11',NOW),1);
  assert.equal(monthsBetween('2025-12','',NOW),null);
  assert.equal(profileLine({role:'Hairdresser',skills:[],entries:[{...thandi,title:'Braiding at home',months:{start:'2025-11',end:'2025-11'}}],nowIso:NOW}).text,'Hairdresser with 1 month of braiding at home.');
});
test('a sentence that cannot fit 180 is never shown',()=>{
  assert.equal(templateBullet({...thandi,what:'I '+'braid hair at home and '.repeat(9)},RULES,{nowIso:NOW}),null);
});
test('the profile line uses the two strongest skills and the longest entry',()=>{
  const skills=[{name:'Customer Service',level:'S1'},{name:'Cosmetics',level:'S1'},{name:'Hairstyling',level:'S2'}];
  assert.deepEqual(profileLine({role:'Hairdresser',skills,entries:[thandi],nowIso:NOW}),{text:'Hairdresser with customer service and cosmetics recorded on Yoma and 9 months of braiding at home.',months:9});
  assert.equal(profileLine({role:'Hairdresser',skills:[{name:'Customer Service',level:'S1'},{name:'Hairstyling',level:'S2'}],entries:[thandi],nowIso:NOW}).text,'Hairdresser with customer service recorded on Yoma, hairstyling and 9 months of braiding at home.');
});
test('the local provider returns the template bullet and only a skill named in the answer',async()=>{
  const p=createLocalProvider(core);
  const out=await p.cvBullets({role:'Hairdresser',entry:{...thandi,outcome:'Good customer service brings them back.'},menuNames:['Hairstyling','Customer Service'],learningTitles:[],nowIso:NOW});
  assert.equal(out.bullets.length,1);
  assert.deepEqual(out.bullets[0].usedNumbers,['2025','40']);
  assert.deepEqual(out.skills,[{name:'Customer Service',sourceQuote:'Good customer service brings them back.'}]);
});
