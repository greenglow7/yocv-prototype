'use strict';
/* YoVouch pages (spec sections 4.3 and 9.5). Every flow page is server-rendered, works without JavaScript,
   uses system fonts only (shell({fonts:false})) and carries the footer honesty strings. Times a worker reads
   ("valid until", "Opens again at") are in the card country's time zone, never in server UTC. */
const {shell,footer,escapeHtml,FLOW_CSS,STRINGS}=require('./render.js');
const {COPY,t,LANGS,LANG_NAMES,splitOptions}=require('./copy.js');
const {formatSpoken,spokenCode,qrTag,scanUrl,counterAt,STEP_SECONDS}=require('./vouchcode.js');
const {encodeQr}=require('../qr.js');
const {tierLabel}=require('./vouch-lines.js');

const TIME_ZONES={'South Africa':'Africa/Johannesburg',Kenya:'Africa/Nairobi',Nigeria:'Africa/Lagos',Ghana:'Africa/Accra',Uganda:'Africa/Kampala',Tanzania:'Africa/Dar_es_Salaam'};
const QR_MARGIN=2;
// The worker page's QR, drawn like qrSvg(text,{cellSize:1,margin:2}) but with each horizontal run of dark modules as
// one rectangle, so the page stays inside its size budget with a vouch list. The CSS sets the drawn size.
function qrCompact(text){
  const {size,modules}=encodeQr(text,{level:'M'}),total=size+2*QR_MARGIN;let d='';
  for(let r=0;r<size;r++)for(let c=0;c<size;){
    if(!modules[r][c]){c++;continue;}
    let n=1;while(c+n<size&&modules[r][c+n])n++;
    d+='M'+(c+QR_MARGIN)+' '+(r+QR_MARGIN)+'h'+n+'v1h-'+n+'z';c+=n;
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+total+' '+total+'" width="'+total+'" height="'+total+'" shape-rendering="crispEdges" role="img" aria-label="QR code">'+
    '<rect width="'+total+'" height="'+total+'" fill="#ffffff"/><path d="'+d+'" fill="#1a1024"/></svg>';
}
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
  'e="/s/"+d.id+"?t="+n+"&k="+c.qr;$("a").href=e+"&w=1";if(window.qrSvg)$("q").innerHTML=qrSvg(d.base+e,{cellSize:1,margin:2});',
  'tm=setTimeout(tick,(n+1)*',STEP_SECONDS*1000,'-ms+50)}addEventListener("online",load);load()})();'].join('');
const WORKER_CSS='.code{font-size:28px;font-weight:700}#q svg{width:100%;max-width:240px;height:auto}.pr{display:none}.langs button{margin:4px 4px 0 0}'+
  '@media print{#c,#q,details,.np{display:none}.pr{display:block}}';

// The worker's code page (spec 4.3). yv is config.yovouch (shortcode and call-back number); a plan addition to
// the signature, since the "Customer has no data" line prints both.
// vouches (plan Task 6) are the worker's own lines, newest first: {vouchId, line, words, hidden, held}. Held words
// show here, on the worker's private page only, so the worker can read them before tapping Show.
// Lines with words waiting come first, then the shown lines, then the hidden ones; each group stays newest first.
const WORKER_BUDGET=13312,INLINE_MAX=10,LIST_PAGE=20;
const vouchRank=v=>v.held&&!v.hidden?0:v.hidden?2:1;
const orderVouches=vouches=>vouches.map((v,i)=>[v,i]).sort((a,b)=>vouchRank(a[0])-vouchRank(b[0])||a[1]-b[1]).map(([v])=>v);
// One form; each button carries its vouchId and a formaction relative to the page URL, so a line stays small.
// rel is that page's path to /my/<cardId>/<token>/ ('<token>/' on the code page, '' on the full list).
function vouchList(vouches,path,L,waiting,{rel=path.split('/').pop()+'/',more=false,page=0,head=true}={}){
  const act=(v,to,label,cls='')=>'<button name="vouchId" value="'+E(v.vouchId)+'" formaction="'+E(rel+to)+'"'+cls+'>'+H(L(label))+'</button>';
  return '<form method="post" action="'+E(path)+'/hide" class="np">'+(head?'<h2>'+H(L('yourVouches'))+'</h2>':'')+(page?hidden('page',page):'')+(waiting?'<p>'+H(L('wordsWaiting',{n:waiting}))+'</p>':'')+
    vouches.map(v=>'<p'+(v.hidden?' class="small"':'')+'>'+H(v.line)+(v.held&&v.words?' <i>"'+H(v.words)+'"</i>':'')+'<br>'+
      (v.hidden?act(v,'show','showAgain'):act(v,'hide','hide',' class="alt"'))+(v.held&&!v.hidden?' '+act(v,'show-words','showWords'):'')+'</p>').join('')+
    (more?'<p><a href="'+E(path)+'/vouches">'+H(L('allYourVouches'))+'</a></p>':'')+
    '<p class="small">'+H(L('biscate'))+'</p></form>';
}
// Polls status.json every 10 s for two minutes and reloads when a new vouch arrives (spec 7.1 step 4).
const STATUS_JS='(function(){var w=document.getElementById("w");if(!w||!window.fetch)return;var c=+w.dataset.n,k=0,i=setInterval(function(){if(++k>12){clearInterval(i);return}'+
  'fetch("/my/"+w.dataset.id+"/"+w.dataset.tk+"/status.json").then(function(r){return r.json()}).then(function(j){if(j.vouchCount>c){clearInterval(i);location.reload()}}).catch(function(){})},10000)})();';

function workerPage({entry,record,batch,locked,lang='en',publicUrl,myUrl,nowMs,sampleMode,yv={},vouches=[],arrived=false,waiting=0,liveCount=0}){
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
  const body=(arrived?'<p class="notice">'+H(L('vouchArrived'))+'</p>':'')+
    '<section id="w" data-id="'+cardId+'" data-tk="'+E(token)+'" data-s="'+E(entry.smsId)+'" data-c="'+now0.spoken+'" data-tz="'+(TIME_ZONES[country]||'')+'" data-base="'+E(base)+'" data-n="'+Number(liveCount)+'">'+
    '<h1>'+H(L('showThis'))+'</h1>'+
    '<div id="c"><p class="code" id="l" data-t="'+E(codeTpl)+'">'+H(codeTpl.replace('%s',formatSpoken(now0.spoken)).replace('%t',until))+'</p></div>'+
    '<div id="q">'+qrCompact(scanUrl(base,cardId,counter,now0.qr))+'</div>'+
    '<p>Card code <b>'+H(record?.code)+'</b> · card number <b>'+H(entry.smsId)+'</b></p>'+
    '<p class="np"><a class="btn alt" href="'+E(path)+'">'+H(L('newCode'))+'</a></p>'+
    '<p class="pr">'+H(L('doNotPrint'))+'</p>'+
    '<p>'+H(L('askLine'))+'</p>'+
    (vouches.length?'':'<p class="small">'+H(L('invite'))+'</p>')+
    '<details><summary>'+H(L('noData'))+'</summary>'+'<p id="n">'+H(noData)+'</p>'+
    '<p><a id="a" href="'+E(scanHref)+'">'+H(L('vouchButton',{first}))+'</a></p></details>'+
    (locked?'<p class="bad">'+H(L('locked',{time:localTime(Date.parse(locked.until),country,{seconds:false})}))+'</p>':'')+
    '</section>'+
    '\u0000'+
    '<form method="post" action="'+E(path)+'/lang" class="langs np"><p>'+H(splitOptions(L('languageMenu')).stem)+'</p>'+langs+'</form>'+
    '<script src="/qr-browser.js" defer></script><script>'+WORKER_JS+STATUS_JS+'</script>';
  // The inline list keeps the page inside its budget: the most lines (up to INLINE_MAX) that fit, and a link to
  // the full list at /my/<cardId>/<token>/vouches when any line is left out.
  const ordered=orderVouches(vouches),at=body.lastIndexOf('\u0000'),render=n=>flowPage({title:'YoCard',lang,sampleMode,css:WORKER_CSS,
    body:body.slice(0,at)+(ordered.length?vouchList(ordered.slice(0,n),path,L,waiting,{more:n<ordered.length}):'')+body.slice(at+1)});
  let html;
  for(let n=Math.min(ordered.length,INLINE_MAX);n>=0;n--){html=render(n);if(Buffer.byteLength(html)<=WORKER_BUDGET)break;}
  return html;
}

// GET /my/:cardId/:cardToken/vouches?page=N: the worker's full own list, LIST_PAGE lines a page, same order and
// buttons as the code page. Each form carries its page, so a Hide or Show comes back to the same page.
function myVouchesPage({entry,lang='en',myUrl,vouches=[],waiting=0,page=1,sampleMode}){
  const L=(key,vars)=>t(key,lang,vars),token=String(myUrl||'').split('/').pop(),path='/my/'+entry.cardId+'/'+token;
  const ordered=orderVouches(vouches),pages=Math.max(1,Math.ceil(ordered.length/LIST_PAGE)),p=Math.min(Math.max(1,page|0),pages);
  const link=(n,key)=>'<a href="'+E(path)+'/vouches?page='+n+'">'+H(L(key))+'</a>';
  const nav=(p>1?link(p-1,'prevPage'):'')+(p>1&&p<pages?' · ':'')+(p<pages?link(p+1,'nextPage'):'');
  const body='<section><h1>'+H(L('yourVouches'))+'</h1><p><a href="'+E(path)+'">'+H(L('backToCode'))+'</a></p></section>'+
    (ordered.length?vouchList(ordered.slice((p-1)*LIST_PAGE,p*LIST_PAGE),path,L,waiting,{rel:'',page:p,head:false}):'<p class="small">'+H(L('invite'))+'</p>')+
    (nav?'<p>'+nav+'</p>':'');
  return flowPage({title:L('yourVouches'),body,lang,sampleMode});
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
function chipsPage({session,card,chips,lang='en',sampleMode,error}){
  const L=(k,v)=>t(k,lang,v),f=first(card);
  const work=chips.map(c=>c==='Other'?radio('work','other',c):radio('work',c,c)).join('')+'<input name="other" maxlength="30" aria-label="Other">';
  const again=session?.voucher?.kind==='worker'?'workAgainQ':'hireAgainQ';
  const body='<section><h1>'+H(titleFor(card,lang))+'</h1><p class="small">'+H(STRINGS.limitsShort(f,session?.channel||'web'))+'</p>'+errorLine(error)+
    '<form method="post" action="/api/vouch/'+E(session.vouchToken)+'/chips">'+
    '<fieldset class="r"><legend>'+H(L('whatDid',{first:f}))+'</legend>'+work+'</fieldset>'+
    group('when',L('when'),splitOptions(COPY.when).options,{after:'<input type="month" name="month">'})+
    group('howOften',L('howOften'),HOW_OFTEN_VALUES)+
    group('hireAgain',L(again,{first:f}),AGAIN_VALUES)+
    '<label>'+H(L('ownWords'))+'<textarea name="words" maxlength="120" rows="3">'+H(session?.words?.text||'')+'</textarea></label>'+
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

// ---- Disclosure, phone binding, read-back and done (spec 7.2 steps 4 to 7, plan Task 6). Each under 4096 bytes. ----
const sessionPath=token=>'/s/t/'+token;
// The no-JS disclosure form posts to the session page with step=disclose. The first-name box never autocompletes,
// because on the worker's phone the browser would keep the customer's name.
function disclosePage({session,card,lang='en',sampleMode,error}){
  const L=(k,v)=>t(k,lang,v),f=first(card),d=session.disclose||{};
  const {stem,options}=splitOptions(L('showMeAs',{first:f,name:'{name}',digits:'{digits}'}));
  const named=d.showMe==='name';
  const nameBox='<input name="firstName" maxlength="30" autocomplete="off" aria-label="'+E(options[1]||'')+'" value="'+E(d.firstName||'')+'"> ···';
  const body='<section><h1>'+H(titleFor(card,lang))+'</h1>'+errorLine(error)+
    '<form method="post" action="'+sessionPath(session.vouchToken)+'">'+hidden('step','disclose')+
    '<fieldset class="r"><legend>'+H(stem)+'</legend>'+radio('showMe','customer',options[0]||'',named?'':' checked')+
    '<label><input type="radio" name="showMe" value="name"'+(named?' checked':'')+'> '+nameBox+'</label></fieldset>'+
    '<p class="r"><label><input type="checkbox" name="attachClip" value="yes"> '+H(L('attachClip'))+'</label></p>'+
    '<button>'+H(L('vouchButton',{first:f}))+'</button></form></section>';
  return flowPage({title:titleFor(card,lang),body,lang,sampleMode,css:FORM_CSS});
}

// The 5-second poll of GET /api/vouch/<token>/bind for 10 minutes; it reloads once the number is bound or the
// error changes. The page works without it: "I have sent it" reloads by hand.
function bindPoll(token,error){
  const cur=JSON.stringify(error||'').replace(/</g,'\\u003c');
  return '<script>(function(){if(!window.fetch)return;var n=0,i=setInterval(function(){if(++n>120){clearInterval(i);return}'+
    'fetch("/api/vouch/'+token+'/bind").then(function(r){return r.json()}).then(function(j){if(j&&(j.bound||(j.error||"")!=='+cur+')){clearInterval(i);location.reload()}}).catch(function(){})},5000)})();</script>';
}
// Phone binding (spec 7.2 step 5). With a gateway the customer texts YES <code> first; without one, the demo
// fallback asks for a number (autocomplete off), shows the code on screen and sends nothing.
function bindPage({session,card,lang='en',sampleMode,shortcode='12345',sessionCode=null,demo=false,bound=false,phoneLast3=null,error}){
  const L=(k,v)=>t(k,lang,v),token=session.vouchToken;
  let body='<section><h1>'+H(titleFor(card,lang))+'</h1>'+errorLine(error);
  if(demo){
    body+='<p class="notice">'+H(L('demoNoGateway'))+'</p>'+
      '<form method="post" action="/api/vouch/'+token+'/otp"><label>'+H(L('sampleNumber'))+
      '<input name="phone" type="tel" inputmode="tel" autocomplete="off" required maxlength="20"></label><button>'+H(L('vouchButton',{first:first(card)}))+'</button></form>';
  }else if(bound){
    body+='<p class="notice">'+H(L('gotIt',{digits:phoneLast3||''}))+'</p><p><a class="btn" href="'+sessionPath(token)+'">'+H(L('sentIt'))+'</a></p>';
  }else{
    body+='<p class="code">'+H(sessionCode||'')+'</p>'+
      '<p>'+H(L(session.onWorkerPhone?'textYesWorkerPhone':'textYesScan',{sessionCode:sessionCode||'',shortcode}))+'</p>'+
      '<p class="notice">'+H(L('waiting'))+'</p><p><a class="btn" href="'+sessionPath(token)+'">'+H(L('sentIt'))+'</a></p>'+bindPoll(token,error);
  }
  return flowPage({title:titleFor(card,lang),body:body+'</section>',lang,sampleMode,css:FORM_CSS+'.code{font-size:28px;font-weight:700;letter-spacing:2px}'});
}

// The read-back (spec 7.2 step 6): the label and the chips line exactly as the card will show them, the held
// words marked as waiting, then Publish (hidden consent=yes) or Change something. A repeat customer is asked to
// add a visit instead; the demo fallback shows its one-time code next to the box.
function readbackPage({session,card,record,lang='en',sampleMode,phoneLast3=null,demoCode=null,recent=false,error}){
  const L=(k,v)=>t(k,lang,v),f=first(card),token=session.vouchToken;
  const words=session.words?.text;
  const yesNo=splitOptions(COPY.adultQ).options;
  const actions=recent
    ?'<p>'+H(L('recent',{first:f}))+'</p><p><button name="visit" value="yes">'+H(yesNo[0]||'Yes')+'</button> <button name="visit" value="no" class="alt">'+H(yesNo[1]||'No')+'</button></p>'
    :'<button>'+H(L('publish'))+'</button>';
  const body='<section>'+(phoneLast3?'<p class="small">'+H(L('gotIt',{digits:phoneLast3}))+'</p>':'')+errorLine(error)+
    '<h1>'+H(L('readIt',{first:f}))+'</h1>'+
    '<p class="small">'+H(tierLabel(record,f))+'</p><p><b>'+H(record.line)+'</b></p>'+
    (words?'<p>"'+H(words)+'"</p><p class="small">'+H(L('heldNote',{first:f}))+'</p>':'')+
    '<p class="small">'+H(L('canWithdraw'))+'</p>'+
    '<form method="post" action="/api/vouch/'+token+'/confirm">'+hidden('consent','yes')+
    (demoCode?'<p class="notice">'+H(L('demoNoGateway'))+'</p><label>'+H(L('digitsLabel'))+' <b>'+H(demoCode)+'</b>'+
      '<input name="otp" inputmode="numeric" autocomplete="off" required maxlength="7"></label>':'')+
    actions+'</form>'+
    '<form method="post" action="'+sessionPath(token)+'">'+hidden('step','change')+'<button class="alt">'+H(L('change'))+'</button></form></section>';
  return flowPage({title:L('readIt',{first:f}),body,lang,sampleMode,css:FORM_CSS});
}

// The done page (spec 7.2 step 7). messages are already in the voucher's language.
function donePage({messages,lang='en',sampleMode}){
  const [head,...rest]=messages;
  const body='<section class="notice"><h1>'+H(head)+'</h1>'+rest.map(m=>'<p>'+H(m)+'</p>').join('')+'</section>';
  return flowPage({title:head,body,lang,sampleMode});
}

// GET /demo/phone (YOVOUCH_SIM=1 only): a pretend phone that posts to /api/sim/sms and lists the replies.
function demoPhonePage({from='',replies=null,sampleMode}){
  const list=Array.isArray(replies)?'<ol>'+replies.map(r=>'<li>'+H(r)+'</li>').join('')+'</ol>':'';
  const body='<section><h1>'+H(t('simSms'))+'</h1>'+list+
    '<form method="post" action="/api/sim/sms"><label>'+H(t('sampleNumber'))+'<input name="from" type="tel" autocomplete="off" required maxlength="20" value="'+E(from)+'"></label>'+
    '<label>SMS<textarea name="text" rows="2" maxlength="480" required></textarea></label><button>Send</button></form></section>';
  return flowPage({title:t('simSms'),body,sampleMode,css:FORM_CSS});
}

// GET /r/:replyId (spec 6.4, 9.5), shown only once the worker confirms: the six confirmed lines, the attached clips that are still live and
// the footer honesty strings. Until an English translation is confirmed by the speaker, the page shows the
// own-language lines and "Not translated".
function replyPage({reply,firstName,clips=[],lang='en',sampleMode}){
  const english=Array.isArray(reply?.lines)&&reply.lines.length===6;
  const lines=english?reply.lines:Array.isArray(reply?.linesInSourceLang)?reply.linesInSourceLang:[];
  const title=String(firstName||'')+' · YoCard';
  const body='<section><h1>'+H(title)+'</h1>'+(english?'':'<p class="small">'+H(STRINGS.notTranslated)+'</p>')+
    '<ol>'+lines.map(l=>'<li>'+H(l)+'</li>').join('')+'</ol>'+
    clips.map(c=>'<p><a href="'+E(c.href)+'">'+H(c.text)+'</a></p>').join('')+'</section>';
  return flowPage({title,body,lang:english?'en':(reply?.lang||lang),sampleMode});
}

module.exports={TIME_ZONES,replyPage,localTime,flowPage,workerPage,myVouchesPage,scanPage,typedPage,adultsOnlyPage,errorPage,chipsPage,withdrawPage,
  disclosePage,bindPage,readbackPage,donePage,demoPhonePage};
