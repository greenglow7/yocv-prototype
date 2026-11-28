/* YoCV prototype: the four CV steps (spec 5), mounted by the Yo-ID shell (yoid.js) into the CV tab. Step 1 shows the
   record the shell read under Confirmed from Yoma, Step 2 holds the work interview and the contact form. The state
   lives in this tab only. The copy, the rules, the roles and the accounts come from the /api/cv/config answer the shell
   hands to mount(); with no server the app runs offline on the browser copies of the catalogue and the rules. */
(()=>{
'use strict';
const C=window.YoCV,E=C.escapeHTML;
const fill=(t,v={})=>String(t??'').replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?'':String(v[k]));
const DOCX_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const KINDS=['none','person','completion','vouch'],SCREENS=7,MAX_ENTRIES=3,PHOTO_TYPES=['image/png','image/jpeg','image/webp'],PHOTO_MAX=2*1024*1024,DEADLINE_MS=30000;
const len=s=>[...String(s??'')].length,ym=v=>{const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);return m?+m[1]*12+(+m[2]-1):null;};
const thisMonth=()=>{const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);};
let cfg=null,copy=window.YoCVCopy.en,rules=window.YoCVRules.RULES;
let state=C.newCvState(),ui=freshUi();
let view=null,api=null; // set by mount(): the CV tab's container and the shell's {copy, cfg, offline, confirm, notify}
function freshUi(menus={}){return {busy:false,error:'',entry:0,screen:0,forms:[],menus,optionalOpen:false,
 reviewed:null,reviewSession:null,reviewAbort:null,retry:false,reviewMenu:[],editing:null,editText:'',editError:'',addSkill:'',profileNote:'',profileRun:0,opps:null};}
const blankForm=()=>({title:'',place:'',what:'',forWhomChip:'',forWhomText:'',frequency:'',start:'',end:'',value:'',unit:'',hedge:'',outcome:'',confirm:'',completionId:''});
// An Entry (plan Shared shapes) from the form: forWhom is the free text when given, else the chip.
const toEntry=f=>({title:f.title.trim(),place:f.place.trim(),what:f.what.trim(),forWhom:f.forWhomText.trim()||f.forWhomChip,frequency:f.frequency,
  months:{start:f.start,end:f.end},number:f.value.trim()===''?null:{value:Number(f.value),unit:f.unit,hedge:f.hedge},outcome:f.outcome.trim(),
  confirm:f.confirm==='completion'?{kind:'completion',completionId:f.completionId}:{kind:f.confirm}});
function sync(){state.entries=ui.forms.map(toEntry);}
const notify=text=>api.notify(text);
const confirmAction=(title,text,label,fn)=>api.confirm(title,text,label,fn);
const errorHTML=()=>ui.error?`<div class="error-message" role="alert" id="step-error" tabindex="-1">${E(ui.error)}</div>`:'';
const opt=()=>` <span class="optional">${E(copy.optionalTag)}</span>`;
/* The step pills above each step title: Step n of 4: name, the current one marked, those past maxStep disabled. */
const stepNames=()=>[copy.stepRecord,copy.stepWork,copy.stepReview,copy.stepCv];
const stepPills=()=>{const names=stepNames();return `<ol class="step-pills" aria-label="Steps">${names.map((name,i)=>`<li><button type="button" class="pill${i===state.step?' current':''}" data-step="${i}" ${i===state.step?'aria-current="step"':''} ${i>state.maxStep?'disabled':''}>${E(fill(copy.stepNav,{n:i+1,total:names.length,name}))}</button></li>`).join('')}</ol>`;};
const head=(n,title,lead)=>stepPills()+`<h2 class="step-title" tabindex="-1">${E(title)}</h2>${lead?`<p class="lead">${E(lead)}</p>`:''}`;
const footer=(back,action,label,disabled)=>`<div class="form-footer">${back?`<button class="back-link" data-action="back">${E(copy.back)}</button>`:'<span></span>'}${action?`<button class="primary" data-action="${action}" ${disabled?'disabled':''}>${E(label)}</button>`:''}</div>`;
/* Step 1: the record the shell read, under Confirmed from Yoma, ticked to include, never edited; then the target role. */
// handoff names the item another prototype handed over (the Skill Credential from SkillLens), as the slides name it.
function tick(kind,id,title,meta,skills,handoff=''){
 const on=state.include[kind].includes(id);
 return `<li><label class="checkbox-label"><input type="checkbox" id="inc-${E(kind)}-${E(id)}" data-include="${E(kind)}" value="${E(id)}" ${on?'checked':''}><span class="choice-text"><strong>${E(title)}</strong>${handoff?` <span class="tag recorded handoff">${E(handoff)}</span>`:''}${meta?`<small>${E(meta)}</small>`:''}${skills.length?`<small>${E(fill(copy.skillsLine,{skills:skills.join(', ')}))}</small>`:''}</span></label></li>`;
}
const tickList=items=>items.length?`<ul class="record-list">${items.join('')}</ul>`:`<p class="field-help">${E(copy.recordEmpty)}</p>`;
function recordHTML(r){
 const credentials=r.wallet==='unavailable'?`<p class="notice">${E(copy.walletUnavailable)}</p>`
  :tickList(r.credentials.map(credential=>tick('credentials',credential.id,credential.title,[fill(copy.issuedBy,{issuer:credential.issuer||copy.issuerNotStated}),credential.month].filter(Boolean).join(', '),credential.skills||[],C.handoffOf(credential,cfg?.journey,copy))));
 return `<section class="form-section" aria-label="${E(copy.labelYoma)}"><p class="field-help">${E(copy.recordTick)}</p>`
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
 const r=state.record;
 if(!r)return head(1,copy.labelYoma)+`<p class="busy-note" role="status">${E(copy.reading)}</p>`;
 return head(1,copy.labelYoma)+recordHTML(r)+roleHTML()+errorHTML()+footer(false,'to-work',copy.continueWork,!state.role);
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
 const d=decisionOf(key),b=(decision,label)=>`<button type="button" class="pill" data-decide="${E(key)}" data-decision="${decision}" aria-pressed="${d===decision}">${E(label)}</button>`;
 return `<div class="claim-actions">${b('accepted',copy.accept)}${edit?`<button type="button" class="pill" data-edit="${E(key)}" aria-pressed="${d==='edited'}">${E(copy.edit)}</button>`:''}${b('left_out',copy.leaveOut)}<span class="tag neutral">${E(copy['decision_'+d])}</span></div>`;
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
// Offline, the notice says what built the lines on the page: this browser, or the server before the connection went.
function reviewStep(){
 const ready=C.readyForCv(state),fromHere=!state.review||state.generation?.mode==='sample-offline';
 return head(3,copy.stepReview,copy.reviewLead)+(state.offline?`<div class="notice">${E(fromHere?copy.reviewOffline:copy.checkOffline)}</div>`:'')
  +(ui.busy&&!state.review?`<p class="notice" role="status">${E(copy.reviewing)}</p>`:state.review?state.review.entries.map(entryReviewHTML).join('')+skillsHTML()+profileHTML():'')
  +errorHTML()+(ui.retry?`<div class="action-row"><button class="secondary" data-action="retry-review">${E(copy.retry)}</button></div>`:'')
  +(ready||!state.review?'':`<p class="field-help">${E(copy.reviewPending)}</p>`)+footer(true,'to-cv',copy.continueCv,!ready||ui.busy);
}
/* Step 4: the paper (heading level 2; the page's one h1 is the shell's greeting), the downloads, and the Yoma learning opportunities for the role. */
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
  +(state.offline?'':`<p class="field-help">${E(copy.downloadDocxHelp)}</p>`)+verifyHTML()+applyHTML()+yoidHTML()+oppsHTML()+footer(true);
}
/* The QR for employers (spec 2026-11-25-yocv-qr-verify-design): made by the server from its own session, hidden offline.
   A QR made before the CV changed is dropped by buildCv, so the button comes back with a note. */
const qrSrc=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
// In UTC, as the employer page prints the same dates (server/cv/verify.js dateOf), so both say the same day.
const longDate=iso=>{const t=Date.parse(iso);return Number.isFinite(t)?new Date(t).toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'}):'';};
function verifyHTML(){
 if(state.offline)return '';
 const v=C.buildCv(state,copy).verify,stale=Boolean(state.verify)&&!v;
 const body=v?`<div class="verify-made"><img class="verify-qr" src="${E(qrSrc(v.qrSvg))}" alt="${E(copy.verifyScan)}" width="180" height="180"><div><p class="verify-code">${E(fill(copy.verifyCode,{code:v.code}))}</p><p class="field-help">${E(fill(copy.verifyUntil,{date:longDate(v.expiresAt)}))}</p><p class="field-help verify-url">${E(v.url)}</p><div class="action-row"><a class="secondary small" id="verify-open" href="${E(v.url)}" target="_blank" rel="noopener noreferrer">${E(copy.verifyOpen)}</a><button class="secondary small" data-action="show-qr">${E(copy.verifyShow)}</button><button class="text-button" data-withdraw="${E(state.verify.checkId)}">${E(copy.verifyWithdraw)}</button></div></div></div>`
  :`${stale?`<p class="notice">${E(copy.verifyStale)}</p>`:''}<div class="action-row"><button class="secondary" data-action="make-qr" ${ui.busy?'disabled':''}>${E(ui.busy?copy.verifyMaking:copy.verifyMake)}</button></div>`;
 return `<section class="claim-card verify print-hide" aria-labelledby="verify-title"><h2 id="verify-title">${E(copy.verifyHeading)}</h2><p class="field-help">${E(copy.verifyLead)}</p>${body}</section>`;
}
/* The close of the journey (spec 2026-11-25-yocv-journey-close-design): apply to the listing with the CV and its check,
   then the mocked Yo-ID list. Neither sends anything: the application is a mock-up and no YoID write happens. */
const isoDay=iso=>longDate(iso)||String(iso??'').slice(0,10);
function applyHTML(){
 const l=cfg?.journey?.listing;if(state.offline||!l)return '';
 const sent=state.application,can=C.canApply(state,copy);
 const body=sent?`<p class="notice" role="status">${E(fill(copy.applySent,{organisation:sent.organisation}))}</p>${leavingHTML()}`
  :`<p class="field-help">${E(can?copy.applySends:copy.applyNeedsQr)}</p><div class="action-row"><button class="primary" data-action="apply" ${can?'':'disabled'}>${E(copy.applyButton)}</button></div>`;
 return `<section class="claim-card apply print-hide" aria-labelledby="apply-title"><h2 id="apply-title" tabindex="-1">${E(fill(copy.applyHeading,{title:l.title}))}</h2><p>${E(fill(copy.applyLead,{organisation:l.organisation,place:l.place,asks:l.asks}))}</p>${l.sample?`<p class="field-help">${E(copy.applySample)}</p>`:''}${body}</section>`;
}
function yoidHTML(){
 const items=C.yoidItems(state,copy,isoDay);if(!items.length)return '';
 const li=i=>`<li>${E(i.text)}${i.button?` <button class="text-button" data-withdraw="${E(i.checkId)}">${E(copy.verifyWithdraw)}</button>`:''}</li>`;
 const p=cfg?.journey?.person,yoid=p&&p.personaId===state.selector?.persona?`<p class="verify-code">${E(fill(copy.yoidId,{id:p.yoid}))}</p>`:'';
 return `<section class="claim-card yoid-record print-hide" aria-labelledby="yoid-record-title"><h2 id="yoid-record-title">${E(copy.yoidHeading)}</h2>${yoid}<p class="field-help">${E(copy.yoidNote)}</p><ul>${items.map(li).join('')}</ul></section>`;
}
/* The connected journey (spec 2026-11-28-yocv-connected-journey-design, journey contract v1). Only when the shell was
   opened with journey=demo, and online: the arriving card at the top of Step 1, the YoID thread above every step, and
   after Apply the leaving card back to the Ziqi listing, in the same tab. The thread's state comes from the phase and
   this page's own Apply; nothing is read from or written to a shared store. */
const journeyOn=()=>Boolean(api?.journey&&cfg?.journey?.connected&&!state.offline);
const TICK='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg> ';
const journeyYoid=()=>api.journey.yoid||cfg.journey.person?.yoid||'';
function journeyCard({id,eyebrow,item,button=''}){
 return `<section class="journey-card print-hide" aria-labelledby="${id}"><p class="journey-eyebrow">${E(eyebrow)}</p><h2 class="journey-title" id="${id}"><strong>${E(item.name)}</strong> <span class="journey-item">${E(item.title)}</span></h2>${button}<p class="journey-recorded">${E(copy.journeyRecorded)}</p></section>`;
}
function arrivingHTML(){
 if(!journeyOn())return '';
 const a=cfg.journey.connected.arriving;
 return journeyCard({id:'journey-arriving-title',eyebrow:fill(copy.journeyFrom,{app:a.from,n:a.phase}),item:a});
}
function leavingHTML(){
 if(!journeyOn()||!state.application)return '';
 const l=cfg.journey.connected.leaving,href=C.journeyBackHref(api.journey,{application:state.application.id,yoid:journeyYoid()});
 const button=href?`<a class="journey-button" id="journey-back" href="${E(href)}">${E(copy.journeyBackButton)}</a>`:'';
 return journeyCard({id:'journey-leaving-title',eyebrow:fill(copy.journeyBack,{app:l.to,n:l.phase}),item:l,button});
}
function threadHTML(){
 if(!journeyOn())return '';
 const c=cfg.journey.connected,label=fill(copy.threadLabel,{yoid:journeyYoid()});
 const words={recorded:copy.threadRecorded,'in-progress':copy.threadInProgress,next:copy.threadNext};
 const li=t=>`<li class="journey-step ${t.state}"><span class="journey-step-name">${E(t.name)}</span><span class="journey-step-state">${t.state==='recorded'?TICK:''}${E(words[t.state])}</span></li>`;
 return `<section class="journey-thread print-hide" aria-label="${E(label)}"><p class="journey-thread-label">${E(label)}</p><ol>${C.journeyThread(c.thread,c.phase,Boolean(state.application)).map(li).join('')}</ol></section>`;
}
/* The person shows the QR on their own phone to an informal employer, who scans it with theirs (spec 2026-11-27-yocv-phone-show-design). */
function showQr(){
 const v=C.buildCv(state,copy).verify,dlg=document.getElementById('show-qr-dialog');if(!v||!dlg)return;
 document.getElementById('show-qr-title').textContent=copy.showTitle;
 document.getElementById('show-qr-body').innerHTML=`<img class="show-qr-img" src="${E(qrSrc(v.qrSvg))}" alt="${E(copy.verifyScan)}"><p class="verify-code show-qr-code">${E(fill(copy.verifyCode,{code:v.code}))}</p><p>${E(copy.showCopy)}</p><p class="fine-print">${E(copy.showWho)}</p><p class="fine-print">${E(fill(copy.verifyUntil,{date:longDate(v.expiresAt)}))}</p>`;
 dlg.showModal();
}
// The withdraw call needs only the check's secret, not the CV session, so it works after the session has ended.
async function withdrawQr(checkId){
 const c=(state.checks||[]).find(x=>x.checkId===checkId);if(!c||ui.busy)return;
 ui.busy=true;rerender();
 const d=deadline();let res;
 try{res=await fetch('/api/cv/verify/'+encodeURIComponent(checkId)+'/withdraw',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({withdrawSecret:c.withdrawSecret}),signal:d.signal});}
 catch(e){ui.busy=false;const err=fetchError(e);if(err.network)goOffline();rerender();notify(err.network?copy.errServer:copy.errWithdraw);return;}
 finally{d.clear();}
 ui.busy=false;
 const data=await res.json().catch(()=>({}));
 if(!res.ok&&data.error?.code!=='withdrawn'){rerender();notify(data.error?.message||copy.errWithdraw);return;}
 state=C.withdrawnCheck(state,checkId,data.withdrawnAt||new Date().toISOString());
 rerender();notify(copy.withdrawDone);
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
 if(!String(state.contact.name??'').trim())return {id:'c-name',message:copy.errName};
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
// Every render tells the shell where the draft stands (the Overview CV card, the hero line and the footer mode label).
function announce(){document.dispatchEvent(new CustomEvent('yocv:draft',{detail:{...draftStatus(),offline:state.offline}}));}
function render(){if(!cfg)return;const f=focusSnapshot();view.innerHTML=(state.step===0?arrivingHTML():'')+threadHTML()+[recordStep,workStep,reviewStep,cvStep][state.step]();view.setAttribute('aria-busy',String(ui.busy));focusRestore(f);announce();}
// A step change writes the hash (#/cv, #/cv/2 to #/cv/4) so Back works; the shell's hashchange then finds the step
// already shown. fromHash is the shell calling back for a hash it read, so nothing is written again.
function go(step,{fromHash=false}={}){
 const first=!view.innerHTML;
 if(step<2)cancelReview();state.step=step;state.maxStep=Math.max(step,state.maxStep);ui.error='';render();
 if(!fromHash){const h=step?'#/cv/'+(step+1):'#/cv';if(location.hash!==h)location.hash=h;}
 if(first)return;
 window.scrollTo({top:0,behavior:'instant'});view.querySelector('h2.step-title')?.focus({preventScroll:true});
}
function showError(message,id){ui.error=message;render();(id&&document.getElementById(id)||document.querySelector('#step-error'))?.focus();}
function rerender(){const y=window.scrollY;render();window.scrollTo({top:y,behavior:'instant'});}
/* Server access. Every request ends after 30 s (as card.js does): a timeout is a retryable error with its own copy,
   and a request the page cancelled (signal) is marked cancelled and shows nothing. */
function deadline(signal){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),DEADLINE_MS);
 if(signal){if(signal.aborted)c.abort();else signal.addEventListener('abort',()=>c.abort(),{once:true});}
 return {signal:c.signal,clear:()=>clearTimeout(t)};
}
function fetchError(e,signal){
 if(signal?.aborted)return Object.assign(new Error(copy.errServer),{cancelled:true});
 if(e&&e.name==='AbortError')return Object.assign(new Error(copy.errTimeout),{timeout:true,retryable:true});
 return Object.assign(new Error(copy.errServer),{network:true});
}
async function post(path,body,{signal}={}){
 const d=deadline(signal);let res;
 try{res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:d.signal});}
 catch(e){throw fetchError(e,signal);}
 finally{d.clear();}
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Object.assign(new Error(data.error?.message||copy.errServer),{code:data.error?.code||'',status:res.status,retryable:!!data.error?.retryable});
 return data;
}
function goOffline(){state.offline=true;announce();}
// A session call. On 410 session_expired: re-open the record with the same selector, keep the entries, the ticks and
// the decisions, and retry once. check and skills read the entries the last review stored, so those are stored again first.
async function cvPost(path,body,opts={}){
 const send=()=>post(path,{...body,sessionId:state.sessionId},opts);
 try{return await send();}
 catch(e){
  if(e.code!=='session_expired')throw e;
  state.sessionId=(await post('/api/cv/record',state.selector||{},opts)).sessionId;
  if(path!=='/api/cv/review'){
   await post('/api/cv/review',C.reviewPayload(state),opts);ui.reviewSession=state.sessionId;
   // The review stores skills without the hand-added ones; put them back so a later call (the QR check) sees them.
   if(path!=='/api/cv/skills'&&state.handAdded.length)await post('/api/cv/skills',{sessionId:state.sessionId,include:state.include,handAdded:state.handAdded},opts);
  }
  return send();
 }
}
// A review in flight is cancelled by a newer review or by leaving Step 2 (Back), so only the review the page shows can
// answer, and only that one writes the server session.
function cancelReview(){const ac=ui.reviewAbort;if(!ac)return;ui.reviewAbort=null;ac.abort();if(ui.busy){ui.busy=false;ui.reviewed=null;}}
const reviewKey=()=>JSON.stringify({...C.reviewPayload(state),sessionId:null});
const reviewFresh=()=>!!state.review&&ui.reviewed===reviewKey()&&ui.reviewSession===state.sessionId;
// A new review replaces the proposals, the skills and every decision.
async function loadReview(){
 const key=reviewKey();
 if(reviewFresh()||ui.busy&&ui.reviewed===key)return;
 cancelReview();
 const ac=new AbortController();
 Object.assign(state,{review:null,skills:[],decisions:{},handAdded:[],profile:null,generation:null,maxStep:2});
 Object.assign(ui,{reviewed:key,reviewSession:state.sessionId,reviewAbort:ac,retry:false,reviewMenu:[],editing:null,editError:'',addSkill:'',profileNote:'',busy:true});
 render();
 let r=null;
 if(!state.offline){
  try{r=await cvPost('/api/cv/review',C.reviewPayload(state),{signal:ac.signal});ui.reviewSession=state.sessionId;ui.reviewMenu=r.menu||[];}
  catch(e){
   if(e.cancelled||ui.reviewed!==key)return;
   if(!e.network){Object.assign(ui,{busy:false,reviewed:null,reviewAbort:null,retry:!!e.retryable});showError(e.message);return;}
   goOffline();
  }
 }
 if(ui.reviewed!==key)return;
 ui.reviewAbort=null;
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
 }catch(e){if(e.network)goOffline();ui.error=e.network?copy.checkOffline:e.message;}
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
// The Word file comes from POST /api/cv/docx, so its button shows only while the server answers. The photo and the
// optional details (date of birth, ID number, state of origin) stay in this browser, as the page promises.
async function downloadDocx(){
 const cv={...C.buildCv(state,copy),optional:{photo:'',dateOfBirth:'',idNumber:'',stateOfOrigin:''}};
 const d=deadline();let res;
 try{res=await fetch('/api/cv/docx',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cv}),signal:d.signal});}
 catch(e){const err=fetchError(e);if(err.network){goOffline();rerender();}notify(err.message);return;}
 finally{d.clear();}
 if(!res.ok){const data=await res.json().catch(()=>({}));notify(data.error?.message||copy.errServer);return;}
 download('YoCV-CV.docx',await res.blob(),DOCX_TYPE);
}
// The server gets the CV without contact or optional details: none of them go on the check. The QR is tied to the CV
// that was sent, so a change made while the request runs leaves it stale. An ended session is re-opened as for every call.
async function makeQr(){
 if(ui.busy)return;
 const cv={...C.buildCv(state,copy),contact:{phone:'',email:'',town:''},optional:{photo:'',dateOfBirth:'',idNumber:'',stateOfOrigin:''},verify:null};
 ui.busy=true;rerender();
 let data;
 try{data=await cvPost('/api/cv/verify',{cv});}
 catch(e){ui.busy=false;if(e.network)goOffline();rerender();notify(e.network?copy.errServer:e.message||copy.errVerify);return;}
 ui.busy=false;
 if(typeof data.url!=='string'){rerender();notify(copy.errVerify);return;}
 state.verify={checkId:data.checkId,code:data.code,url:data.url,qrSvg:data.qrSvg,expiresAt:data.expiresAt,fp:C.cvFingerprint(cv)};
 state.checks=[...(state.checks||[]),{checkId:data.checkId,code:data.code,madeAt:new Date().toISOString(),expiresAt:data.expiresAt,withdrawSecret:String(data.withdrawSecret??'')}];
 rerender();document.querySelector('#verify-open')?.focus();
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
/* The record the shell read (or null on sign out): every item ticked, the contact line prefilled from the Yoma
   profile, the role picked when none is chosen yet: in the connected journey the role the journey's job maps to,
   otherwise the one for the persona's trade. */
function applyRecord(record,selector,sessionId){
 Object.assign(state,{sessionId:sessionId??null,selector:selector??null,record:record??null});
 if(!record){state.include={completions:[],credentials:[],selfAttested:[]};sync();return;}
 const u=record.user||{};
 Object.assign(state,{include:{completions:record.completions.map(c=>c.evidenceId),credentials:record.credentials.map(c=>c.id),selfAttested:record.selfAttested.map(a=>a.evidenceId)},
  contact:{...state.contact,name:u.displayName??'',phone:u.phoneNumber??'',town:u.city??''}});
 for(const f of ui.forms)if(f.confirm==='completion'&&!state.include.completions.includes(f.completionId))f.completionId='';
 const persona=cfg.accounts.personas.find(p=>p.id===selector?.persona),match=cfg.roles.find(r=>r.tradeId&&r.tradeId===persona?.trade);
 if(!state.role)state.role=C.journeyRole(api?.journey,cfg.journey,cfg.roles)||match?.name||'';
 sync();
}
function useRecord(record,selector,sessionId){applyRecord(record,selector,sessionId);ui.error='';render();loadMenu(state.role);}
// Reset: the draft goes, the person stays. The record is applied again so Step 1 shows the ticks and the role.
function clearDraft(){
 cancelReview();
 const {offline,record,selector,sessionId}=state;
 state=C.newCvState();state.offline=offline;ui=freshUi(ui.menus);
 applyRecord(record,selector,sessionId);
 render();
 if(/^#\/cv\//.test(location.hash))history.replaceState(null,'','#/cv');
}
function draftStatus(){
 return {step:state.step,accepted:Object.values(state.decisions).filter(d=>d.decision==='accepted'||d.decision==='edited').length,ready:C.readyForCv(state),
  dirty:state.step>0||state.entries.some(e=>e.title||e.what)};
}
// The shell read step n from the hash: shown when the draft allows it, else Step 1 and the hash corrected.
function showStep(n){
 const target=n<=state.maxStep?n:0;
 if(target!==n)history.replaceState(null,'',target?'#/cv/'+(target+1):'#/cv');
 if(state.step===target&&view.innerHTML)return;
 if(target<2)go(target,{fromHash:true});else enter(target);
}
function readPhoto(file){
 if(!file)return;
 if(!PHOTO_TYPES.includes(file.type)||file.size>PHOTO_MAX){showError(copy.errPhoto,'o-photo');return;}
 const reader=new FileReader();
 reader.onload=()=>{state.optional.photo=String(reader.result);ui.error='';render();};
 reader.readAsDataURL(file);
}
/* mount(container, api): the shell hands over the CV tab's container, the config it fetched (offline: the browser
   copies), and its confirm and notify. Returns showStep for the hash and goOffline for a failed record read. */
function mount(container,shell){
 view=container;api=shell;cfg=shell.cfg;copy=cfg.copy||shell.copy||copy;rules=cfg.rules||rules;state.offline=!!shell.offline;
 bindView();
 return {showStep,goOffline:()=>{goOffline();render();}};
}
function bindView(){
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
 if(d.step!==undefined){enter(Number(d.step));return;}
 if(d.chip){f[d.chip]=f[d.chip]===d.value&&d.chip!=='confirm'?'':d.value;if(d.chip==='confirm'&&d.value!=='completion')f.completionId='';sync();render();return;}
 if(d.entry!==undefined){ui.entry=Number(d.entry);ui.screen=0;ui.error='';render();return;}
 if(d.decide){state=C.decide(state,d.decide,d.decision);if(ui.editing===d.decide)ui.editing=null;rerender();await refreshProfile();rerender();return;}
 if(d.edit){const k=d.edit,x=state.decisions[k];ui.editing=k;ui.editError='';ui.editText=x?.decision==='edited'?x.text:k==='profile'?state.profile.text:proposalOf(k).text;rerender();document.querySelector('#edit-text')?.focus();return;}
 if(d.save){await saveEdit(d.save);return;}
 if(d.withdraw){const id=d.withdraw;confirmAction(copy.withdrawTitle,copy.withdrawCopy,copy.withdrawAction,()=>withdrawQr(id));return;}
 const action=d.action;
 if(action==='back')go(state.step-1);
 if(action==='to-work'){if(state.offline?!state.role:!state.record||!cfg.roles.some(r=>r.name===state.role)){showError(state.offline?copy.errRoleOffline:copy.errRole,state.offline?'role-offline':'role');return;}go(1);}
 if(action==='to-review')await enter(2);
 if(action==='to-cv'&&C.readyForCv(state)){go(3);loadOpportunities();}
 if(action==='retry-review'){ui.retry=false;ui.error='';await loadReview();}
 if(action==='cancel-edit'){ui.editing=null;ui.editError='';rerender();}
 if(action==='add-skill')await addSkill();
 if(action==='print')window.print();
 if(action==='download-docx')await downloadDocx();
 if(action==='make-qr')await makeQr();
 if(action==='show-qr')showQr();
 if(action==='apply'&&C.canApply(state,copy)){state=C.applied(state,cfg.journey,new Date().toISOString());rerender();document.querySelector('#apply-title')?.focus?.();}
 if(action==='download-text')download('YoCV-CV.txt',C.buildCvText(C.buildCv(state,copy),copy),'text/plain;charset=utf-8');
 if(action==='download-record-html')download('YoCV-evidence.html',recordPage(C.buildCvRecord(state,copy)),'text/html;charset=utf-8');
 if(action==='download-record-json')download('YoCV-evidence.json',JSON.stringify(C.buildCvRecord(state,copy),null,2),'application/json');
 if(action==='add-entry'){ui.forms.push(blankForm());ui.entry=ui.forms.length-1;ui.screen=0;sync();render();document.querySelector('#e-title')?.focus();}
 if(action==='remove-entry')confirmAction(copy.removeTitle,copy.removeCopy,copy.removeAction,()=>{ui.forms.splice(ui.entry,1);ui.entry=Math.max(0,ui.entry-1);ui.screen=0;sync();render();});
 if(action==='next-q'||action==='prev-q'){ui.screen=Math.min(SCREENS-1,Math.max(0,ui.screen+(action==='next-q'?1:-1)));render();view.querySelector('.q.current input,.q.current textarea,.q.current button')?.focus();}
 if(action==='remove-photo'){state.optional.photo='';render();}
});
}
window.YoCVApp={mount,useRecord,clearDraft,draftStatus};
})();
