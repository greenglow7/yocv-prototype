const {test}=require('node:test');
const assert=require('node:assert/strict');
let errors={},azure={},compat={},local={},index={};
try{errors=require('../server/providers/errors.js');}catch{}
try{azure=require('../server/providers/azure-openai.js');}catch{}
try{compat=require('../server/providers/openai-compatible.js');}catch{}
try{local=require('../server/providers/local.js');}catch{}
try{index=require('../server/providers/index.js');}catch{}
const {KEY,azureConfig,openaiConfig,completion,fakeFetch,fakeSleep,hangUntilAbort}=require('./helpers/providers.cjs');
const {matchesSchema}=require('../server/providers/schema-check.js');

// The transport tests run through complete(), the one HTTP path left (Task 16).
const goodOutput={ok:true};
const input={schemaName:'yocv_test',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},messages:[{role:'system',content:'S'},{role:'user',content:'U'}]};

test('ProviderError carries code, retryable and status',()=>{
 assert.equal(typeof errors.ProviderError,'function');
 const err=new errors.ProviderError('provider_error','Something failed.',{retryable:true,status:500});
 assert.ok(err instanceof Error);
 assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);assert.equal(err.status,500);
});

test('Azure adapter builds the dated URL, api-key header and strict JSON schema body',async()=>{
 assert.equal(typeof azure.createAzureProvider,'function');
 const {fetch,calls}=fakeFetch([{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 assert.equal(provider.name,'azure-openai');assert.equal(provider.model,'gpt-4.1-mini');
 assert.deepEqual(await provider.complete(input),goodOutput);
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://my-resource.openai.azure.com/openai/deployments/gpt-4.1-mini/chat/completions?api-version=2024-10-21');
 assert.equal(calls[0].init.method,'POST');
 assert.equal(calls[0].init.headers['api-key'],KEY);
 assert.equal(calls[0].init.headers['content-type'],'application/json');
 assert.equal(calls[0].init.headers['user-agent'],'YoCV-prototype');
 const body=JSON.parse(calls[0].init.body);
 assert.equal(body.response_format.type,'json_schema');
 assert.equal(body.response_format.json_schema.strict,true);
 assert.equal(body.response_format.json_schema.name,'yocv_test');
 assert.deepEqual(body.response_format.json_schema.schema,input.schema);
 assert.equal(body.temperature,0.2);assert.equal(body.max_tokens,900);
 assert.deepEqual(body.messages,input.messages);
 assert.equal('model' in body,false);
});

test('Azure adapter uses the v1 URL form with model in the body',async()=>{
 const {fetch,calls}=fakeFetch([{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider({...azureConfig,apiVersion:'v1'},{fetch,sleep:fakeSleep().sleep});
 await provider.complete(input);
 assert.equal(calls[0].url,'https://my-resource.openai.azure.com/openai/v1/chat/completions');
 assert.equal(JSON.parse(calls[0].init.body).model,'gpt-4.1-mini');
});

test('429 then 200 succeeds after exactly one sleep',async()=>{
 const {fetch,calls}=fakeFetch([{status:429,body:{error:{message:'rate'}}},{status:200,body:completion(goodOutput)}]);
 const sleeper=fakeSleep();
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:sleeper.sleep});
 assert.deepEqual(await provider.complete(input),goodOutput);
 assert.equal(calls.length,2);assert.deepEqual(sleeper.calls,[1500]);
});

test('429 twice maps to provider_rate_limited retryable',async()=>{
 const {fetch,calls}=fakeFetch([{status:429,body:{error:{message:'rate'}}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.ok(err instanceof errors.ProviderError);assert.equal(err.code,'provider_rate_limited');assert.equal(err.retryable,true);assert.equal(err.status,429);return true;});
 assert.equal(calls.length,2);
});

test('500 then 200 succeeds',async()=>{
 const {fetch,calls}=fakeFetch([{status:500,body:'Internal error'},{status:200,body:completion(goodOutput)}]);
 const sleeper=fakeSleep();
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:sleeper.sleep});
 assert.deepEqual(await provider.complete(input),goodOutput);
 assert.equal(calls.length,2);assert.equal(sleeper.calls.length,1);
});

test('500 twice maps to provider_error retryable',async()=>{
 const {fetch,calls}=fakeFetch([{status:503,body:'down'}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);assert.equal(err.status,503);return true;});
 assert.equal(calls.length,2);
});

test('network error then 200 succeeds; repeated network error maps to provider_error',async()=>{
 const first=fakeFetch([new TypeError('fetch failed'),{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch:first.fetch,sleep:fakeSleep().sleep});
 assert.deepEqual(await provider.complete(input),goodOutput);
 assert.equal(first.calls.length,2);
 const second=fakeFetch([new TypeError('fetch failed')]);
 const provider2=azure.createAzureProvider(azureConfig,{fetch:second.fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider2.complete(input),err=>{assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);return true;});
 assert.equal(second.calls.length,2);
});

test('body read failure counts as a network error: one retry then provider_error',async()=>{
 const brokenBody=()=>({ok:true,status:200,text:async()=>{throw new TypeError('terminated');}});
 const first=fakeFetch([brokenBody,{status:200,body:completion(goodOutput)}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch:first.fetch,sleep:fakeSleep().sleep});
 assert.deepEqual(await provider.complete(input),goodOutput);
 assert.equal(first.calls.length,2);
 const second=fakeFetch([brokenBody]);
 const sleeper=fakeSleep();
 const provider2=azure.createAzureProvider(azureConfig,{fetch:second.fetch,sleep:sleeper.sleep});
 await assert.rejects(provider2.complete(input),err=>{assert.ok(err instanceof errors.ProviderError);assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);return true;});
 assert.equal(second.calls.length,2);assert.deepEqual(sleeper.calls,[1500]);
});

test('timeout maps to provider_timeout retryable without retry',async()=>{
 const {fetch,calls}=fakeFetch([hangUntilAbort]);
 const sleeper=fakeSleep();
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:sleeper.sleep,timeoutMs:5});
 await assert.rejects(provider.complete(input),err=>{assert.ok(err instanceof errors.ProviderError);assert.equal(err.code,'provider_timeout');assert.equal(err.retryable,true);return true;});
 assert.equal(calls.length,1);assert.equal(sleeper.calls.length,0);
});

test('401 maps to provider_auth not retryable without retry',async()=>{
 const {fetch,calls}=fakeFetch([{status:401,body:{error:{message:'Access denied due to invalid subscription key '+KEY}}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_auth');assert.equal(err.retryable,false);assert.equal(err.status,401);assert.doesNotMatch(err.message,new RegExp(KEY));assert.doesNotMatch(JSON.stringify(err),new RegExp(KEY));return true;});
 assert.equal(calls.length,1);
});

test('403 maps to provider_auth',async()=>{
 const {fetch}=fakeFetch([{status:403,body:'forbidden'}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_auth');assert.equal(err.retryable,false);return true;});
});

test('400 content_filter maps to provider_bad_output not retryable',async()=>{
 const {fetch,calls}=fakeFetch([{status:400,body:{error:{code:'content_filter',message:'The response was filtered'}}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.retryable,false);assert.equal(err.status,400);return true;});
 assert.equal(calls.length,1);
});

test('message.refusal maps to provider_bad_output',async()=>{
 const {fetch}=fakeFetch([{status:200,body:{choices:[{finish_reason:'stop',message:{role:'assistant',content:null,refusal:'I cannot help with that.'}}]}}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.retryable,true);return true;});
});

test('finish_reason length maps to provider_bad_output',async()=>{
 const {fetch}=fakeFetch([{status:200,body:completion(goodOutput,{finish_reason:'length'})}]);
 const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_bad_output');return true;});
});

test('non-JSON content maps to provider_bad_output',async()=>{
 const bad=fakeFetch([{status:200,body:completion('{"experience": [')}]);
 await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:bad.fetch,sleep:fakeSleep().sleep}).complete(input),err=>{assert.equal(err.code,'provider_bad_output');return true;});
 const html=fakeFetch([{status:200,body:'<html>maintenance</html>'}]);
 await assert.rejects(azure.createAzureProvider(azureConfig,{fetch:html.fetch,sleep:fakeSleep().sleep}).complete(input),err=>{assert.equal(err.code,'provider_bad_output');return true;});
});

test('error messages never contain the key string',async()=>{
 const cases=[{status:401,body:'bad key '+KEY},{status:500,body:'oops '+KEY},{status:400,body:{error:{code:'content_filter',message:KEY}}},{status:200,body:completion('not json '+KEY)}];
 for(const step of cases){
  const {fetch}=fakeFetch([step]);
  const provider=azure.createAzureProvider(azureConfig,{fetch,sleep:fakeSleep().sleep});
  await assert.rejects(provider.complete(input),err=>{assert.doesNotMatch(String(err.message),new RegExp(KEY));assert.doesNotMatch(String(err.stack),new RegExp(KEY));return true;});
 }
});

test('OpenAI-compatible adapter shares the error mapping',async()=>{
 const {fetch}=fakeFetch([{status:401,body:'nope'}]);
 await assert.rejects(compat.createOpenAICompatibleProvider(openaiConfig,{fetch,sleep:fakeSleep().sleep}).complete(input),err=>{assert.equal(err.code,'provider_auth');return true;});
});

test('createProvider picks the adapter from config.provider',()=>{
 assert.equal(typeof index.createProvider,'function');
 const deps={fetch:async()=>{throw new Error('unused');},sleep:async()=>{}};
 const core={templateBullet:()=>null};
 assert.equal(index.createProvider({provider:'azure-openai',azure:azureConfig,openai:null,model:'gpt-4.1-mini'},core,deps).name,'azure-openai');
 assert.equal(index.createProvider({provider:'openai-compatible',azure:null,openai:openaiConfig,model:'gpt-4.1-mini'},core,deps).name,'openai-compatible');
 assert.equal(index.createProvider({provider:'local',azure:null,openai:null,model:null},core,deps).name,'local');
 assert.throws(()=>index.createProvider({provider:'something-else'},core,deps),/provider/i);
 assert.equal(index.ProviderError,errors.ProviderError);
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
 assert.equal(typeof provider.generate,'undefined');
 assert.equal(typeof provider.cvBullets,'function');
});

const SCHEMA={type:'object',properties:{text:{type:'string'},n:{type:['number','null']}},required:['text','n'],additionalProperties:false};
test('json_object mode puts the schema in the prompt and asks for a JSON object',async()=>{
  const {fetch,calls}=fakeFetch(()=>completion({text:'hi',n:null}));
  const p=compat.createOpenAICompatibleProvider({...openaiConfig,structuredOutput:'json_object'},{fetch,sleep:fakeSleep().sleep});
  assert.deepEqual(await p.complete({schemaName:'t',schema:SCHEMA,messages:[{role:'system',content:'S'},{role:'user',content:'U'}]}),{text:'hi',n:null});
  const body=JSON.parse(calls[0].init.body);
  assert.deepEqual(body.response_format,{type:'json_object'});
  assert.equal(body.messages[0].content,'S\nReply with one JSON object only. It must match this JSON Schema:\n'+JSON.stringify(SCHEMA));
});
test('json_object mode refuses a reply that breaks the schema',async()=>{
  const {fetch}=fakeFetch(()=>completion({text:7,n:null}));
  const p=compat.createOpenAICompatibleProvider({...openaiConfig,structuredOutput:'json_object'},{fetch,sleep:fakeSleep().sleep});
  await assert.rejects(p.complete({schemaName:'t',schema:SCHEMA,messages:[{role:'user',content:'U'}]}),{code:'provider_bad_output',retryable:true});
});
test('json_object mode prepends a system message when the chat has none',async()=>{
  const {fetch,calls}=fakeFetch(()=>completion({text:'hi',n:1}));
  const messages=[{role:'user',content:'U'}];
  await compat.createOpenAICompatibleProvider({...openaiConfig,structuredOutput:'json_object'},{fetch,sleep:fakeSleep().sleep}).complete({schemaName:'t',schema:SCHEMA,messages});
  assert.deepEqual(JSON.parse(calls[0].init.body).messages,[{role:'system',content:'Reply with one JSON object only. It must match this JSON Schema:\n'+JSON.stringify(SCHEMA)},{role:'user',content:'U'}]);
  assert.deepEqual(messages,[{role:'user',content:'U'}]);
});
test('json_schema stays the default and the Azure adapter ignores the flag',async()=>{
  const messages=[{role:'system',content:'S'},{role:'user',content:'U'}];
  const plain=fakeFetch(()=>completion({text:'hi',n:null}));
  await compat.createOpenAICompatibleProvider(openaiConfig,{fetch:plain.fetch,sleep:fakeSleep().sleep}).complete({schemaName:'t',schema:SCHEMA,messages});
  const az=fakeFetch(()=>completion({text:'hi',n:null}));
  await azure.createAzureProvider({...azureConfig,structuredOutput:'json_object'},{fetch:az.fetch,sleep:fakeSleep().sleep}).complete({schemaName:'t',schema:SCHEMA,messages});
  for(const {calls} of [plain,az]){
    const body=JSON.parse(calls[0].init.body);
    assert.deepEqual(body.response_format,{type:'json_schema',json_schema:{name:'t',strict:true,schema:SCHEMA}});
    assert.deepEqual(body.messages,messages);
  }
  const off=fakeFetch(()=>completion({text:7,n:null}));
  assert.deepEqual(await compat.createOpenAICompatibleProvider(openaiConfig,{fetch:off.fetch,sleep:fakeSleep().sleep}).complete({schemaName:'t',schema:SCHEMA,messages}),{text:7,n:null});
});
test('matchesSchema covers type lists, enum, required, additionalProperties and items',()=>{
  assert.deepEqual(matchesSchema({text:'a',n:1},SCHEMA),{ok:true});
  assert.deepEqual(matchesSchema({text:'a'},SCHEMA),{ok:false,path:'$.n'});
  assert.deepEqual(matchesSchema({text:'a',n:null,x:1},SCHEMA),{ok:false,path:'$.x'});
  assert.deepEqual(matchesSchema({a:['x','y']},{type:'object',properties:{a:{type:'array',items:{type:'string',enum:['x']}}},required:['a'],additionalProperties:false}),{ok:false,path:'$.a[1]'});
});
test('matchesSchema tells integer from number and arrays from objects, and names the nested path',()=>{
  const s={type:'object',properties:{bullets:{type:'array',items:{type:'object',properties:{text:{type:'string'},count:{type:['integer','null']}},required:['text','count'],additionalProperties:false}}},required:['bullets'],additionalProperties:false};
  assert.deepEqual(matchesSchema({bullets:[{text:'a',count:2},{text:'b',count:null}]},s),{ok:true});
  assert.deepEqual(matchesSchema({bullets:[{text:'a',count:2.5}]},s),{ok:false,path:'$.bullets[0].count'});
  assert.deepEqual(matchesSchema({bullets:[{text:1,count:2}]},s),{ok:false,path:'$.bullets[0].text'});
  assert.deepEqual(matchesSchema({bullets:{}},s),{ok:false,path:'$.bullets'});
  assert.deepEqual(matchesSchema([],s),{ok:false,path:'$'});
  assert.deepEqual(matchesSchema(null,s),{ok:false,path:'$'});
  assert.deepEqual(matchesSchema({bullets:[]},s),{ok:true});
});
