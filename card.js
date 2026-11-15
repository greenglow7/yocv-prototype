/* YoCard worker flow: connect a Yoma account, describe your work, review the draft, consent, publish, share. */
(()=>{
'use strict';
const E=window.YoCV.escapeHTML;
const stepNames=['Connect Yoma','Describe your work','Review your card','Publish and share'];
const STRINGS={
 whoCanSee:'Who can see this: anyone with the link',
 neverPay:'Never pay before the work is done',
 statedBy:first=>`Stated by ${first}, not checked`,
 readFrom:(first,when)=>`Read from ${first}'s Yoma account on ${when}`,
 phoneConfirmed:'Phone confirmed by Yoma (not an ID check)'
};
let status={offline:true,accountSource:'sample',model:{mode:'sample',provider:'local',model:null},personas:[],trades:[],publicUrl:''};
const isLive=()=>!status.offline&&status.model.mode==='live';
const fresh=()=>({step:0,maxStep:0,persona:'',draftToken:null,snapshot:null,trade:'',description:'',draft:null,selfDeclared:null,confirms:[],disclose:{completions:[],skills:[],photo:true,whatsapp:false},consent:false,published:null,error:'',errorMeta:null,busy:false,busyText:''});
let state=fresh(),pendingAction=null,toastTimer;
const view=document.querySelector('#view'),steps=document.querySelector('#steps'),pill=document.querySelector('#mode-pill');
function notify(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function fmtDate(iso){if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function monthYear(iso){if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';return d.toLocaleDateString('en-GB',{month:'long',year:'numeric'});}
function firstName(){const u=state.snapshot?.user||{};return u.firstName||String(u.displayName||'').split(/\s+/)[0]||'the worker';}
function tradeLabel(id){const t=status.trades.find(t=>t.id===id);return t?t.label:id;}
const FIELD_LABELS={headline:'Headline',services:'Services and prices',area:'Area',hours:'Hours',languages:'Languages',notes:'Notes'};
const REASON_TEXT={asserts_credential:'claims a certificate or qualification, which only the Yoma block can show',banned_phrase:'claims a certificate, licence or guarantee, which this block cannot do',organisation_name:'names an organisation, which only the Yoma block can do',wrong_organisation:'names an organisation that is not on your Yoma record',invented_number:'contains a number that is not in your message',length:'is longer than the card allows',duplicate:'repeats another line',over_limit:'goes over the limit for this part of the card',malformed:'could not be read as a service with a price',uncited_evidence:'does not cite a Yoma record',unknown_evidence:'cites a record that is not on your account'};
function storedCards(){try{return Object.keys(sessionStorage).filter(k=>k.startsWith('yocard:')).map(k=>({cardId:k.slice(7)}));}catch{return [];}}
function storedCardsHTML(){const cards=storedCards();if(!cards.length)return '';return `<div class="notice"><p>Cards you published in this browser session. Each stays public until you withdraw it.</p><ul>${cards.map(c=>`<li><a href="/c/${E(c.cardId)}" target="_blank" rel="noopener noreferrer">Card ${E(c.cardId)}</a> <button class="text-button" data-action="withdraw-stored" data-card="${E(c.cardId)}">Withdraw this card</button></li>`).join('')}</ul></div>`;}
function errorHTML(){
 if(!state.error)return '';
 const m=state.errorMeta;
 const actions=m&&(m.retryable||m.allowSample)?`<div class="error-actions">${m.retryable?'<button class="secondary" data-action="retry-draft">Retry</button>':''}${m.allowSample?'<button class="secondary" data-action="sample-draft">Continue with template draft</button>':''}</div>`:'';
 return `<div class="error-message" role="alert" id="card-error" tabindex="-1">${E(state.error)}${actions}</div>`;
}
function focusError(){document.querySelector('#card-error')?.focus();}
function setError(message,meta=null){state.error=message;state.errorMeta=meta;}
function go(step){state.step=step;state.maxStep=Math.max(step,state.maxStep);state.error='';state.errorMeta=null;render();window.scrollTo({top:0,behavior:'instant'});document.querySelector('#page-band h1')?.focus({preventScroll:true});}
function renderSteps(){steps.innerHTML=stepNames.map((name,i)=>`<button class="step-button ${i===state.step?'active':i<state.step?'completed':''}" data-step="${i}" aria-label="Step ${i+1} of ${stepNames.length}: ${name}" ${i>state.maxStep||state.published?'disabled':''} ${i===state.step?'aria-current="step"':''}><span class="step-number">${i+1}</span><span>${name}</span></button>`).join('');}
function stepLine(n){return `<p class="step-line">Step ${n} of 4</p>`;}
function modePillText(){return status.offline?'Sample mode (offline)':isLive()?'Live AI · '+(status.model.model||status.model.provider):'Sample mode';}
function updatePill(){if(!pill)return;const text=modePillText();pill.className='mode-label '+(status.offline?'offline':isLive()?'live':'sample');pill.textContent=text;}
function confirmAction(title,copy,label,fn){pendingAction=fn;document.querySelector('#confirm-title').textContent=title;document.querySelector('#confirm-copy').textContent=copy;document.querySelector('#confirm-action').textContent=label;document.querySelector('#confirm-dialog').showModal();}

/* Step 1: connect */
function connect(){
 if(status.offline)return `${stepLine(1)}<h1 tabindex="-1">Start the YoCard server</h1><p class="lead">This page needs the local server to read an account, draft a card and publish it.</p><div class="notice">Run <code>npm start</code> in the project folder and reload this page. Published cards are served by the same server.</div>${errorHTML()}`;
 const sample=status.accountSource==='sample';
 return `${stepLine(1)}<h1 tabindex="-1">Read your Yoma account</h1><p class="lead">${sample?'These are fictional sample accounts. A real account needs a Yoma-issued sign-in client, which this prototype does not have.':'This server is configured with a Yoma access token. It reads the account behind that token.'}</p>${sample?`<h2>Choose a sample account</h2><div class="choice-list" role="group" aria-label="Sample accounts">${status.personas.map(p=>`<button class="choice ${p.id===state.persona?'selected':''}" data-persona="${E(p.id)}" aria-pressed="${p.id===state.persona}"><span class="radio" aria-hidden="true"></span><span class="choice-text"><strong>${E(p.displayName)}</strong><small>${E(tradeLabel(p.trade))}${p.city?' · '+E(p.city):''}</small></span></button>`).join('')}</div>`:''}${errorHTML()}<div class="busy-note" aria-live="polite">${state.busy?E(state.busyText):''}</div><div class="action-row"><button class="${state.snapshot?'secondary':'primary'}" data-action="read-account" ${state.busy||(sample&&!state.persona)?'disabled':''}>${sample?'Read this account':'Read my Yoma account'}</button></div><p class="field-help">YoCard is for adults. Accounts whose Yoma date of birth shows under 18 are refused.</p>${state.snapshot?accountSummary():''}${storedCardsHTML()}`;
}
function accountSummary(){
 const s=state.snapshot,u=s.user,n=s.completions.length,k=s.skills.length;
 return `<div class="account-summary"><h3>${E(u.displayName)}</h3><p class="field-help">${E(STRINGS.readFrom(firstName(),fmtDate(s.readAt)+' at '+new Date(s.readAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})))}${s.source==='sample'?' (fictional sample account)':''}</p><dl class="summary-list"><dt>Yo-ID</dt><dd>${u.yoIDOnboarded?'Active'+(u.dateYoIDOnboarded?' since '+E(monthYear(u.dateYoIDOnboarded)):''):'Not yet. Yo-ID is needed to publish'}</dd><dt>Phone</dt><dd>${u.phoneNumberConfirmed?E(u.phoneNumber)+' · '+E(STRINGS.phoneConfirmed):'Not confirmed. Customers cannot message you through the card'}</dd><dt>Completions</dt><dd>${n} verified completion${n===1?'':'s'}${n?', recorded by Yoma partners':'. The card still works and will suggest opportunities'}</dd><dt>Skills</dt><dd>${k} skill${k===1?'':'s'}${k?', awarded through completions':' recorded'}</dd></dl><div class="action-row"><button class="primary" data-action="to-describe">Continue to describe your work</button></div></div>`;
}

/* Step 2: describe */
function describe(){
 return `${stepLine(2)}<h1 tabindex="-1">Describe your work in one message</h1><p class="lead">One message, like you would send on WhatsApp. What you do, where, what you charge, when you are free.</p><h2>Your trade</h2><div class="trade-grid" role="group" aria-label="Choose a trade">${status.trades.map(t=>`<button class="trade ${t.id===state.trade?'selected':''}" data-trade="${E(t.id)}" aria-pressed="${t.id===state.trade}">${E(t.label)}</button>`).join('')}</div><div class="form-section"><label class="field-label" for="description">Your message to customers</label><textarea id="description" maxlength="1000" placeholder="I do braids and cornrows in Khayelitsha, R150 to R400. Monday to Saturday. I come to you.">${E(state.description)}</textarea><p class="field-help">Only what you write here goes to the AI. Your name and phone number do not. <span id="description-count">${state.description.length}</span>/1,000</p></div><div class="notice">${isLive()?`Live AI (${E(status.model.model||status.model.provider)}) will draft the “stated by you” block and plain-language lines about what Yoma recorded. Every line must cite the Yoma record it comes from, or it is dropped.`:'Sample mode: the draft uses simple templates, no live AI call. The two-tier card and the checks are the same.'}</div>${errorHTML()}<div class="busy-note" id="busy-status" aria-live="polite">${state.busy?E(state.busyText):''}</div><div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="draft" ${state.busy||!state.trade?'disabled':''}>${state.busy?E(state.busyText):'Write the draft'}</button></div>`;
}

/* Step 3: review */
function completionRow(c){
 const on=state.disclose.completions.includes(c.evidenceId);
 const live=c.live;
 const checked=live?(live.verificationMethod==='Manual'?`${E(c.organizationName)} reviewed: ${E((live.verificationTypes||[]).map(t=>t.displayName||t.type).join(', ')||'evidence')}`:`${E(c.organizationName)} verified automatically`):'Opportunity details could not be checked with Yoma';
 return `<li class="evidence-row">${c.organizationLogoURL?`<img src="${E(c.organizationLogoURL)}" alt="" loading="lazy">`:''}<div class="evidence-body"><strong>${E(c.title)}</strong><small>${E(c.organizationName)} · completed ${E(monthYear(c.dateCompleted))}. ${checked}.${live&&live.yomaInfoURL?` <a href="${E(live.yomaInfoURL)}" target="_blank" rel="noopener noreferrer">Open on Yoma (yoma.world)</a>`:''}</small></div><label class="checkbox-label"><input type="checkbox" data-disclose="completions" data-id="${E(c.evidenceId)}" ${on?'checked':''}> Show</label></li>`;
}
function skillRow(s){
 const on=state.disclose.skills.includes(s.evidenceId);
 return `<li class="evidence-row"><div class="evidence-body"><strong>${E(s.name)}</strong><small>Awarded by ${E((s.organizations||[]).map(o=>o.name).join(', ')||'Yoma')}${s.infoURL?` · <a href="${E(s.infoURL)}" target="_blank" rel="noopener noreferrer">Lightcast skill entry</a>`:''}</small></div><label class="checkbox-label"><input type="checkbox" data-disclose="skills" data-id="${E(s.evidenceId)}" ${on?'checked':''}> Show</label></li>`;
}
function serviceRows(){
 const services=state.selfDeclared.services||[];
 return services.map((s,i)=>`<div class="service-row"><input aria-label="Service ${i+1} name" data-service="${i}" data-key="name" value="${E(s.name)}" maxlength="80" placeholder="Service"><input aria-label="Service ${i+1} price from" data-service="${i}" data-key="priceFrom" type="number" min="0" value="${s.priceFrom??''}" placeholder="From"><input aria-label="Service ${i+1} price to" data-service="${i}" data-key="priceTo" type="number" min="0" value="${s.priceTo??''}" placeholder="To"><input aria-label="Service ${i+1} currency" data-service="${i}" data-key="currency" value="${E(s.currency||'')}" maxlength="3" placeholder="ZAR"><button class="text-button" data-action="remove-service" data-index="${i}" aria-label="Remove service ${i+1}">Remove</button></div>`).join('');
}
function review(){
 const s=state.snapshot,sd=state.selfDeclared,first=firstName();
 const rejected=state.draft?.generation?.rejected||[];
 return `${stepLine(3)}<h1 tabindex="-1">What Yoma recorded, and what you added yourself</h1><p class="lead">The first block is what Yoma recorded, with a link to each record. The second is what you say about yourself, which nobody has checked.</p><div class="tier confirmed"><div class="tier-head"><h3>Confirmed from Yoma</h3><span class="tag recorded">Rendered from your Yoma record</span></div><p class="tier-note">${E(STRINGS.readFrom(first,fmtDate(s.readAt)))}. Untick anything you would rather not show.</p>${s.completions.length?`<ul class="evidence-list">${s.completions.map(completionRow).join('')}</ul>`:'<p class="tier-note">No verified completions yet. Your card will show your Yo-ID and confirmed phone, and the public page suggests Yoma opportunities for your trade.</p>'}${s.skills.length?`<h4>Skills</h4><ul class="evidence-list">${s.skills.map(skillRow).join('')}</ul>`:''}${state.confirms.length?`<h4>What Yoma confirms, in plain words</h4>${state.confirms.map((l,i)=>`<div class="confirm-line">${E(l.text)}<small>Cites ${E(l.evidenceIds.join(', '))}. ${state.draft?.generation?.mode==='live'?'AI-written, checked against the record.':'Template line from the record.'}</small><button class="text-button" data-action="remove-confirm" data-index="${i}">Remove line</button></div>`).join('')}`:''}${rejected.length?`<div class="rejected-note"><p>${rejected.length} draft suggestion${rejected.length===1?' was':'s were'} dropped because ${rejected.length===1?'it':'they'} could not be tied to your record or your words.</p><ul>${rejected.map(r=>`<li>${r.field?E(FIELD_LABELS[r.field]||r.field)+': ':''}${r.text?'“'+E(window.YoCV.shortQuote(r.text,160))+'” ':''}${E(REASON_TEXT[r.reason]||r.reason)}.</li>`).join('')}</ul></div>`:''}</div><div class="tier stated"><div class="tier-head"><h3>${E(STRINGS.statedBy(first))}</h3><span class="tag stated">Your own words</span></div><p class="tier-note">Edit freely. Prices must appear in your message, and this block cannot claim certifications or name organisations.</p><div class="form-section"><label class="field-label" for="headline">Headline</label><input id="headline" data-self="headline" maxlength="80" value="${E(sd.headline)}"></div><div class="form-section"><label class="field-label">Services and prices</label>${serviceRows()}<button class="text-button" data-action="add-service">Add a service</button></div><div class="field-row"><div class="form-section"><label class="field-label" for="area">Area</label><input id="area" data-self="area" maxlength="120" value="${E(sd.area)}"></div><div class="form-section"><label class="field-label" for="hours">Hours</label><input id="hours" data-self="hours" maxlength="120" value="${E(sd.hours)}"></div></div><div class="form-section"><label class="field-label" for="languages">Languages (comma separated)</label><input id="languages" data-self="languages" value="${E((sd.languages||[]).join(', '))}"></div><div class="form-section"><label class="field-label" for="notes">Notes</label><textarea id="notes" data-self="notes" maxlength="400" class="edit-area">${E(sd.notes)}</textarea></div></div><div class="tier"><div class="tier-head"><h3>What customers can do</h3></div><div class="toggle-list"><label class="checkbox-label"><input type="checkbox" data-toggle="whatsapp" ${state.disclose.whatsapp?'checked':''} ${s.user.phoneNumberConfirmed?'':'disabled'}><span>Show a “Message on WhatsApp” button to ${E(s.user.phoneNumber||'your confirmed number')}<small>${s.user.phoneNumberConfirmed?'Off by default. The button is the only place the full number appears. '+E(STRINGS.whoCanSee)+'.':'Your Yoma phone is not confirmed, so this is unavailable.'}</small></span></label><label class="checkbox-label"><input type="checkbox" data-toggle="photo" ${state.disclose.photo?'checked':''} ${s.user.photoURL?'':'disabled'}><span>Show my Yoma profile photo<small>${s.user.photoURL?'Customers compare the photo to the person in front of them.':'No photo on this Yoma account.'}</small></span></label></div></div>${errorHTML()}<div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="to-publish">Continue to publish</button></div>`;
}

/* Step 4: publish and share */
function publishStep(){
 if(state.published)return published();
 const s=state.snapshot,first=firstName();
 const n=state.disclose.completions.length,k=state.disclose.skills.length;
 return `${stepLine(4)}<h1 tabindex="-1">Choose what the card shows, then publish</h1><p class="lead">Your card becomes a page anyone with the link can open. Nothing else about you is published.</p><div class="consent-box"><strong>${E(STRINGS.whoCanSee)}</strong><ul><li>Your display name “${E(s.user.displayName)}”, trade “${E(tradeLabel(state.trade))}” and area${state.disclose.photo&&s.user.photoURL?', and your Yoma profile photo':''}</li><li>Yo-ID since ${E(monthYear(s.user.dateYoIDOnboarded)||'unknown')}, on Yoma since ${E(monthYear(s.user.dateCreated)||'unknown')}, ${n} completion${n===1?'':'s'} and ${k} skill${k===1?'':'s'} you ticked, with the organisations that recorded them</li><li>Phone: last three digits only${state.disclose.whatsapp?', plus a WhatsApp button that opens a chat with your full number':''}</li><li>The “${E(STRINGS.statedBy(first))}” block exactly as you edited it</li><li>Not published: your date of birth, email, address, or any file</li></ul><p class="field-help">The page says “${E(STRINGS.readFrom(first,'<date>'))}”. It never says “verified by Yoma”. The record is signed by YoCard so a customer can tell it was not edited after you published; it is not signed by Yoma. You can withdraw the card at any time with the owner secret shown after publishing.</p><label class="checkbox-label"><input type="checkbox" data-toggle="consent" ${state.consent?'checked':''}> I understand what becomes public and I want to publish this card.</label></div>${errorHTML()}<div class="busy-note" aria-live="polite">${state.busy?E(state.busyText):''}</div><div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="publish" ${!state.consent||state.busy?'disabled':''}>${state.busy?E(state.busyText):'Publish the card'}</button></div>`;
}
function published(){
 const p=state.published;
 return `${stepLine(4)}<h1 tabindex="-1">Your card is public</h1><p class="lead">Share the link, print the code, or show the image.</p><div class="result-grid"><section><div class="card-preview" id="card-preview"><img src="${E(p.svgUrl)}" alt="Your YoCard image with QR code" id="card-image"></div><div class="ladder"><h3>What this card proves, and what it does not</h3><ol><li>The image proves nothing; it says so and carries the code <strong>${E(p.code)}</strong> so a customer can match it to the page.</li><li>The page is signed by YoCard: it has not been edited since you published. Not a Yoma signature.</li><li>The green block was read from your Yoma account at a stated time. “Check now” reads it again.</li><li>The WhatsApp button, if on, goes only to the phone Yoma confirmed by code. That is not an ID check.</li><li>Each completion links to its live page on yoma.world, so the programme and organisation can be checked.</li></ol></div></section><aside><div class="link-box"><dl class="link-list"><dt>Your link</dt><dd><code id="card-link">${E(p.url)}</code></dd><dt>Card code</dt><dd class="big-code">${E(p.code)}</dd></dl><button class="primary" data-action="share">Share on WhatsApp</button><button class="secondary" data-action="copy-link">Copy link</button><button class="secondary" data-action="download-png">Download image (PNG)</button><a class="secondary" href="${E(p.url)}" target="_blank" rel="noopener noreferrer">Open the public page</a><button class="secondary" data-action="print">Print the QR code</button><div class="secret-box">Owner secret. Keep it: it is the only way to withdraw this card.<code id="owner-secret">${E(p.ownerSecret)}</code><button class="text-button" data-action="withdraw">Withdraw this card</button></div></div></aside></div>`;
}
/* Focus preservation across innerHTML replacement. */
function focusSnapshot(){try{const a=document.activeElement;if(!a||!view.contains(a))return null;const key=a.tagName==='BUTTON'?['role','example','persona','trade','action'].find(k=>a.dataset[k]!==undefined):undefined;if(!a.id&&!key)return null;const sel=typeof a.selectionStart==='number'&&typeof a.selectionEnd==='number'?[a.selectionStart,a.selectionEnd]:null;return {id:a.id,key,val:key?a.dataset[key]:null,sel};}catch{return null;}}
function focusRestore(f){if(!f)return;try{const esc=v=>window.CSS&&CSS.escape?CSS.escape(v):String(v).replace(/["\\]/g,'\\$&');const el=f.id?document.getElementById(f.id):view.querySelector(`button[data-${f.key}="${esc(f.val)}"]`);if(!el||el.disabled)return;el.focus({preventScroll:true});if(f.sel&&typeof el.setSelectionRange==='function')el.setSelectionRange(f.sel[0],f.sel[1]);}catch{}}
function setBand(){const band=document.querySelector('#page-band');if(!band)return;band.innerHTML='';const line=view.querySelector('.step-line'),h=view.querySelector('h1');if(line)band.appendChild(line);if(h)band.appendChild(h);}
function render(){const f=focusSnapshot();renderSteps();view.innerHTML=[connect,describe,review,publishStep][state.step]();setBand();view.setAttribute('aria-busy',String(state.busy));focusRestore(f);}

/* Server access */
function withDeadline(ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return {signal:c.signal,clear:()=>clearTimeout(t)};}
async function api(path,body){
 const d=withDeadline(30000);let res;
 try{res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:d.signal});}
 catch(e){
  const timedOut=!!(e&&e.name==='AbortError');
  const err=new Error(timedOut?'The server did not answer in time. You can retry.':'The YoCard server could not be reached. Check your connection and try again.');
  err.code=timedOut?'timeout':'network';err.retryable=true;err.status=0;
  if(!timedOut)loadStatus();
  throw err;
 }finally{d.clear();}
 const data=await res.json().catch(()=>({}));
 if(status.offline)await loadStatus();
 if(res.ok)return data;
 const err=new Error(data.error?.message||'Something went wrong.');err.code=data.error?.code||'error';err.retryable=!!data.error?.retryable;err.status=res.status;err.details=data.error;throw err;
}
async function loadStatus(){
 try{const res=await fetch('/api/card/status',{cache:'no-store'});if(!res.ok)throw new Error();const d=await res.json();status={offline:false,accountSource:d.accountSource,model:d.model,personas:d.personas||[],trades:d.trades||[],publicUrl:d.publicUrl||''};}
 catch{status={...status,offline:true};}
 updatePill();render();
}
async function readAccount(){
 if(state.busy)return;
 state.busy=true;state.busyText='Reading the account…';setError('');render();
 try{
  const d=await api('/api/card/account',status.accountSource==='sample'?{persona:state.persona}:{});
  state.busy=false;state.draftToken=d.draftToken;state.snapshot=d.snapshot;
  state.disclose={completions:d.snapshot.completions.map(c=>c.evidenceId),skills:d.snapshot.skills.map(s=>s.evidenceId),photo:!!d.snapshot.user.photoURL,whatsapp:false};
  const p=status.personas.find(p=>p.id===state.persona);if(p&&!state.trade)state.trade=p.trade;
  render();notify('Account read. Nothing is public yet.');document.querySelector('.account-summary h3')?.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(err){state.busy=false;setError(err.message,(err.retryable===true||err.code==='yoma_unavailable')?{retryable:true}:null);render();focusError();}
}
async function draftCard(mode){
 if(state.busy)return;
 state.busy=true;state.busyText=(mode!=='sample'&&isLive())?'Asking the AI…':'Preparing a template draft…';setError('');render();
 const body={draftToken:state.draftToken,trade:state.trade,description:state.description};if(mode)body.mode=mode;
 try{
  const d=await api('/api/card/draft',body);
  state.busy=false;state.draft=d;state.selfDeclared=d.selfDeclared;state.confirms=d.confirms||[];go(2);
 }catch(err){
  state.busy=false;
  const allowSample=err.status===502&&mode!=='sample';
  setError(err.message,(err.retryable===true||allowSample)?{retryable:err.retryable===true,allowSample}:null);render();focusError();
 }
}
async function publishCard(){
 if(state.busy)return;
 state.busy=true;state.busyText='Publishing…';setError('');render();
 try{
  const d=await api('/api/card/publish',{draftToken:state.draftToken,trade:state.trade,description:state.description,selfDeclared:state.selfDeclared,confirms:state.confirms,disclose:state.disclose,consent:state.consent===true});
  state.busy=false;state.published=d;try{sessionStorage.setItem('yocard:'+d.cardId,d.ownerSecret);}catch{}
  render();window.scrollTo({top:0,behavior:'instant'});notify('Your card is published.');
 }catch(err){
  state.busy=false;
  const detail=err.details?.rejected?.length?' Dropped: '+err.details.rejected.map(r=>r.field?r.field+' ('+r.reason+')':r.reason).join(', ')+'.':'';
  if(err.code==='session_expired'){setError(err.message);state.maxStep=0;}
  else setError(err.message+detail,err.retryable===true?{retryable:true}:null);
  render();focusError();
 }
}
async function withdrawCard(){
 const p=state.published;if(!p)return;
 try{await api('/api/card/'+p.cardId+'/withdraw',{ownerSecret:p.ownerSecret});try{sessionStorage.removeItem('yocard:'+p.cardId);}catch{}notify('Card withdrawn. The link now shows that it was withdrawn by its owner.');state=fresh();render();}
 catch(err){notify(err.message);}
}
async function withdrawStored(cardId){
 let secret=null;try{secret=sessionStorage.getItem('yocard:'+cardId);}catch{}
 if(!secret){notify('The owner secret for this card is no longer in this session.');return;}
 try{await api('/api/card/'+cardId+'/withdraw',{ownerSecret:secret});try{sessionStorage.removeItem('yocard:'+cardId);}catch{}notify('Card withdrawn. The link now shows that it was withdrawn by its owner.');render();}
 catch(err){if(err&&(err.status===404||err.status===410)){try{sessionStorage.removeItem('yocard:'+cardId);}catch{}render();}notify(err.message);}
}
async function svgToPngBlob(svgUrl){
 const svgText=await (await fetch(svgUrl,{cache:'no-store'})).text();
 const blob=new Blob([svgText],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob);
 try{
  const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Could not render the card image.'));img.src=url;});
  const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,1080,1350);ctx.drawImage(img,0,0,1080,1350);
  return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not export PNG.')),'image/png'));
 }finally{URL.revokeObjectURL(url);}
}
async function share(){
 const p=state.published;if(!p)return;
 const text=`My YoCard: ${p.url} (code ${p.code}). Open the link to see what Yoma recorded.`;
 try{
  const png=await svgToPngBlob(p.svgUrl);const file=new File([png],'yocard-'+p.code+'.png',{type:'image/png'});
  if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],text});return;}
 }catch(err){if(err&&err.name==='AbortError')return;}
 window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');
}
async function downloadPng(){
 const p=state.published;if(!p)return;
 try{const png=await svgToPngBlob(p.svgUrl);const url=URL.createObjectURL(png);const a=document.createElement('a');a.href=url;a.download='yocard-'+p.code+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);notify('PNG prepared. Check your downloads.');}
 catch(err){notify(err.message);}
}

/* Events */
view.addEventListener('input',event=>{
 const el=event.target;
 if(el.id==='description'){state.description=el.value;document.querySelector('#description-count').textContent=el.value.length;}
 if(el.dataset.self){const v=el.value;state.selfDeclared[el.dataset.self]=el.dataset.self==='languages'?v.split(',').map(s=>s.trim()).filter(Boolean):v;}
 if(el.dataset.service!==undefined){const s=state.selfDeclared.services[Number(el.dataset.service)];if(!s)return;const key=el.dataset.key;s[key]=key==='priceFrom'||key==='priceTo'?(el.value===''?null:Number(el.value)):el.value;}
});
view.addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.disclose){const list=state.disclose[el.dataset.disclose];const id=el.dataset.id;if(el.checked){if(!list.includes(id))list.push(id);}else state.disclose[el.dataset.disclose]=list.filter(x=>x!==id);}
 if(el.dataset.toggle==='whatsapp')state.disclose.whatsapp=el.checked;
 if(el.dataset.toggle==='photo')state.disclose.photo=el.checked;
 if(el.dataset.toggle==='consent'){state.consent=el.checked;render();}
});
view.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 if(button.dataset.persona!==undefined){state.persona=button.dataset.persona;state.snapshot=null;state.draftToken=null;render();return;}
 if(button.dataset.trade!==undefined){state.trade=button.dataset.trade;render();return;}
 const action=button.dataset.action;
 if(action==='read-account')await readAccount();
 if(action==='to-describe')go(1);
 if(action==='back')go(state.step-1);
 if(action==='draft')await draftCard();
 if(action==='retry-draft'){if(state.step===0)await readAccount();else if(state.step===3)await publishCard();else await draftCard();}
 if(action==='sample-draft')await draftCard('sample');
 if(action==='add-service'){state.selfDeclared.services.push({name:'',priceFrom:null,priceTo:null,currency:''});render();document.querySelector(`[data-service="${state.selfDeclared.services.length-1}"][data-key="name"]`)?.focus();}
 if(action==='remove-service'){state.selfDeclared.services.splice(Number(button.dataset.index),1);render();}
 if(action==='remove-confirm'){state.confirms.splice(Number(button.dataset.index),1);render();}
 if(action==='to-publish'){
  if(!state.selfDeclared.services.length&&!state.selfDeclared.headline&&!state.selfDeclared.notes){setError('Add at least a headline, one service or a note so customers know what you offer.');render();focusError();return;}
  go(3);
 }
 if(action==='publish')await publishCard();
 if(action==='share')await share();
 if(action==='copy-link'){try{await navigator.clipboard.writeText(state.published.url);notify('Link copied.');}catch{notify('Copy the link from the box above.');}}
 if(action==='download-png')await downloadPng();
 if(action==='print'&&state.published)window.open(state.published.svgUrl,'_blank','noopener');
 if(action==='withdraw-stored')confirmAction('Withdraw this card?','The link will show that the card was withdrawn by its owner. This cannot be undone.','Withdraw',()=>withdrawStored(button.dataset.card));
 if(action==='withdraw')confirmAction('Withdraw this card?','The link will show that the card was withdrawn by its owner. This cannot be undone.','Withdraw',withdrawCard);
});
steps.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;go(Number(button.dataset.step));});
document.querySelector('#reset-button').onclick=()=>confirmAction('Start over?','This clears your draft in this browser. A published card stays online until you withdraw it.','Start over',()=>{state=fresh();render();window.scrollTo({top:0,behavior:'instant'});});
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>{button.closest('dialog').close();pendingAction=null;});
document.querySelector('#confirm-action').onclick=()=>{document.querySelector('#confirm-dialog').close();const action=pendingAction;pendingAction=null;action?.();};
updatePill();render();loadStatus();
})();
