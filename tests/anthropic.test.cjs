const {test}=require('node:test');
const assert=require('node:assert/strict');
let errors={},anthropic={},index={},schema={};
try{errors=require('../server/providers/errors.js');}catch{}
try{anthropic=require('../server/providers/anthropic.js');}catch{}
try{index=require('../server/providers/index.js');}catch{}
try{schema=require('../server/providers/schema.js');}catch{}
const {KEY,fakeFetch,fakeSleep,hangUntilAbort}=require('./helpers/providers.cjs');

// The Anthropic Messages API adapter (spec 2026-11-20-yocv-anthropic-provider-design.md).
const anthropicConfig={apiKey:KEY,model:'claude-opus-5-5',baseUrl:'https://api.anthropic.com'};
const input={schemaName:'yocv_test',schema:{type:'object',properties:{ok:{type:'boolean'}},required:['ok'],additionalProperties:false},messages:[{role:'system',content:'S'},{role:'user',content:'U'}]};
function reply(output,extra={}){return {id:'msg_1',type:'message',role:'assistant',model:'claude-opus-5-5',stop_reason:'end_turn',content:[{type:'text',text:typeof output==='string'?output:JSON.stringify(output)}],...extra};}

test('Anthropic adapter builds the Messages URL, headers and body',async()=>{
 const {fetch,calls}=fakeFetch([{status:200,body:reply({ok:true})}]);
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
 assert.equal(provider.name,'anthropic');assert.equal(provider.model,'claude-opus-5-5');
 assert.deepEqual(await provider.complete(input),{ok:true});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');
 assert.equal(calls[0].init.method,'POST');
 const h=calls[0].init.headers;
 assert.equal(h['x-api-key'],KEY);assert.equal(h['anthropic-version'],'2026-10-21');
 assert.equal(h['anthropic-beta'],'server-side-fallback-2026-07-01');
 assert.equal(h['content-type'],'application/json');assert.equal(h['user-agent'],'YoCV-prototype');
 assert.equal('authorization' in h,false);
 const body=JSON.parse(calls[0].init.body);
 assert.equal(body.model,'claude-opus-5-5');assert.equal(body.max_tokens,4096);
 assert.equal(body.system,'S');
 assert.deepEqual(body.messages,[{role:'user',content:'U'}]);
 assert.deepEqual(body.output_config,{effort:'low',format:{type:'json_schema',schema:input.schema}});
 assert.equal(body.fallbacks,'default');
 for(const k of ['temperature','top_p','top_k','response_format','thinking'])assert.equal(k in body,false,k);
});
test('toAnthropicBody joins every system message in order and keeps the rest',()=>{
 const body=anthropic.toAnthropicBody({model:'m',schema:input.schema,messages:[{role:'user',content:'A'},{role:'system',content:'S1'},{role:'assistant',content:'B'},{role:'system',content:'S2'}]});
 assert.equal(body.system,'S1\n\nS2');
 assert.deepEqual(body.messages,[{role:'user',content:'A'},{role:'assistant',content:'B'}]);
 assert.equal(body.messages.some(m=>m.role==='system'),false);
});
test('toAnthropicBody omits system when the chat has none',()=>{
 const body=anthropic.toAnthropicBody({model:'m',schema:input.schema,messages:[{role:'user',content:'A'}]});
 assert.equal('system' in body,false);
});
test('messageToJson reads the first text block even after a thinking block',()=>{
 const json=reply({ok:true});json.content.unshift({type:'thinking',thinking:'',signature:'x'});
 assert.deepEqual(anthropic.messageToJson(json),{ok:true});
});
test('stop_reason refusal maps to provider_bad_output with the content-filter message, not retryable',async()=>{
 const {fetch}=fakeFetch([{status:200,body:reply({ok:true},{stop_reason:'refusal',stop_details:{type:'refusal',category:'general_harms'}})}]);
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.message,errors.messages.provider_content_filter);assert.equal(err.retryable,false);return true;});
});
test('stop_reason max_tokens, a non-text block and non-JSON text map to provider_bad_output retryable',async()=>{
 for(const body of [reply({ok:true},{stop_reason:'max_tokens'}),reply('not json'),{...reply({ok:true}),content:[{type:'tool_use',id:'t',name:'n',input:{}}]},{...reply({ok:true}),content:[]}]){
  const {fetch}=fakeFetch([{status:200,body}]);
  const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
  await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.retryable,true);return true;});
 }
});
test('401 maps to provider_auth; 529 then 200 succeeds after one sleep; 529 twice is provider_error',async()=>{
 const auth=anthropic.createAnthropicProvider(anthropicConfig,{fetch:fakeFetch([{status:401,body:{type:'error',error:{type:'authentication_error',message:'bad '+KEY}}}]).fetch,sleep:fakeSleep().sleep});
 await assert.rejects(auth.complete(input),err=>{assert.equal(err.code,'provider_auth');assert.equal(err.retryable,false);assert.equal(err.message.includes(KEY),false);return true;});
 const over={status:529,body:{type:'error',error:{type:'overloaded_error',message:'Overloaded'}}};
 const once=fakeFetch([over,{status:200,body:reply({ok:true})}]),sleeper=fakeSleep();
 assert.deepEqual(await anthropic.createAnthropicProvider(anthropicConfig,{fetch:once.fetch,sleep:sleeper.sleep}).complete(input),{ok:true});
 assert.equal(once.calls.length,2);assert.deepEqual(sleeper.calls,[1500]);
 const twice=fakeFetch([over]);
 await assert.rejects(anthropic.createAnthropicProvider(anthropicConfig,{fetch:twice.fetch,sleep:fakeSleep().sleep}).complete(input),err=>{assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);assert.equal(err.status,529);return true;});
 assert.equal(twice.calls.length,2);
});
test('timeout maps to provider_timeout',async()=>{
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch:hangUntilAbort,sleep:fakeSleep().sleep,timeoutMs:20});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_timeout');assert.equal(err.retryable,true);return true;});
});
test('cvBullets sends the CV prompt and schema and checks the reply',async()=>{
 const good={bullets:[{text:'Braided hair at home.',usedNumbers:[],sourceFields:['what'],sourceQuote:'I braid hair at home'}],skills:[{name:'Hairstyling',sourceQuote:'I braid hair at home'}]};
 const {fetch,calls}=fakeFetch([{status:200,body:reply(good)}]);
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
 const out=await provider.cvBullets({role:'Hairdresser',entry:{title:'Braiding at home',what:'I braid hair at home'},menuNames:['Hairstyling']});
 assert.deepEqual(out,good);
 const body=JSON.parse(calls[0].init.body);
 assert.ok(body.system.includes('You rewrite one entry'));
 assert.deepEqual(body.output_config.format.schema,schema.buildCvSchema(['Hairstyling']));
 const bad=fakeFetch([{status:200,body:reply({bullets:[{text:'x'}]})}]);
 await assert.rejects(anthropic.createAnthropicProvider(anthropicConfig,{fetch:bad.fetch,sleep:fakeSleep().sleep}).cvBullets({role:'Hairdresser',entry:{what:'I braid'},menuNames:[]}),err=>err.code==='provider_bad_output');
});
test('missing key is provider_not_configured; defaults fill model and base URL',async()=>{
 assert.throws(()=>anthropic.createAnthropicProvider({apiKey:''}),err=>err.code==='provider_not_configured');
 const {fetch,calls}=fakeFetch([{status:200,body:reply({ok:true})}]);
 const provider=anthropic.createAnthropicProvider({apiKey:KEY},{fetch,sleep:fakeSleep().sleep});
 assert.equal(provider.model,'claude-opus-5-5');
 await provider.complete(input);
 assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');
 const trailing=fakeFetch([{status:200,body:reply({ok:true})}]);
 await anthropic.createAnthropicProvider({apiKey:KEY,baseUrl:'https://proxy.example/'},{fetch:trailing.fetch,sleep:fakeSleep().sleep}).complete(input);
 assert.equal(trailing.calls[0].url,'https://proxy.example/v1/messages');
});
test('createProvider dispatches anthropic',()=>{
 const provider=index.createProvider({provider:'anthropic',anthropic:{apiKey:KEY}},{},{fetch:fakeFetch([]).fetch});
 assert.equal(provider.name,'anthropic');
});
