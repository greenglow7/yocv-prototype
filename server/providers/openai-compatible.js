'use strict';
// OpenAI-compatible chat completions adapter (spec §5.4) and the shared HTTP
// logic (callChatCompletions, createChatProvider) that the Azure adapter
// reuses, so retry, timeout and error mapping exist once.
const {ProviderError,messages}=require('./errors.js');
const {CV_SCHEMA_NAME,buildCvSchema,buildCvMessages}=require('./schema.js');
const {matchesSchema}=require('./schema-check.js');

const RETRY_DELAY_MS=1500;
const RETRY_STATUSES=new Set([429,500,502,503,504]);
const defaultSleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function stripSlash(url){return String(url??'').replace(/\/+$/,'');}

async function readJson(response){
  const text=await response.text();
  try{return {text,json:JSON.parse(text)};}catch{return {text,json:undefined};}
}

function isContentFilter(json){
  const error=json?.error;
  if(!error||typeof error!=='object')return false;
  return error.code==='content_filter'||error.innererror?.code==='ResponsibleAIPolicyViolation'||error.type==='content_filter';
}

function mapStatus(status,json){
  if(status===401||status===403)return new ProviderError('provider_auth',messages.provider_auth,{retryable:false,status});
  if(status===400&&isContentFilter(json))return new ProviderError('provider_bad_output',messages.provider_content_filter,{retryable:false,status});
  if(status===429)return new ProviderError('provider_rate_limited',messages.provider_rate_limited,{retryable:true,status});
  return new ProviderError('provider_error',messages.provider_error,{retryable:true,status});
}

// One HTTP call with timeout, a single retry on network error / 429 / 5xx,
// and the spec §4 error mapping. Resolves the parsed JSON response body.
async function callChatCompletions({url,headers,body,fetch=globalThis.fetch,sleep=defaultSleep,timeoutMs=20000,signal}){
  const payload=JSON.stringify(body);
  let attempt=0;
  for(;;){
    attempt+=1;
    const timeoutSignal=AbortSignal.timeout(timeoutMs);
    const combined=signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal;
    let response,json;
    try{
      response=await fetch(url,{method:'POST',headers,body:payload,signal:combined});
      // Reading the body is part of the network call: a stream that drops
      // mid-read must take the same retry path as a failed connect.
      ({json}=await readJson(response));
    }catch(err){
      if(timeoutSignal.aborted||err?.name==='TimeoutError')throw new ProviderError('provider_timeout',messages.provider_timeout,{retryable:true,status:null});
      if(signal?.aborted||err?.name==='AbortError')throw new ProviderError('provider_aborted',messages.provider_aborted,{retryable:false,status:null});
      if(attempt===1){await sleep(RETRY_DELAY_MS);continue;}
      throw new ProviderError('provider_error',messages.provider_error,{retryable:true,status:null});
    }
    if(response.ok){
      if(json===undefined)throw new ProviderError('provider_bad_output',messages.provider_bad_output,{retryable:true,status:response.status});
      return json;
    }
    const error=mapStatus(response.status,json);
    if(RETRY_STATUSES.has(response.status)&&attempt===1){await sleep(RETRY_DELAY_MS);continue;}
    throw error;
  }
}

// Extracts choices[0].message.content and parses it as JSON. Refusal, a
// truncated answer and non-JSON content all map to provider_bad_output.
function completionToJson(json){
  const bad=(retryable=true)=>new ProviderError('provider_bad_output',messages.provider_bad_output,{retryable,status:200});
  const choice=Array.isArray(json?.choices)?json.choices[0]:undefined;
  if(!choice||typeof choice!=='object')throw bad();
  const message=choice.message;
  if(!message||typeof message!=='object')throw bad();
  if(message.refusal)throw bad(); // spec §4: only content_filter is non-retryable
  if(choice.finish_reason==='length')throw bad();
  if(choice.finish_reason==='content_filter')throw new ProviderError('provider_bad_output',messages.provider_content_filter,{retryable:false,status:200});
  if(typeof message.content!=='string')throw bad();
  try{return JSON.parse(message.content);}catch{throw bad();}
}

// json_object mode (spec 8): the schema goes into the first system message,
// or into a new one at the front when the chat has none.
const SCHEMA_PROMPT='Reply with one JSON object only. It must match this JSON Schema:\n';
function withSchemaPrompt(chat,schema){
  const text=SCHEMA_PROMPT+JSON.stringify(schema);
  const at=chat.findIndex(message=>message?.role==='system');
  if(at<0)return [{role:'system',content:text},...chat];
  return chat.map((message,i)=>i===at?{...message,content:message.content+'\n'+text}:message);
}

// Builds a provider around a URL, header set and optional body extras.
// structuredOutput 'json_object' is for endpoints without json_schema support.
function createChatProvider({name,model,url,headers,bodyExtra={},structuredOutput='json_schema'},{fetch=globalThis.fetch,sleep=defaultSleep,timeoutMs=20000}={}){
  const provider={
    name,
    model,
    // Generic structured completion (YoCard draft pipeline): the caller owns
    // the messages and the strict schema; this only transports and parses.
    // check:false leaves the json_object schema check to a caller that runs its own, as cvBullets does.
    async complete({schemaName,schema,messages:chat,maxTokens=900,temperature=0.2}={},{signal,check=true}={}){
      if(typeof schemaName!=='string'||!schemaName||!schema||typeof schema!=='object'||!Array.isArray(chat))throw new TypeError('complete() needs schemaName, schema and messages');
      const asObject=structuredOutput==='json_object';
      const body={
        ...bodyExtra,
        messages:asObject?withSchemaPrompt(chat,schema):chat,
        response_format:asObject?{type:'json_object'}:{type:'json_schema',json_schema:{name:schemaName,strict:true,schema}},
        temperature,
        max_tokens:maxTokens
      };
      const json=await callChatCompletions({url,headers,body,fetch,sleep,timeoutMs,signal});
      const output=completionToJson(json);
      if(asObject&&check&&!matchesSchema(output,schema).ok)throw new ProviderError('provider_bad_output',messages.provider_bad_output,{retryable:true,status:200});
      return output;
    },
    // CV bullets for one masked entry (spec 8), checked against the CV schema in both modes, here and not in complete(),
    // so that with no menu an empty skills list is tolerated in json_object mode too (the prompt asks for one).
    async cvBullets(input,{signal}={}){
      const schema=buildCvSchema(input?.menuNames);
      const output=await provider.complete({schemaName:CV_SCHEMA_NAME,schema,messages:buildCvMessages(input),maxTokens:600},{signal,check:false});
      const reply=!schema.properties.skills&&Array.isArray(output?.skills)&&!output.skills.length?{bullets:output.bullets}:output;
      if(!matchesSchema(reply,schema).ok)throw new ProviderError('provider_bad_output',messages.provider_bad_output,{retryable:true,status:200});
      return {bullets:reply.bullets,skills:reply.skills||[]};
    }
  };
  return provider;
}

function createOpenAICompatibleProvider(openaiConfig,deps={}){
  if(!openaiConfig||!openaiConfig.apiKey)throw new ProviderError('provider_not_configured',messages.provider_not_configured,{retryable:false});
  const baseUrl=stripSlash(openaiConfig.baseUrl||'https://api.openai.com/v1');
  const model=openaiConfig.model||'gpt-4.1-mini';
  return createChatProvider({
    name:'openai-compatible',
    model,
    url:baseUrl+'/chat/completions',
    headers:{authorization:'Bearer '+openaiConfig.apiKey,'content-type':'application/json','user-agent':'YoCV-prototype'},
    bodyExtra:{model},
    structuredOutput:openaiConfig.structuredOutput
  },deps);
}

module.exports={createOpenAICompatibleProvider,createChatProvider,callChatCompletions,completionToJson,RETRY_DELAY_MS};
