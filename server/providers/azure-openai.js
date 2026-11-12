'use strict';
// Azure OpenAI chat completions adapter (spec §5.1). Shares HTTP, retry and
// error mapping with the OpenAI-compatible adapter via createChatProvider,
// which also supplies the generic complete() used by the YoCard draft pipeline.
const {ProviderError,messages}=require('./errors.js');
const {createChatProvider}=require('./openai-compatible.js');

function stripSlash(url){return String(url??'').replace(/\/+$/,'');}

function azureUrl({endpoint,deployment,apiVersion}){
  const base=stripSlash(endpoint);
  if(apiVersion==='v1')return base+'/openai/v1/chat/completions';
  return base+'/openai/deployments/'+encodeURIComponent(deployment)+'/chat/completions?api-version='+encodeURIComponent(apiVersion);
}

function createAzureProvider(azureConfig,deps={}){
  if(!azureConfig||!azureConfig.endpoint||!azureConfig.apiKey||!azureConfig.deployment)throw new ProviderError('provider_not_configured',messages.provider_not_configured,{retryable:false});
  const apiVersion=azureConfig.apiVersion||'2024-10-21';
  const deployment=azureConfig.deployment;
  return createChatProvider({
    name:'azure-openai',
    model:deployment,
    url:azureUrl({endpoint:azureConfig.endpoint,deployment,apiVersion}),
    headers:{'api-key':azureConfig.apiKey,'content-type':'application/json','user-agent':'YoCV-prototype'},
    bodyExtra:apiVersion==='v1'?{model:deployment}:{}
  },deps);
}

module.exports={createAzureProvider,azureUrl};
