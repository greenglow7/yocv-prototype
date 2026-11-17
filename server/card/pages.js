'use strict';
/* YoVouch pages (spec sections 4.3 and 9.5). Every flow page is server-rendered, works without JavaScript,
   uses system fonts only (shell({fonts:false})) and carries the footer honesty strings. Times a worker reads
   ("valid until", "Opens again at") are in the card country's time zone, never in server UTC. */
const {shell,footer,escapeHtml,FLOW_CSS,STRINGS}=require('./render.js');
const {COPY,t,LANGS,LANG_NAMES,splitOptions}=require('./copy.js');
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

// ---- Scan and vouch pages (spec 7.2, plan Task 4). Each stays under 4096 bytes. ----
const FORM_CSS='fieldset{border:0;padding:0;margin:0 0 12px}legend{font-weight:600;padding:0}.r label{display:block;min-height:44px}'+
  '.r input{width:auto;min-height:0;margin:0 8px 0 0}select{font:inherit;min-height:44px;margin-left:8px}form>label{display:block;margin:0 0 12px}';
const first=card=>card?.record?.user?.firstName||'';
const tradeWord=card=>String(card?.record?.trade||'').toLowerCase();
const radio=(name,value,label,extra='')=>'<label><input type="radio" name="'+name+'" value="'+E(value)+'"'+extra+'> '+H(label)+'</label>';
// One radio group: the stem as the legend, labels from the copy in the page language, values fixed in English.
function group(name,template,values,{required=false,after=''}={}){
  const {stem,options}=splitOptions(template);
  return '<fieldset class="r"><legend>'+H(stem)+'</legend>'+values.map((v,i)=>radio(name,v,options[i]??v,required&&i===0?' required':'')).join('')+after+'</fieldset>';
}
function langSelect(lang){
  return '<label>'+H(t('langMenu'))+'<select name="lang">'+LANGS.map(l=>'<option value="'+l+'"'+(l===lang?' selected':'')+'>'+H(LANG_NAMES[l])+'</option>').join('')+'</select></label>';
}
const hidden=(name,value)=>value==null||value===''?'':'<input type="hidden" name="'+name+'" value="'+E(value)+'">';
const errorLine=error=>error?'<p class="bad" role="alert">'+H(error)+'</p>':'';
// The 18-or-older question, the language choice and the "Vouch for <First name>" button end every entry form.
function adultTail(card,lang){
  const L=(k,v)=>t(k,lang,v);
  return group('adult',L('adultQ'),['yes','no'],{required:true})+langSelect(lang)+'<button>'+H(L('vouchButton',{first:first(card)}))+'</button>';
}
function titleFor(card,lang){return t('vouchTitle',lang,{first:first(card),trade:tradeWord(card)});}

// GET /s/:cardId?t=&k=: the QR landing page. Consumes nothing; the form POST opens the session.
function scanPage({card,proof,lang='en',onWorkerPhone=false,formNonce,error,sampleMode}){
  const L=(k,v)=>t(k,lang,v),id=card.cardId;
  const body='<section><h1>'+H(titleFor(card,lang))+'</h1><p>'+H(STRINGS.limitsShort(first(card),'web'))+'</p>'+
    (onWorkerPhone?'<p class="notice">'+H(L('onWorkerPhone',{first:first(card)}))+'</p>':'')+errorLine(error)+
    '<form method="post" action="/s/'+id+'">'+hidden('t',proof?.t)+hidden('k',proof?.k)+hidden('f',formNonce)+(onWorkerPhone?hidden('w','1'):'')+
    adultTail(card,lang)+'</form>'+
    '<p class="small"><a href="/s/'+id+'">'+H(L('typeInstead'))+'</a></p></section>';
  return flowPage({title:titleFor(card,lang),body,lang,sampleMode,css:FORM_CSS});
}

// GET /s/:cardId (six digits only) and GET /s (card code or card number, then the six digits).
function typedPage({card=null,lang='en',formNonce,error,sampleMode}){
  const L=(k,v)=>t(k,lang,v);
  const title=card?titleFor(card,lang):L('typeInstead');
  const field=(name,label,extra)=>'<label>'+H(label)+'<input name="'+name+'" autocomplete="off" required'+extra+'></label>';
  const body='<section><h1>'+H(title)+'</h1>'+(card?'<p>'+H(STRINGS.limitsShort(first(card),'web'))+'</p>':'')+errorLine(error)+
    '<form method="post" action="/s'+(card?'/'+card.cardId:'')+'">'+hidden('f',formNonce)+
    (card?'':field('ref',L('cardRefLabel'),' maxlength="12"'))+field('code',L('digitsLabel'),' inputmode="numeric" maxlength="9"')+
    adultTail(card,lang)+'</form></section>';
  return flowPage({title,body,lang,sampleMode,css:FORM_CSS});
}

function adultsOnlyPage({lang='en',sampleMode}){
  const msg=t('adultsOnly',lang);
  return flowPage({title:msg,body:'<section class="notice"><h1>'+H(msg)+'</h1></section>',lang,sampleMode});
}

// A refusal with no form to retry on. link (plan addition) offers the typed path after a failed scan.
function errorPage({message,lang='en',sampleMode,link=null}){
  const body='<section class="notice"><h1>'+H(message)+'</h1>'+(link?'<p><a href="'+E(link.href)+'">'+H(link.text)+'</a></p>':'')+'</section>';
  return flowPage({title:message,body,lang,sampleMode});
}

const HOW_OFTEN_VALUES=['once','a few times','regularly','rather not say'];
const AGAIN_VALUES=['yes','rather not say'];
// The chips page under the vouchToken (spec 7.2 step 2). Choosing chips consumes nothing more.
function chipsPage({session,card,chips,lang='en',sampleMode}){
  const L=(k,v)=>t(k,lang,v),f=first(card);
  const work=chips.map(c=>c==='Other'?radio('work','other',c):radio('work',c,c)).join('')+'<input name="other" maxlength="40" aria-label="Other">';
  const again=session?.voucher?.kind==='worker'?'workAgainQ':'hireAgainQ';
  const body='<section><h1>'+H(titleFor(card,lang))+'</h1><p class="small">'+H(STRINGS.limitsShort(f,session?.channel||'web'))+'</p>'+
    '<form method="post" action="/api/vouch/'+E(session.vouchToken)+'/chips">'+
    '<fieldset class="r"><legend>'+H(L('whatDid',{first:f}))+'</legend>'+work+'</fieldset>'+
    group('when',L('when'),splitOptions(COPY.when).options,{after:'<input type="month" name="month">'})+
    group('howOften',L('howOften'),HOW_OFTEN_VALUES)+
    group('hireAgain',L(again,{first:f}),AGAIN_VALUES)+
    '<label>'+H(L('ownWords'))+'<textarea name="words" maxlength="120" rows="3"></textarea></label>'+
    '<button>'+H(L('vouchButton',{first:f}))+'</button></form></section>';
  return flowPage({title:titleFor(card,lang),body,lang,sampleMode,css:FORM_CSS});
}

// GET /v/:vouchId/withdraw (spec 5.6, 7.8): one question, two buttons. The secret rides in a hidden field; only
// the POST acts. No reason is asked and the worker is not messaged.
function withdrawPage({first:name,vouchId,secret,lang='en',error,sampleMode}){
  const L=(k,v)=>t(k,lang,v);
  const body='<section><h1>'+H(L('withdrawQ',{first:name||''}))+'</h1>'+errorLine(error)+
    '<form method="post" action="/v/'+E(vouchId)+'/withdraw">'+hidden('w',secret)+
    '<p><button name="mode" value="now">'+H(L('withdrawNow'))+'</button></p>'+
    '<p><button name="mode" value="quiet" class="alt">'+H(L('withdrawQuiet'))+'</button></p></form></section>';
  return flowPage({title:L('withdrawNow'),body,lang,sampleMode});
}

module.exports={TIME_ZONES,localTime,flowPage,workerPage,scanPage,typedPage,adultsOnlyPage,errorPage,chipsPage,withdrawPage};
