/* YoCV prototype. Draft data is session-local; generation runs through the local server when available. */
(()=>{
'use strict';
const C=window.YoCV,E=C.escapeHTML;
const roles=[{name:'Retail assistant',description:'Help customers, organise stock and support a shop.'},{name:'Customer support assistant',description:'Listen to people, answer questions and solve problems.'},{name:'Community outreach assistant',description:'Bring people together and support local activities.'}];
const stepNames=['Choose a role','Your experience','Your evidence','Review your claims','Your CV'];
const sampleStory={context:'Helping at a family shop',experience:'I helped customers find products at my aunt’s shop.\nI packed orders and kept the shelves organised.'};
const EMPTY_CLAIMS_MESSAGE='No grounded suggestions could be made from this text. Add one or two concrete responsibilities, or continue in sample mode.';
/* Server status. Starts offline until /api/status answers. Survives "Reset demo". */
let status={mode:'sample',provider:'browser-local',model:null,offline:true,yoma:null};
const isLive=()=>!status.offline&&status.mode==='live';
const fresh=()=>({step:0,maxStep:0,role:roles[0].name,profile:{name:'',email:'',city:'',phone:''},experience:'',context:'',dates:'',credential:false,document:null,claims:[],stale:false,sample:false,error:'',generationError:null,generation:null,opportunities:{state:'hidden',items:[],source:null,matchedQuery:null,role:null},editing:null,busy:false,busyText:''});
let state=fresh(),pendingAction=null,toastTimer;
const view=document.querySelector('#view'),steps=document.querySelector('#steps'),pill=document.querySelector('#mode-pill');
const badge=(category)=>`<span class="tag ${category==='verified'?'recorded':category==='document'?'awaiting':'stated'}">${E(C.labels[category])}</span>`;
function notify(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function errorHTML(){
 if(!state.error)return '';
 const g=state.generationError;
 const actions=g&&(g.retryable||g.allowSample)?`<div class="error-actions">${g.retryable?'<button class="secondary" data-action="retry-generate">Retry</button>':''}${g.allowSample?'<button class="secondary" data-action="sample-generate">Continue in sample mode</button>':''}</div>`:'';
 return `<div class="error-message" role="alert" id="generation-error" tabindex="-1">${E(state.error)}${actions}</div>`;
}
function focusError(){document.querySelector('#generation-error')?.focus({preventScroll:false});}
function go(step){state.step=step;state.maxStep=Math.max(step,state.maxStep);state.error='';state.generationError=null;state.editing=null;if(step===4)loadOpportunities();render();window.scrollTo({top:0,behavior:'instant'});document.querySelector('#page-band h1')?.focus({preventScroll:true});}
function invalidate(){if(state.claims.length)state.stale=true;}
function confirmAction(title,copy,label,fn){pendingAction=fn;document.querySelector('#confirm-title').textContent=title;document.querySelector('#confirm-copy').textContent=copy;document.querySelector('#confirm-action').textContent=label;document.querySelector('#confirm-dialog').showModal();}
function renderSteps(){steps.innerHTML=stepNames.map((name,i)=>`<button class="step-button ${i===state.step?'active':i<state.step?'completed':''}" data-step="${i}" aria-label="Step ${i+1} of ${stepNames.length}: ${name}" ${i>state.maxStep?'disabled':''} ${i===state.step?'aria-current="step"':''}><span class="step-number">${i+1}</span><span>${name}</span></button>`).join('');}
function stepLine(n){return `<p class="step-line">Step ${n} of 5</p>`;}
/* Mode label: "Live AI · <model>", "Sample mode" or "Sample mode (offline)". */
function modePillText(){return status.offline?'Sample mode (offline)':isLive()?'Live AI · '+(status.model||status.provider):'Sample mode';}
function updatePill(){if(!pill)return;const text=modePillText();pill.className='mode-label '+(status.offline?'offline':isLive()?'live':'sample');pill.textContent=text;}
function generationLabel(){
 const g=state.generation;
 if(!g)return isLive()?'Live AI generation':'Local sample generation';
 if(g.mode==='live')return 'Live AI generation'+(g.model?' ('+g.model+')':'');
 return g.provider==='browser-local'?'Sample generation (offline, in your browser)':'Local sample generation';
}
function generationSummary(){
 const g=state.generation;const rejected=g&&Array.isArray(g.rejected)?g.rejected:[];
 const menuGone=rejected.some(r=>r.reason==='yoma_skill_menu_unavailable');
 const counted=rejected.filter(r=>r.reason!=='yoma_skill_menu_unavailable').length;
 const parts=[];
 if(g&&g.mode==='live')parts.push('Every sentence was checked against your own words. '+(counted?counted+' suggestion'+(counted===1?' was':'s were')+' rejected by the grounding checks and kept in the evidence record.':'No suggestions were rejected.'));
 else parts.push('These are template suggestions, with no live AI call. Check every sentence carefully.');
 if(g&&g.skillMenuSource==='cache')parts.push('Yoma skills came from a cached copy.');
 if(menuGone)parts.push('Yoma skills were unavailable, so no skills were suggested.');
 return parts.join(' ');
}
/* Landing preview: the real CV paper, built from the Amina example through the same local rules as a draft. */
function samplePreviewHTML(){
 let claims;
 try{claims=C.localExperienceClaims({experience:sampleStory.experience,context:sampleStory.context,dates:'School holidays, 2025–2026',role:'Retail assistant'}).concat(C.evidenceClaims({credential:true})).map(c=>C.reviewClaim(c,'accepted'));}
 catch{return '';}
 return `<section class="sample-preview" aria-label="Example of the result"><div class="preview-head"><h3>Example of the result</h3><span class="tag neutral">Sample</span></div><p class="lead">Amina’s sample story, Retail assistant</p>${cvPaperHTML({profile:{name:'Amina Ndlovu',city:'Cape Town, South Africa',email:'',phone:''},role:'Retail assistant',claims,generation:null,id:'sample-cv',label:'Sample CV'})}</section>`;
}
function landing(){return `${stepLine(1)}<h1 tabindex="-1">Build a first CV from work you have <span class="hl">already done</span></h1><p class="lead">Helping at home, in a shop or in your community is a place to start.</p><h2>Which role are you working towards?</h2><div class="choice-list" role="group" aria-label="Choose a target role">${roles.map((r,i)=>{const sel=r.name===state.role;return `<button class="choice ${sel?'selected':''}" data-role="${i}" aria-pressed="${sel}"><span class="radio" aria-hidden="true"></span><span class="choice-text"><strong>${r.name}</strong><small>${r.description}</small></span></button>`;}).join('')}</div><div class="action-row"><button class="primary" data-action="start">Continue to your experience</button><button class="text-button" data-action="sample">Load Amina’s sample story</button></div><p class="field-help">No formal work history needed. You choose what goes in.</p><p class="field-help">Looking for customers rather than a job? <a href="card.html">Make a work card instead</a></p>${samplePreviewHTML()}`;}
function privacyNote(){
 if(state.sample)return 'Amina is a fictional person. All loaded details are synthetic.';
 if(isLive())return 'Your experience text is sent to the AI model through this prototype’s server when you create a draft. Your name and contact details stay in this browser.';
 return 'Your text stays in this browser session. No AI service receives it.';
}
function experience(){return `${stepLine(2)}<h1 tabindex="-1">Describe one thing you did</h1><p class="lead">Think of a time you helped someone, took responsibility or made something happen. Target role: ${E(state.role)}.</p><div class="form-section"><label class="field-label" for="context">Where did this experience happen?</label><input id="context" data-field="context" value="${E(state.context)}" maxlength="120" placeholder="e.g. Helping at a family shop"></div><div class="form-section"><label class="field-label" for="experience">What were your responsibilities?</label><textarea id="experience" data-field="experience" maxlength="4000" placeholder="I helped…\nI was responsible for…\nOne thing I did regularly was…">${E(state.experience)}</textarea><p class="field-help">Use your own words. Include numbers only if you know they’re accurate.${isLive()?'':' Sample mode drafts from your first three sentences.'} <span id="character-count">${state.experience.length}</span>/4,000</p></div><div class="form-section"><label class="field-label" for="dates">When did you do this? <span class="optional">Optional</span></label><input id="dates" data-field="dates" maxlength="100" value="${E(state.dates)}" placeholder="e.g. School holidays, 2025–2026"></div><div class="form-section"><h2>Your details</h2><div class="fields-grid"><div><label class="field-label" for="name">Your name</label><input id="name" data-profile="name" maxlength="100" autocomplete="name" value="${E(state.profile.name)}" placeholder="Your full name"></div><div><label class="field-label" for="city">City <span class="optional">Optional</span></label><input id="city" data-profile="city" maxlength="100" autocomplete="address-level2" value="${E(state.profile.city)}" placeholder="Your city"></div><div><label class="field-label" for="email">Email <span class="optional">Optional</span></label><input id="email" data-profile="email" type="email" maxlength="160" autocomplete="email" value="${E(state.profile.email)}" placeholder="you@example.com"></div><div><label class="field-label" for="phone">Phone <span class="optional">Optional</span></label><input id="phone" data-profile="phone" type="tel" maxlength="50" autocomplete="tel" value="${E(state.profile.phone)}" placeholder="Your phone number"></div></div></div><details class="form-section"><summary>Why this matters</summary><p>Who did you help? What did you do? How did you do it? You do not need impressive titles. Start with real responsibilities.</p></details><div class="notice">${privacyNote()}</div>${errorHTML()}<div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="to-evidence">Continue to evidence</button></div>`;}
function generationNotice(){
 if(status.offline)return 'Sample mode (offline): suggestions use local templates in your browser. Start the YoCV server to use live AI and Yoma data.';
 if(isLive())return `Live AI generation is connected (${E(status.model||status.provider)}). Your experience text is sent to the model through this prototype’s server; your name and contact details are not. Every suggestion is checked against your own words before you see it.`;
 return 'Sample generation uses local templates and the facts you supply. No live AI call is connected. Skills are still matched against Yoma’s skill taxonomy.';
}
function credentialCard(){
 const c=C.credential;
 const detail=c.sample?'A representative sample credential based on Yoma’s wallet credential model. It shows how an issuer-recorded achievement could enter your CV. It was not issued by Yoma and does not prove workplace proficiency.':'A synthetic Yoma-style credential for course completion. It demonstrates how an issued achievement could enter your CV. It does not prove workplace proficiency.';
 return `<li class="evidence-item"><div class="row-head"><h3>${E(c.title)}</h3>${badge('verified')}</div><p class="field-help">${E(c.sourceLabel||c.issuer)}${c.dates?' · '+E(c.dates):''}</p><p>${detail}</p><label class="checkbox-label"><input id="credential" type="checkbox" ${state.credential?'checked':''}> Include this ${c.sample?'sample':'synthetic'} achievement</label></li>`;
}
function evidence(){return `${stepLine(3)}<h1 tabindex="-1">Add supporting evidence</h1><p class="lead">Optional. You can build the CV from your own description alone.</p><ul class="evidence-list"><li class="evidence-item"><div class="row-head"><h3>Your own experience</h3><span class="tag stated">Self-reported</span></div><p class="field-help">${E(state.context||'The responsibilities you described')}</p><blockquote class="source-quote">${E(state.experience)}</blockquote></li>${credentialCard()}<li class="evidence-item"><div class="row-head"><h3>A supporting document</h3>${badge('document')}</div><p class="field-help">A letter, certificate or reference you want to mention.</p><label class="drop-zone" for="file"><span class="file-field"><strong id="file-label">${E(state.document?.name||'Choose a file on your device')}</strong><small>PDF, JPG or PNG, up to 5 MB. No upload or document reading.</small><input id="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></span></label><div class="action-row"><button class="text-button" data-action="sample-document">Use a synthetic reference letter</button>${state.document?'<button class="text-button" data-action="remove-document">Remove document</button>':''}</div>${state.document?`<div class="form-section"><label class="field-label" for="document-statement">What claim would this document support?</label><textarea class="edit-area" id="document-statement" maxlength="2000" placeholder="Describe the claim in your own words. This prototype does not read your file.">${E(state.document.statement||'')}</textarea><p class="field-help">This statement is yours. The document stays unverified.</p></div>`:''}</li></ul><div class="notice">${generationNotice()}</div>${errorHTML()}<div class="busy-note" id="busy-status" aria-live="polite">${state.busy?E(state.busyText):''}</div><div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="primary" data-action="generate" ${state.busy?'disabled':''}>${state.busy?E(state.busyText):'Write the draft'}</button></div>`;}
function kindLabel(c,i){const base=c.kind==='skill'?'Suggested skill':c.kind==='learning'?'Learning':'Experience';return `${base} ${i+1}`;}
function generatedTag(c){return c.generated==='model'?'<span class="tag ai">AI-suggested</span>':c.generated==='local'?'<span class="tag neutral">Template suggestion</span>':'';}
function sourceQuoteHTML(c){
 const label=`<strong>${E(c.sourceLabel)}${c.edited?' (original source retained)':''}</strong>`;
 if(c.sourceQuote)return `<blockquote class="source-quote">${label}Based on: “${E(C.shortQuote(c.sourceQuote))}”</blockquote>`;
 return `<blockquote class="source-quote">${label}“${E(c.sourceText)}”</blockquote>`;
}
function yomaTag(c){return c.yomaSkill?`<a class="yoma-tag" href="${E(c.yomaSkill.infoURL)}" target="_blank" rel="noopener noreferrer">Yoma skill: ${E(c.yomaSkill.name)}</a>`:'';}
function decisionTag(c){return c.decision==='accepted'?`<span class="tag recorded">${c.edited?'Edited and accepted':'Accepted'}</span>`:'<span class="tag neutral">Not on your CV</span>';}
function claimHTML(c,i){return `<article class="claim-card ${c.decision}" id="claim-${E(c.id)}"><div class="claim-top"><span class="claim-kind">${E(kindLabel(c,i))}</span><span class="claim-tags">${badge(c.category)}${generatedTag(c)}</span></div>${state.editing===c.id?`<label class="field-label" for="edit-${E(c.id)}">Make this sound like you</label><textarea class="edit-area" id="edit-${E(c.id)}" maxlength="1500">${E(c.text)}</textarea><p class="claim-reason">Edited wording is marked self-reported. The original source stays in the evidence record.</p>`:`<p class="claim-text">${E(c.text)}</p>`}${c.yomaSkill?`<p class="claim-reason">Matches the Yoma skill taxonomy entry <a class="yoma-tag" href="${E(c.yomaSkill.infoURL)}" target="_blank" rel="noopener noreferrer">${E(c.yomaSkill.name)}</a>.</p>`:``}${sourceQuoteHTML(c)}<p class="claim-reason">${E(c.reason)}</p><div class="claim-actions">${state.editing===c.id?`<button class="primary small" data-claim="${E(c.id)}" data-decision="save">Save and accept</button><button class="secondary small" data-claim="${E(c.id)}" data-decision="cancel">Cancel</button>`:c.decision==='pending'?`<button class="primary small" data-claim="${E(c.id)}" data-decision="accepted">Accept</button><button class="secondary small" data-claim="${E(c.id)}" data-decision="edit">Edit</button><button class="text-button" data-claim="${E(c.id)}" data-decision="rejected">Leave out</button>`:`${decisionTag(c)}<button class="text-button" data-claim="${E(c.id)}" data-decision="pending">Review again</button>`}</div></article>`;}
function review(){const reviewed=state.claims.filter(c=>c.decision!=='pending').length,yes=state.claims.filter(c=>c.decision==='accepted').length;return `${stepLine(4)}<div class="review-heading"><div><h1 tabindex="-1">Check each sentence before it goes on your CV</h1><p class="lead">Keep what is accurate, change the wording or leave it out. Your approval confirms the wording, not its verification.</p></div><span class="review-count">${reviewed} of ${state.claims.length} reviewed</span></div><div class="review-progress" role="progressbar" aria-label="Review progress" aria-valuemin="0" aria-valuemax="${state.claims.length}" aria-valuenow="${reviewed}"><div style="width:${state.claims.length?reviewed/state.claims.length*100:0}%"></div></div>${state.stale?'<div class="error-message" role="alert">Your role or source text changed. Create a fresh draft before reviewing or exporting. <button class="text-button" data-action="back-to-evidence">Go to evidence</button></div>':''}${errorHTML()}<section aria-label="Claims to review">${state.claims.map(claimHTML).join('')}</section><p class="notice">${E(generationLabel())}. ${E(generationSummary())}</p><div class="form-footer"><button class="back-link" data-action="back">Back</button><p class="review-instruction">${reviewed<state.claims.length?'Review each claim to unlock your CV.':!yes?'You left out every claim. Review again or add another experience.':'Your reviewed claims are ready for a final look.'}</p><button class="primary" data-action="preview" ${!C.canExport(state.claims)||state.stale?'disabled':''}>Preview the CV</button></div>`;}
function cvFootnote(generation){const live=generation&&generation.mode==='live';return `Supporting sources and evidence categories are available in the separate evidence record.<br>YoCV prototype · ${live?'Live AI generation':'Sample generation'} · Demonstration record`;}
function cvPaperHTML({profile,role,claims,generation,id='cv-paper',label='Approved CV'}){const experience=claims.filter(c=>c.kind==='experience'),skills=claims.filter(c=>c.kind==='skill'),learning=claims.filter(c=>c.kind==='learning');return `<article class="cv-paper" id="${E(id)}" aria-label="${E(label)}"><h2 class="cv-name">${E(profile.name||'Your name')}</h2><p class="cv-role">${E(role)}</p><p class="cv-contact">${[profile.city,profile.email,profile.phone].filter(Boolean).map(E).join(' · ')}</p>${experience.length?'<h3 class="cv-section-title">Experience</h3>'+experience.map(c=>`<div class="cv-entry">${c.context?`<p class="cv-context">${E(c.context)}</p>`:''}${c.dates?`<p class="cv-dates">${E(c.dates)}</p>`:''}<p class="cv-bullet">${E(c.text)}</p></div>`).join(''):''}${skills.length?'<h3 class="cv-section-title">Skills</h3>'+skills.map(c=>`<span class="cv-skill">${E(c.text)}${c.yomaSkill&&c.yomaSkill.name!==c.text?` <small>(Yoma skill: ${E(c.yomaSkill.name)})</small>`:''}</span>`).join(''):''}${learning.length?'<h3 class="cv-section-title">Learning and achievements</h3>'+learning.map(c=>`<div class="cv-entry"><p class="cv-bullet">${E(c.text)}</p>${c.dates?`<p class="cv-dates">${E(c.dates)}</p>`:''}</div>`).join(''):''}<p class="cv-footnote">${cvFootnote(generation)}</p></article>`;}
function cvHTML(){return cvPaperHTML({profile:state.profile,role:state.role,claims:state.claims.filter(c=>c.decision==='accepted'),generation:state.generation});}
function rejectedHTML(){
 const g=state.generation;const list=g&&Array.isArray(g.rejected)?g.rejected.filter(r=>r.reason!=='yoma_skill_menu_unavailable'):[];
 if(!list.length)return '';
 return `<div class="record-row rejected-row"><span class="tag awaiting">Rejected before review</span><p>${list.length} suggestion${list.length===1?'':'s'} failed the grounding checks and never reached you:</p><ul class="rejected-list">${list.map(r=>`<li><strong>${E(r.reason)}</strong>${r.text?': “'+E(C.shortQuote(r.text,160))+'”':''}</li>`).join('')}</ul></div>`;
}
function evidenceHTML(){const record=C.buildEvidence(state.profile,state.role,state.claims,state.generation);return `<details class="evidence-record"><summary>View the demonstration evidence record (${state.claims.length} reviewed claims)</summary><p>This record distinguishes source evidence from your review of the wording. The credential in this demo is a representative sample, not an issued Yoma credential.</p><p><strong>Generation:</strong> ${E(record.generationMode)}</p>${rejectedHTML()}${state.claims.map(c=>`<div class="record-row">${badge(c.category)} <span class="tag neutral">${c.decision==='accepted'?'Included in CV':'Excluded from CV'}</span>${c.yomaSkill?' '+yomaTag(c):''}<p><strong>${E(c.text)}</strong></p><p>Source: ${E(c.sourceLabel)}<br>${c.sourceQuote?'Supporting quote: “'+E(c.sourceQuote)+'”<br>':''}Original statement: ${E(c.sourceText)}${c.sourceDates?"<br>Related source date: "+E(c.sourceDates):""}<br>Review: ${E(c.decision)}${c.edited?' · Wording edited; original evidence category: '+E(C.labels[c.originalCategory]):''}</p></div>`).join('')}</details>`;}
function opportunitiesHTML(){
 const o=state.opportunities;if(o.state==='hidden')return '';
 const tagText=o.state==='unavailable'?'Yoma unreachable':o.state==='loading'?'Yoma':o.source==='cache'?'From Yoma (cached)':'Live from Yoma';
 let body='';
 if(o.state==='loading')body='<p class="opp-note">Looking for learning opportunities on Yoma…</p>';
 else if(o.state==='unavailable')body='<p class="opp-note">Yoma opportunities unavailable right now.</p>';
 else if(o.state==='empty')body='<p class="opp-note">No Yoma learning opportunities matched this role yet.</p>';
 else body=`<ul class="opp-list">${o.items.map(i=>`<li class="opp-item">${i.organizationLogoURL?`<img class="opp-logo" src="${E(i.organizationLogoURL)}" alt="" loading="lazy" width="32" height="32">`:'<span class="opp-logo placeholder" aria-hidden="true"></span>'}<div class="opp-body"><h4>${E(i.title)}</h4><p class="opp-meta">${E(i.organizationName)}${i.commitmentIntervalDescription?', '+E(i.commitmentIntervalDescription):''}${i.difficulty?', '+E(i.difficulty):''}</p>${Array.isArray(i.skills)&&i.skills.length?`<div class="opp-skills">${i.skills.slice(0,3).map(s=>`<a class="tag recorded" href="${E(s.infoURL)}" target="_blank" rel="noopener noreferrer">${E(s.name)}</a>`).join('')}</div>`:''}<a class="opp-link" href="${E(i.yomaInfoURL)}" target="_blank" rel="noopener noreferrer">Open on Yoma (yoma.world)</a></div></li>`).join('')}</ul>`;
 return `<section class="opportunities print-hide" aria-labelledby="opp-title"><div class="opp-head"><h3 id="opp-title">Learning opportunities on Yoma for this role</h3><span class="tag ${o.state==='ready'?'recorded':'neutral'}">${E(tagText)}</span></div><p class="opp-intro">Completing a verified learning opportunity on Yoma adds an issuer-recorded achievement to a Yo-ID. These matches come from a keyword search of Yoma’s public opportunity list for “${E(state.role)}”, not from your profile.</p>${body}</section>`;
}
function preview(){return `${stepLine(5)}<h1 tabindex="-1">Your CV is ready to save</h1><p class="lead">${state.claims.filter(c=>c.decision==='accepted').length} accepted claims. Sources are kept in a separate evidence record.</p>${cvHTML()}<div class="export-actions"><button class="primary" data-action="print">Print or save as PDF</button><button class="secondary" data-action="download-cv">Download text CV</button><button class="secondary" data-action="download-evidence">Download evidence record</button><button class="text-button" data-action="download-json">Download evidence as JSON</button></div><p class="notice">User-approved wording and issuer verification are different. The sample credential demonstrates course completion only.</p>${opportunitiesHTML()}${evidenceHTML()}<div class="form-footer"><button class="back-link" data-action="back">Back</button><button class="text-button" data-action="about">How this could fit into Yoma</button></div>`;}
/* Focus preservation across innerHTML replacement. */
function focusSnapshot(){try{const a=document.activeElement;if(!a||!view.contains(a))return null;const key=a.tagName==='BUTTON'?['role','example','persona','trade','action'].find(k=>a.dataset[k]!==undefined):undefined;if(!a.id&&!key)return null;const sel=typeof a.selectionStart==='number'&&typeof a.selectionEnd==='number'?[a.selectionStart,a.selectionEnd]:null;return {id:a.id,key,val:key?a.dataset[key]:null,sel};}catch{return null;}}
function focusRestore(f){if(!f)return;try{const esc=v=>window.CSS&&CSS.escape?CSS.escape(v):String(v).replace(/["\\]/g,'\\$&');const el=f.id?document.getElementById(f.id):view.querySelector(`button[data-${f.key}="${esc(f.val)}"]`);if(!el||el.disabled)return;el.focus({preventScroll:true});if(f.sel&&typeof el.setSelectionRange==='function')el.setSelectionRange(f.sel[0],f.sel[1]);}catch{}}
function setBand(){const band=document.querySelector('#page-band');if(!band)return;band.innerHTML='';const line=view.querySelector('.step-line'),h=view.querySelector('h1');if(line)band.appendChild(line);if(h)band.appendChild(h);}
function render(){const f=focusSnapshot();renderSteps();view.innerHTML=[landing,experience,evidence,review,preview][state.step]();setBand();view.setAttribute('aria-busy',String(state.busy));focusRestore(f);}
function sample(){const keep=state.opportunities;state=fresh();state.opportunities=keep;state.sample=true;state.profile={name:'Amina Ndlovu',email:'amina@example.com',city:'Cape Town, South Africa',phone:''};Object.assign(state,sampleStory);state.dates='School holidays, 2025–2026';state.credential=true;state.document={name:'community-reference-demo.pdf',statement:'Helped prepare materials for a community clean-up.'};render();notify('Amina’s sample story is loaded. Choose a role, then continue.');}
function download(name,content,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);notify('Download prepared. Check your browser’s downloads.');}
function guardExport(){if(state.stale||!C.canExport(state.claims)){notify('Review the current draft before exporting.');return false;}return true;}
/* Server access */
async function loadStatus(){
 try{
  const res=await fetch('/api/status',{cache:'no-store'});
  if(!res.ok)throw new Error('status '+res.status);
  const data=await res.json();
  status={mode:data.mode==='live'?'live':'sample',provider:data.provider||'local',model:data.model||null,offline:false,yoma:data.yoma||null};
 }catch{status={mode:'sample',provider:'browser-local',model:null,offline:true,yoma:null};}
 updatePill();render();
}
async function loadCredential(){
 try{const res=await fetch('data/sample-credential.json',{cache:'no-store'});if(!res.ok)return;const fixture=await res.json();C.setCredential(fixture);if(state.step===2)render();}
 catch{/* file:// or missing fixture: keep the built-in credential */}
}
function goOffline(){status={mode:'sample',provider:'browser-local',model:null,offline:true,yoma:null};updatePill();}
function withDeadline(ms){const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);return {signal:c.signal,clear:()=>clearTimeout(t)};}
async function requestClaims(mode){
 if(status.offline){
  await new Promise(resolve=>setTimeout(resolve,450));
  const claims=C.localExperienceClaims(state);
  return {claims,generation:{mode:'sample',provider:'browser-local',model:null,generatedAt:new Date().toISOString(),skillMenuSize:0,skillMenuSource:'none',rejected:[]}};
 }
 const body={role:state.role,experience:state.experience,context:state.context,dates:state.dates};
 if(mode)body.mode=mode;
 let res;const d=withDeadline(30000);
 try{res=await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:d.signal});}
 catch(e){
  if(e&&e.name==='AbortError'){const err=new Error('The server did not answer in time. You can retry.');err.generationError={code:'provider_timeout',retryable:true,allowSample:mode!=='sample'};throw err;}
  goOffline();notify('The YoCV server could not be reached. Continuing in your browser.');return requestClaims('sample');
 }finally{d.clear();}
 const data=await res.json().catch(()=>({}));
 if(res.ok)return data;
 const err=new Error(data.error?.message||'The AI service could not be reached. You can retry or continue in sample mode.');
 const code=data.error?.code||'provider_error';
 err.generationError={code,retryable:!!data.error?.retryable,allowSample:code!=='invalid_input'&&mode!=='sample'};
 if(res.status===400)err.generationError.allowSample=false;
 throw err;
}
async function generate(mode){
 if(state.busy)return;
 if(state.document&&!state.document.statement?.trim()){state.error='Describe the claim this document would support, or remove the document to continue.';state.generationError=null;render();return;}
 const perform=async()=>{
  state.error='';state.generationError=null;state.busy=true;state.busyText=(mode!=='sample'&&isLive())?'Asking the AI…':'Preparing your draft…';render();
  try{
   const result=await requestClaims(mode);
   state.busy=false;
   const generated=Array.isArray(result.claims)?result.claims:[];
   state.generation=result.generation||null;
   if(!generated.length){state.claims=[];state.maxStep=Math.min(state.maxStep,2);state.error=EMPTY_CLAIMS_MESSAGE;state.generationError={code:'no_claims',retryable:false,allowSample:(state.generation?.mode)!=='sample'};render();focusError();return;}
   state.claims=generated.concat(C.evidenceClaims(state));state.stale=false;go(3);
  }catch(error){state.busy=false;state.error=error.message;state.generationError=error.generationError||null;render();focusError();}
 };
 if(state.claims.length&&!mode)confirmAction('Create a fresh draft?','This replaces your current suggestions and clears their individual review decisions. Your original experience stays in the form.','Create fresh draft',perform);else await perform();
}
async function loadOpportunities(){
 if(status.offline){state.opportunities={state:'hidden',items:[],source:null,matchedQuery:null,role:null};return;}
 const o=state.opportunities;
 if(o.role===state.role&&(o.state==='ready'||o.state==='empty'||o.state==='loading'))return;
 state.opportunities={state:'loading',items:[],source:null,matchedQuery:null,role:state.role};
 const role=state.role;
 try{
  const res=await fetch('/api/yoma/opportunities?role='+encodeURIComponent(role),{cache:'no-store'});
  const data=res.ok?await res.json():{unavailable:true,items:[]};
  if(state.opportunities.role!==role)return;
  state.opportunities=data.unavailable?{state:'unavailable',items:[],source:null,matchedQuery:null,role}:{state:data.items.length?'ready':'empty',items:data.items,source:data.source||'live',matchedQuery:data.matchedQuery||null,role};
 }catch{if(state.opportunities.role===role)state.opportunities={state:'unavailable',items:[],source:null,matchedQuery:null,role};}
 if(state.step===4){const scroll=window.scrollY;render();window.scrollTo({top:scroll,behavior:'instant'});}
}
view.addEventListener('input',event=>{const el=event.target;if(el.dataset.field){state[el.dataset.field]=el.value;invalidate();if(el.id==='experience')document.querySelector('#character-count').textContent=el.value.length;}if(el.dataset.profile)state.profile[el.dataset.profile]=el.value;if(el.id==='document-statement'){state.document.statement=el.value;invalidate();}});
view.addEventListener('change',event=>{const el=event.target;if(el.id==='credential'){state.credential=el.checked;invalidate();}if(el.id==='file'){
 const file=el.files?.[0];if(!file)return;const supported=/\.(pdf|jpe?g|png)$/i.test(file.name)&&['','application/pdf','image/jpeg','image/png'].includes(file.type);
 if(!supported||file.size>5*1024*1024){state.error=supported?'Choose a file smaller than 5 MB.':'Choose a PDF, JPG or PNG file.';state.generationError=null;render();return;}
 state.document={name:file.name,statement:''};invalidate();state.error='';render();notify('File name added. The file was not uploaded or read.');
}});
view.addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button||button.disabled)return;
 if(button.dataset.role!==undefined){const role=roles[Number(button.dataset.role)].name;if(role!==state.role){const change=()=>{state.role=role;invalidate();render();};if(state.claims.length)confirmAction('Change your target role?','Your previous claim approvals won’t apply to a new role. Create a fresh draft before exporting.','Change role',change);else change();}return;}
 if(button.dataset.claim){const id=button.dataset.claim,index=state.claims.findIndex(c=>c.id===id),decision=button.dataset.decision;if(state.stale){notify('Create a fresh draft from your updated sources first.');return;}if(decision==='edit')state.editing=id;else if(decision==='cancel')state.editing=null;else{try{state.claims[index]=C.reviewClaim(state.claims[index],decision==='save'?'accepted':decision,decision==='save'?document.querySelector('#edit-'+id).value:undefined);state.editing=null;}catch(error){notify(error.message);return;}}const scroll=window.scrollY;render();window.scrollTo({top:scroll,behavior:'instant'});document.querySelector('#claim-'+id+' button')?.focus({preventScroll:true});return;}
 const action=button.dataset.action;
 if(action==='sample'){if(state.experience&&!state.sample)confirmAction('Load Amina’s sample story?','This replaces your current draft with synthetic sample data.','Load sample',sample);else sample();}
 if(action==='start')go(1);
 if(action==='back')go(state.step-1);
 if(action==='back-to-evidence')go(2);
 if(action==='to-evidence'){
  try{C.localExperienceClaims({...state});const email=document.querySelector('#email');if(!email.checkValidity()){email.reportValidity();return;}go(2);}catch(error){state.error=error.message;state.generationError=null;render();document.querySelector('#experience').focus();}
 }
 if(action==='sample-document'){state.document={name:'community-reference-demo.pdf',statement:'Helped prepare materials for a community clean-up.'};invalidate();render();notify('Synthetic reference added. It remains unverified.');}
 if(action==='remove-document'){state.document=null;invalidate();render();}
 if(action==='generate')await generate();
 if(action==='retry-generate')await generate();
 if(action==='sample-generate')await generate('sample');
 if(action==='preview'&&guardExport())go(4);
 if(action==='print'&&guardExport())window.print();
 if(action==='download-cv'&&guardExport())download('YoCV-CV.txt',C.buildTextCV(state.profile,state.role,state.claims,state.generation),'text/plain;charset=utf-8');
 if(action==='download-json'&&guardExport())download('YoCV-evidence.json',JSON.stringify(C.buildEvidence(state.profile,state.role,state.claims,state.generation),null,2),'application/json');
 if(action==='download-evidence'&&guardExport()){
  const evidence=C.buildEvidence(state.profile,state.role,state.claims,state.generation);
  const rejected=evidence.generation&&Array.isArray(evidence.generation.rejected)?evidence.generation.rejected.filter(r=>r.reason!=='yoma_skill_menu_unavailable'):[];
  download('YoCV-evidence.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YoCV evidence record</title><style>body{font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;max-width:680px;margin:32px auto;padding:16px;color:#1f1a22}h1{font-size:24px}article{border:1px solid #d9d5dc;padding:16px;margin:16px 0;border-radius:4px}p{overflow-wrap:anywhere}small{color:#5d5566}a{color:#41204b}</style><h1>YoCV demonstration evidence record</h1><p>${E(evidence.name)} · ${E(evidence.role)}</p><p>${E(evidence.notice)}</p><p><small>Generation: ${E(evidence.generationMode)}</small></p>${rejected.length?`<article><strong>Suggestions rejected before review</strong><ul>${rejected.map(r=>`<li>${E(r.reason)}${r.text?': “'+E(r.text)+'”':''}</li>`).join('')}</ul></article>`:''}${evidence.claims.map(c=>`<article><strong>${E(c.text)}</strong><p>Evidence category: ${E(c.evidenceLabel)}<br>Decision: ${E(c.decision)} · ${c.includedInCV?'Included in CV':'Excluded from CV'}</p><p>Source: ${E(c.sourceLabel)}<br>${c.sourceQuote?'Supporting quote: “'+E(c.sourceQuote)+'”<br>':''}Original statement: ${E(c.sourceText)}<br>Original proposed wording: ${E(c.originalText)}${c.yomaSkill?'<br>Yoma skill: '+E(c.yomaSkill.name)+' ('+E(c.yomaSkill.infoURL)+')':''}${c.sourceDates?"<br>Related source date: "+E(c.sourceDates):""}${c.edited?'<br>Edited wording is self-reported. Original category: '+E(C.labels[c.originalCategory]):''}</p></article>`).join('')}<small>Demonstration record. No independent document or cryptographic verification.</small></html>`,'text/html;charset=utf-8');
 }
 if(action==='about')document.querySelector('#about-dialog').showModal();
});
steps.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;const step=Number(button.dataset.step);if(step===4&&!guardExport())return;go(step);});
document.querySelector('#about-button').onclick=()=>document.querySelector('#about-dialog').showModal();
document.querySelector('#reset-button').onclick=()=>confirmAction('Reset this demo?','This clears the profile, experience and review decisions in this browser session. Download anything you want to keep first.','Reset demo',()=>{state=fresh();render();window.scrollTo({top:0,behavior:'instant'});notify('Demo reset. Your session draft has been cleared.');});
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();go(0);});
document.querySelectorAll('.close-dialog').forEach(button=>button.onclick=()=>{button.closest('dialog').close();pendingAction=null;});
document.querySelector('#confirm-action').onclick=()=>{document.querySelector('#confirm-dialog').close();const action=pendingAction;pendingAction=null;action?.();};
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
updatePill();
render();
loadStatus();
loadCredential();
})();
