'use strict';
// Reads .env (from cwd) and process env, picks the model provider.
// Secrets (model keys, YOMA_ACCESS_TOKEN) stay inside the returned Config; never log it.
const path=require('node:path');
const {loadEnvFile}=require('./env.js');

const DEFAULTS={
  azureApiVersion:'2024-10-21',
  openaiBaseUrl:'https://api.openai.com/v1',
  model:'gpt-4.1-mini',
  anthropicModel:'claude-opus-5-5',
  anthropicBaseUrl:'https://api.anthropic.com',
  yomaBase:'https://api.yoma.world/api/v3',
  port:4174,
  host:'127.0.0.1'
};

const stripSlashes=(value)=>String(value).replace(/\/+$/,'');
// YOVOUCH_ORG_KEY_SAMPLE_SKILLS_TRUST -> 'Sample Skills Trust': the name's words split on _, each capitalised.
const ORG_KEY=/^YOVOUCH_ORG_KEY_([A-Z0-9_]+)$/;
const orgNameOf=suffix=>suffix.split('_').filter(Boolean).map(w=>w[0]+w.slice(1).toLowerCase()).join(' ');
// A configuration that cannot start: main() prints the message and exits with code 1.
const invalid=message=>Object.assign(new Error(message),{code:'config_invalid'});
const SELECTORS=['azure','anthropic','openai','local'],STRUCTURED=['json_schema','json_object'];

function loadConfig({env=process.env,cwd=process.cwd()}={}){
  const file=loadEnvFile(path.join(cwd,'.env'));
  const get=(name)=>{
    const fromEnv=env[name];
    const value=fromEnv!==undefined&&fromEnv!==null?fromEnv:file[name];
    const trimmed=value===undefined||value===null?'':String(value).trim();
    return trimmed;
  };
  const azureEndpoint=get('AZURE_OPENAI_ENDPOINT'),azureKey=get('AZURE_OPENAI_API_KEY'),azureDeployment=get('AZURE_OPENAI_DEPLOYMENT');
  const openaiKey=get('OPENAI_API_KEY'),anthropicKey=get('ANTHROPIC_API_KEY');
  // MODEL_PROVIDER wins when set; empty keeps the order Azure, then Anthropic, then OpenAI-compatible, then local
  // (spec 8 and the Anthropic provider spec), so a leftover OPENAI_API_KEY=ollama never beats a Claude key.
  const selector=get('MODEL_PROVIDER'),structuredOutput=get('OPENAI_STRUCTURED_OUTPUT')||'json_schema';
  if(selector&&!SELECTORS.includes(selector))throw invalid('MODEL_PROVIDER must be azure, anthropic, openai or local.');
  if(!STRUCTURED.includes(structuredOutput))throw invalid('OPENAI_STRUCTURED_OUTPUT must be json_schema or json_object.');
  const azureReady=Boolean(azureEndpoint&&azureKey&&azureDeployment);
  const kind=selector||(azureReady?'azure':anthropicKey?'anthropic':openaiKey?'openai':'local');
  if(kind==='azure'&&!azureReady)throw invalid('MODEL_PROVIDER=azure needs AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY and AZURE_OPENAI_DEPLOYMENT.');
  if(kind==='anthropic'&&!anthropicKey)throw invalid('MODEL_PROVIDER=anthropic needs ANTHROPIC_API_KEY.');
  if(kind==='openai'&&!openaiKey)throw invalid('MODEL_PROVIDER=openai needs OPENAI_API_KEY (any value for a local server, such as ollama).');
  const transcribeDeployment=get('AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT'),transcribeModel=get('TRANSCRIBE_MODEL');
  const portRaw=Number.parseInt(get('PORT'),10);
  const publicUrlRaw=get('YOCARD_PUBLIC_URL');
  const base={
    yomaBase:stripSlashes(get('YOMA_API_BASE')||DEFAULTS.yomaBase),
    port:Number.isInteger(portRaw)&&portRaw>0?portRaw:DEFAULTS.port,
    host:get('HOST')||DEFAULTS.host,
    // YoCard: a bearer token switches the account source from sample personas to a real Yoma account;
    // the public URL is what card links, the QR and share text use (default http://HOST:PORT).
    yomaAccessToken:get('YOMA_ACCESS_TOKEN'),
    publicUrl:/^https?:\/\//i.test(publicUrlRaw)?stripSlashes(publicUrlRaw):null,
    // YoVouch: the simulated gateways, the production gateway secret, the shortcode and call-back number
    // printed on the worker's page, and the shortcode's market for local-format senders with no card context.
    yovouch:{
      sim:get('YOVOUCH_SIM')==='1',
      gatewaySecret:get('YOVOUCH_GATEWAY_SECRET'),
      shortcode:get('YOVOUCH_SHORTCODE')||'12345',
      callbackNumber:get('YOVOUCH_CALLBACK_NUMBER')||'0800 000 000',
      smsCountry:get('YOVOUCH_SMS_COUNTRY')||'South Africa',
      // Demo organisation keys for the referral page (spec 7.5), one per YOVOUCH_ORG_KEY_<NAME>.
      orgKeys:Object.fromEntries([...new Set([...Object.keys(file),...Object.keys(env||{})])].filter(k=>ORG_KEY.test(k)&&get(k))
        .map(k=>[orgNameOf(ORG_KEY.exec(k)[1]),get(k)]).filter(([name])=>name))
    },
    // YoVouch transcription (spec 8), read directly so the chat deployment is not needed: an Azure deployment,
    // else an OpenAI-compatible model, else null (template: the typed text box).
    transcribe:azureEndpoint&&azureKey&&transcribeDeployment
      ?{kind:'azure',endpoint:stripSlashes(azureEndpoint),apiKey:azureKey,deployment:transcribeDeployment,apiVersion:get('AZURE_OPENAI_API_VERSION')||DEFAULTS.azureApiVersion}
      :openaiKey&&transcribeModel?{kind:'openai',baseUrl:stripSlashes(get('OPENAI_BASE_URL')||DEFAULTS.openaiBaseUrl),apiKey:openaiKey,model:transcribeModel}:null,
    // YoCV: the secret the /api/cv/draft webhook requires in x-yocv-service-secret. Empty: no webhook.
    yocv:{serviceSecret:get('YOCV_SERVICE_SECRET')}
  };
  if(kind==='azure'){
    const azure={endpoint:stripSlashes(azureEndpoint),apiKey:azureKey,deployment:azureDeployment,apiVersion:get('AZURE_OPENAI_API_VERSION')||DEFAULTS.azureApiVersion};
    return {provider:'azure-openai',model:azure.deployment,azure,anthropic:null,openai:null,...base};
  }
  if(kind==='anthropic'){
    const anthropic={apiKey:anthropicKey,model:get('ANTHROPIC_MODEL')||DEFAULTS.anthropicModel,baseUrl:stripSlashes(get('ANTHROPIC_BASE_URL')||DEFAULTS.anthropicBaseUrl)};
    return {provider:'anthropic',model:anthropic.model,anthropic,azure:null,openai:null,...base};
  }
  if(kind==='openai'){
    const openai={baseUrl:stripSlashes(get('OPENAI_BASE_URL')||DEFAULTS.openaiBaseUrl),apiKey:openaiKey,model:get('OPENAI_MODEL')||DEFAULTS.model,structuredOutput};
    return {provider:'openai-compatible',model:openai.model,azure:null,anthropic:null,openai,...base};
  }
  return {provider:'local',model:null,azure:null,anthropic:null,openai:null,...base};
}

module.exports={loadConfig,DEFAULTS};
