const {test}=require('node:test');
const assert=require('node:assert/strict');
let errors={},schema={},azure={},compat={},local={},index={};
try{errors=require('../server/providers/errors.js');}catch{}
try{schema=require('../server/providers/schema.js');}catch{}
try{azure=require('../server/providers/azure-openai.js');}catch{}
try{compat=require('../server/providers/openai-compatible.js');}catch{}
try{local=require('../server/providers/local.js');}catch{}
try{index=require('../server/providers/index.js');}catch{}

const KEY='sk-super-secret-key-ABC123';
const menu=['Customer Service','Cash Handling','Teamwork'];
const input={role:'Retail assistant',context:'Family shop',dates:'School holidays, 2025',experience:'I helped customers find products at my aunt’s shop.\nI packed orders and kept the shelves organised.',menuNames:menu};
const goodOutput={experience:[{text:'Helped customers find products in a family shop.',sourceQuote:'I helped customers find products at my aunt’s shop.',reason:'Reworded from your text; check it is accurate.'}],skills:[{name:'Customer Service',sourceQuote:'I helped customers find products',reason:'Evidence of serving customers; include only if it fits.'}]};
const azureConfig={endpoint:'https://my-resource.openai.azure.com',apiKey:KEY,deployment:'gpt-4.1-mini',apiVersion:'2024-10-21'};
const openaiConfig={baseUrl:'https://api.openai.com/v1',apiKey:KEY,model:'gpt-4.1-mini'};

function completion(output,extra={}){return {choices:[{finish_reason:'stop',message:{role:'assistant',content:typeof output==='string'?output:JSON.stringify(output)},...extra}]};}
function jsonResponse(status,body){return new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
function fakeFetch(steps){
 const calls=[];
 const fetch=async(url,init)=>{
  calls.push({url:String(url),init});
  const step=steps[Math.min(calls.length-1,steps.length-1)];
  if(typeof step==='function')return step(url,init);
  if(step instanceof Error)throw step;
  return jsonResponse(step.status,step.body);
 };
 return {fetch,calls};
}
function fakeSleep(){const calls=[];const sleep=async(ms)=>{calls.push(ms);};return {sleep,calls};}
const hangUntilAbort=(url,init)=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});

test('ProviderError carries code, retryable and status',()=>{
 assert.equal(typeof errors.ProviderError,'function');
 const err=new errors.ProviderError('provider_error','Something failed.',{retryable:true,status:500});
 assert.ok(err instanceof Error);
 assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);assert.equal(err.status,500);
});

test('schema follows the strict shape without maxItems and uses the menu as enum',()=>{
 assert.equal(typeof schema.buildSchema,'function');
 const s=schema.buildSchema(menu);
 assert.doesNotMatch(JSON.stringify(s),/maxItems|minItems/);
 assert.deepEqual(s.required,['experience','skills']);
 assert.equal(s.additionalProperties,false);
 assert.deepEqual(s.properties.skills.items.properties.name.enum,menu);
 assert.deepEqual(s.properties.experience.items.required,['text','sourceQuote','reason']);
 assert.deepEqual(s.properties.skills.items.required,['name','sourceQuote','reason']);
 assert.equal(s.properties.experience.items.additionalProperties,false);
 assert.equal(s.properties.skills.items.additionalProperties,false);
});

test('empty menu removes skills from properties and required',()=>{
 const s=schema.buildSchema([]);
 assert.equal('skills' in s.properties,false);
 assert.deepEqual(s.required,['experience']);
});

test('validateOutput accepts the exact shape and rejects deviations',()=>{
 assert.equal(typeof schema.validateOutput,'function');
 assert.deepEqual(schema.validateOutput(goodOutput,menu),{ok:true});
 assert.equal(schema.validateOutput(null,menu).ok,false);
 assert.equal(schema.validateOutput({experience:'x',skills:[]},menu).ok,false);
 assert.equal(schema.validateOutput({experience:[{text:1,sourceQuote:'a',reason:'b'}],skills:[]},menu).ok,false);
 assert.equal(schema.validateOutput({experience:[],skills:[{name:'Not In Menu',sourceQuote:'a',reason:'b'}]},menu).ok,false);
 assert.equal(schema.validateOutput({experience:[]},menu).ok,false);
 assert.deepEqual(schema.validateOutput({experience:[]},[]),{ok:true});
 assert.equal(schema.validateOutput({experience:[],skills:[{name:'Customer Service',sourceQuote:'a',reason:'b'}]},[]).ok,false);
});

test('messages contain the delimited experience and menu but never profile fields',()=>{
 assert.equal(typeof schema.buildMessages,'function');
 const messages=schema.buildMessages({...input,profile:{name:'Amina Ndlovu',email:'amina@example.com',city:'Cape Town',phone:'0821234567'},name:'Amina Ndlovu'});
 assert.equal(messages.length,2);
 assert.equal(messages[0].role,'system');assert.equal(messages[1].role,'user');
 const all=JSON.stringify(messages);
 assert.match(messages[1].content,/<<<EXPERIENCE>>>[\s\S]*packed orders[\s\S]*<<<END>>>/);
 assert.match(messages[1].content,/Retail assistant/);
 assert.match(messages[1].content,/Cash Handling/);
 assert.match(messages[0].content,/verbatim quote/i);
 assert.doesNotMatch(all,/Amina|example\.com|Cape Town|0821234567|profile/);
});

test('empty menu prompt tells the model not to suggest skills and never asks for a skills list',()=>{
 const messages=schema.buildMessages({...input,menuNames:[]});
 assert.match(messages[1].content,/Skill list: none available\. Do not suggest any skills\./);
 assert.doesNotMatch(messages[1].content,/empty skills list/i);
});

test('Azure adapter builds the dated URL, api-key header and strict JSON schema body',async()=>{
 assert.equal(typeof azure.createAzureProvider,'function');
 const {fetch,calls}=fakeFetch([{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 assert.equal(provider.name,'azure-openai');assert.equal(provider.model,'gpt-4.1-mini');
 const result=await provider.generate(input);
 assert.deepEqual(result.output,goodOutput);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://my-resource.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2024-10-21');
 assert.equal(calls[0].init.method,'POST');
 assert.equal(calls[0].init.headers['api-key'],KEY);
 assert.equal(calls[0].init.headers['content-type'],'application/json');
 assert.equal(calls[0].init.headers['user-agent'],'YoCV-prototype');
 const body=JSON.parse(calls[0].init.body);
 assert.equal(body.response_format.type,'json_schema');
 assert.equal(body.response_format.json_schema.strict,true);
 assert.equal(body.response_format.json_schema.name,'yocv_claims');
 assert.deepEqual(body.response_format.json_schema.schema.properties.skills.items.properties.name.enum,menu);
 assert.equal(body.temperature,0.2);assert.equal(body.max_tokens,800);
 assert.equal(body.messages.length,2);
 assert.equal('model' in body,false);
});

test('Azure adapter uses the v1 URL form with model in the body',async()=>{
 const {fetch,calls}=fakeFetch([{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider({...azureConfig,apiVersion:'v1'},{fetch,sleep:fakeSleep().sleep});
 await provider.generate(input);
 assert.equal(calls[0].url,'https://my-resource.openai.azure.com/openai/v1/chat/completions');
 assert.equal(JSON.parse(calls[0].init.body).model,'gpt-4.1-mini');
});

test('Azure adapter accepts a skillMenu of Yoma entries as the menu',async()=>{
 const {fetch,calls}=fakeFetch([{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 const {menuNames,...rest}=input;
 await provider.generate({...rest,skillMenu:menu.map((name,i)=>({id:'id-'+i,name,infoURL:'https://example.test/'+i}))});
 assert.deepEqual(JSON.parse(calls[0].init.body).response_format.json_schema.schema.properties.skills.items.properties.name.enum,menu);
});

test('429 then 200 succeeds after exactly one sleep',async()=>{
 const {fetch,calls}=fakeFetch([{status:429,body:{error:{message:'rate'}}},{status:200,body:completion(goodOutput)}]);
 const sleeper=fakeSleep();
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:sleeper.sleep});
 const result=await provider.generate(input);
 assert.deepEqual(result.output,goodOutput);
 assert.equal(calls.length,2);assert.deepEqual(sleeper.calls,[1500]);
});

test('429 twice maps to provider_rate_limited retryable',async()=>{
 const {fetch,calls}=fakeFetch([{status:429,body:{error:{message:'rate'}}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.generate(input),err=>{assert.ok(err instanceof errors.ProviderError);assert.equal(err.code,'provider_rate_limited');assert.equal(err.retryable,true);assert.equal(err.status,429);return true;});
 assert.equal(calls.length,2);
});

test('500 then 200 succeeds',async()=>{
 const {fetch,calls}=fakeFetch([{status:500,body:'Internal error'},{status:200,body:completion(goodOutput)}]);
 const sleeper=fakeSleep();
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:sleeper.sleep});
 const result=await provider.generate(input);
 assert.deepEqual(result.output,goodOutput);
 assert.equal(calls.length,2);assert.equal(sleeper.calls.length,1);
});

test('500 twice maps to provider_error retryable',async()=>{
 const {fetch,calls}=fakeFetch([{status:503,body:'down'}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.generate(input),err=>{assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);assert.equal(err.status,503);return true;});
 assert.equal(calls.length,2);
});

test('network error then 200 succeeds; repeated network error maps to provider_error',async()=>{
 const first=fakeFetch([new TypeError('fetch failed'),{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch:first.fetch,sleep:fakeSleep().sleep});
 assert.deepEqual((await provider.generate(input)).output,goodOutput);
 assert.equal(first.calls.length,2);
 const second=fakeFetch([new TypeError('fetch failed')]);
 const provider2=azure.createAzureProvider(azureConfig,{fetch:second.fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider2.generate(input),err=>{assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);return true;});
 assert.equal(second.calls.length,2);
});

test('body read failure counts as a network error: one retry then provider_error',async()=>{
 const brokenBody=()=>({ok:true,status:200,text:async()=>{throw new TypeError('terminated');}});
 const first=fakeFetch([brokenBody,{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch:first.fetch,sleep:fakeSleep().sleep});
 assert.deepEqual((await provider.generate(input)).output,goodOutput);
 assert.equal(first.calls.length,2);
 const second=fakeFetch([brokenBody]);
 const sleeper=fakeSleep();
 const provider2=azure.createAzureProvider(azureConfig,{fetch:second.fetch,sleep:sleeper.sleep});
 await assert.rejects(provider2.generate(input),err=>{assert.ok(err instanceof errors.ProviderError);assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);return true;});
 assert.equal(second.calls.length,2);assert.deepEqual(sleeper.calls,[1500]);
});

test('timeout maps to provider_timeout retryable without retry',async()=>{
 const {fetch,calls}=fakeFetch([hangUntilAbort]);
 const sleeper=fakeSleep();
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:sleeper.sleep,timeoutMs:5});
 await assert.rejects(provider.generate(input),err=>{assert.ok(err instanceof errors.ProviderError);assert.equal(err.code,'provider_timeout');assert.equal(err.retryable,true);return true;});
 assert.equal(calls.length,1);assert.equal(sleeper.calls.length,0);
});

test('401 maps to provider_auth not retryable without retry',async()=>{
 const {fetch,calls}=fakeFetch([{status:401,body:{error:{message:'Access denied due to invalid subscription key '+KEY}}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.generate(input),err=>{assert.equal(err.code,'provider_auth');assert.equal(err.retryable,false);assert.equal(err.status,401);assert.doesNotMatch(err.message,new RegExp(KEY));assert.doesNotMatch(JSON.stringify(err),new RegExp(KEY));return true;});
 assert.equal(calls.length,1);
});

test('403 maps to provider_auth',async()=>{
 const {fetch}=fakeFetch([{status:403,body:'forbidden'}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.generate(input),err=>{assert.equal(err.code,'provider_auth');assert.equal(err.retryable,false);return true;});
});

test('400 content_filter maps to provider_bad_output not retryable',async()=>{
 const {fetch,calls}=fakeFetch([{status:400,body:{error:{code:'content_filter',message:'The response was filtered'}}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.generate(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.retryable,false);assert.equal(err.status,400);return true;});
 assert.equal(calls.length,1);
});

test('message.refusal maps to provider_bad_output',async()=>{
 const {fetch}=fakeFetch([{status:200,body:{choices:[{finish_reason:'stop',message:{role:'assistant',content:null,refusal:'I cannot help with that.'}}]}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.generate(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.retryable,true);return true;});
});

test('finish_reason length maps to provider_bad_output',async()=>{
 const {fetch}=fakeFetch([{status:200,body:completion(goodOutput,{finish_reason:'length'})}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.generate(input),err=>{assert.equal(err.code,'provider_bad_output');return true;});
});

test('non-JSON content and schema violations map to provider_bad_output',async()=>{
 const bad=fakeFetch([{status:200,body:completion('{"experience": [')}]);
 await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:bad.fetch,sleep:fakeSleep().sleep}).generate(input),err=>{assert.equal(err.code,'provider_bad_output');return true;});
 const wrong=fakeFetch([{status:200,body:completion({experience:[{text:'x'}],skills:[]})}]);
 await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:wrong.fetch,sleep:fakeSleep().sleep}).generate(input),err=>{assert.equal(err.code,'provider_bad_output');return true;});
 const html=fakeFetch([{status:200,body:'<html>maintenance</html>'}]);
 await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:html.fetch,sleep:fakeSleep().sleep}).generate(input),err=>{assert.equal(err.code,'provider_bad_output');return true;});
});

test('error messages never contain the key string',async()=>{
 const cases=[{status:401,body:'bad key '+KEY},{status:500,body:'oops '+KEY},{status:400,body:{error:{code:'content_filter',message:KEY}}},{status:200,body:completion('not json '+KEY)}];
 for(const step of cases){
  const {fetch}=fakeFetch([step]);
  const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
  await assert.rejects(provider.generate(input),err=>{assert.doesNotMatch(String(err.message),new RegExp(KEY));assert.doesNotMatch(String(err.stack),new RegExp(KEY));return true;});
 }
});

test('OpenAI-compatible adapter uses bearer auth, base URL and model in the body',async()=>{
 assert.equal(typeof compat.createOpenAICompatibleProvider,'function');
 const {fetch,calls}=fakeFetch([{status:200,body:completion(goodOutput)}]);
 const provider=compat.createOpenAICompatibleProvider(openaiConfig,{fetch,sleep:fakeSleep().sleep});
 assert.equal(provider.name,'openai-compatible');assert.equal(provider.model,'gpt-4.1-mini');
 const result=await provider.generate(input);
 assert.deepEqual(result.output,goodOutput);
 assert.equal(calls[0].url,'https://api.openai.com/v1/chat/completions');
 assert.equal(calls[0].init.headers.authorization,'Bearer '+KEY);
 assert.equal(calls[0].init.headers['user-agent'],'YoCV-prototype');
 const body=JSON.parse(calls[0].init.body);
 assert.equal(body.model,'gpt-4.1-mini');
 assert.equal(body.response_format.json_schema.strict,true);
});

test('OpenAI-compatible adapter shares the error mapping',async()=>{
 const {fetch}=fakeFetch([{status:401,body:'nope'}]);
 await assert.rejects(compat.createOpenAICompatibleProvider(openaiConfig,{fetch,sleep:fakeSleep().sleep}).generate(input),err=>{assert.equal(err.code,'provider_auth');return true;});
});

test('local provider maps rule-based claims with sourceQuote equal to the original sentence',async()=>{
 assert.equal(typeof local.createLocalProvider,'function');
 const fakeCore={localExperienceClaims(i){
  const sentences=String(i.experience).split(/\n+/);
  const claims=sentences.map((s,k)=>({id:'experience-'+k,kind:'experience',text:s.replace(/^I looked after\s+/,'Cared for '),sourceQuote:s,sourceText:i.experience,reason:'Check this.',generated:'local'}));
  claims.push({id:'skill-0',kind:'skill',text:'Organisation',sourceText:i.experience,reason:'Suggested from your tasks.',generated:'local'});
  return claims;
 }};
 const provider=local.createLocalProvider(fakeCore);
 assert.equal(provider.name,'local');assert.equal(provider.model,null);
 const {output}=await provider.generate({role:'Customer support assistant',context:'Family caregiving',dates:'',experience:'I looked after my younger siblings after school.',menuNames:[]});
 assert.equal(output.experience.length,1);
 assert.equal(output.experience[0].text,'Cared for my younger siblings after school.');
 assert.equal(output.experience[0].sourceQuote,'I looked after my younger siblings after school.');
 assert.equal(typeof output.experience[0].reason,'string');
 assert.equal(output.skills.length,1);
 assert.equal(output.skills[0].name,'Organisation');
 assert.equal(typeof output.skills[0].sourceQuote,'string');
 assert.ok(output.skills[0].sourceQuote.length>0);
});

test('local provider against real core yields the caregiving sentence as sourceQuote',{skip:typeof require('../core.js').localExperienceClaims!=='function'?'core.localExperienceClaims not available yet (Task 5)':false},async()=>{
 const provider=local.createLocalProvider(require('../core.js'));
 const {output}=await provider.generate({role:'Customer support assistant',context:'Family caregiving',dates:'',experience:'I looked after my younger siblings after school.'});
 assert.equal(output.experience[0].text,'Cared for my younger siblings after school.');
 assert.equal(output.experience[0].sourceQuote,'I looked after my younger siblings after school.');
});

test('createProvider picks the adapter from config.provider',()=>{
 assert.equal(typeof index.createProvider,'function');
 const deps={fetch:async()=>{throw new Error('unused');},sleep:async()=>{}};
 const core={localExperienceClaims:()=>[]};
 assert.equal(index.createProvider({provider:'azure-openai',azure:azureConfig,openai:null,model:'gpt-4.1-mini'},core,deps).name,'azure-openai');
 assert.equal(index.createProvider({provider:'openai-compatible',azure:null,openai:openaiConfig,model:'gpt-4.1-mini'},core,deps).name,'openai-compatible');
 assert.equal(index.createProvider({provider:'local',azure:null,openai:null,model:null},core,deps).name,'local');
 assert.throws(()=>index.createProvider({provider:'something-else'},core,deps),/provider/i);
 assert.equal(index.ProviderError,errors.ProviderError);
});

test('local provider maps rule-based skill names to Yoma names present in the menu',async()=>{
 const provider=local.createLocalProvider(require('../core.js'));
 const input={role:'Retail assistant',experience:'I helped customers find products at my aunt’s shop.\nI packed orders and kept the shelves organised.',context:'',dates:''};
 const withMenu=await provider.generate({...input,menuNames:['Cash Handling','Customer Service','Teamwork']});
 assert.deepEqual(withMenu.output.skills.map(s=>s.name),['Customer Service']);
 const noMatch=await provider.generate({...input,menuNames:['Cash Handling']});
 assert.deepEqual(noMatch.output.skills.map(s=>s.name),['Customer communication']);
 const noMenu=await provider.generate(input);
 assert.deepEqual(noMenu.output.skills.map(s=>s.name),['Customer communication']);
});

test('complete() on an OpenAI-compatible provider sends the given schema name and returns the parsed JSON',async()=>{
 const {fetch,calls}=fakeFetch([{status:200,body:completion({headline:'Braids in Khayelitsha',services:[]})}]);
 const provider=compat.createOpenAICompatibleProvider(openaiConfig,{fetch,sleep:fakeSleep().sleep});
 assert.equal(typeof provider.complete,'function');
 const schema={type:'object',properties:{headline:{type:'string'},services:{type:'array',items:{type:'string'}}},required:['headline','services'],additionalProperties:false};
 const messages=[{role:'system',content:'Output JSON only.'},{role:'user',content:'Braids in Khayelitsha'}];
 const result=await provider.complete({schemaName:'yocard_self_declared',schema,messages});
 assert.deepEqual(result,{headline:'Braids in Khayelitsha',services:[]});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.openai.com/v1/chat/completions');
 assert.equal(calls[0].init.headers.authorization,'Bearer '+KEY);
 const body=JSON.parse(calls[0].init.body);
 assert.equal(body.model,'gpt-4.1-mini');
 assert.deepEqual(body.messages,messages);
 assert.equal(body.response_format.type,'json_schema');
 assert.equal(body.response_format.json_schema.name,'yocard_self_declared');
 assert.equal(body.response_format.json_schema.strict,true);
 assert.deepEqual(body.response_format.json_schema.schema,schema);
 assert.equal(body.temperature,0.2);assert.equal(body.max_tokens,900);
 const tuned=fakeFetch([{status:200,body:completion({ok:true})}]);
 await compat.createOpenAICompatibleProvider(openaiConfig,{fetch:tuned.fetch,sleep:fakeSleep().sleep}).complete({schemaName:'x',schema,messages,maxTokens:300,temperature:0});
 const tunedBody=JSON.parse(tuned.calls[0].init.body);
 assert.equal(tunedBody.max_tokens,300);assert.equal(tunedBody.temperature,0);
});

test('complete() on the Azure adapter uses the same transport and maps refusal, length and non-JSON to provider_bad_output',async()=>{
 const schema={type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false};
 const messages=[{role:'user',content:'hi'}];
 const good=fakeFetch([{status:200,body:completion({ok:true})}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch:good.fetch,sleep:fakeSleep().sleep});
 assert.deepEqual(await provider.complete({schemaName:'yocard_confirms',schema,messages}),{ok:true});
 assert.equal(good.calls[0].init.headers['api-key'],KEY);
 assert.equal(JSON.parse(good.calls[0].init.body).response_format.json_schema.name,'yocard_confirms');
 const cases=[
  {status:200,body:{choices:[{finish_reason:'stop',message:{role:'assistant',content:null,refusal:'No.'}}]}},
  {status:200,body:completion({ok:true},{finish_reason:'length'})},
  {status:200,body:completion('{"ok": ')}
 ];
 for(const step of cases){
  const {fetch}=fakeFetch([step]);
  await assert.rejects(azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep}).complete({schemaName:'x',schema,messages}),err=>{assert.ok(err instanceof errors.ProviderError);assert.equal(err.code,'provider_bad_output');return true;});
 }
 const auth=fakeFetch([{status:401,body:'nope'}]);
 await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:auth.fetch,sleep:fakeSleep().sleep}).complete({schemaName:'x',schema,messages}),err=>{assert.equal(err.code,'provider_auth');return true;});
});

test('the local provider has no complete()',()=>{
 const provider=local.createLocalProvider(require('../core.js'));
 assert.equal(typeof provider.complete,'undefined');
 assert.equal(typeof provider.generate,'function');
});
