/* YoCV prototype: the four-step shell (spec 5). Step 1 reads the Yoma record, Step 2 holds the work interview and the
   contact form. The state lives in this tab only. The copy, the rules, the roles and the accounts come from
   /api/cv/config; with no server the app starts offline on the browser copies of the catalogue and the rules. */
(()=>{
'use strict';
const C=window.YoCV,E=C.escapeHTML;
const fill=(t,v={})=>String(t??'').replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?'':String(v[k]));
const DOCX_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const KINDS=['none','person','completion','vouch'],SCREENS=7,MAX_ENTRIES=3,PHOTO_TYPES=['image/png','image/jpeg','image/webp'],PHOTO_MAX=2*1024*1024;
const len=s=>[...String(s??'')].length,ym=v=>{const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);return m?+m[1]*12+(+m[2]-1):null;};
const thisMonth=()=>{const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);};
let cfg=null,copy=window.YoCVCopy.en,rules=window.YoCVRules.RULES;
let state=C.newCvState(),ui=freshUi(),pendingAction=null,toastTimer;
const view=document.querySelector('#view'),steps=document.querySelector('#steps'),pill=document.querySelector('#mode-pill');
function freshUi(menus={}){return {persona:'',busy:false,error:'',entry:0,screen:0,forms:[],menus,optionalOpen:false,
 reviewed:null,reviewSession:null,reviewMenu:[],editing:null,editText:'',editError:'',addSkill:'',profileNote:'',profileRun:0,opps:null};}
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
/* Step 3: each proposal beside the person's own words, then the skills, then the profile line. Nothing reaches the CV without an Accept. */
const decisionOf=key=>state.decisions[key]?.decision||'pending';
const bulletKeys=()=>(state.review?.entries||[]).flatMap(d=>d.proposals.map((p,j)=>d.index+':'+j));
const allDecided=()=>bulletKeys().every(k=>decisionOf(k)!=='pending')&&state.skills.every(s=>decisionOf('skill:'+s.name)!=='pending');
const acceptedSkillNames=()=>state.skills.filter(s=>decisionOf('skill:'+s.name)==='accepted').map(s=>s.name);
const marked=(text,h)=>Array.isArray(h)&&h[1]>h[0]?E(text.slice(0,h[0]))+'<mark>'+E(text.slice(h[0],h[1]))+'</mark>'+E(text.slice(h[1])):E(text);
function decisionButtons(key,{edit=true}={}){
 const d=decisionOf(key),b=(decision,label)=>`<button class="${d===decision?'primary':'secondary'} small" data-decide="${E(key)}" data-decision="${decision}" aria-pressed="${d===decision}">${E(label)}</button>`;
 return `<div class="claim-actions">${b('accepted',copy.accept)}${edit?`<button class="${d==='edited'?'primary':'secondary'} small" data-edit="${E(key)}" aria-pressed="${d==='edited'}">${E(copy.edit)}</button>`:''}${b('left_out',copy.leaveOut)}<span class="tag neutral">${E(copy['decision_'+d])}</span></div>`;
}
function editHTML(key){
 return `<div class="edit-area"><label class="field-label" for="edit-text">${E(copy.editLabel)}</label><textarea id="edit-text" class="short" data-edit-text maxlength="400">${E(ui.editText)}</textarea>`
  +(ui.editError?`<div class="error-message" role="alert" id="edit-error" tabindex="-1">${E(ui.editError)}</div>`:'')
  +`<div class="claim-actions"><button class="primary small" data-save="${E(key)}">${E(copy.save)}</button><button class="secondary small" data-action="cancel-edit">${E(copy.cancel)}</button></div></div>`;
}
function proposalHTML(e,d,p,j){
 const key=d.index+':'+j,edited=state.decisions[key]?.decision==='edited'?state.decisions[key].text:null;
 return `<div class="record-row" id="p-${d.index}-${j}"><h3>${E(fill(copy.suggestion,{n:j+1}))}</h3><div class="fields-grid"><div><p class="field-label">${E(copy.yourWords)}</p><p class="source-quote">${E(e.what)}</p></div>`
  +`<div><p class="claim-text">${marked(edited??p.text,edited==null?p.highlight:null)}</p>${p.templateWording?`<span class="tag neutral">${E(copy.templateWording)}</span>`:''}</div></div>`
  +(ui.editing===key?editHTML(key):decisionButtons(key))+'</div>';
}
function entryReviewHTML(d){
 const e=state.entries[d.index];if(!e)return '';
 const refused=d.rejected.length?`<h3>${E(copy.recordRejected)}</h3><ul class="rejected-list">${d.rejected.map(r=>`<li>${E(r.text)} <strong>${E(copy['reason_'+r.reason]||r.reason)}</strong></li>`).join('')}</ul>`:'';
 return `<section class="claim-card" aria-labelledby="entry-${d.index}"><h2 id="entry-${d.index}">${E(e.title)}</h2>${d.proposals.map((p,j)=>proposalHTML(e,d,p,j)).join('')}${d.needsDetail?`<p class="notice">${E(copy.needsDetail)}</p>`:''}${refused}</section>`;
}
function skillsHTML(){
 const have=new Set(state.skills.map(s=>s.name)),menu=ui.reviewMenu.filter(m=>!have.has(m.name));
 const rows=state.skills.map(s=>`<div class="record-row"><p class="claim-kind">${E(s.name)}</p><span class="tag ${{S1:'recorded',S2:'ai'}[s.level]||'stated'}">${E(s.label)}</span>${decisionButtons('skill:'+s.name,{edit:false})}</div>`).join('');
 const add=!state.offline&&menu.length?`<div class="form-section"><label class="field-label" for="add-skill">${E(copy.addSkillLabel)}</label><select id="add-skill" data-add-skill><option value="">${E(copy.addSkillChoose)}</option>${menu.map(m=>`<option value="${E(m.name)}" ${m.name===ui.addSkill?'selected':''}>${E(m.name)}</option>`).join('')}</select><p class="field-help">${E(copy.addSkillHelp)}</p><div class="action-row"><button class="secondary small" data-action="add-skill" ${ui.addSkill&&!ui.busy?'':'disabled'}>${E(copy.addSkill)}</button></div></div>`:'';
 return `<section class="claim-card" aria-labelledby="skills-title"><h2 id="skills-title">${E(copy.cvSkills)}</h2><p class="field-help">${E(state.skills.length?copy.skillsLead:copy.skillsNone)}</p>${rows}${add}</section>`;
}
function profileHTML(){
 const body=state.profile?(ui.editing==='profile'?editHTML('profile'):`<p class="claim-text">${E(state.decisions.profile?.decision==='edited'?state.decisions.profile.text:state.profile.text)}</p>${decisionButtons('profile')}`)
  :`<p class="field-help">${E(ui.profileNote||copy.profileWaiting)}</p>`;
 return `<section class="claim-card" aria-labelledby="profile-title"><h2 id="profile-title">${E(copy.recordProfile)}</h2>${body}</section>`;
}
function reviewStep(){
 const ready=C.readyForCv(state);
 return head(3,copy.stepReview,copy.reviewLead)+(state.offline?`<div class="notice">${E(copy.reviewOffline)}</div>`:'')
  +(ui.busy&&!state.review?`<p class="notice" role="status">${E(copy.reviewing)}</p>`:state.review?state.review.entries.map(entryReviewHTML).join('')+skillsHTML()+profileHTML():'')
  +errorHTML()+(ready||!state.review?'':`<p class="field-help">${E(copy.reviewPending)}</p>`)+footer(true,'to-cv',copy.continueCv,!ready||ui.busy);
}
/* Step 4: the paper (one h1 on the page, in the band), the downloads, and the Yoma learning opportunities for the role. */
const safeUrl=u=>/^https:\/\//i.test(String(u??''))?String(u):'';
function oppsHTML(){
 const o=ui.opps;if(state.offline||!o)return '';
 const tag=o.state==='unavailable'?copy.oppUnreachable:o.source==='cache'?copy.oppCached:copy.oppLive;
 const item=i=>`<li class="opp-item">${safeUrl(i.organizationLogoURL)?`<img class="opp-logo" src="${E(safeUrl(i.organizationLogoURL))}" alt="" loading="lazy" width="32" height="32">`:'<span class="opp-logo placeholder" aria-hidden="true"></span>'}<div class="opp-body"><h3>${E(i.title)}</h3><p class="opp-meta">${E([i.organizationName,i.commitmentIntervalDescription,i.difficulty].filter(Boolean).join(', '))}</p>`
  +(Array.isArray(i.skills)&&i.skills.length?`<div class="opp-skills">${i.skills.slice(0,3).map(s=>safeUrl(s.infoURL)?`<a class="tag recorded" href="${E(safeUrl(s.infoURL))}" target="_blank" rel="noopener noreferrer">${E(s.name)}</a>`:`<span class="tag recorded">${E(s.name)}</span>`).join('')}</div>`:'')
  +(safeUrl(i.yomaInfoURL)?`<a class="opp-link" href="${E(safeUrl(i.yomaInfoURL))}" target="_blank" rel="noopener noreferrer">${E(copy.oppOpen)}</a>`:'')+'</div></li>';
 const body=o.state==='loading'?copy.oppLoading:o.state==='unavailable'?copy.oppUnavailable:o.items.length?'':copy.oppEmpty;
 return `<section class="opportunities print-hide" aria-labelledby="opp-title"><div class="opp-head"><h2 id="opp-title">${E(copy.oppHeading)}</h2>${o.state==='loading'?'':`<span class="tag ${o.state==='ready'?'recorded':'neutral'}">${E(tag)}</span>`}</div><p class="opp-intro">${E(fill(copy.oppIntro,{role:o.role}))}</p>${body?`<p class="opp-note">${E(body)}</p>`:`<ul class="opp-list">${o.items.map(item).join('')}</ul>`}</section>`;
}
function cvStep(){
 if(!C.readyForCv(state))return head(4,copy.stepCv)+`<div class="notice">${E(copy.cvNotReady)}</div>`+footer(true);
 const paper=C.renderCvHtml(C.buildCv(state,copy),copy,{headingLevel:2});
 return head(4,copy.stepCv,copy.cvLead)+paper
  +`<div class="export-actions"><button class="primary" data-action="print">${E(copy.printCv)}</button><button class="secondary" data-action="download-text">${E(copy.downloadText)}</button>${state.offline?'':`<button class="secondary" data-action="download-docx">${E(copy.downloadDocx)}</button>`}<button class="secondary" data-action="download-record-html">${E(copy.downloadRecordHtml)}</button><button class="secondary" data-action="download-record-json">${E(copy.downloadRecordJson)}</button></div>`
  +oppsHTML()+footer(true);
}
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
function rerender(){const y=window.scrollY;render();window.scrollTo({top:y,behavior:'instant'});}
/* Server access */
async function post(path,body){
 let res;
 try{res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}catch{throw Object.assign(new Error(copy.errServer),{network:true});}
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Object.assign(new Error(data.error?.message||copy.errServer),{code:data.error?.code||'',status:res.status});
 return data;
}
function goOffline(){state.offline=true;updatePill();}
// A session call. On 410 session_expired: re-open the record with the same selector, keep the entries, the ticks and
// the decisions, and retry once. check and skills read the entries the last review stored, so those are stored again first.
async function cvPost(path,body){
 const send=()=>post(path,{...body,sessionId:state.sessionId});
 try{return await send();}
 catch(e){
  if(e.code!=='session_expired')throw e;
  state.sessionId=(await post('/api/cv/record',state.selector||{})).sessionId;
  if(path!=='/api/cv/review'){await post('/api/cv/review',C.reviewPayload(state));ui.reviewSession=state.sessionId;}
  return send();
 }
}
const reviewKey=()=>JSON.stringify({...C.reviewPayload(state),sessionId:null});
const reviewFresh=()=>!!state.review&&ui.reviewed===reviewKey()&&ui.reviewSession===state.sessionId;
// A new review replaces the proposals, the skills and every decision.
async function loadReview(){
 const key=reviewKey();
 if(reviewFresh()||ui.busy&&ui.reviewed===key)return;
 Object.assign(state,{review:null,skills:[],decisions:{},handAdded:[],profile:null,generation:null,maxStep:2});
 Object.assign(ui,{reviewed:key,reviewSession:state.sessionId,reviewMenu:[],editing:null,editError:'',addSkill:'',profileNote:'',busy:true});
 render();
 let r=null;
 if(!state.offline){
  try{r=await cvPost('/api/cv/review',C.reviewPayload(state));ui.reviewSession=state.sessionId;ui.reviewMenu=r.menu||[];}
  catch(e){if(!e.network){ui.busy=false;ui.reviewed=null;showError(e.message);return;}goOffline();}
 }
 if(ui.reviewed!==key)return;
 if(!r)r=C.offlineReview(state,rules,new Date().toISOString());
 Object.assign(state,{review:{entries:r.entries},skills:r.skills,generation:r.generation});
 ui.busy=false;render();
}
const fieldsOf=({place,confirm,...fields}={})=>fields;
const words=s=>String(s??'').split(/[\s,]+/).filter(Boolean);
// The entry the profile line names, as profileLine picks it: the first with the most months.
const profileFields=months=>C.profileInput(state).entries.find(e=>C.monthsBetween(e.months.start,e.months.end,new Date().toISOString())===months)||{};
// An edit or the profile line, checked by /api/cv/check online and by the same core check offline. {ok} or {ok:false, message}.
async function checkText(body){
 if(!state.offline){
  try{const r=await cvPost('/api/cv/check',body);return r.ok?{ok:true}:{ok:false,message:r.message};}
  catch(e){if(!e.network)return {ok:false,message:e.message};goOffline();}
 }
 const r=body.kind==='profile'
  ?C.checkCvText(body.text,{fields:profileFields(body.months),role:state.role,kind:'profile',extraNumbers:[body.months],extraNames:['Yoma',...body.skillNames.flatMap(words)]},rules)
  :C.checkCvText(body.text,{fields:fieldsOf(state.entries[body.entryIndex]),role:state.role,kind:'bullet'},rules);
 return r.ok?{ok:true}:{ok:false,message:copy['reason_'+r.reason]||r.reason};
}
// Once every bullet and skill is decided, the profile line from accepted material only, checked before it is shown.
// A change in what was accepted replaces it and clears its decision.
async function refreshProfile(){
 const done=allDecided(),next=done?C.profileLine({...C.profileInput(state),nowIso:new Date().toISOString()}):null;
 if(!next)ui.profileNote=done?copy.profileNone:'';
 if(next?next.text===state.profile?.text&&next.months===state.profile?.months:!state.profile)return;
 const {profile,...rest}=state.decisions,run=++ui.profileRun;
 Object.assign(state,{profile:null,decisions:rest});
 if(ui.editing==='profile')ui.editing=null;
 if(!next)return;
 ui.profileNote='';
 const r=await checkText({kind:'profile',text:next.text,months:next.months,skillNames:acceptedSkillNames()});
 if(run!==ui.profileRun)return;
 if(r.ok)state.profile=next;else ui.profileNote=copy.profileNone;
}
const proposalOf=key=>{const [i,j]=key.split(':').map(Number);return state.review.entries.find(d=>d.index===i).proposals[j];};
// An edit goes on only once the check answers ok. A refusal shows the reason and keeps the edit open.
async function saveEdit(key){
 const text=ui.editText.trim();
 const body=key==='profile'?{kind:'profile',text,months:state.profile.months,skillNames:acceptedSkillNames()}:{kind:'bullet',entryIndex:Number(key.split(':')[0]),text};
 const r=await checkText(body);
 if(r.ok){state=C.decide(state,key,'edited',text);Object.assign(ui,{editing:null,editError:''});if(key!=='profile')await refreshProfile();}
 else ui.editError=r.message;
 rerender();
 (r.ok?view.querySelector(`[data-edit="${CSS.escape(key)}"]`):document.querySelector('#edit-error'))?.focus();
}
async function addSkill(){
 const name=ui.addSkill;if(!name)return;
 ui.busy=true;render();
 try{
  const handAdded=[...state.handAdded,{name}],r=await cvPost('/api/cv/skills',{include:state.include,handAdded});
  Object.assign(state,{handAdded,skills:r.skills});ui.addSkill='';ui.error='';
 }catch(e){if(e.network)goOffline();ui.error=e.network?copy.reviewOffline:e.message;}
 ui.busy=false;await refreshProfile();render();
}
async function loadOpportunities(){
 const role=state.role;
 if(state.offline||!role||ui.opps?.role===role&&ui.opps.state!=='unavailable')return;
 ui.opps={state:'loading',items:[],source:null,role};render();
 let o;
 try{
  const res=await fetch('/api/yoma/opportunities?role='+encodeURIComponent(role),{cache:'no-store'}),data=res.ok?await res.json():{unavailable:true};
  o=data.unavailable?{state:'unavailable',items:[],source:null,role}:{state:data.items.length?'ready':'empty',items:data.items,source:data.source||'live',role};
 }catch{o={state:'unavailable',items:[],source:null,role};}
 if(ui.opps?.role!==role)return;
 ui.opps=o;
 if(state.step===3){const y=window.scrollY;render();window.scrollTo({top:y,behavior:'instant'});}
}
function download(name,content,type){
 const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);notify(copy.downloadDone);
}
// The Word file comes from POST /api/cv/docx, so its button shows only while the server answers. The photo stays here.
async function downloadDocx(){
 const cv=C.buildCv(state,copy);cv.optional.photo='';
 let res;
 try{res=await fetch('/api/cv/docx',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cv})});}
 catch{goOffline();rerender();notify(copy.errServer);return;}
 if(!res.ok){const data=await res.json().catch(()=>({}));notify(data.error?.message||copy.errServer);return;}
 download('YoCV-CV.docx',await res.blob(),DOCX_TYPE);
}
const recordPage=record=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${E(copy.recordTitle)}</title><style>body{font:16px/1.5 Arial,Helvetica,"Liberation Sans",sans-serif;max-width:720px;margin:32px auto;padding:0 16px;color:#020304}.record-row{border-top:1px solid #dce0e5;margin-top:16px;padding-top:8px}p,li,dd{overflow-wrap:anywhere}</style>${C.renderRecordHtml(record,copy)}</html>`;
// Steps 3 and 4 need valid work answers and a fresh review; anything stale goes back through the review.
async function enter(step){
 if(step<2)return go(step);
 const bad=checkWork();
 if(bad){if(state.step!==1)go(1);if(bad.entry!=null){ui.entry=bad.entry;ui.screen=bad.screen;}showError(bad.message,bad.id);return;}
 if(step===3&&reviewFresh()&&C.readyForCv(state)){go(3);loadOpportunities();return;}
 go(2);await loadReview();
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
 }catch(e){if(e.network)goOffline();else ui.error=e.message;}
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
 if(el.dataset.editText!==undefined)ui.editText=el.value;
});
view.addEventListener('change',event=>{
 const el=event.target;
 if(el.dataset.include){const k=el.dataset.include,ids=state.record[k].map(x=>k==='credentials'?x.id:x.evidenceId),on=new Set(state.include[k]);if(el.checked)on.add(el.value);else on.delete(el.value);state.include[k]=ids.filter(id=>on.has(id));}
 if(el.dataset.rolePick!==undefined){state.role=el.value;render();loadMenu(state.role);}
 if(el.id==='o-photo')readPhoto(el.files?.[0]);
 if(el.dataset.addSkill!==undefined){ui.addSkill=el.value;rerender();}
});
view.addEventListener('toggle',event=>{if(event.target.id==='optional-fields')ui.optionalOpen=event.target.open;},true);
view.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 const f=ui.forms[ui.entry],d=button.dataset;
 if(d.persona!==undefined){ui.persona=d.persona;ui.error='';render();return;}
 if(d.chip){f[d.chip]=f[d.chip]===d.value&&d.chip!=='confirm'?'':d.value;if(d.chip==='confirm'&&d.value!=='completion')f.completionId='';sync();render();return;}
 if(d.entry!==undefined){ui.entry=Number(d.entry);ui.screen=0;ui.error='';render();return;}
 if(d.decide){state=C.decide(state,d.decide,d.decision);if(ui.editing===d.decide)ui.editing=null;rerender();await refreshProfile();rerender();return;}
 if(d.edit){const k=d.edit,x=state.decisions[k];ui.editing=k;ui.editError='';ui.editText=x?.decision==='edited'?x.text:k==='profile'?state.profile.text:proposalOf(k).text;rerender();document.querySelector('#edit-text')?.focus();return;}
 if(d.save){await saveEdit(d.save);return;}
 const action=d.action;
 if(action==='read-record')await readRecord();
 if(action==='back')go(state.step-1);
 if(action==='to-work'){if(state.offline?!state.role:!state.record||!cfg.roles.some(r=>r.name===state.role)){showError(state.offline?copy.errRoleOffline:copy.errRole,state.offline?'role-offline':'role');return;}go(1);}
 if(action==='to-review')await enter(2);
 if(action==='to-cv'&&C.readyForCv(state)){go(3);loadOpportunities();}
 if(action==='cancel-edit'){ui.editing=null;ui.editError='';rerender();}
 if(action==='add-skill')await addSkill();
 if(action==='print')window.print();
 if(action==='download-docx')await downloadDocx();
 if(action==='download-text')download('YoCV-CV.txt',C.buildCvText(C.buildCv(state,copy),copy),'text/plain;charset=utf-8');
 if(action==='download-record-html')download('YoCV-evidence.html',recordPage(C.buildCvRecord(state,copy)),'text/html;charset=utf-8');
 if(action==='download-record-json')download('YoCV-evidence.json',JSON.stringify(C.buildCvRecord(state,copy),null,2),'application/json');
 if(action==='add-entry'){ui.forms.push(blankForm());ui.entry=ui.forms.length-1;ui.screen=0;sync();render();document.querySelector('#e-title')?.focus();}
 if(action==='remove-entry')confirmAction(copy.removeTitle,copy.removeCopy,copy.removeAction,()=>{ui.forms.splice(ui.entry,1);ui.entry=Math.max(0,ui.entry-1);ui.screen=0;sync();render();});
 if(action==='next-q'||action==='prev-q'){ui.screen=Math.min(SCREENS-1,Math.max(0,ui.screen+(action==='next-q'?1:-1)));render();view.querySelector('.q.current input,.q.current textarea,.q.current button')?.focus();}
 if(action==='remove-photo'){state.optional.photo='';render();}
});
steps.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;enter(Number(button.dataset.step));});
document.querySelector('#about-button').onclick=()=>document.querySelector('#about-dialog').showModal();
document.querySelector('#reset-button').onclick=()=>confirmAction(copy.resetTitle,copy.resetCopy,copy.resetAction,()=>{const offline=state.offline;state=C.newCvState();state.offline=offline;ui=freshUi(ui.menus);render();window.scrollTo({top:0,behavior:'instant'});notify(copy.resetDone);});
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();if(cfg)go(0);});
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>{button.closest('dialog').close();pendingAction=null;});
document.querySelector('#confirm-action').onclick=()=>{document.querySelector('#confirm-dialog').close();const action=pendingAction;pendingAction=null;action?.();};
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
start();
})();
