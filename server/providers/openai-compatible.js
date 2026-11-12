'use strict';
// OpenAI-compatible chat completions adapter (spec §5.4) and the shared HTTP
// logic (callChatCompletions, completionToOutput, createChatProvider) that the
// Azure adapter reuses, so retry, timeout and error mapping exist once.
const {ProviderError,messages}=require('./errors.js');
const {buildSchema,validateOutput,buildMessages,menuNamesOf}=require('./schema.js');

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

// Extracts and validates choices[0].message.content against the strict YoCV shape.
function completionToOutput(json,menuNames){
  const output=completionToJson(json);
  const check=validateOutput(output,menuNames);
  if(!check.ok)throw new ProviderError('provider_bad_output',messages.provider_bad_output,{retryable:true,status:200});
  return output;
}

// Builds a provider around a URL, header set and optional body extras.
function createChatProvider({name,model,url,headers,bodyExtra={}},{fetch=globalThis.fetch,sleep=defaultSleep,timeoutMs=20000}={}){
  return {
    name,
    model,
    async generate(input,{signal}={}){
      const menuNames=menuNamesOf(input);
      const body={
        ...bodyExtra,
        messages:buildMessages(input),
        response_format:{type:'json_schema',json_schema:{name:'yocv_claims',strict:true,schema:buildSchema(menuNames)}},
        temperature:0.2,
        max_tokens:800
      };
      const json=await callChatCompletions({url,headers,body,fetch,sleep,timeoutMs,signal});
      return {output:completionToOutput(json,menuNames)};
    },
    // Generic structured completion (YoCard draft pipeline): the caller owns
    // the messages and the strict schema; this only transports and parses.
    async complete({schemaName,schema,messages:chat,maxTokens=900,temperature=0.2}={},{signal}={}){
      if(typeof schemaName!=='string'||!schemaName||!schema||typeof schema!=='object'||!Array.isArray(chat))throw new TypeError('complete() needs schemaName, schema and messages');
      const body={
        ...bodyExtra,
        messages:chat,
        response_format:{type:'json_schema',json_schema:{name:schemaName,strict:true,schema}},
        temperature,
        max_tokens:maxTokens
      };
      const json=await callChatCompletions({url,headers,body,fetch,sleep,timeoutMs,signal});
      return completionToJson(json);
    }
  };
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
    bodyExtra:{model}
  },deps);
}

module.exports={createOpenAICompatibleProvider,createChatProvider,callChatCompletions,completionToOutput,completionToJson,RETRY_DELAY_MS};
