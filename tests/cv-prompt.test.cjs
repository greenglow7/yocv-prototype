const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildCvSchema,buildCvMessages,CV_SCHEMA_NAME}=require('../server/providers/schema.js');
const azure=require('../server/providers/azure-openai.js');
const compat=require('../server/providers/openai-compatible.js');
const {INFLATION}=require('../server/cv/validate.js');

const {fakeFetch,completion,fakeSleep,azureConfig,openaiConfig}=require('./helpers/providers.cjs'); // Task 3
const masked={title:'Braiding at home',what:"I braid hair at [name1] [name2]'s salon on Saturdays",forWhom:'customers',frequency:'weekly',months:{start:'2025-03',end:''},number:{value:40,unit:'customers a week',hedge:'about'},outcome:''};
test('buildCvSchema is strict, uses the menu as enum and leaves skills out without a menu',()=>{
  const s=buildCvSchema(['Hairstyling','Customer Service']);
  assert.deepEqual(s.required,['bullets','skills']);
  assert.deepEqual(s.properties.bullets.items.required,['text','usedNumbers','sourceFields','sourceQuote']);
  assert.deepEqual(s.properties.skills.items.properties.name.enum,['Hairstyling','Customer Service']);
  assert.deepEqual(buildCvSchema([]).required,['bullets']);
  assert.ok(!JSON.stringify(s).includes('maxItems'));
});
test('the prompt carries the rules, two examples, the masked answers and the titles, never contact details',()=>{
  const m=buildCvMessages({role:'Hairdresser',entry:masked,menuNames:['Hairstyling'],learningTitles:['Customer Care Skills and Telephone Etiquette']});
  for(const s of ['Never add a number, a name, an employer, a date or an outcome','Keep the person\'s hedge','between 40 and 180 characters','[name1]','Example 1','Example 2',...INFLATION])assert.ok(m[0].content.includes(s),s);
  assert.ok(m[1].content.includes('<<<ENTRY>>>')&&m[1].content.includes("[name1] [name2]'s salon")&&m[1].content.includes('Learning on Yoma (context only, do not mention): Customer Care Skills and Telephone Etiquette'));
  assert.ok(!/Thandi|Mokoena|\+27|Khayelitsha|@/.test(JSON.stringify(m)));
});
test('cvBullets sends the CV schema through complete() and refuses a reply that breaks it',async()=>{
  const good={bullets:[{text:'Braided hair at [name1] [name2]\'s salon for about 40 customers a week.',usedNumbers:['40'],sourceFields:['what','number'],sourceQuote:'braid hair'}],skills:[]};
  const {fetch,calls}=fakeFetch(()=>completion(good));
  const p=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
  assert.deepEqual(await p.cvBullets({role:'Hairdresser',entry:masked,menuNames:['Hairstyling'],learningTitles:[]}),good);
  assert.equal(JSON.parse(calls[0].init.body).response_format.json_schema.name,'yocv_cv_bullets');
  const {fetch:f2}=fakeFetch(()=>completion({bullets:[{text:'x'}],skills:[]}));
  await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:f2,sleep:fakeSleep().sleep}).cvBullets({role:'Hairdresser',entry:masked,menuNames:['Hairstyling'],learningTitles:[]}),{code:'provider_bad_output'});
});
test('cvBullets in json_object mode puts the CV schema in the prompt',async()=>{
  const good={bullets:[{text:'Braided hair at [name1] [name2]\'s salon for about 40 customers a week.',usedNumbers:['40'],sourceFields:['what','number'],sourceQuote:'braid hair'}],skills:[{name:'Hairstyling',sourceQuote:'braid hair'}]};
  const {fetch,calls}=fakeFetch(()=>completion(good));
  const p=compat.createOpenAICompatibleProvider({...openaiConfig,structuredOutput:'json_object'},{fetch,sleep:fakeSleep().sleep});
  assert.deepEqual(await p.cvBullets({role:'Hairdresser',entry:masked,menuNames:['Hairstyling'],learningTitles:[]}),good);
  const body=JSON.parse(calls[0].init.body);
  assert.deepEqual(body.response_format,{type:'json_object'});
  assert.equal(body.messages[0].role,'system');
  assert.ok(body.messages[0].content.endsWith(JSON.stringify(buildCvSchema(['Hairstyling']))));
  assert.equal(body.max_tokens,600);
  assert.equal(CV_SCHEMA_NAME,'yocv_cv_bullets');
  const {fetch:f2}=fakeFetch(()=>completion({...good,skills:[{name:'Braiding',sourceQuote:'braid hair'}]}));
  await assert.rejects(compat.createOpenAICompatibleProvider({...openaiConfig,structuredOutput:'json_object'},{fetch:f2,sleep:fakeSleep().sleep}).cvBullets({role:'Hairdresser',entry:masked,menuNames:['Hairstyling'],learningTitles:[]}),{code:'provider_bad_output',retryable:true});
});
test('cvBullets with no menu asks for no skills and accepts an empty skills list',async()=>{
  const reply={bullets:[{text:'Braided hair at [name1] [name2]\'s salon on Saturdays.',usedNumbers:[],sourceFields:['what'],sourceQuote:'braid hair'}],skills:[]};
  const {fetch,calls}=fakeFetch(()=>completion(reply));
  const {cvBullets}=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
  assert.deepEqual(await cvBullets({role:'Hairdresser',entry:masked,menuNames:[],learningTitles:[]}),reply);
  assert.ok(JSON.parse(calls[0].init.body).messages[1].content.includes('Skill list: none. Return an empty skills list.'),'the user message agrees with the system prompt and its examples');
  const {fetch:f2}=fakeFetch(()=>completion({...reply,skills:[{name:'Hairstyling',sourceQuote:'braid hair'}]}));
  await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:f2,sleep:fakeSleep().sleep}).cvBullets({role:'Hairdresser',entry:masked,menuNames:[],learningTitles:[]}),{code:'provider_bad_output'});
});
test('cvBullets in json_object mode with no menu accepts an empty skills list and still refuses a filled one (final review 6)',async()=>{
  const reply={bullets:[{text:'Braided hair at [name1] [name2]\'s salon on Saturdays.',usedNumbers:[],sourceFields:['what'],sourceQuote:'braid hair'}],skills:[]};
  const {fetch,calls}=fakeFetch(()=>completion(reply));
  const make=f=>compat.createOpenAICompatibleProvider({...openaiConfig,structuredOutput:'json_object'},{fetch:f,sleep:fakeSleep().sleep});
  assert.deepEqual(await make(fetch).cvBullets({role:'Hairdresser',entry:masked,menuNames:[],learningTitles:[]}),reply);
  const messages=JSON.parse(calls[0].init.body).messages;
  assert.ok(messages[0].content.includes('If none fits, return an empty skills list.')&&messages[1].content.includes('Skill list: none. Return an empty skills list.'));
  const {fetch:f2}=fakeFetch(()=>completion({...reply,skills:[{name:'Hairstyling',sourceQuote:'braid hair'}]}));
  await assert.rejects(make(f2).cvBullets({role:'Hairdresser',entry:masked,menuNames:[],learningTitles:[]}),{code:'provider_bad_output'});
  // complete() itself still checks json_object output for the YoCard pipeline.
  const {fetch:f3}=fakeFetch(()=>completion({bullets:[],skills:[]}));
  await assert.rejects(make(f3).complete({schemaName:'x',schema:buildCvSchema([]),messages:[{role:'user',content:'x'}]}),{code:'provider_bad_output'});
});
