'use strict';
// Provider factory: picks the adapter from config.provider.
const {ProviderError,messages}=require('./errors.js');
const {createAzureProvider}=require('./azure-openai.js');
const {createOpenAICompatibleProvider}=require('./openai-compatible.js');
const {createAnthropicProvider}=require('./anthropic.js');
const {createLocalProvider}=require('./local.js');

function createProvider(config,core,deps={}){
  const kind=config?.provider;
  if(kind==='azure-openai')return createAzureProvider(config.azure,deps);
  if(kind==='anthropic')return createAnthropicProvider(config.anthropic,deps);
  if(kind==='openai-compatible')return createOpenAICompatibleProvider(config.openai,deps);
  if(kind==='local')return createLocalProvider(core);
  throw new Error('Unknown provider "'+String(kind)+'"; expected azure-openai, anthropic, openai-compatible or local.');
}

module.exports={createProvider,createAzureProvider,createAnthropicProvider,createOpenAICompatibleProvider,createLocalProvider,ProviderError,messages};
