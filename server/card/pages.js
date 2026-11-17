'use strict';
/* YoVouch pages (spec sections 4.3 and 9.5). Every flow page is server-rendered, works without JavaScript,
   uses system fonts only (shell({fonts:false})) and carries the footer honesty strings. Times a worker reads
   ("valid until", "Opens again at") are in the card country's time zone, never in server UTC. */
const {shell,footer,escapeHtml,FLOW_CSS}=require('./render.js');
const {t,LANGS,LANG_NAMES,splitOptions}=require('./copy.js');
const {formatSpoken,spokenCode,qrTag,scanUrl,counterAt,STEP_SECONDS}=require('./vouchcode.js');
const {qrSvg}=require('../qr.js');

const TIME_ZONES={'South Africa':'Africa/Johannesburg',Kenya:'Africa/Nairobi',Nigeria:'Africa/Lagos',Ghana:'Africa/Accra',Uganda:'Africa/Kampala',Tanzania:'Africa/Dar_es_Salaam'};
const QR_OPTS={cellSize:4,margin:2};
const E=escapeHtml;
// Text nodes keep straight quotes as typed (the copy quotes the worker's question); attributes use E.
const H=v=>String(v??'').replace(/[&<>]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[ch]);

// 'HH:MM:SS' (or 'HH:MM') in the country's zone; an unknown country gives UTC with " UTC" appended.
function localTime(ms,country,{seconds=true}={}){
  const zone=TIME_ZONES[country];
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:zone||'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms));
  const at=type=>parts.find(p=>p.type===type)?.value||'00';
  return [at('hour'),at('minute'),...(seconds?[at('second')]:[])].join(':')+(zone?'':' UTC');
}

function flowPage({title,body,lang='en',sampleMode,css=''}){
  const sample=sampleMode?'<p class="small">'+H(t('sampleMode'))+'</p>':'';
  const html=shell({title,body:body+sample+footer({}),fonts:false,css:FLOW_CSS+css});
  return lang==='en'?html:html.replace('<html lang="en">','<html lang="'+E(lang)+'">');
}

// The swap script redraws the code line from its data-t template (%s spoken, %t valid until), swaps the six
// digits in the "no data" line, the scan link and the QR from the 10-step batch, timed from performance.now()
// deltas since the response, not from the phone clock. It fetches again when the batch runs out or on "online".
const WORKER_JS=['(function(){var w=document.getElementById("w");if(!w||!window.fetch||!window.performance)return;',
  'var d=w.dataset,B=null,t0=0,tm,P=d.c,u=d.tz?"":" UTC",$=function(i){return document.getElementById(i)};function f(ms){try{return new Intl.DateTimeFormat("en-GB",{timeZone:d.tz||"UTC",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).format(ms)+u}catch(e){return new Date(ms).toISOString().slice(11,19)+" UTC"}}',
  'function load(){fetch("/api/vouch/codes",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({cardId:d.id,cardToken:d.tk})}).then(function(r){return r.json()}).then(function(j){if(j&&j.codes){B=j;t0=performance.now();tick()}}).catch(function(){})}',
  'function tick(){clearTimeout(tm);if(!B)return;var ms=Date.parse(B.serverNow)+performance.now()-t0,n=Math.floor(ms/',STEP_SECONDS*1000,'),c=B.codes[n-B.fromCounter];if(!c){B=null;load();return}',
  'var s=c.spoken.slice(0,3)+" "+c.spoken.slice(3),v=f((n+2)*',STEP_SECONDS*1000,');',
  'var e=$("l"),k="VOUCH "+d.s+" ";e.textContent=e.dataset.t.replace("%s",s).replace("%t",v);e=$("n");e.textContent=e.textContent.replace(k+P,k+c.spoken);P=c.spoken;',
  'e="/s/"+d.id+"?t="+n+"&k="+c.qr;$("a").href=e+"&w=1";if(window.qrSvg)$("q").innerHTML=qrSvg(d.base+e,{cellSize:4,margin:2});',
  'tm=setTimeout(tick,(n+1)*',STEP_SECONDS*1000,'-ms+50)}addEventListener("online",load);load()})();'].join('');
const WORKER_CSS='.code{font-size:28px;font-weight:700}#q svg{width:100%;max-width:240px;height:auto}.pr{display:none}.langs button{margin:4px 4px 0 0}'+
  '@media print{#c,#q,details,.np{display:none}.pr{display:block}}';

// The worker's code page (spec 4.3). yv is config.yovouch (shortcode and call-back number); a plan addition to
// the signature, since the "Customer has no data" line prints both.
function workerPage({entry,record,batch,locked,lang='en',publicUrl,myUrl,nowMs,sampleMode,yv={}}){
  const cardId=entry.cardId,country=record?.user?.country,first=record?.user?.firstName||'',secret=entry.vouch?.secret;
  const counter=batch?.fromCounter??counterAt(nowMs);
  const now0=batch?.codes?.[0]||{spoken:spokenCode(secret,counter),qr:qrTag(secret,counter)};
  const until=localTime((counter+2)*STEP_SECONDS*1000,country);
  const token=String(myUrl||'').split('/').pop(),path='/my/'+cardId+'/'+token,base=String(publicUrl||'').replace(/\/+$/,'');
  const L=(key,vars)=>t(key,lang,vars);
  const codeTpl=L('codeLine',{spoken:'%s',time:'%t'});
  const noData=L('noDataLine',{smsId:entry.smsId,code:now0.spoken,shortcode:yv.shortcode||'12345',callback:yv.callbackNumber||'0800 000 000'});
  const scanHref='/s/'+cardId+'?t='+counter+'&k='+now0.qr+'&w=1';
  const langs=LANGS.map(l=>'<button name="lang" value="'+l+'"'+(l===lang?' class="alt" aria-pressed="true"':'')+'>'+H(LANG_NAMES[l])+'</button>').join('');
  const body='<section id="w" data-id="'+cardId+'" data-tk="'+E(token)+'" data-s="'+E(entry.smsId)+'" data-c="'+now0.spoken+'" data-tz="'+(TIME_ZONES[country]||'')+'" data-base="'+E(base)+'">'+
    '<h1>'+H(L('showThis'))+'</h1>'+
    '<div id="c"><p class="code" id="l" data-t="'+E(codeTpl)+'">'+H(codeTpl.replace('%s',formatSpoken(now0.spoken)).replace('%t',until))+'</p></div>'+
    '<div id="q">'+qrSvg(scanUrl(base,cardId,counter,now0.qr),QR_OPTS)+'</div>'+
    '<p>Card code <b>'+H(record?.code)+'</b> · card number <b>'+H(entry.smsId)+'</b></p>'+
    '<p class="np"><a class="btn alt" href="'+E(path)+'">'+H(L('newCode'))+'</a></p>'+
    '<p class="pr">'+H(L('doNotPrint'))+'</p>'+
    '<p>'+H(L('askLine'))+'</p>'+
    '<p class="small">'+H(L('invite'))+'</p>'+
    '<details><summary>'+H(L('noData'))+'</summary>'+'<p id="n">'+H(noData)+'</p>'+
    '<p><a id="a" href="'+E(scanHref)+'">'+H(L('vouchButton',{first}))+'</a></p></details>'+
    (locked?'<p class="bad">'+H(L('locked',{time:localTime(Date.parse(locked.until),country,{seconds:false})}))+'</p>':'')+
    '</section>'+
    '<form method="post" action="'+E(path)+'/lang" class="langs np"><p>'+H(splitOptions(L('languageMenu')).stem)+'</p>'+langs+'</form>'+
    '<script src="/qr-browser.js" defer></script><script>'+WORKER_JS+'</script>';
  return flowPage({title:'YoCard',body,lang,sampleMode,css:WORKER_CSS});
}

module.exports={TIME_ZONES,localTime,flowPage,workerPage};
