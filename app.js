/* YoCV prototype. Draft data is session-local; generation runs through the local server when available. */
(()=>{
'use strict';
const C=window.YoCV,E=C.escapeHTML;
const icons={arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',bag:'<path d="M4 7h16l-1 14H5L4 7Zm4 0V5a4 4 0 0 1 8 0v2"/>',chat:'<path d="M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 19 0Z"/><path d="M7 10h9M7 14h6"/>',people:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 3 5v2"/>',check:'<path d="m5 12 4 4L19 6"/>',shield:'<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 11 3 3 5-6"/>',document:'<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h6"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4"/>',upload:'<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',heart:'<path d="M20.5 4.5a5 5 0 0 0-7 0L12 6l-1.5-1.5a5 5 0 0 0-7 7L12 20l8.5-8.5a5 5 0 0 0 0-7Z"/>',lock:'<path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4"/>'};
const svg=(name)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||icons.document}</svg>`;
const roles=[{name:'Retail assistant',icon:'bag',description:'Help customers, organise stock and support a shop.'},{name:'Customer support assistant',icon:'chat',description:'Listen to people, answer questions and solve problems.'},{name:'Community outreach assistant',icon:'people',description:'Bring people together and support local activities.'}];
const stepNames=['Choose a role','Your experience','Your evidence','Review your claims','Your CV'];
const examples={shop:{context:'Helping at a family shop',experience:'I helped customers find products at my aunt’s shop.\nI packed orders and kept the shelves organised.'},care:{context:'Family caregiving',experience:'I looked after my younger siblings after school.\nI planned their meals and helped them with homework.'},community:{context:'Community volunteering',experience:'I volunteered at a community garden.\nI helped the team prepare planting areas and welcomed new volunteers.'}};
const EMPTY_CLAIMS_MESSAGE='No grounded suggestions could be made from this text. Add one or two concrete responsibilities, or continue in sample mode.';
/* Server status. Starts offline until /api/status answers. Survives "Reset demo". */
let status={mode:'sample',provider:'browser-local',model:null,offline:true,yoma:null};
const isLive=()=>!status.offline&&status.mode==='live';
const fresh=()=>({step:0,maxStep:0,role:roles[0].name,profile:{name:'',email:'',city:'',phone:''},experience:'',context:'',dates:'',credential:false,document:null,claims:[],stale:false,sample:false,error:'',generationError:null,generation:null,opportunities:{state:'hidden',items:[],source:null,matchedQuery:null,role:null},editing:null,busy:false,busyText:''});
let state=fresh(),pendingAction=null,toastTimer;
const view=document.querySelector('#view'),steps=document.querySelector('#steps'),pill=document.querySelector('#mode-pill');
const badge=(category)=>`<span class="tag ${category==='verified'?'green':category==='document'?'amber':'purple'}">${category==='verified'?'✓ ':category==='document'?'◷ ':'○ '}${E(C.labels[category])}</span>`;
function notify(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function errorHTML(){
 if(!state.error)return '';
 const g=state.generationError;
 const actions=g&&(g.retryable||g.allowSample)?`<div class="error-actions">${g.retryable?'<button class="secondary" data-action="retry-generate">Retry</button>':''}${g.allowSample?'<button class="secondary" data-action="sample-generate">Continue in sample mode</button>':''}</div>`:'';
 return `<div class="error-message" role="alert" id="generation-error" tabindex="-1">${E(state.error)}${actions}</div>`;
}
function focusError(){document.querySelector('#generation-error')?.focus({preventScroll:false});}
function go(step){state.step=step;state.maxStep=Math.max(step,state.maxStep);state.error='';state.generationError=null;state.editing=null;if(step===4)loadOpportunities();render();window.scrollTo({top:0,behavior:'instant'});view.querySelector('h1')?.focus({preventScroll:true});}
function invalidate(){if(state.claims.length)state.stale=true;}
function confirmAction(title,copy,label,fn){pendingAction=fn;document.querySelector('#confirm-title').textContent=title;document.querySelector('#confirm-copy').textContent=copy;document.querySelector('#confirm-action').textContent=label;document.querySelector('#confirm-dialog').showModal();}
function renderSteps(){steps.innerHTML=stepNames.map((name,i)=>`<button class="step-button ${i===state.step?'active':i<state.step?'completed':''}" data-step="${i}" ${i>state.maxStep?'disabled':''} ${i===state.step?'aria-current="step"':''}><span class="step-number">${i<state.step?'✓':String(i+1).padStart(2,'0')}</span><span>${name}</span></button>`).join('');}
function intro(kicker,title,text){return `<div class="intro"><span class="eyebrow">${kicker}</span><h1 tabindex="-1">${title}</h1><p>${text}</p></div>`;}
/* Mode pill: "Live AI · <model>", "Sample mode" or "Sample mode (offline)". */
function modePillText(){return status.offline?'Sample mode (offline)':isLive()?'Live AI · '+(status.model||status.provider):'Sample mode';}
function updatePill(){if(!pill)return;const text=modePillText();pill.className='mode-pill '+(status.offline?'offline':isLive()?'live':'sample');pill.innerHTML=`<span></span> ${E(text)}`;pill.setAttribute('aria-label','Generation mode: '+text);}
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
function previewMini(){return `<aside class="landing-preview" aria-label="Illustrative CV preview"><div class="preview-scene"><div class="preview-label">A LITTLE EXPERIENCE. A REAL START.</div><div class="mini-cv"><div class="mini-cv-name">${E(state.profile.name||'Your name, your future.')}</div><div class="mini-cv-sub">${E(state.role)}</div><div class="mini-rule"></div><div class="mini-title">EXPERIENCE</div><div class="mini-line"></div><div class="mini-line"></div><div class="mini-line short"></div><div class="mini-title">SKILLS THAT COUNT</div><div class="mini-line"></div><div class="mini-line short"></div><div class="mini-skills"><span>Communication</span><span>Teamwork</span></div><div class="mini-title">LEARNING & ACHIEVEMENTS</div><div class="mini-line"></div><div class="mini-line short"></div></div><div class="floating-note"><span class="check-icon">✓</span> You approve every claim.</div></div><p class="preview-caption">A CV that reflects what you’ve done,<br>with a clear source behind each claim.</p>${state.sample?'<div class="avatar-row"><span class="avatar">AN</span><span><strong>Amina’s story is loaded</strong><small>Synthetic profile for your demonstration</small></span></div>':''}</aside>`;}
function landing(){return `<div class="content-grid landing-grid"><section>${intro('YOUR EXPERIENCE COUNTS','You have experience.<br>Let’s put it on paper.','Helping at home, in a shop or in your community is a place to start. Build a first CV you can feel confident explaining.')}<div class="section-kicker">WHAT OPPORTUNITY ARE YOU WORKING TOWARDS?</div><div class="role-list" role="group" aria-label="Choose a target role">${roles.map((r,i)=>`<button class="role-card ${r.name===state.role?'selected':''}" data-role="${i}" aria-pressed="${r.name===state.role}"><span class="role-icon">${svg(r.icon)}</span><span class="role-text"><strong>${r.name}</strong><small>${r.description}</small></span><span class="radio-dot" aria-hidden="true"></span></button>`).join('')}</div><div class="action-row"><button class="primary" data-action="start">Build my CV ${svg('arrow')}</button><button class="text-button" data-action="sample">Try Amina’s story ↗</button></div><p class="tiny-note">No formal work history needed. You stay in control of what goes in.</p><div class="value-row"><span>${svg('check')} Review every claim</span><span>${svg('shield')} Know its source</span><span>${svg('lock')} No account needed</span></div></section>${previewMini()}</div>`;}
function privacyNote(){
 if(state.sample)return 'Amina is a fictional person. All loaded details are synthetic.';
 if(isLive())return 'Your experience text is sent to the AI model through this prototype’s server when you create a draft. Your name and contact details stay in this browser.';
 return 'Your text stays in this browser session. No AI service receives it.';
}
function experience(){return `<div class="progress-caption">YOUR TARGET ROLE <strong>${E(state.role)}</strong></div><div class="content-grid"><section>${intro('STEP 02 / YOUR EXPERIENCE','Tell us what you did.','Small tasks can say a lot. Think of a time you helped someone, took responsibility or made something happen.')}<div class="form-section"><label class="field-label" for="context">Where did this experience happen?</label><input id="context" data-field="context" value="${E(state.context)}" maxlength="120" placeholder="e.g. Helping at a family shop"></div><div class="form-section"><label class="field-label" for="experience">What were your responsibilities?</label><div class="prompt-row"><button class="prompt-chip" data-example="shop">Family business</button><button class="prompt-chip" data-example="care">Caregiving</button><button class="prompt-chip" data-example="community">Volunteering</button></div><textarea id="experience" data-field="experience" maxlength="4000" placeholder="I helped…\nI was responsible for…\nOne thing I did regularly was…">${E(state.experience)}</textarea><p class="field-help">Use your own words. Include numbers only if you know they’re accurate. <span id="character-count">${state.experience.length}</span>/4,000</p></div><div class="form-section"><label class="field-label" for="dates">When did you do this? <span class="optional">Optional</span></label><input id="dates" data-field="dates" maxlength="100" value="${E(state.dates)}" placeholder="e.g. School holidays, 2025–2026"></div><div class="form-section"><div class="section-kicker">THE DETAILS ON YOUR CV</div><div class="fields-grid"><div><label class="field-label" for="name">Your name</label><input id="name" data-profile="name" maxlength="100" autocomplete="name" value="${E(state.profile.name)}" placeholder="Your full name"></div><div><label class="field-label" for="city">City <span class="optional">Optional</span></label><input id="city" data-profile="city" maxlength="100" autocomplete="address-level2" value="${E(state.profile.city)}" placeholder="Your city"></div><div><label class="field-label" for="email">Email <span class="optional">Optional</span></label><input id="email" data-profile="email" type="email" maxlength="160" autocomplete="email" value="${E(state.profile.email)}" placeholder="you@example.com"></div><div><label class="field-label" for="phone">Phone <span class="optional">Optional</span></label><input id="phone" data-profile="phone" type="tel" maxlength="50" autocomplete="tel" value="${E(state.profile.phone)}" placeholder="Your phone number"></div></div></div>${errorHTML()}<div class="form-footer"><button class="back-button" data-action="back">← Back</button><button class="primary" data-action="to-evidence">Add supporting evidence ${svg('arrow')}</button></div></section><aside><div class="help-card">${svg('chat')}<h3>Let’s make it concrete.</h3><p>Who did you help? What did you do? How did you do it?</p><div class="example-card"><strong>IN YOUR OWN WORDS</strong>“I helped my aunt in her shop. I showed customers where things were and packed their orders.”</div><p style="margin-top:15px">You don’t need impressive titles. Start with real responsibilities.</p></div><div class="notice">${privacyNote()}</div></aside></div>`;}
function generationNotice(){
 if(status.offline)return 'Sample mode (offline): suggestions use local templates in your browser. Start the YoCV server to use live AI and Yoma data.';
 if(isLive())return `Live AI generation is connected (${E(status.model||status.provider)}). Your experience text is sent to the model through this prototype’s server; your name and contact details are not. Every suggestion is checked against your own words before you see it.`;
 return 'Sample generation uses local templates and the facts you supply. No live AI call is connected. Skills are still matched against Yoma’s skill taxonomy.';
}
function credentialCard(){
 const c=C.credential;
 const detail=c.sample?'A representative sample credential based on Yoma’s wallet credential model. It shows how an issuer-recorded achievement could enter your CV. It was not issued by Yoma and does not prove workplace proficiency.':'A synthetic Yoma-style credential for course completion. It demonstrates how an issued achievement could enter your CV. It does not prove workplace proficiency.';
 return `<div class="evidence-card"><div class="evidence-card-top"><span class="source-icon">${svg('shield')}</span><div class="source-info"><h3>${E(c.title)}</h3><p>${E(c.sourceLabel||c.issuer)}${c.dates?' · '+E(c.dates):''}</p></div></div><div style="margin-top:14px">${badge('verified')}</div><p class="source-detail">${detail}</p><label class="checkbox-label"><input id="credential" type="checkbox" ${state.credential?'checked':''}> Include this ${c.sample?'sample':'synthetic'} achievement</label></div>`;
}
function evidence(){return `<div class="progress-caption">YOUR TARGET ROLE <strong>${E(state.role)}</strong></div><div class="content-grid"><section>${intro('STEP 03 / YOUR EVIDENCE','Give your story context.','Supporting evidence can help explain a claim. You can build your CV with self-reported experience alone.')}<div class="evidence-card"><div class="evidence-card-top"><span class="source-icon">${svg('chat')}</span><div class="source-info"><h3>Your own experience</h3><p>${E(state.context||'The responsibilities you described')}</p></div><span class="tag purple">Self-reported</span></div><p class="source-detail">${E(state.experience)}</p></div>${credentialCard()}<div class="evidence-card"><div class="evidence-card-top"><span class="source-icon" style="background:#faf0dc;color:#a37734">${svg('document')}</span><div class="source-info"><h3>A supporting document</h3><p>A letter, certificate or reference you want to mention.</p></div></div><div style="margin-top:14px">${badge('document')}</div><label class="drop-zone" for="file">${svg('upload')}<span class="file-field"><strong id="file-label">${E(state.document?.name||'Choose a file on your device')}</strong><small>PDF, JPG or PNG, up to 5 MB. No upload or document reading.</small><input id="file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"></span></label><div class="action-row" style="margin-top:10px"><button class="text-button" data-action="sample-document">Use a synthetic reference letter ↗</button>${state.document?'<button class="text-button" data-action="remove-document">Remove document</button>':''}</div>${state.document?`<div style="margin-top:16px"><label class="field-label" for="document-statement">What claim would this document support?</label><textarea class="edit-area" id="document-statement" maxlength="2000" placeholder="Describe the claim in your own words. This prototype does not read your file.">${E(state.document.statement||'')}</textarea><p class="field-help">This statement is yours. The document stays unverified.</p></div>`:''}</div><div class="notice">${svg('spark')} ${generationNotice()}</div>${errorHTML()}<div class="busy-note" id="busy-status" aria-live="polite">${state.busy?E(state.busyText):''}</div><div class="form-footer"><button class="back-button" data-action="back">← Back</button><button class="primary" data-action="generate" ${state.busy?'disabled':''}>${state.busy?E(state.busyText):'Create my draft'} ${svg('arrow')}</button></div></section><aside><div class="help-card purple">${svg('shield')}<h3>Different sources.<br>Different meanings.</h3><div class="evidence-key"><div class="key-item"><span class="tag green">Issuer-recorded achievement</span><p>An issuer records specific facts. In this demo, the credential is a representative sample.</p></div><div class="key-item"><span class="tag amber">Awaiting verification</span><p>A supplied document has not been checked for authenticity or accuracy.</p></div><div class="key-item"><span class="tag purple">Self-reported</span><p>A responsibility or skill you describe from your own experience.</p></div></div></div></aside></div>`;}
function kindLabel(c,i){const base=c.kind==='skill'?'Suggested skill':c.kind==='learning'?'Learning':'Experience';const gen=c.generated==='model'?' · AI-suggested':c.generated==='local'?' · Template suggestion':'';return `${base} ${String(i+1).padStart(2,'0')}${gen}`;}
function sourceQuoteHTML(c){
 if(c.sourceQuote)return `<div class="source-quote"><strong>${E(c.sourceLabel)} ${c.edited?'· Original source retained':''}</strong>Based on: “${E(C.shortQuote(c.sourceQuote))}”</div>`;
 return `<div class="source-quote"><strong>${E(c.sourceLabel)} ${c.edited?'· Original source retained':''}</strong>“${E(c.sourceText)}”</div>`;
}
function yomaTag(c){return c.yomaSkill?`<a class="tag green yoma-tag" href="${E(c.yomaSkill.infoURL)}" target="_blank" rel="noopener noreferrer" title="Yoma skill taxonomy entry">Yoma skill · ${E(c.yomaSkill.name)} ↗</a>`:'';}
function claimHTML(c,i){return `<article class="claim-card ${c.decision}" id="claim-${E(c.id)}"><div class="claim-top">${badge(c.category)}<span class="claim-kind">${E(kindLabel(c,i))}</span></div>${state.editing===c.id?`<label class="field-label" for="edit-${E(c.id)}" style="margin-top:15px">Make this sound like you</label><textarea class="edit-area" id="edit-${E(c.id)}" maxlength="1500">${E(c.text)}</textarea><p class="claim-reason">Edited wording is marked self-reported. The original source stays in the evidence record.</p>`:`<p class="claim-text">${E(c.text)}</p>`}${yomaTag(c)?`<div class="claim-tags">${yomaTag(c)}</div>`:''}${sourceQuoteHTML(c)}<p class="claim-reason">${E(c.reason)}</p><div class="claim-actions">${state.editing===c.id?`<button class="accept-button" data-claim="${E(c.id)}" data-decision="save">✓ Save & accept</button><button class="edit-button" data-claim="${E(c.id)}" data-decision="cancel">Cancel</button>`:c.decision==='pending'?`<button class="accept-button" data-claim="${E(c.id)}" data-decision="accepted">✓ Accept claim</button><button class="edit-button" data-claim="${E(c.id)}" data-decision="edit">Edit wording</button><button class="reject-button" data-claim="${E(c.id)}" data-decision="rejected">Reject</button>`:`<span class="decision-label ${c.decision}">${c.decision==='accepted'?'✓ '+(c.edited?'Edited & accepted':'Accepted by you'):'× Excluded from CV'}</span><button class="edit-button" data-claim="${E(c.id)}" data-decision="pending">Review again</button>`}</div></article>`;}
function review(){const reviewed=state.claims.filter(c=>c.decision!=='pending').length,yes=state.claims.filter(c=>c.decision==='accepted').length;return `<span class="eyebrow">STEP 04 / YOUR CLAIMS, YOUR CALL</span><div class="review-heading"><div><h1 tabindex="-1">Does this sound like you?</h1><p>Review every suggestion. Keep what’s accurate, change the wording or leave it out. Your approval confirms the wording, not its verification.</p></div><span class="review-count">${reviewed} of ${state.claims.length} reviewed</span></div><div class="review-progress" aria-label="Review progress"><div style="width:${state.claims.length?reviewed/state.claims.length*100:0}%"></div></div>${state.stale?'<div class="error-message" role="alert">Your role or source text changed. Create a fresh draft before reviewing or exporting. <button class="text-button" data-action="back-to-evidence">Go to evidence →</button></div>':''}${errorHTML()}<div class="review-layout"><section aria-label="Claims to review">${state.claims.map(claimHTML).join('')}</section><aside class="review-aside"><div class="help-card purple">${svg('heart')}<h3>It’s your CV.</h3><p>You can say no. You can change a sentence. You can leave out a skill you’re still learning.</p><div class="evidence-key"><div class="key-item"><span class="tag green">Your review</span><p>${yes} claim${yes!==1?'s':''} accepted. ${state.claims.filter(c=>c.decision==='rejected').length} excluded.</p></div><div class="key-item"><span class="tag purple">Your sources stay attached</span><p>An edit keeps the original statement and source in the separate evidence record.</p></div><div class="key-item"><span class="tag neutral">${E(generationLabel())}</span><p>${E(generationSummary())}</p></div></div></div></aside></div><div class="form-footer"><button class="back-button" data-action="back">← Back to evidence</button><p class="review-instruction">${reviewed<state.claims.length?'Review each claim to unlock your CV.':!yes?'You excluded every claim. Review again or add another experience.':'Your reviewed claims are ready for a final look.'}</p><button class="primary" data-action="preview" ${!C.canExport(state.claims)||state.stale?'disabled':''}>Preview my CV ${svg('arrow')}</button></div>`;}
function cvFootnote(){const live=state.generation&&state.generation.mode==='live';return `Supporting sources and evidence categories are available in the separate evidence record.<br>YoCV prototype · ${live?'Live AI generation':'Sample generation'} · Demonstration record`;}
function cvHTML(){const claims=state.claims.filter(c=>c.decision==='accepted'),experience=claims.filter(c=>c.kind==='experience'),skills=claims.filter(c=>c.kind==='skill'),learning=claims.filter(c=>c.kind==='learning');return `<article class="cv-paper" id="cv-paper" aria-label="Approved CV"><h2 class="cv-name">${E(state.profile.name||'Your name')}</h2><p class="cv-role">${E(state.role)}</p><p class="cv-contact">${[state.profile.city,state.profile.email,state.profile.phone].filter(Boolean).map(E).join(' &nbsp;·&nbsp; ')}</p><div class="cv-divider"></div>${experience.length?'<h3 class="cv-section-title">EXPERIENCE</h3>'+experience.map(c=>`<div class="cv-entry">${c.context?`<p class="cv-context">${E(c.context)}</p>`:''}${c.dates?`<p class="cv-dates">${E(c.dates)}</p>`:''}<p class="cv-bullet">${E(c.text)}</p></div>`).join(''):''}${skills.length?'<h3 class="cv-section-title">SKILLS</h3>'+skills.map(c=>`<span class="cv-skill">${E(c.text)}${c.yomaSkill&&c.yomaSkill.name!==c.text?` <small>(Yoma skill: ${E(c.yomaSkill.name)})</small>`:''}</span>`).join(''):''}${learning.length?'<h3 class="cv-section-title">LEARNING & ACHIEVEMENTS</h3>'+learning.map(c=>`<div class="cv-entry"><p class="cv-bullet">${E(c.text)}</p>${c.dates?`<p class="cv-dates">${E(c.dates)}</p>`:''}</div>`).join(''):''}<p class="cv-footnote">${cvFootnote()}</p></article>`;}
function rejectedHTML(){
 const g=state.generation;const list=g&&Array.isArray(g.rejected)?g.rejected.filter(r=>r.reason!=='yoma_skill_menu_unavailable'):[];
 if(!list.length)return '';
 return `<div class="record-row rejected-row"><span class="tag amber">Rejected before review</span><p>${list.length} suggestion${list.length===1?'':'s'} failed the grounding checks and never reached you:</p><ul class="rejected-list">${list.map(r=>`<li><strong>${E(r.reason)}</strong>${r.text?': “'+E(C.shortQuote(r.text,160))+'”':''}</li>`).join('')}</ul></div>`;
}
function evidenceHTML(){const record=C.buildEvidence(state.profile,state.role,state.claims,state.generation);return `<details class="evidence-record"><summary>View the demonstration evidence record (${state.claims.length} reviewed claims)</summary><p>This record distinguishes source evidence from your review of the wording. The credential in this demo is a representative sample, not an issued Yoma credential.</p><p><strong>Generation:</strong> ${E(record.generationMode)}</p>${rejectedHTML()}${state.claims.map(c=>`<div class="record-row">${badge(c.category)} <span class="tag neutral">${c.decision==='accepted'?'Included in CV':'Excluded from CV'}</span>${c.yomaSkill?' '+yomaTag(c):''}<p><strong>${E(c.text)}</strong></p><p>Source: ${E(c.sourceLabel)}<br>${c.sourceQuote?'Supporting quote: “'+E(c.sourceQuote)+'”<br>':''}Original statement: ${E(c.sourceText)}${c.sourceDates?"<br>Related source date: "+E(c.sourceDates):""}<br>Review: ${E(c.decision)}${c.edited?' · Wording edited; original evidence category: '+E(C.labels[c.originalCategory]):''}</p></div>`).join('')}</details>`;}
function opportunitiesHTML(){
 const o=state.opportunities;if(o.state==='hidden')return '';
 const tagText=o.state==='unavailable'?'Yoma unreachable':o.state==='loading'?'Yoma':o.source==='cache'?'From Yoma (cached)':'Live from Yoma';
 let body='';
 if(o.state==='loading')body='<p class="opp-note">Looking for learning opportunities on Yoma…</p>';
 else if(o.state==='unavailable')body='<p class="opp-note">Yoma opportunities unavailable right now.</p>';
 else if(o.state==='empty')body='<p class="opp-note">No Yoma learning opportunities matched this role yet.</p>';
 else body=`<div class="opp-grid">${o.items.map(i=>`<article class="opp-card">${i.organizationLogoURL?`<img class="opp-logo" src="${E(i.organizationLogoURL)}" alt="" loading="lazy" width="40" height="40">`:'<span class="opp-logo placeholder" aria-hidden="true"></span>'}<div class="opp-body"><h4>${E(i.title)}</h4><p class="opp-meta">${E(i.organizationName)}${i.commitmentIntervalDescription?' · '+E(i.commitmentIntervalDescription):''}${i.difficulty?' · '+E(i.difficulty):''}</p>${Array.isArray(i.skills)&&i.skills.length?`<div class="opp-skills">${i.skills.slice(0,3).map(s=>`<a class="tag green" href="${E(s.infoURL)}" target="_blank" rel="noopener noreferrer">${E(s.name)}</a>`).join('')}</div>`:''}<a class="opp-link" href="${E(i.yomaInfoURL)}" target="_blank" rel="noopener noreferrer">Open “${E(i.title)}” by ${E(i.organizationName)} on Yoma ↗</a></div></article>`).join('')}</div>`;
 return `<section class="opportunities print-hide" aria-labelledby="opp-title"><div class="opp-head"><h3 id="opp-title">Strengthen this CV on Yoma</h3><span class="tag ${o.state==='ready'?'green':'neutral'}">${E(tagText)}</span></div><p class="opp-intro">Completing a verified learning opportunity on Yoma adds an issuer-recorded achievement to a Yo-ID. These matches come from a keyword search of Yoma’s public opportunity list for “${E(state.role)}”, not from your profile.</p>${body}</section>`;
}
function preview(){return `${intro('STEP 05 / READY FOR YOUR NEXT OPPORTUNITY','Your experience, on paper.','One final look. Your CV includes only the claims you accepted. You can return to review and change your mind.')}<div class="success-banner">${svg('check')}<span>${state.claims.filter(c=>c.decision==='accepted').length} approved claims. Sources preserved in a separate evidence record.</span></div><div class="preview-layout"><section>${cvHTML()}</section><aside><div class="export-card"><h3>Take your next step.</h3><p>Save your CV and keep the evidence record alongside it.</p><button class="primary" data-action="print">${svg('document')} Print / save as PDF</button><button class="secondary" data-action="download-cv">Download text CV</button><button class="secondary" data-action="download-evidence">Download evidence record</button><button class="text-button" data-action="download-json">Evidence as JSON ↗</button></div><div class="help-card purple" style="margin-top:18px">${svg('shield')}<h3>What the evidence means</h3><p>User-approved wording and issuer verification are different. The sample credential demonstrates course completion only.</p></div></aside></div>${opportunitiesHTML()}${evidenceHTML()}<div class="form-footer"><button class="back-button" data-action="back">← Back to claim review</button><button class="text-button" data-action="about">How this could fit into Yoma ↗</button></div>`;}
function render(){renderSteps();view.innerHTML=[landing,experience,evidence,review,preview][state.step]();view.setAttribute('aria-busy',String(state.busy));}
function sample(){const keep=state.opportunities;state=fresh();state.opportunities=keep;state.sample=true;state.profile={name:'Amina Ndlovu',email:'amina@example.com',city:'Cape Town, South Africa',phone:''};Object.assign(state,examples.shop);state.dates='School holidays, 2025–2026';state.credential=true;state.document={name:'community-reference-demo.pdf',statement:'Helped prepare materials for a community clean-up.'};render();notify('Amina’s synthetic story is ready. Choose a role, then build her CV.');}
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
async function requestClaims(mode){
 if(status.offline){
  await new Promise(resolve=>setTimeout(resolve,450));
  const claims=C.localExperienceClaims(state);
  return {claims,generation:{mode:'sample',provider:'browser-local',model:null,generatedAt:new Date().toISOString(),skillMenuSize:0,skillMenuSource:'none',rejected:[]}};
 }
 const body={role:state.role,experience:state.experience,context:state.context,dates:state.dates};
 if(mode)body.mode=mode;
 let res;
 try{res=await fetch('/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
 catch{goOffline();notify('The YoCV server could not be reached. Continuing in your browser.');return requestClaims('sample');}
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
   if(!generated.length){state.claims=[];state.error=EMPTY_CLAIMS_MESSAGE;state.generationError={code:'no_claims',retryable:false,allowSample:(state.generation?.mode)!=='sample'};render();focusError();return;}
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
 if(button.dataset.example){const use=()=>{Object.assign(state,examples[button.dataset.example]);invalidate();render();notify('Example loaded. Adapt it to your own experience.');};if(state.experience)confirmAction('Use this example?','This replaces the experience in the form. Any existing claim approvals will need a fresh review.','Use example',use);else use();return;}
 if(button.dataset.claim){const id=button.dataset.claim,index=state.claims.findIndex(c=>c.id===id),decision=button.dataset.decision;if(state.stale){notify('Create a fresh draft from your updated sources first.');return;}if(decision==='edit')state.editing=id;else if(decision==='cancel')state.editing=null;else{try{state.claims[index]=C.reviewClaim(state.claims[index],decision==='save'?'accepted':decision,decision==='save'?document.querySelector('#edit-'+id).value:undefined);state.editing=null;}catch(error){notify(error.message);return;}}const scroll=window.scrollY;render();window.scrollTo({top:scroll,behavior:'instant'});document.querySelector('#claim-'+id+' button')?.focus({preventScroll:true});return;}
 const action=button.dataset.action;
 if(action==='sample'){if(state.experience&&!state.sample)confirmAction('Load Amina’s demo story?','This replaces your current draft with synthetic sample data.','Load demo',sample);else sample();}
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
  download('YoCV-evidence.html',`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YoCV evidence record</title><style>body{font:15px/1.7 system-ui;max-width:850px;margin:40px auto;padding:24px;color:#41204b}article{border:1px solid #ddd;padding:20px;margin:20px 0;border-radius:12px}p{overflow-wrap:anywhere}small{color:#777}</style><h1>YoCV demonstration evidence record</h1><p>${E(evidence.name)} · ${E(evidence.role)}</p><p>${E(evidence.notice)}</p><p><small>Generation: ${E(evidence.generationMode)}</small></p>${rejected.length?`<article><strong>Suggestions rejected before review</strong><ul>${rejected.map(r=>`<li>${E(r.reason)}${r.text?': “'+E(r.text)+'”':''}</li>`).join('')}</ul></article>`:''}${evidence.claims.map(c=>`<article><strong>${E(c.text)}</strong><p>Evidence category: ${E(c.evidenceLabel)}<br>Decision: ${E(c.decision)} · ${c.includedInCV?'Included in CV':'Excluded from CV'}</p><p>Source: ${E(c.sourceLabel)}<br>${c.sourceQuote?'Supporting quote: “'+E(c.sourceQuote)+'”<br>':''}Original statement: ${E(c.sourceText)}<br>Original proposed wording: ${E(c.originalText)}${c.yomaSkill?'<br>Yoma skill: '+E(c.yomaSkill.name)+' ('+E(c.yomaSkill.infoURL)+')':''}${c.sourceDates?"<br>Related source date: "+E(c.sourceDates):""}${c.edited?'<br>Edited wording is self-reported. Original category: '+E(C.labels[c.originalCategory]):''}</p></article>`).join('')}<small>Demonstration record. No independent document or cryptographic verification.</small></html>`,'text/html;charset=utf-8');
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
