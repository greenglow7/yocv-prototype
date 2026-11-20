/* YoCV prototype: the four-step shell (spec 5). Step 1 reads the Yoma record, Step 2 holds the work interview and the
   contact form. The state lives in this tab only. The copy, the rules, the roles and the accounts come from
   /api/cv/config; with no server the app starts offline on the browser copies of the catalogue and the rules. */
(()=>{
'use strict';
const C=window.YoCV,E=C.escapeHTML;
const fill=(t,v={})=>String(t??'').replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?'':String(v[k]));
const KINDS=['none','person','completion','vouch'],SCREENS=7,MAX_ENTRIES=3,PHOTO_TYPES=['image/png','image/jpeg','image/webp'],PHOTO_MAX=2*1024*1024;
const len=s=>[...String(s??'')].length,ym=v=>{const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);return m?+m[1]*12+(+m[2]-1):null;};
const thisMonth=()=>{const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);};
let cfg=null,copy=window.YoCVCopy.en,rules=window.YoCVRules.RULES;
let state=C.newCvState(),ui=freshUi(),pendingAction=null,toastTimer;
const view=document.querySelector('#view'),steps=document.querySelector('#steps'),pill=document.querySelector('#mode-pill');
function freshUi(menus={}){return {persona:'',busy:false,error:'',entry:0,screen:0,forms:[],menus,optionalOpen:false};}
const blankForm=()=>({title:'',place:'',what:'',forWhomChip:'',forWhomText:'',frequency:'',start:'',end:'',value:'',unit:'',hedge:'',outcome:'',confirm:'',completionId:''});
// An Entry (plan Shared shapes) from the form: forWhom is the free text when given, else the chip.
const toEntry=f=>({title:f.title.trim(),place:f.place.trim(),what:f.what.trim(),forWhom:f.forWhomText.trim()||f.forWhomChip,frequency:f.frequency,
  months:{start:f.start,end:f.end},number:f.value.trim()===''?null:{value:Number(f.value),unit:f.unit,hedge:f.hedge},outcome:f.outcome.trim(),
  confirm:f.confirm==='completion'?{kind:'completion',completionId:f.completionId}:{kind:f.confirm}});
function sync(){state.entries=ui.forms.map(toEntry);}
function notify(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function confirmAction(title,text,label,fn){pendingAction=fn;document.querySelector('#confirm-title').textContent=title;document.querySelector('#confirm-copy').textContent=text;document.querySelector('#confirm-action').textContent=label;document.querySelector('#confirm-dialog').showModal();}
const errorHTML=()=>ui.error?`<div class="error-message" role="alert" id="step-error" tabindex="-1">${E(ui.error)}</div>`:'';
const opt=()=>` <span class="optional">${E(copy.optionalTag)}</span>`;
/* Mode label: copy.modeLive with the model (else the provider), copy.modeSample or copy.modeOffline. */
function updatePill(){
 const m=cfg.mode,live=!state.offline&&m.mode==='live';
 pill.className='mode-label '+(state.offline?'offline':live?'live':'sample');
 pill.textContent=state.offline?copy.modeOffline:live?fill(copy.modeLive,{model:m.model||m.provider}):copy.modeSample;
}
const stepNames=()=>[copy.stepRecord,copy.stepWork,copy.stepReview,copy.stepCv];
function renderSteps(){const names=stepNames();steps.innerHTML=names.map((name,i)=>`<button class="step-button ${i===state.step?'active':i<state.step?'completed':''}" data-step="${i}" aria-label="${E(fill(copy.stepNav,{n:i+1,total:names.length,name}))}" ${i>state.maxStep?'disabled':''} ${i===state.step?'aria-current="step"':''}><span class="step-number">${i+1}</span><span>${E(name)}</span></button>`).join('');}
const head=(n,title,lead)=>`<p class="step-line">${E(fill(copy.stepOf,{n,total:4}))}</p><h1 class="step-title" tabindex="-1">${E(title)}</h1>${lead?`<p class="lead">${E(lead)}</p>`:''}`;
const footer=(back,action,label,disabled)=>`<div class="form-footer">${back?`<button class="back-link" data-action="back">${E(copy.back)}</button>`:'<span></span>'}${action?`<button class="primary" data-action="${action}" ${disabled?'disabled':''}>${E(label)}</button>`:''}</div>`;
/* Step 1: the record under Confirmed from Yoma, ticked to include, never edited; then the target role. */
const tradeLabel=id=>cfg.roles.find(r=>r.tradeId&&r.tradeId===id)?.name||id;
const personaHTML=p=>`<button class="choice ${p.id===ui.persona?'selected':''}" data-persona="${E(p.id)}" aria-pressed="${p.id===ui.persona}"><span class="radio" aria-hidden="true"></span><span class="choice-text"><strong>${E(p.displayName)}</strong><small>${E([tradeLabel(p.trade),p.city].filter(Boolean).join(' · '))}</small></span></button>`;
function tick(kind,id,title,meta,skills){
 const on=state.include[kind].includes(id);
 return `<li><label class="checkbox-label"><input type="checkbox" id="inc-${E(kind)}-${E(id)}" data-include="${E(kind)}" value="${E(id)}" ${on?'checked':''}><span class="choice-text"><strong>${E(title)}</strong>${meta?`<small>${E(meta)}</small>`:''}${skills.length?`<small>${E(fill(copy.skillsLine,{skills:skills.join(', ')}))}</small>`:''}</span></label></li>`;
}
const tickList=items=>items.length?`<ul class="record-list">${items.join('')}</ul>`:`<p class="field-help">${E(copy.recordEmpty)}</p>`;
function recordHTML(r){
 const credentials=r.wallet==='unavailable'?`<p class="notice">${E(copy.walletUnavailable)}</p>`
  :tickList(r.credentials.map(credential=>tick('credentials',credential.id,credential.title,[fill(copy.issuedBy,{issuer:credential.issuer||copy.issuerNotStated}),credential.month].filter(Boolean).join(', '),credential.skills||[])));
 return `<section class="form-section" aria-labelledby="record-title"><h2 id="record-title">${E(copy.labelYoma)}</h2><p class="field-help">${E(copy.recordTick)}</p>`
  +`<h3>${E(copy.recordCompletions)}</h3>${tickList(r.completions.map(c=>tick('completions',c.evidenceId,c.title,[c.organizationName,c.month].filter(Boolean).join(', '),c.skills.map(s=>s.name))))}`
  +`<h3>${E(copy.recordCredentials)}</h3>${credentials}`
  +(r.selfAttested.length?`<h3>${E(copy.recordSelfAttested)} <span class="tag stated">${E(copy.labelSelf)}</span></h3>${tickList(r.selfAttested.map(a=>tick('selfAttested',a.evidenceId,a.name,'',[])))}`:'')+'</section>';
}
function roleHTML(){
 const role=cfg.roles.find(r=>r.name===state.role),m=ui.menus[state.role];
 const menu=m?`<p class="field-help">${E(m.menu.length?fill(copy.roleMenu,{skills:m.menu.map(s=>s.name).join(', ')}):copy.roleMenuNone)}</p>`:'';
 return `<section class="form-section"><h2>${E(copy.roleHeading)}</h2><label class="field-label" for="role">${E(copy.roleLabel)}</label><select id="role" data-role-pick><option value="">${E(copy.roleChoose)}</option>${cfg.roles.map(r=>`<option value="${E(r.name)}" ${r.name===state.role?'selected':''}>${E(r.name)}</option>`).join('')}</select>${role?.description?`<p class="field-help">${E(role.description)}</p>`:''}${menu}</section>`;
}
function recordStep(){
 if(state.offline)return head(1,copy.stepRecord)+`<div class="notice">${E(copy.recordOffline)}</div><section class="form-section"><label class="field-label" for="role-offline">${E(copy.roleOffline)}</label><input id="role-offline" data-role-text maxlength="60" value="${E(state.role)}"></section>${errorHTML()}${footer(false,'to-work',copy.continueWork)}`;
 const sample=cfg.accounts.source==='sample',r=state.record;
 return head(1,copy.stepRecord,sample?copy.recordLeadSample:copy.recordLeadToken)
  +(sample?`<h2>${E(copy.chooseAccount)}</h2><div class="choice-list" role="group" aria-label="${E(copy.chooseAccount)}">${cfg.accounts.personas.map(personaHTML).join('')}</div>`:'')
  +`<div class="action-row"><button class="${r?'secondary':'primary'}" data-action="read-record" ${ui.busy||(sample&&!ui.persona)?'disabled':''}>${E(ui.busy?copy.reading:sample?copy.readSample:copy.readToken)}</button></div>${errorHTML()}`
  +(r?recordHTML(r)+roleHTML():'')+footer(false,'to-work',copy.continueWork,!r||!state.role);
}
/* Step 2: up to three entries, each a title and place then the six questions (one screen each on a phone), then contact. */
const chips=(f,field,values,labels=values)=>`<div class="chips">${values.map((v,i)=>`<button type="button" class="chip${f[field]===v?' selected':''}" data-chip="${field}" data-value="${E(v)}" aria-pressed="${f[field]===v}">${E(labels[i])}</button>`).join('')}</div>`;
const field=(id,label,attrs,value,help='')=>`<label class="field-label" for="${id}">${label}</label><input id="${id}" ${attrs} value="${E(value)}">${help?`<p class="field-help">${E(help)}</p>`:''}`;
function screens(f){
 const ticked=state.record?state.record.completions.filter(c=>state.include.completions.includes(c.evidenceId)):[];
 const kinds=KINDS.filter(k=>k!=='completion'||ticked.length),labels=kinds.map(k=>copy.confirmChips[KINDS.indexOf(k)]);
 return [
  field('e-title',E(copy.fieldTitle),'data-e="title" maxlength="60"',f.title,copy.titleHelp)+field('e-place',E(copy.fieldPlace)+opt(),'data-e="place" maxlength="60" autocomplete="address-level2"',f.place),
  `<label class="field-label" for="e-what">${E(copy.qWhat)}</label><textarea id="e-what" data-e="what" maxlength="400">${E(f.what)}</textarea><p class="field-help">${E(copy.whatHelp)} <span id="what-count">${E(fill(copy.countOf,{n:len(f.what),max:400}))}</span></p>`,
  `<fieldset><legend class="field-label">${E(copy.qForWhom)}</legend>${chips(f,'forWhomChip',copy.forWhomChips)}</fieldset>${field('e-for-whom',E(copy.forWhomOther)+opt(),'data-e="forWhomText" maxlength="80"',f.forWhomText)}`,
  `<fieldset><legend class="field-label">${E(copy.qOften)}</legend>${chips(f,'frequency',copy.frequencyChips)}</fieldset><div class="fields-grid"><div>${field('e-start',E(copy.monthStart),`data-e="start" type="month" max="${thisMonth()}" placeholder="YYYY-MM"`,f.start)}</div><div>${field('e-end',E(copy.monthEnd)+opt(),`data-e="end" type="month" max="${thisMonth()}" placeholder="YYYY-MM"`,f.end)}</div></div><p class="field-help">${E(copy.monthHelp)}</p>`,
  `<fieldset><legend class="field-label">${E(copy.qNumber)}${opt()}</legend><p class="field-help">${E(copy.numberHelp)}</p>${field('e-value',E(copy.numberValue),'data-e="value" type="number" inputmode="numeric" min="0" max="100000" step="1"',f.value)}<p class="field-label">${E(copy.numberUnit)}</p>${chips(f,'unit',copy.unitChips)}<p class="field-label">${E(copy.numberHedge)}</p>${chips(f,'hedge',copy.hedgeChips)}</fieldset>`,
  `<label class="field-label" for="e-outcome">${E(copy.qBetter)}${opt()}</label><textarea id="e-outcome" class="short" data-e="outcome" maxlength="200">${E(f.outcome)}</textarea>`,
  `<fieldset><legend class="field-label">${E(copy.qConfirm)}</legend>${chips(f,'confirm',kinds,labels)}</fieldset>${f.confirm==='completion'&&ticked.length?`<fieldset><legend class="field-label">${E(copy.completionPick)}</legend>${chips(f,'completionId',ticked.map(c=>c.evidenceId),ticked.map(c=>c.title))}</fieldset>`:''}`
 ];
}
function entryTabs(){
 const tabs=ui.forms.map((f,i)=>`<button type="button" class="chip${i===ui.entry?' selected':''}" data-entry="${i}" aria-pressed="${i===ui.entry}">${E(fill(copy.entryTab,{n:i+1,title:f.title.trim()||copy.entryUntitled}))}</button>`).join('');
 return `<div class="entry-tabs" role="group" aria-label="${E(copy.entriesLabel)}">${tabs}${ui.forms.length<MAX_ENTRIES?`<button class="text-button" data-action="add-entry">${E(copy.addEntry)}</button>`:''}${ui.forms.length>1?`<button class="text-button" data-action="remove-entry">${E(copy.removeEntry)}</button>`:''}</div>`;
}
function contactHTML(){
 const c=state.contact,o=state.optional,photo=o.photo?`<img class="photo-preview" src="${E(o.photo)}" alt="${E(fill(copy.cvPhotoAlt,{name:c.name}))}"><button class="text-button" data-action="remove-photo">${E(copy.photoRemove)}</button>`:'';
 return `<section class="form-section"><h2>${E(copy.contactHeading)}</h2><p class="field-help">${E(copy.contactHelp)}</p><div class="fields-grid">`
  +`<div>${field('c-name',E(copy.contactName),'data-contact="name" maxlength="100" autocomplete="name"',c.name)}</div><div>${field('c-phone',E(copy.contactPhone)+opt(),'data-contact="phone" type="tel" maxlength="30" autocomplete="tel"',c.phone)}</div>`
  +`<div>${field('c-email',E(copy.contactEmail)+opt(),'data-contact="email" type="email" maxlength="160" autocomplete="email"',c.email)}</div><div>${field('c-town',E(copy.contactTown)+opt(),'data-contact="town" maxlength="100" autocomplete="address-level2"',c.town)}</div></div>`
  +`<div class="form-section">${field('c-education',E(copy.education)+opt(),'data-contact="education" maxlength="200"',c.education,copy.educationHelp)}</div>`
  +`<details class="form-section" id="optional-fields" ${ui.optionalOpen?'open':''}><summary>${E(copy.optionalHeading)}</summary><p class="field-help">${E(copy.optionalHelp)}</p>`
  +`<label class="field-label" for="o-photo">${E(copy.photoLabel)}</label><input id="o-photo" type="file" accept="image/png,image/jpeg,image/webp"><p class="field-help">${E(copy.photoHelp)}</p>${photo}`
  +`<div class="fields-grid form-section"><div>${field('o-dob',E(copy.cvDateOfBirth),'data-optional="dateOfBirth" type="date"',o.dateOfBirth)}</div><div>${field('o-id',E(copy.cvIdNumber),'data-optional="idNumber" maxlength="30"',o.idNumber)}</div><div>${field('o-origin',E(copy.cvStateOfOrigin),'data-optional="stateOfOrigin" maxlength="60"',o.stateOfOrigin)}</div></div></details></section>`;
}
function workStep(){
 if(!ui.forms.length){ui.forms.push(blankForm());sync();}
 const nav=`<div class="q-nav"><button class="secondary small" data-action="prev-q" ${ui.screen?'':'disabled'}>${E(copy.prevQuestion)}</button><button class="primary small" data-action="next-q" ${ui.screen<SCREENS-1?'':'disabled'}>${E(copy.nextQuestion)}</button></div>`;
 return head(2,copy.stepWork,copy.workLead)+entryTabs()
  +`<section class="form-section interview" aria-label="${E(fill(copy.entryTab,{n:ui.entry+1,title:ui.forms[ui.entry].title.trim()||copy.entryUntitled}))}">${screens(ui.forms[ui.entry]).map((html,i)=>`<div class="q${i===ui.screen?' current':''}">${html}</div>`).join('')}${nav}</section>`
  +contactHTML()+errorHTML()+footer(true,'to-review',copy.continueReview);
}
/* Steps 3 and 4 arrive with the review and the CV (Task 15b). */
const reviewStep=()=>head(3,copy.stepReview)+footer(true);
const cvStep=()=>head(4,copy.stepCv)+footer(true);
// The first field that would fail the server's checks (server/cv/routes.js validateEntries), with its screen.
function checkWork(){
 const cur=ym(thisMonth());
 for(const [i,e] of state.entries.entries()){
  const bad=(screen,id,key)=>({entry:i,screen,id,message:copy[key]}),a=ym(e.months.start),b=ym(e.months.end);
  if(len(e.title)<2||len(e.title)>60)return bad(0,'e-title','errTitle');
  if(len(e.what)<20||len(e.what)>400)return bad(1,'e-what','errWhat');
  if((e.months.start&&a==null)||(e.months.end&&b==null)||(e.months.end&&!e.months.start)||a>cur||b>cur||(b!=null&&a>b))return bad(3,'e-start','errMonths');
  if(e.number&&(!Number.isInteger(e.number.value)||e.number.value<0||e.number.value>100000||!e.number.unit||!e.number.hedge))return bad(4,'e-value','errNumber');
  if(!KINDS.includes(e.confirm.kind)||(e.confirm.kind==='completion'&&!state.include.completions.includes(e.confirm.completionId)))return bad(6,null,'errConfirm');
 }
 if(!state.contact.name.trim())return {id:'c-name',message:copy.errName};
 if(document.querySelector('#c-email')?.checkValidity()===false)return {id:'c-email',message:copy.errEmail};
 return null;
}
/* Focus survives innerHTML replacement: by id, else by the button's data attributes. */
function focusSnapshot(){
 try{
  const a=document.activeElement;if(!a||!view.contains(a))return null;
  const sel=a.id?'#'+CSS.escape(a.id):a.tagName==='BUTTON'&&Object.keys(a.dataset).length?'button'+Object.entries(a.dataset).map(([k,v])=>`[data-${k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${CSS.escape(v)}"]`).join(''):null;
  let range=null;try{if(typeof a.selectionStart==='number')range=[a.selectionStart,a.selectionEnd];}catch{}
  return sel?{sel,range}:null;
 }catch{return null;}
}
function focusRestore(f){if(!f)return;try{const el=view.querySelector(f.sel);if(!el||el.disabled)return;el.focus({preventScroll:true});if(f.range)el.setSelectionRange(...f.range);}catch{}}
function setBand(){const band=document.querySelector('#page-band');if(!band)return;band.innerHTML='';const line=view.querySelector('.step-line'),h=view.querySelector('h1.step-title');if(line)band.appendChild(line);if(h)band.appendChild(h);}
function render(){if(!cfg)return;const f=focusSnapshot();renderSteps();view.innerHTML=[recordStep,workStep,reviewStep,cvStep][state.step]();setBand();view.setAttribute('aria-busy',String(ui.busy));focusRestore(f);}
function go(step){state.step=step;state.maxStep=Math.max(step,state.maxStep);ui.error='';render();window.scrollTo({top:0,behavior:'instant'});document.querySelector('#page-band h1')?.focus({preventScroll:true});}
function showError(message,id){ui.error=message;render();(id&&document.getElementById(id)||document.querySelector('#step-error'))?.focus();}
/* Server access */
async function post(path,body){
 let res;
 try{res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}catch{throw new Error(copy.errServer);}
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(data.error?.message||copy.errServer);
 return data;
}
async function loadMenu(role){
 if(state.offline||!role||ui.menus[role])return;
 try{const res=await fetch('/api/cv/menu?role='+encodeURIComponent(role),{cache:'no-store'});ui.menus[role]=res.ok?await res.json():{menu:[],source:'none'};}
 catch{ui.menus[role]={menu:[],source:'none'};}
 if(state.step===0&&state.role===role)render();
}
async function readRecord(){
 ui.busy=true;ui.error='';render();
 const selector=cfg.accounts.source==='sample'?{persona:ui.persona}:{};
 try{
  const {sessionId,record}=await post('/api/cv/record',selector),u=record.user;
  Object.assign(state,{sessionId,selector,record,
   include:{completions:record.completions.map(c=>c.evidenceId),credentials:record.credentials.map(c=>c.id),selfAttested:record.selfAttested.map(a=>a.evidenceId)},
   contact:{...state.contact,name:u.displayName,phone:u.phoneNumber,town:u.city}});
  for(const f of ui.forms)if(f.confirm==='completion'&&!state.include.completions.includes(f.completionId))f.completionId='';
  const persona=cfg.accounts.personas.find(p=>p.id===ui.persona),match=cfg.roles.find(r=>r.tradeId&&r.tradeId===persona?.trade);
  if(!state.role&&match)state.role=match.name;
  sync();
 }catch(e){ui.error=e.message;}
 ui.busy=false;render();loadMenu(state.role);
}
function readPhoto(file){
 if(!file)return;
 if(!PHOTO_TYPES.includes(file.type)||file.size>PHOTO_MAX){showError(copy.errPhoto,'o-photo');return;}
 const reader=new FileReader();
 reader.onload=()=>{state.optional.photo=String(reader.result);ui.error='';render();};
 reader.readAsDataURL(file);
}
async function start(){
 try{
  const res=await fetch('/api/cv/config',{cache:'no-store'});
  if(!res.ok)throw new Error('config '+res.status);
  cfg=await res.json();
 }catch{
  state.offline=true;
  cfg={copy:window.YoCVCopy.en,rules:window.YoCVRules.RULES,roles:[],accounts:{source:null,personas:[]},mode:{mode:'sample',provider:'browser-local',model:null}};
 }
 copy=cfg.copy;rules=cfg.rules;
 updatePill();render();
}
view.addEventListener('input',event=>{
 const el=event.target,f=ui.forms[ui.entry];
 if(el.dataset.e&&f){f[el.dataset.e]=el.value;sync();
  if(el.dataset.e==='what')document.querySelector('#what-count').textContent=fill(copy.countOf,{n:len(el.value),max:400});
  if(el.dataset.e==='title')view.querySelector(`[data-entry="${ui.entry}"]`).textContent=fill(copy.entryTab,{n:ui.entry+1,title:el.value.trim()||copy.entryUntitled});}
 if(el.dataset.contact)state.contact[el.dataset.contact]=el.value;
 if(el.dataset.optional)state.optional[el.dataset.optional]=el.value;
 if(el.dataset.roleText!==undefined)state.role=el.value.trim();
});
view.addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.include){const k=el.dataset.include,ids=state.record[k].map(x=>k==='credentials'?x.id:x.evidenceId),on=new Set(state.include[k]);if(el.checked)on.add(el.value);else on.delete(el.value);state.include[k]=ids.filter(id=>on.has(id));}
 if(el.dataset.rolePick!==undefined){state.role=el.value;render();loadMenu(state.role);}
 if(el.id==='o-photo')readPhoto(el.files?.[0]);
});
view.addEventListener('toggle',event=>{if(event.target.id==='optional-fields')ui.optionalOpen=event.target.open;},true);
view.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 const f=ui.forms[ui.entry],d=button.dataset;
 if(d.persona!==undefined){ui.persona=d.persona;ui.error='';render();return;}
 if(d.chip){f[d.chip]=f[d.chip]===d.value&&d.chip!=='confirm'?'':d.value;if(d.chip==='confirm'&&d.value!=='completion')f.completionId='';sync();render();return;}
 if(d.entry!==undefined){ui.entry=Number(d.entry);ui.screen=0;ui.error='';render();return;}
 const action=d.action;
 if(action==='read-record')await readRecord();
 if(action==='back')go(state.step-1);
 if(action==='to-work'){if(state.offline?!state.role:!state.record||!cfg.roles.some(r=>r.name===state.role)){showError(state.offline?copy.errRoleOffline:copy.errRole,state.offline?'role-offline':'role');return;}go(1);}
 if(action==='to-review'){const bad=checkWork();if(bad){if(bad.entry!=null){ui.entry=bad.entry;ui.screen=bad.screen;}showError(bad.message,bad.id);return;}go(2);}
 if(action==='add-entry'){ui.forms.push(blankForm());ui.entry=ui.forms.length-1;ui.screen=0;sync();render();document.querySelector('#e-title')?.focus();}
 if(action==='remove-entry')confirmAction(copy.removeTitle,copy.removeCopy,copy.removeAction,()=>{ui.forms.splice(ui.entry,1);ui.entry=Math.max(0,ui.entry-1);ui.screen=0;sync();render();});
 if(action==='next-q'||action==='prev-q'){ui.screen=Math.min(SCREENS-1,Math.max(0,ui.screen+(action==='next-q'?1:-1)));render();view.querySelector('.q.current input,.q.current textarea,.q.current button')?.focus();}
 if(action==='remove-photo'){state.optional.photo='';render();}
});
steps.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;go(Number(button.dataset.step));});
document.querySelector('#about-button').onclick=()=>document.querySelector('#about-dialog').showModal();
document.querySelector('#reset-button').onclick=()=>confirmAction(copy.resetTitle,copy.resetCopy,copy.resetAction,()=>{const offline=state.offline;state=C.newCvState();state.offline=offline;ui=freshUi(ui.menus);render();window.scrollTo({top:0,behavior:'instant'});notify(copy.resetDone);});
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();if(cfg)go(0);});
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>{button.closest('dialog').close();pendingAction=null;});
document.querySelector('#confirm-action').onclick=()=>{document.querySelector('#confirm-dialog').close();const action=pendingAction;pendingAction=null;action?.();};
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
start();
})();
