'use strict';
// Reads .env (from cwd) and process env, picks the model provider.
// Secrets (model keys, YOMA_ACCESS_TOKEN) stay inside the returned Config; never log it.
const path=require('node:path');
const {loadEnvFile}=require('./env.js');

const DEFAULTS={
  azureApiVersion:'2024-10-21',
  openaiBaseUrl:'https://api.openai.com/v1',
  model:'gpt-4.1-mini',
  yomaBase:'https://api.yoma.world/api/v3',
  port:4173,
  host:'127.0.0.1'
};

const stripSlashes=(value)=>String(value).replace(/\/+$/,'');

function loadConfig({env=process.env,cwd=process.cwd()}={}){
  const file=loadEnvFile(path.join(cwd,'.env'));
  const get=(name)=>{
    const fromEnv=env[name];
    const value=fromEnv!==undefined&&fromEnv!==null?fromEnv:file[name];
    const trimmed=value===undefined||value===null?'':String(value).trim();
    return trimmed;
  };
  const azureEndpoint=get('AZURE_OPENAI_ENDPOINT'),azureKey=get('AZURE_OPENAI_API_KEY'),azureDeployment=get('AZURE_OPENAI_DEPLOYMENT');
  const openaiKey=get('OPENAI_API_KEY');
  const portRaw=Number.parseInt(get('PORT'),10);
  const publicUrlRaw=get('YOCARD_PUBLIC_URL');
  const base={
    yomaBase:stripSlashes(get('YOMA_API_BASE')||DEFAULTS.yomaBase),
    port:Number.isInteger(portRaw)&&portRaw>0?portRaw:DEFAULTS.port,
    host:get('HOST')||DEFAULTS.host,
    // YoCard: a bearer token switches the account source from sample personas to a real Yoma account;
    // the public URL is what card links, the QR and share text use (default http://HOST:PORT).
    yomaAccessToken:get('YOMA_ACCESS_TOKEN'),
    publicUrl:/^https?:\/\//i.test(publicUrlRaw)?stripSlashes(publicUrlRaw):null
  };
  if(azureEndpoint&&azureKey&&azureDeployment){
    const azure={endpoint:stripSlashes(azureEndpoint),apiKey:azureKey,deployment:azureDeployment,apiVersion:get('AZURE_OPENAI_API_VERSION')||DEFAULTS.azureApiVersion};
    return {provider:'azure-openai',model:azure.deployment,azure,openai:null,...base};
  }
  if(openaiKey){
    const openai={baseUrl:stripSlashes(get('OPENAI_BASE_URL')||DEFAULTS.openaiBaseUrl),apiKey:openaiKey,model:get('OPENAI_MODEL')||DEFAULTS.model};
    return {provider:'openai-compatible',model:openai.model,azure:null,openai,...base};
  }
  return {provider:'local',model:null,azure:null,openai:null,...base};
}

module.exports={loadConfig,DEFAULTS};
