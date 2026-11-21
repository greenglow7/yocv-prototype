'use strict';
// Anthropic Messages API adapter (spec 2026-11-20-yocv-anthropic-provider-design.md).
// It turns the OpenAI-style chat the callers build into a Messages API body and
// reuses the shared transport in openai-compatible.js, so timeout, the single
// retry and the status mapping still exist once. No sampling parameters are
// sent: the current API version rejects temperature, top_p and top_k.
const {ProviderError,messages}=require('./errors.js');
const {CV_SCHEMA_NAME,buildCvSchema,buildCvMessages}=require('./schema.js');
const {matchesSchema}=require('./schema-check.js');
const {callChatCompletions}=require('./openai-compatible.js');

const API_VERSION='2026-10-21';
const FALLBACK_BETA='server-side-fallback-2026-07-01';
// Thinking is on by default and its tokens count toward max_tokens, so the
// adapter sends a fixed budget whatever the caller asked for.
const MAX_TOKENS=4096;
const DEFAULT_MODEL='claude-opus-5-5';
const DEFAULT_BASE_URL='https://api.anthropic.com';

function stripSlash(url){return String(url??'').replace(/\/+$/,'');}
const bad=(retryable=true)=>new ProviderError('provider_bad_output',messages.provider_bad_output,{retryable,status:200});

// A deep copy of the schema for output_config: a type list such as
// ['number','null'] becomes anyOf of single types, the form the Messages API
// structured-output limits document. Other keywords stay beside the anyOf.
// The caller's schema is untouched and replies are checked against it.
function forAnthropicSchema(schema){
  if(Array.isArray(schema))return schema.map(forAnthropicSchema);
  if(!schema||typeof schema!=='object')return schema;
  // A node that has both a type list and its own anyOf keeps its type list:
  // no schema in the repo does this, and merging the two would change meaning.
  const rewrite=Array.isArray(schema.type)&&schema.anyOf===undefined;
  const out=rewrite?{anyOf:schema.type.map(type=>({type}))}:{};
  for(const [key,value] of Object.entries(schema)){
    if(rewrite&&key==='type')continue;
    if(key==='properties'&&value&&typeof value==='object'&&!Array.isArray(value)){
      out.properties={};
      for(const [name,child] of Object.entries(value))out.properties[name]=forAnthropicSchema(child);
    }else if(key==='items'||key==='anyOf')out[key]=forAnthropicSchema(value);
    else out[key]=value&&typeof value==='object'?structuredClone(value):value;
  }
  return out;
}

// Every system message goes into the top-level system string, in order; a
// system role never reaches messages, which the API would reject.
function toAnthropicBody({model,schema,messages:chat}){
  const system=[],rest=[];
  for(const message of chat){
    if(message?.role==='system')system.push(message.content);
    else rest.push({role:message?.role,content:message?.content});
  }
  const body={model,max_tokens:MAX_TOKENS};
  if(system.length)body.system=system.join('\n\n');
  body.messages=rest;
  body.output_config={effort:'low',format:{type:'json_schema',schema:forAnthropicSchema(schema)}};
  body.fallbacks='default';
  return body;
}

// A refusal wins over any text, even text that parses as JSON. Otherwise the
// first text block (thinking blocks may come before it) is parsed as JSON.
function messageToJson(json){
  if(json?.stop_reason==='refusal')throw new ProviderError('provider_bad_output',messages.provider_content_filter,{retryable:false,status:200});
  if(json?.stop_reason==='max_tokens')throw bad();
  const content=Array.isArray(json?.content)?json.content:[];
  const block=content.find(item=>item&&item.type==='text');
  if(!block||typeof block.text!=='string')throw bad();
  try{return JSON.parse(block.text);}catch{throw bad();}
}

function createAnthropicProvider(anthropicConfig,{fetch=globalThis.fetch,sleep,timeoutMs=20000}={}){
  if(!anthropicConfig||!anthropicConfig.apiKey)throw new ProviderError('provider_not_configured',messages.provider_not_configured,{retryable:false});
  const model=anthropicConfig.model||DEFAULT_MODEL;
  const url=stripSlash(anthropicConfig.baseUrl||DEFAULT_BASE_URL)+'/v1/messages';
  const headers={
    'x-api-key':anthropicConfig.apiKey,
    'anthropic-version':API_VERSION,
    'anthropic-beta':FALLBACK_BETA,
    'content-type':'application/json',
    'user-agent':'YoCV-prototype'
  };
  const provider={
    name:'anthropic',
    model,
    // schemaName is validated for the shared interface but not sent: the
    // Messages API has no field for it. maxTokens and temperature are ignored.
    async complete({schemaName,schema,messages:chat}={},{signal,check=true}={}){
      if(typeof schemaName!=='string'||!schemaName||!schema||typeof schema!=='object'||!Array.isArray(chat))throw new TypeError('complete() needs schemaName, schema and messages');
      const body=toAnthropicBody({model,schema,messages:chat});
      const json=await callChatCompletions({url,headers,body,fetch,sleep,timeoutMs,signal});
      const output=messageToJson(json);
      if(check&&!matchesSchema(output,schema).ok)throw bad();
      return output;
    },
    // CV bullets for one masked entry, checked against the CV schema here as
    // the chat provider does, so an empty skills list is tolerated with no menu.
    async cvBullets(input,{signal}={}){
      const schema=buildCvSchema(input?.menuNames);
      const output=await provider.complete({schemaName:CV_SCHEMA_NAME,schema,messages:buildCvMessages(input),maxTokens:600},{signal,check:false});
      const reply=!schema.properties.skills&&Array.isArray(output?.skills)&&!output.skills.length?{bullets:output.bullets}:output;
      if(!matchesSchema(reply,schema).ok)throw bad();
      return {bullets:reply.bullets,skills:reply.skills||[]};
    }
  };
  return provider;
}

module.exports={createAnthropicProvider,toAnthropicBody,messageToJson,forAnthropicSchema};
