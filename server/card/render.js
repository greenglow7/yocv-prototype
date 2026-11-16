'use strict';
/* YoCard public page and image (spec §3.6, §3.4). Everything here renders from the stored public record
   only: no snapshot, no secrets. The HTML works without JavaScript (the "Check now" form is a plain POST);
   a small inline script upgrades it to fetch in place. Every string from the record goes through
   escapeHtml, every href through safeUrl. The phone number is shown masked; the full E.164 number appears
   only inside the wa.me link and only when the record says WhatsApp is enabled. Fixed public copy is
   spelled exactly as the spec fixes it. */

const STRINGS={
  readFrom:(firstName,date,time)=>'Read from '+firstName+"'s Yoma account on "+date+' at '+time,
  phoneConfirmed:'Phone confirmed by Yoma (not an ID check)',
  phoneNotConfirmed:'Phone not confirmed by Yoma',
  statedBy:(firstName)=>'Stated by '+firstName+', not checked',
  neverPay:'Never pay before the work is done',
  whoCanSee:'Who can see this: anyone with the link',
  notProof:'This image is not proof, open the link',
  footer:'Student prototype. Not operated by Yoma or UNICEF. Record signed by YoCard, not by Yoma.',
  noServices:'No services listed yet',
  liveMissing:'Opportunity details could not be checked with Yoma',
  withdrawn:(date)=>'This card was withdrawn by its owner on '+date,
  sampleAccount:'Fictional sample account: this card was built from a sample persona, not a real Yoma user. The completions reference real Yoma opportunities.',
  sampleSvg:'Sample card · fictional persona',
  notFound:'No card with this code',
  checkUnavailable:'Could not check with Yoma right now',
  confirmedTitle:'Confirmed from Yoma',
  whatConfirms:'What Yoma confirms',
  whatsapp:'Message on WhatsApp',
  checkNow:'Check now'
};
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const E164=/^\+[1-9]\d{6,14}$/;
const FONT='"Open Sans",system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const HEAD_FONT='"Nunito",system-ui,sans-serif';
const SVG_FONT='system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif';
const FONT_LINK='https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&family=Open+Sans:wght@400;600;700&display=swap';

function str(value){return value==null?'':String(value);}
function list(value){return Array.isArray(value)?value:[];}
// Attributes are always double-quoted here, so the apostrophe stays literal (fixed copy such as
// "Read from Thandi's Yoma account" must appear verbatim).
function escapeHtml(value){
  return str(value).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[ch]);
}
// Only http(s) links are ever written into an href; anything else renders as plain text.
function safeUrl(value){
  const s=str(value).trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s)?s:null;
}
function parseDate(iso){const d=new Date(str(iso));return Number.isNaN(d.getTime())?null:d;}
function monthYear(iso){const d=parseDate(iso);return d?MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear():'';}
function year(iso){const d=parseDate(iso);return d?String(d.getUTCFullYear()):'';}
function fullDate(iso){const d=parseDate(iso);return d?d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear():'';}
function timeOfDay(iso){
  const d=parseDate(iso);
  if(!d)return '';
  const pad=n=>String(n).padStart(2,'0');
  return pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+' UTC';
}
function firstNameOf(record){
  const user=record?.user||{};
  return str(user.firstName).trim()||str(user.displayName).trim().split(/\s+/)[0]||'the worker';
}
function cardUrl(record,publicUrl){return str(publicUrl).replace(/\/+$/,'')+'/c/'+str(record?.cardId);}

function maskPhone(e164){
  const digits=str(e164).replace(/\D/g,'');
  if(digits.length<3)return '';
  return '••• ••• '+digits.slice(-3);
}
function maskedFromRecord(record){
  const last3=str(record?.user?.phoneLast3).replace(/\D/g,'').slice(-3);
  return last3.length===3?'••• ••• '+last3:'';
}

function waLink(record){
  const wa=record?.whatsapp;
  if(!wa||wa.enabled!==true)return null;
  const number=str(wa.number).trim();
  if(!E164.test(number))return null;
  const text='Hi '+firstNameOf(record)+', I saw your YoCard '+str(record?.code);
  return 'https://wa.me/'+number.slice(1)+'?text='+encodeURIComponent(text);
}

const CURRENCY_SYMBOLS={ZAR:'R',KES:'KSh ',NGN:'₦',USD:'$',GHS:'GH₵',UGX:'USh ',TZS:'TSh ',ZMW:'K',MWK:'MK',RWF:'RF',ETB:'Br '};
function money(amount,currency){
  if(amount===null||amount===undefined||!Number.isFinite(Number(amount)))return '';
  const code=str(currency).toUpperCase();
  const symbol=CURRENCY_SYMBOLS[code];
  const n=Number(amount);
  const formatted=Number.isInteger(n)?String(n):n.toFixed(2);
  return symbol!==undefined?symbol+formatted:(code?code+' ':'')+formatted;
}
function priceText(service){
  const from=money(service?.priceFrom,service?.currency),to=money(service?.priceTo,service?.currency);
  if(from&&to)return from+' – '+to;
  if(from)return 'from '+from;
  if(to)return 'up to '+to;
  return '';
}

function evidenceLabel(completion){
  const types=list(completion?.evidenceTypes).map(str).filter(Boolean);
  if(types.length){
    const live=list(completion?.live?.verificationTypes);
    return types.map(t=>{
      const match=live.find(v=>str(v?.type)===t);
      return str(match?.displayName)||t.replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase();
    }).join(', ');
  }
  return completion?.live?.verificationMethod==='Manual'?'manually':'automatically';
}

// ---------- HTML ----------

const CSS=[
  ':root{--ink:#020304;--muted:#545859;--line:#dce0e5;--ok:#2b6a57;--bad:#b3261e;--grey:#545859;--bg:#f3f6fa;--card:#fff;--accent:#41204b;--tint:#e7d4ed;--stated:#f3f6fa}',
  '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:'+FONT+';line-height:1.5;-webkit-text-size-adjust:100%}',
  'main{max-width:640px;margin:0 auto;padding:16px}',
  'header{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;font-size:14px;color:var(--muted)}',
  'header form{margin:0}button,.btn{font:inherit;min-height:44px;border:1px solid var(--accent);background:var(--accent);color:#fff;border-radius:9999px;padding:8px 24px;font-weight:600;cursor:pointer;text-decoration:none;display:inline-block}',
  '#check-form button{background:var(--card);color:var(--ok);border-color:#387f6a}',
  'section{background:var(--card);border:0;border-radius:16px;padding:24px;margin:16px 0}',
  'h1{font-family:'+HEAD_FONT+';font-size:28px;font-weight:800;line-height:1.2;margin:0 0 4px}h2{font-family:'+HEAD_FONT+';font-size:18px;font-weight:700;margin:0 0 8px;color:var(--ink)}',
  '.identity{display:flex;gap:16px;align-items:center}.identity img{width:72px;height:72px;border-radius:50%;object-fit:cover;background:var(--line)}',
  '.trade{font-size:16px;margin:0}.meta{font-size:14px;color:var(--muted);margin:4px 0 0}',
  'ul{list-style:none;margin:0;padding:0}li{padding:8px 0;border-top:1px solid var(--line)}li:first-child{border-top:0}',
  '.small{font-size:14px;color:var(--muted)}.small.sample{margin:8px 0 0;padding:8px 16px;border:0;border-left:6px solid var(--accent);border-radius:0;background:var(--stated)}.chip{display:inline-block;background:var(--stated);border:0;border-radius:9999px;padding:4px 12px;margin:4px 4px 0 0;font-size:14px;font-weight:600}',
  '.stated{border-left:6px solid var(--grey)}.stated h2{color:var(--grey)}.price{float:right;color:var(--muted)}',
  '.wa{display:block;text-align:center;background:var(--accent);border-color:var(--accent);margin-top:8px}',
  '.safety{font-weight:600;margin:16px 0;padding:16px 24px;border-radius:16px;background:var(--tint)}',
  '.ok{color:var(--ok)}.bad{color:var(--bad)}.grey{color:var(--grey)}.check li{font-size:14px}',
  'footer{font-size:14px;color:var(--muted);padding:16px 0 32px}footer a{color:var(--accent)}',
  '.notice{background:var(--tint);border-radius:16px;padding:16px 24px}a{color:var(--accent)}.empty{color:var(--grey);font-style:italic}'
].join('');

const SCRIPT=[
  '(function(){var f=document.getElementById("check-form");if(!f||!window.fetch)return;',
  'f.addEventListener("submit",function(e){e.preventDefault();var b=f.querySelector("button");b.disabled=true;b.textContent="Checking…";',
  'fetch(f.getAttribute("data-api"),{method:"POST",headers:{"content-type":"application/json"},body:"{}"}).then(function(r){return r.text();}).then(function(t){',
  'var j=null;try{j=JSON.parse(t);}catch(x){}var box=document.getElementById("check-result");if(!box||!j){location.reload();return;}',
  'if(j.unavailable){box.innerHTML="<p class=grey>'+STRINGS.checkUnavailable+'</p>";}else{var h="<ul class=check>";(j.signals||[]).forEach(function(s){',
  'var d=document.createElement("div");d.textContent=s.label+(s.detail?" · "+s.detail:"");h+="<li class="+(s.ok?"ok":"bad")+">"+d.innerHTML+"</li>";});',
  'h+="</ul><p class=small>Checked "+new Date(j.checkedAt).toUTCString()+(j.simulated?" · simulated re-read of a sample account":"")+"</p>";box.innerHTML=h;}',
  'box.hidden=false;b.disabled=false;b.textContent="'+STRINGS.checkNow+'";}).catch(function(){b.disabled=false;b.textContent="'+STRINGS.checkNow+'";});});})();'
].join('');

function shell({title,description,ogImage,ogUrl,body}){
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escapeHtml(title)+'</title>'+
    '<meta name="robots" content="noindex">'+
    '<meta property="og:title" content="'+escapeHtml(title)+'">'+
    (description?'<meta property="og:description" content="'+escapeHtml(description)+'">':'')+
    (ogImage?'<meta property="og:image" content="'+escapeHtml(ogImage)+'">':'')+
    (ogUrl?'<meta property="og:url" content="'+escapeHtml(ogUrl)+'">':'')+
    '<meta property="og:type" content="profile">'+
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="'+FONT_LINK+'">'+
    '<style>'+CSS+'</style></head><body><main>'+body+'</main></body></html>';
}

function footer(record){
  const json=record?.cardId?'<a href="/c/'+escapeHtml(record.cardId)+'.json">Signed record (JSON)</a> · <a href="/.well-known/jwks.json">Signing key</a>':'';
  return '<footer><p>'+escapeHtml(STRINGS.whoCanSee)+'</p><p>'+escapeHtml(STRINGS.footer)+'</p>'+(json?'<p>'+json+'</p>':'')+'</footer>';
}

function completionItem(c){
  const title=escapeHtml(str(c?.title).trim()||'Opportunity');
  const org=escapeHtml(str(c?.organizationName).trim()||'the organisation');
  const when=monthYear(c?.dateCompleted);
  const link=c?.live?safeUrl(c.live.yomaInfoURL):null;
  const head=link?'<a href="'+escapeHtml(link)+'" rel="noopener">'+title+'</a>':title;
  let item='<li>'+head+'<div class="small">'+org+(when?', completed '+escapeHtml(when):'')+'. '+org+' checked: '+escapeHtml(evidenceLabel(c))+'</div>';
  if(!c?.live)item+='<div class="small grey">'+escapeHtml(STRINGS.liveMissing)+'</div>';
  else if(Number.isFinite(c.live.participantCountCompleted)&&c.live.participantCountCompleted>0)item+='<div class="small">'+c.live.participantCountCompleted+' people have completed this on Yoma</div>';
  return item+'</li>';
}

function skillChip(s){
  const name=escapeHtml(str(s?.name).trim()||'Skill');
  const orgs=list(s?.organizations).map(o=>str(o?.name).trim()).filter(Boolean);
  const link=safeUrl(s?.infoURL);
  const label=link?'<a href="'+escapeHtml(link)+'" rel="noopener">'+name+'</a>':name;
  return '<span class="chip">'+label+(orgs.length?' <span class="small">awarded by '+escapeHtml(orgs.join(', '))+'</span>':'')+'</span>';
}

function confirmedSection(record){
  const user=record?.user||{};
  const completions=list(record?.disclosed?.completions);
  const skills=list(record?.disclosed?.skills);
  const confirms=list(record?.confirms);
  const masked=maskedFromRecord(record);
  const phoneLine=user.phoneNumberConfirmed===true
    ?escapeHtml(STRINGS.phoneConfirmed)+(masked?' · <span>'+escapeHtml(masked)+'</span>':'')
    :escapeHtml(STRINGS.phoneNotConfirmed);
  let html='<section><h2>'+escapeHtml(STRINGS.confirmedTitle)+'</h2>';
  html+='<p class="small">'+phoneLine+'</p>';
  if(completions.length)html+='<ul>'+completions.map(completionItem).join('')+'</ul>';
  else{
    const trade=str(record?.trade).trim();
    const nudge=trade?' <a href="https://yoma.world/opportunities?query='+encodeURIComponent(trade)+'" rel="noopener">Find verified opportunities for '+escapeHtml(trade.toLowerCase())+' on Yoma</a>, which add issuer-recorded completions to this card.':'';
    html+='<p class="empty">No completed opportunities shared on this card.'+nudge+'</p>';
  }
  if(skills.length)html+='<p>'+skills.map(skillChip).join('')+'</p>';
  if(confirms.length){
    html+='<h2>'+escapeHtml(STRINGS.whatConfirms)+'</h2><ul>'+confirms.map(l=>'<li>'+escapeHtml(l?.text)+'</li>').join('')+'</ul>';
    if(record?.generation?.mode==='sample')html+='<p class="small">Template lines built from the account data, not written by a model.</p>';
  }
  return html+'</section>';
}

function statedSection(record){
  const sd=record?.selfDeclared||{};
  const services=list(sd.services);
  let html='<section class="stated"><h2>'+escapeHtml(STRINGS.statedBy(firstNameOf(record)))+'</h2>';
  if(str(sd.headline).trim())html+='<p><strong>'+escapeHtml(sd.headline)+'</strong></p>';
  if(services.length){
    html+='<ul>'+services.map(s=>{
      const price=priceText(s);
      return '<li>'+escapeHtml(s?.name)+(price?'<span class="price">'+escapeHtml(price)+'</span>':'')+'</li>';
    }).join('')+'</ul>';
  }else html+='<p class="empty">'+escapeHtml(STRINGS.noServices)+'</p>';
  const rows=[];
  if(str(sd.area).trim())rows.push(['Area',sd.area]);
  if(str(sd.hours).trim())rows.push(['Hours',sd.hours]);
  if(list(sd.languages).length)rows.push(['Languages',list(sd.languages).map(str).join(', ')]);
  if(str(sd.notes).trim())rows.push(['Notes',sd.notes]);
  if(rows.length)html+='<p class="small">'+rows.map(([k,v])=>'<strong>'+k+':</strong> '+escapeHtml(v)).join('<br>')+'</p>';
  return html+'</section>';
}

// `notice` is a short grey line shown in place of a check result (the busy answer to the no-JS form).
function checkSection(check,notice=''){
  if(!check&&str(notice).trim())return '<section id="check-result"><p class="grey">'+escapeHtml(notice)+'</p></section>';
  if(!check)return '<div id="check-result" hidden></div>';
  let inner;
  if(check.unavailable===true)inner='<p class="grey">'+escapeHtml(STRINGS.checkUnavailable)+'</p>';
  else{
    inner='<ul class="check">'+list(check.signals).map(s=>'<li class="'+(s?.ok===true?'ok':'bad')+'">'+escapeHtml(s?.label)+(str(s?.detail).trim()?' · '+escapeHtml(s.detail):'')+'</li>').join('')+'</ul>';
  }
  const when=parseDate(check.checkedAt);
  inner+='<p class="small">Checked '+(when?escapeHtml(fullDate(check.checkedAt)+' at '+timeOfDay(check.checkedAt)):'')+(check.simulated===true?' · simulated re-read of a sample account':'')+'</p>';
  return '<section id="check-result">'+inner+'</section>';
}

function publicPage({record,status='ok',check=null,withdrawn=null,publicUrl='',notice=''}={}){
  if(status==='withdrawn')return withdrawnPage(record,withdrawn||{});
  const user=record?.user||{};
  const first=firstNameOf(record);
  const name=str(user.displayName).trim()||first;
  const trade=str(record?.trade).trim();
  const id=str(record?.cardId);
  const url=cardUrl(record,publicUrl);
  const photo=safeUrl(user.photoURL);
  const area=str(record?.selfDeclared?.area).trim()||str(user.city).trim();
  const metaBits=[];
  if(monthYear(user.dateYoIDOnboarded))metaBits.push('Yo-ID since '+monthYear(user.dateYoIDOnboarded));
  if(year(user.dateCreated))metaBits.push('On Yoma since '+year(user.dateCreated));
  const completed=Number.isInteger(user.opportunityCountCompleted)?user.opportunityCountCompleted:list(record?.disclosed?.completions).length;
  metaBits.push(completed+' verified completion'+(completed===1?'':'s'));
  const wa=waLink(record);
  const firstConfirm=str(list(record?.confirms)[0]?.text).trim();

  let body='<header><span>'+escapeHtml(STRINGS.readFrom(first,fullDate(record?.snapshotReadAt),timeOfDay(record?.snapshotReadAt)))+'</span>'+
    '<form method="post" action="/c/'+escapeHtml(id)+'/check" id="check-form" data-api="/api/card/'+escapeHtml(id)+'/check"><button type="submit">'+escapeHtml(STRINGS.checkNow)+'</button></form></header>';
  if(record?.accountSource==='sample')body+='<p class="small sample">'+escapeHtml(STRINGS.sampleAccount)+'</p>';
  body+=checkSection(check,notice);
  body+='<section><div class="identity">'+(photo?'<img src="'+escapeHtml(photo)+'" alt="" loading="lazy">':'')+
    '<div><h1>'+escapeHtml(name)+'</h1>'+(trade?'<p class="trade">'+escapeHtml(trade)+(area?' · '+escapeHtml(area):'')+'</p>':(area?'<p class="trade">'+escapeHtml(area)+'</p>':''))+
    '<p class="meta">'+escapeHtml(metaBits.join('. '))+'</p></div></div></section>';
  body+=confirmedSection(record);
  body+=statedSection(record);
  if(wa)body+='<a class="btn wa" href="'+escapeHtml(wa)+'" rel="noopener">'+escapeHtml(STRINGS.whatsapp)+'</a>';
  body+='<p class="safety">'+escapeHtml(STRINGS.neverPay)+'</p>';
  body+=footer(record);
  body+='<script>'+SCRIPT+'</script>';
  return shell({title:name+(trade?' · '+trade:'')+' · YoCard',description:firstConfirm||(trade?trade+' on YoCard':'YoCard'),ogImage:url+'.svg',ogUrl:url,body});
}

function withdrawnPage(record,{withdrawnAt=null}={}){
  const date=fullDate(withdrawnAt)||'an earlier date';
  const body='<section class="notice"><h1>Card withdrawn</h1><p>'+escapeHtml(STRINGS.withdrawn(date))+'</p><p class="small">The worker who published this card has taken it down. Nothing on it can be checked any more.</p></section>'+
    '<p class="safety">'+escapeHtml(STRINGS.neverPay)+'</p>'+footer({cardId:record?.cardId});
  return shell({title:'Card withdrawn · YoCard',description:STRINGS.withdrawn(date),body});
}

function notFoundPage(){
  const body='<section class="notice"><h1>'+escapeHtml(STRINGS.notFound)+'</h1><p>Check the link or the 6-character code on the image and try again.</p></section>'+footer({});
  return shell({title:'No card with this code · YoCard',description:STRINGS.notFound,body});
}

// ---------- SVG card (1080 x 1350) ----------

function clip(text,max){
  const s=str(text).replace(/\s+/g,' ').trim();
  return s.length<=max?s:s.slice(0,Math.max(0,max-1)).trimEnd()+'…';
}
function svgText(x,y,text,{size=28,weight=400,fill='#020304',anchor='start',family=SVG_FONT}={}){
  return '<text x="'+x+'" y="'+y+'" font-family="'+escapeHtml(family)+'" font-size="'+size+'" font-weight="'+weight+'" fill="'+fill+'" text-anchor="'+anchor+'">'+escapeHtml(text)+'</text>';
}
// Places the QR (its own <svg>) inside the card by wrapping it; the nested svg keeps its viewBox so any
// cell size scales to the requested box.
function placeQr(qr,x,y,box){
  const m=/<svg\b[^>]*\bwidth="(\d+(?:\.\d+)?)"/.exec(str(qr));
  const natural=m?Number(m[1]):box;
  const k=natural>0?box/natural:1;
  return '<g transform="translate('+x+' '+y+') scale('+k+')">'+str(qr)+'</g>';
}

function cardSvg({record,publicUrl='',qrSvgFn,withdrawn=false}={}){
  const W=1080,H=1350;
  const user=record?.user||{};
  const first=firstNameOf(record);
  const name=clip(str(user.displayName).trim()||first,28);
  const trade=clip(record?.trade,40);
  const url=cardUrl(record,publicUrl);
  const shortUrl=url.replace(/^https?:\/\//,'');
  const code=str(record?.code);
  const parts=['<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="YoCard">',
    '<rect width="'+W+'" height="'+H+'" fill="#ffffff"/>',
    '<rect width="'+W+'" height="220" fill="#41204b"/>',
    svgText(60,96,'YoCard',{size:44,weight:700,fill:'#ffffff'}),
    svgText(60,150,record?.accountSource==='sample'?STRINGS.sampleSvg:'A work card read from a Yoma account',{size:28,fill:'#dce0e5'})];
  if(withdrawn){
    parts.push(svgText(60,420,'This card was withdrawn by its owner.',{size:44,weight:700}));
    parts.push(svgText(60,480,'Open the link to see the current status.',{size:30,fill:'#545859'}));
    parts.push(svgText(60,H-60,clip(shortUrl,60),{size:28,fill:'#545859'}));
    parts.push('</svg>');
    return parts.join('');
  }
  const photo=safeUrl(user.photoURL);
  let textX=60;
  if(photo){
    parts.push('<clipPath id="p"><circle cx="150" cy="340" r="90"/></clipPath><image href="'+escapeHtml(photo)+'" x="60" y="250" width="180" height="180" preserveAspectRatio="xMidYMid slice" clip-path="url(#p)"/>');
    textX=280;
  }
  parts.push(svgText(textX,320,name,{size:56,weight:700}));
  const area=clip(str(record?.selfDeclared?.area).trim()||str(user.city).trim(),40);
  parts.push(svgText(textX,372,trade+(area?' · '+area:''),{size:32,fill:'#545859'}));

  // Confirmed strip
  let y=470;
  parts.push('<rect x="60" y="'+(y-40)+'" width="960" height="330" rx="16" fill="#e6f5f3"/>');
  parts.push(svgText(90,y,STRINGS.confirmedTitle,{size:24,weight:700,fill:'#2b6a57'}));
  y+=50;
  const lines=[];
  const since=monthYear(user.dateYoIDOnboarded);
  if(since)lines.push('Yo-ID since '+since);
  if(user.phoneNumberConfirmed===true)lines.push(STRINGS.phoneConfirmed);
  const completions=list(record?.disclosed?.completions);
  const count=Number.isInteger(user.opportunityCountCompleted)?user.opportunityCountCompleted:completions.length;
  const orgs=[...new Set(completions.map(c=>str(c?.organizationName).trim()).filter(Boolean))].slice(0,3);
  lines.push(count+' completion'+(count===1?'':'s')+(orgs.length?' · '+orgs.join(', '):''));
  const skills=list(record?.disclosed?.skills);
  lines.push(skills.length+' skill'+(skills.length===1?'':'s')+(skills.length?' · '+clip(skills.map(s=>str(s?.name).trim()).filter(Boolean).join(', '),50):''));
  for(const line of lines.slice(0,5)){parts.push(svgText(90,y,clip(line,62),{size:28}));y+=46;}

  // Stated block
  y=830;
  parts.push('<rect x="60" y="'+(y-40)+'" width="960" height="250" rx="16" fill="#f3f6fa"/>');
  // The fixed string stays verbatim (as on the HTML page); only the name is clipped.
  parts.push(svgText(90,y,STRINGS.statedBy(clip(first,18)),{size:24,weight:700,fill:'#545859'}));
  y+=50;
  const services=list(record?.selfDeclared?.services).slice(0,3);
  if(services.length){
    for(const s of services){
      const price=priceText(s);
      parts.push(svgText(90,y,clip(s?.name,40),{size:28}));
      if(price)parts.push(svgText(990,y,clip(price,24),{size:28,fill:'#545859',anchor:'end'}));
      y+=46;
    }
  }else parts.push(svgText(90,y,STRINGS.noServices,{size:28,fill:'#545859'}));

  // QR, link, code
  const qr=typeof qrSvgFn==='function'?qrSvgFn(url,{cellSize:4,margin:2}):'';
  if(qr)parts.push(placeQr(qr,60,1070,220));
  parts.push(svgText(310,1120,clip(shortUrl,44),{size:30,weight:600}));
  parts.push(svgText(310,1172,'Code '+code,{size:34,weight:700,fill:'#41204b'}));
  parts.push(svgText(310,1220,STRINGS.notProof,{size:26,fill:'#545859'}));
  parts.push(svgText(310,1262,STRINGS.neverPay,{size:26,fill:'#545859'}));
  // Centred and small enough to fit the 1080 px width whole; the fixed string is never clipped.
  parts.push(svgText(540,H-28,STRINGS.footer,{size:18,fill:'#545859',anchor:'middle'}));
  parts.push('</svg>');
  return parts.join('');
}

module.exports={publicPage,notFoundPage,withdrawnPage,cardSvg,maskPhone,waLink,escapeHtml,safeUrl,fullDate,timeOfDay,monthYear,STRINGS};
