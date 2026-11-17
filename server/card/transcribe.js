'use strict';
/* YoVouch transcription adapter (spec 8, plan Task 11). One /audio/transcriptions call, OpenAI-compatible or an
   Azure deployment, always with response_format=verbose_json. The adapter's own schema is
   {text, lang, confidence: number | null, unclear: string[]}: confidence = exp(mean avg_logprob) over the
   segments, a segment under ln(0.6) is unclear, and with no segments confidence is null (never invented).
   With no transcription config the template transcriber returns the typed text, so server/providers/local.js
   stays a chat provider. The transcript is shown to the speaker, who keeps it, edits it or types instead. */
const crypto=require('node:crypto');

const CONFIDENCE_FLOOR=0.6;
const LANGUAGE_FIELD=new Set(['en','zu','xh','sw']); // Pidgin (pcm) has no ISO-639-1 code: the field is left out
const MAX_AUDIO_BYTES=409600;
const AUDIO_TYPES={'audio/webm':'webm','audio/mp4':'m4a'};

// The browser's container, without codec parameters: audio/webm or audio/mp4, else null. Never Ogg (spec 6.3).
function audioType(header){
  const m=/^\s*(audio\/(?:webm|mp4))\s*(?:;|$)/i.exec(String(header??''));
  return m?m[1].toLowerCase():null;
}
const isAudio=header=>/^\s*audio\//i.test(String(header??''));
// Whole seconds 1..max from a header, else null.
function clipSeconds(header,max){
  const s=String(header??'').trim();
  if(!/^\d{1,3}$/.test(s))return null;
  const n=Number(s);
  return n>=1&&n<=max?n:null;
}
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');

function multipart(fields,{name,filename,contentType,data}){
  const boundary='----yovouch'+crypto.randomBytes(12).toString('hex');
  const parts=[];
  for(const [k,v] of Object.entries(fields||{}))parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+k+'"\r\n\r\n'+v+'\r\n'));
  parts.push(Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="'+name+'"; filename="'+filename+'"\r\nContent-Type: '+contentType+'\r\n\r\n'));
  parts.push(Buffer.isBuffer(data)?data:Buffer.from(data||''));
  parts.push(Buffer.from('\r\n--'+boundary+'--\r\n'));
  return {body:Buffer.concat(parts),boundary};
}

// verbose_json to the adapter's schema.
function readResult(json,lang){
  const text=typeof json?.text==='string'?json.text.trim():'';
  const segs=(Array.isArray(json?.segments)?json.segments:[]).filter(s=>Number.isFinite(s?.avg_logprob));
  const confidence=segs.length?Math.exp(segs.reduce((a,s)=>a+s.avg_logprob,0)/segs.length):null;
  const unclear=segs.filter(s=>s.avg_logprob<Math.log(CONFIDENCE_FLOOR)).map(s=>String(s.text??'').trim()).filter(Boolean);
  return {text,lang,confidence,unclear};
}
function failed(message){const err=new Error(message);err.code='transcription_failed';return err;}

function createTranscriber(transcribeConfig,{fetch=globalThis.fetch,timeoutMs=20000}={}){
  const cfg=transcribeConfig&&typeof transcribeConfig==='object'?transcribeConfig:null;
  if(!cfg||(cfg.kind!=='azure'&&cfg.kind!=='openai')){
    return {name:'template',template:true,
      async transcribe({lang,typedText}={}){return {text:typedText??'',lang:lang??'en',confidence:null,unclear:[]};}};
  }
  const azure=cfg.kind==='azure';
  const url=azure?String(cfg.endpoint).replace(/\/+$/,'')+'/openai/deployments/'+encodeURIComponent(cfg.deployment)+'/audio/transcriptions?api-version='+encodeURIComponent(cfg.apiVersion)
    :String(cfg.baseUrl).replace(/\/+$/,'')+'/audio/transcriptions';
  async function transcribe({audio,contentType,lang='en'}={},{signal}={}){
    const type=audioType(contentType)||'audio/webm';
    const fields={...(azure?{}:{model:cfg.model}),response_format:'verbose_json',...(LANGUAGE_FIELD.has(lang)?{language:lang}:{})};
    const {body,boundary}=multipart(fields,{name:'file',filename:'clip.'+AUDIO_TYPES[type],contentType:type,data:audio});
    const headers={'content-type':'multipart/form-data; boundary='+boundary,...(azure?{'api-key':cfg.apiKey}:{authorization:'Bearer '+cfg.apiKey})};
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
    const onAbort=()=>ctl.abort();
    if(signal){if(signal.aborted)ctl.abort();else signal.addEventListener('abort',onAbort,{once:true});}
    try{
      const res=await fetch(url,{method:'POST',headers,body,signal:ctl.signal});
      if(!res.ok)throw failed('transcription answered '+res.status);
      return readResult(await res.json(),lang);
    }catch(err){
      if(err?.code==='transcription_failed')throw err;
      throw failed(ctl.signal.aborted?'transcription timed out':'transcription request failed');
    }finally{clearTimeout(timer);signal?.removeEventListener?.('abort',onAbort);}
  }
  return {name:azure?'azure-openai':'openai-compatible',template:false,transcribe};
}

module.exports={createTranscriber,multipart,readResult,audioType,isAudio,clipSeconds,sha256,CONFIDENCE_FLOOR,MAX_AUDIO_BYTES,AUDIO_TYPES};
