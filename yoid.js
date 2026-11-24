/* The Yo-ID shell (docs/superpowers/specs/2026-11-22-yoid-shell-design.md). It owns the signed-in person, the record,
   the hash route, the bar, the two drawers, the hero, the tab pages and the footer. app.js owns the CV steps and is
   mounted into the CV tab's container with the record handed to it. Routes: #/, #/wallet, #/passport,
   #/opportunities, #/skills, #/cv and #/cv/2 to #/cv/4. Only the chosen person's id is kept in sessionStorage. */
(()=>{
'use strict';
const C=window.YoCV,E=C.escapeHTML;
const fill=(t,v={})=>String(t??'').replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?'':String(v[k]));
const $=s=>document.querySelector(s);
const ROUTES=['#/','#/wallet','#/passport','#/opportunities','#/skills','#/cv'],DEADLINE_MS=30000;
let copy=window.YoCVCopy.en;
// person: {id, displayName, firstName, town, trade}. signedOut keeps the token account for Log in while hiding it.
const S={cfg:null,person:null,record:null,selector:null,tab:null,offline:false,signedOut:false,busy:false,list:false,open:{}};
let cv=null,pendingAction=null,toastTimer;
const sample=()=>S.cfg?.accounts?.source==='sample';
const who=()=>S.signedOut?null:S.person;
const stored=()=>{try{return sessionStorage.getItem('yoid.person');}catch{return null;}};
function store(id){try{if(id)sessionStorage.setItem('yoid.person',id);else sessionStorage.removeItem('yoid.person');}catch{}}
const tabOf=route=>copy.tabs.find(t=>t.route===route)||copy.tabs[0];
const draft=()=>window.YoCVApp?.draftStatus?.()||{step:0,accepted:0,ready:false,dirty:false};
const tradeLabel=id=>S.cfg?.roles?.find(r=>r.tradeId&&r.tradeId===id)?.name||'';
function route(){
 const h=location.hash||'#/',m=/^#\/cv(?:\/([2-4]))?$/.exec(h);
 if(m)return {tab:'#/cv',step:m[1]?Number(m[1])-1:0};
 return {tab:ROUTES.includes(h)?h:'#/',step:0};
}
/* Inline icons: simple strokes, nothing from Yoma's repository. */
const svg=(d,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PATHS={
 close:'<path d="M6 6l12 12M18 6L6 18"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
 sunLow:'<path d="M8 15a4 4 0 0 1 8 0M12 5v2M5.6 8.6l1.4 1.4M18.4 8.6L17 10M3 15h2M19 15h2M4 19h16"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
 chevron:'<path d="M9 6l6 6-6 6"/>',
 arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
 wallet:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 15h2"/>',
 passport:'<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 17h6"/>',
 trophy:'<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4v4"/>',
 bolt:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
 doc:'<path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/>',
 ring:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/>',
 login:'<path d="M10 17l5-5-5-5M15 12H3M13 3h6v18h-6"/>',
 check:'<path d="M5 12l4 4L19 6"/>',
 globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'
};
const icon=(name,size)=>svg(PATHS[name],size);
const initials=name=>String(name??'').trim().split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function hashHue(name){let h=0;for(const ch of String(name??''))h=(h*31+ch.codePointAt(0))%360;return h;}
const avatarHTML=(p,size)=>p?`<span class="avatar-face" style="background:hsl(${hashHue(p.displayName)} 45% 35%);width:${size}px;height:${size}px;font-size:${Math.max(14,Math.round(size*0.36))}px">${E(initials(p.displayName))}</span>`
 :`<span class="avatar-face generic" style="width:${size}px;height:${size}px">${icon('user',Math.round(size*0.55))}</span>`;
/* The greeting by local hour; the first name in orange; no name on a cold offline start. */
function greetingHTML(){
 const h=new Date().getHours(),ic=icon(h<12?'sun':h<18?'sunLow':'moon',28),first=who()?.firstName;
 if(!first)return `<span class="time-icon">${ic}</span><span>${E(copy.greetingNoName)}</span>`;
 const text=h<12?copy.greetingMorning:h<18?copy.greetingAfternoon:copy.greetingEvening,[before,after]=text.split('{first}');
 return `<span class="time-icon">${ic}</span><span>${E(before)}<span class="first">${E(first)}</span>${E(after||'')}</span>`;
}
function heroLine(){
 if(S.tab!=='#/')return tabOf(S.tab).blurb;
 const d=draft();return d.step>0?fill(copy.heroCvDraft,{n:d.step+1}):copy.heroCvNone;
}
const pillsHTML=()=>copy.tabs.map(t=>`<a class="pill${t.route===S.tab?' current':''}" href="${E(t.route)}" ${t.route===S.tab?'aria-current="page"':''}><span aria-hidden="true">${t.emoji}</span>${E(t.label)}</a>`).join('');
/* Views: pure functions of the record (and the draft status), so tests can run them in Node. Task 3 fills the five
   tab pages; this task renders the Overview and a first version of the other four. */
const empty={completions:[],credentials:[],selfAttested:[],wallet:null};
function skillsOf(record){
 const seen=new Map();
 for(const c of record.completions||[])for(const s of c.skills||[])if(s?.name&&!seen.has(s.name))seen.set(s.name,{name:s.name,source:'completion',issuer:c.organizationName||''});
 for(const a of record.selfAttested||[])if(a?.name&&!seen.has(a.name))seen.set(a.name,{name:a.name,source:'self',issuer:''});
 return [...seen.values()];
}
const crumb=(label,count)=>`<nav class="breadcrumb" aria-label="Breadcrumb"><a href="#/">${E(copy.breadcrumbRoot)}</a><span aria-hidden="true">›</span><span>${E(label)}${count!=null?` <span class="count">${count}</span>`:''}</span></nav>`;
const intro=text=>`<div class="card intro">${icon('info')}<p>${E(text)}</p></div>`;
const emptyHTML=(title,body,ic='ring')=>`<div class="empty"><span class="empty-icon">${icon(ic,28)}</span><h2>${E(title)}</h2><p>${E(body)}</p></div>`;
const openLink=(route,label)=>`<a class="section-link" href="${E(route)}">${E(label)}${icon('arrow',16)}</a>`;
const SECTIONS={
 wallet:r=>({tint:'gold',ic:'wallet',title:copy.tabs[1].label,count:null,preview:copy.walletSetup,body:`<p class="muted">${E(copy.walletSetupBody)}</p>`,route:'#/wallet',link:copy.openWallet}),
 passport:r=>{const n=r.credentials.length;return {tint:'lilac',ic:'passport',title:copy.tabs[2].label,count:n,preview:n?`${n} Learning`:copy.passportEmpty,
  body:n?`<div class="chip-row"><span class="type-pill"><span class="dot learning" aria-hidden="true"></span>Learning <strong>${n}</strong></span></div>`:`<p class="muted">${E(copy.passportEmptyBody)}</p>`,route:'#/passport',link:copy.openPassport};},
 opportunities:r=>{const n=r.completions.length;return {tint:'blue',ic:'trophy',title:copy.tabs[3].label,count:null,preview:`${n} completed · 0 pending · 0 declined · 0 saved`,
  body:n?`<ul class="counts"><li><strong>${n}</strong> completed</li><li><strong>0</strong> pending</li><li><strong>0</strong> declined</li><li><strong>0</strong> saved</li></ul>`:`<p class="muted">${E(copy.oppsEmptyBody)}</p>`,route:'#/opportunities',link:copy.openOpportunities};},
 skills:r=>{const list=skillsOf(r);return {tint:'mint',ic:'bolt',title:copy.tabs[4].label,count:list.length,preview:list.length?list.slice(0,3).map(s=>s.name).join(' · '):copy.skillsEmpty,
  body:list.length?`<div class="chip-row">${list.slice(0,8).map(s=>`<span class="skill-chip">${E(s.name)}</span>`).join('')}</div>`:`<p class="muted">${E(copy.skillsEmptyBody)}</p>`,route:'#/skills',link:copy.openSkills};}
};
function sectionCard(key,record,open,prefix='ov'){
 const s=SECTIONS[key](record),id=`${prefix}-${key}-body`;
 return `<div class="section-card" data-section="${key}" ${open?'open':''}><button class="section-head" aria-expanded="${!!open}" aria-controls="${id}" data-toggle="${key}"><span class="icon-square ${s.tint}">${icon(s.ic)}</span><span class="section-text"><span class="section-title">${E(s.title)}${s.count!=null?` <span class="count">· ${s.count}</span>`:''}</span><span class="section-preview">${E(s.preview)}</span></span><span class="chevron">${icon('chevron',16)}</span></button><div class="section-body" id="${id}">${s.body}${openLink(s.route,s.link)}</div></div>`;
}
function cvCard(d){
 const ready=d.ready,drafting=!ready&&d.step>0;
 const note=ready?copy.cvTileReady:drafting?fill(copy.cvTileDraft,{n:d.step+1,k:d.accepted}):copy.cvTileNote,label=drafting?copy.continueCvTile:copy.openCv;
 return `<div class="section-card cv-card span-2" open><div class="section-head static"><span class="icon-square ${ready||drafting?'lilac':'grey'}">${icon('doc')}</span><span class="section-text"><span class="section-title">${E(copy.cvTileTitle)}</span><span class="section-preview">${E(note)}</span></span>${openLink('#/cv',label)}</div></div>`;
}
const views={
 skillsOf,
 overview:(record,d,open={})=>`<div class="grid-2">${Object.keys(SECTIONS).map(k=>sectionCard(k,record,open[k])).join('')}${cvCard(d)}</div>`,
 wallet:()=>crumb(copy.tabs[1].label)+`<div class="grid-2"><div class="card"><h2 class="card-title">${E(copy.walletSetup)}</h2><p class="muted">${E(copy.walletSetupBody)}</p></div><div class="card"><h2 class="card-title">${E(copy.walletHow)}</h2><ul class="bullets">${copy.walletHowBullets.map(b=>`<li>${icon('check',18)}<span>${E(b)}</span></li>`).join('')}</ul></div></div>`,
 passport:r=>{const n=r.credentials.length;return crumb(copy.tabs[2].label,n)+intro(copy.passportIntro)+(n?`<div class="cred-grid">${r.credentials.map(c=>`<div class="card cred-card"><span class="status-pill">${E(copy.statusIssued)}</span><p class="cred-title">${E(c.title)}</p><p class="muted">${E(fill(copy.issuedByPartner,{issuer:c.issuer||copy.issuerNotStated}))}${c.month?` · ${E(c.month)}`:''}</p></div>`).join('')}</div>`:emptyHTML(copy.passportEmpty,copy.passportEmptyBody,'passport'));},
 opportunities:r=>{const n=r.completions.length;return crumb(copy.tabs[3].label,n)+intro(copy.oppsIntro)+(n?`<div class="cred-grid">${r.completions.map(c=>`<div class="card cred-card"><span class="tag recorded">${E(copy.completedBadge)}</span><p class="cred-title">${E(c.title)}</p><p class="muted">${E([c.organizationName,c.month].filter(Boolean).join(' · '))}</p>${c.opportunityId?`<a class="secondary small" href="https://yoma.world/opportunities/${encodeURIComponent(c.opportunityId)}" rel="noopener">${E(copy.viewOpportunity)}</a>`:''}</div>`).join('')}</div>`:emptyHTML(copy.oppsEmpty,copy.oppsEmptyBody,'trophy'));},
 skills:r=>{const list=skillsOf(r);return crumb(copy.tabs[4].label,list.length)+intro(copy.skillsIntro)+(list.length?`<div class="skill-grid">${list.map(s=>`<div class="card skill-tile"><p class="cred-title">${E(s.name)}</p><p class="muted">${E(s.source==='self'?copy.selfAttested:fill(copy.skillIssuedBy,{n:1}))}</p></div>`).join('')}</div>`:emptyHTML(copy.skillsEmpty,copy.skillsEmptyBody,'bolt'));}
};
const signedOutHTML=()=>`<div class="card signed-out"><span class="empty-icon">${icon('ring',28)}</span><h2>${E(copy.signedOutTitle)}</h2><p>${E(copy.signedOutBody)}</p><button class="primary" data-action="login">${E(copy.logIn)}</button></div>`;
function tabViewHTML(tab){
 if(S.signedOut)return signedOutHTML();
 const label=tabOf(tab).label;
 if(tab==='#/cv')return crumb(label);
 if(!S.record)return S.busy?`<div class="card" role="status">${E(copy.reading)}</div>`:emptyHTML(label,copy.recordOffline);
 switch(tab){
  case '#/wallet':return views.wallet(S.record);
  case '#/passport':return views.passport(S.record);
  case '#/opportunities':return views.opportunities(S.record);
  case '#/skills':return views.skills(S.record);
  default:return views.overview(S.record,draft(),S.open);
 }
}
/* Drawers */
function menuDrawerHTML(){
 const ext=[[copy.menuHome,'https://yoma.world/'],[copy.menuAbout,'https://yoma.world/about'],[copy.menuOpportunities,'https://yoma.world/opportunities'],[copy.menuMarketplace,'https://yoma.world/marketplace']];
 return `<div class="drawer-head"><span class="wordmark dark" aria-hidden="true">yoma</span><button class="icon-button close-dialog" aria-label="${E(copy.closeMenu)}">${icon('close')}</button></div>`
  +`<nav class="drawer-rows" aria-label="Yoma">${ext.map(([l,u])=>`<a class="drawer-row" href="${u}" rel="noopener">${icon('globe')}${E(l)}</a>`).join('')}</nav><hr>`
  +`<nav class="drawer-rows" aria-label="${E(copy.breadcrumbRoot)}"><a class="drawer-row current" href="#/" aria-current="page">${icon('passport')}${E(copy.menuYoid)}</a><a class="drawer-row" href="card.html">${icon('doc')}${E(copy.menuYocard)}</a></nav><hr>`
  +(who()?`<div class="drawer-pad"><button class="secondary wide" data-action="signout">${E(copy.signOut)}</button></div>`:'')
  +`<div class="drawer-foot"><span>${E(copy.footerPrototype)}</span><button class="text-button" data-action="about">${E(copy.aboutPrototype)}</button></div>`;
}
function accounts(){
 if(sample())return S.cfg.accounts.personas.map(p=>({id:p.id,displayName:p.displayName,firstName:p.firstName,town:p.city,trade:tradeLabel(p.trade)}));
 return S.person?[S.person]:[];
}
function accountListHTML(){
 const cur=who()?.id;
 return `<div class="account-list" role="group" aria-label="${E(copy.switchAccount)}">${accounts().map(a=>`<button class="account-row${a.id===cur?' current':''}" data-account="${E(a.id)}" aria-current="${a.id===cur}">${avatarHTML(a,36)}<span class="choice-text"><strong>${E(a.displayName)}</strong><small>${E([a.trade,a.town].filter(Boolean).join(' · '))}</small></span></button>`).join('')}</div>`;
}
function userDrawerHTML(){
 const p=who(),canSwitch=accounts().length>0&&!(S.offline&&!S.record);
 const band=`<div class="drawer-band"><button class="icon-button close-dialog" aria-label="${E(copy.closeMenu)}">${icon('close')}</button>${avatarHTML(p,80)}<p class="drawer-name">${E(p?p.displayName:copy.drawerAccount)}</p>${p?.town?`<p class="drawer-town">${E(p.town)}</p>`:''}`
  +`<div class="drawer-pills">${canSwitch&&p?`<button class="pill" data-action="switch" aria-expanded="${S.list}">${E(copy.switchAccount)}</button>`:''}<button class="pill" data-action="about">${E(copy.aboutPrototype)}</button></div></div>`;
 const body=S.list||!p?(canSwitch?accountListHTML():`<p class="drawer-note">${E(copy.recordOffline)}</p>`)
  :S.record?`<div class="drawer-cards">${Object.keys(SECTIONS).map(k=>sectionCard(k,S.record,S.open['d-'+k],'d')).join('')}</div>`:`<p class="drawer-note">${E(copy.recordOffline)}</p>`;
 return band+body+(p?`<div class="drawer-pad"><button class="secondary small wide" data-action="signout">${E(copy.signOut)}</button></div>`:'');
}
const drawerHTML=d=>d.id==='menu-drawer'?menuDrawerHTML():userDrawerHTML();
function openDrawer(id){const d=$(id);if(!d)return;d.innerHTML=drawerHTML(d);if(!d.open)d.showModal();}
function closeDrawers(){for(const d of document.querySelectorAll('dialog.drawer[open]'))d.close();}
/* Dialog plumbing: the confirm dialog, the toast, the close buttons and the backdrop click. */
function confirm(title,text,label,fn){pendingAction=fn;$('#confirm-title').textContent=title;$('#confirm-copy').textContent=text;$('#confirm-action').textContent=label;$('#confirm-dialog').showModal();}
function notify(text){const el=$('#toast');el.textContent=text;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function modeLabel(){const m=S.cfg?.mode||{};return S.offline?copy.modeOffline:m.mode==='live'?fill(copy.modeLive,{model:m.model||m.provider}):copy.modeSample;}
/* Rendering. The whole shell on a route or person change; the draft bits alone on a CV state change. */
function render(){
 const {tab,step}=route(),changed=S.tab!==null&&S.tab!==tab;S.tab=tab;
 const p=who(),av=$('#avatar-button'),login=$('#login-button');
 av.hidden=S.signedOut;av.innerHTML=avatarHTML(p,44);av.setAttribute('aria-label',p?p.displayName:copy.drawerAccount);
 login.hidden=!S.signedOut;login.innerHTML=icon('login',18)+E(copy.logIn);
 $('#menu-button').setAttribute('aria-label',copy.openMenu);$('.language').title=copy.languageOnly;
 $('#greeting').innerHTML=greetingHTML();
 const info=$('#yoid-info');info.innerHTML=icon('info',22);info.setAttribute('aria-label',copy.whatIsYoid);
 $('#hero-line').textContent=heroLine();
 $('#tabs').innerHTML=pillsHTML();
 $('#tab-view').innerHTML=tabViewHTML(tab);
 const showCv=tab==='#/cv'&&!S.signedOut;
 $('#view').hidden=!showCv;
 if(showCv)cv?.showStep(step);
 renderFooter();
 for(const d of document.querySelectorAll('dialog.drawer[open]'))d.innerHTML=drawerHTML(d);
 if(changed){closeDrawers();window.scrollTo({top:0,behavior:'instant'});document.getElementById('greeting').focus({preventScroll:true});}
}
function renderFooter(){
 $('#footer-mode').textContent=modeLabel()+'.';
 $('#footer-fictional').textContent=sample()?copy.footerFictional:'';
 const about=$('#about-mode');if(about)about.textContent=modeLabel()+(sample()?'. '+copy.footerFictional:'.');
}
function renderDraftBits(){
 if(!S.tab)return;
 $('#hero-line').textContent=heroLine();
 const card=$('#tab-view .cv-card');if(card)card.outerHTML=cvCard(draft());
 renderFooter();
}
/* Server access, with the 30 s deadline app.js uses. */
async function post(path,body){
 const ac=new AbortController(),t=setTimeout(()=>ac.abort(),DEADLINE_MS);let res;
 try{res=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ac.signal});}
 catch(e){throw Object.assign(new Error(e?.name==='AbortError'?copy.errTimeout:copy.errServer),{network:true});}
 finally{clearTimeout(t);}
 const data=await res.json().catch(()=>({}));
 if(!res.ok)throw Object.assign(new Error(data.error?.message||copy.errServer),{code:data.error?.code||''});
 return data;
}
const personOf=p=>({id:p.id,displayName:p.displayName||'',firstName:p.firstName||'',town:p.city||'',trade:tradeLabel(p.trade)});
const personOfUser=u=>({id:'token',displayName:u?.displayName||'',firstName:u?.firstName||'',town:u?.city||'',trade:''});
/* Sign in: sample mode reads the persona by id (the first one when the id is unknown) and stores the id; token mode
   posts an empty selector, stores nothing and names the account from the record. The CV draft is cleared first. */
async function signIn(id){
 const personas=S.cfg.accounts.personas||[],persona=sample()?(personas.find(p=>p.id===id)||personas[0]||null):null;
 if(sample()&&!persona){S.person=null;render();return;}
 const selector=sample()?{persona:persona.id}:{};
 Object.assign(S,{signedOut:false,busy:true,record:null,selector,list:false,open:{}});
 if(persona){S.person=personOf(persona);store(persona.id);}
 window.YoCVApp.clearDraft();
 render();
 try{
  const {sessionId,record}=await post('/api/cv/record',selector);
  S.record=record;S.offline=false;
  if(!persona)S.person=personOfUser(record.user);
  window.YoCVApp.useRecord(record,selector,sessionId);
 }catch(e){
  if(e.network){S.offline=true;cv?.goOffline();}
  else notify(e.message);
 }
 S.busy=false;render();
}
function signOut(){
 closeDrawers();
 Object.assign(S,{signedOut:true,record:null,selector:null,list:false,open:{}});
 if(sample())S.person=null;
 store(null);
 window.YoCVApp.clearDraft();
 window.YoCVApp.useRecord(null,null,null);
 render();
}
function chooseAccount(id){
 const same=!!who()&&who().id===id;
 closeDrawers();
 if(same)return;
 const d=draft();
 if(who()&&(d.step>0||d.dirty))confirm(copy.switchTitle,copy.switchCopy,copy.switchAccount,()=>signIn(id));else signIn(id);
}
/* ?as=<id> signs in as that persona and leaves the address; else the stored person, else the first persona. */
function resolvePerson(){
 const url=new URL(location.href),as=url.searchParams.get('as');
 if(as!=null){url.searchParams.delete('as');history.replaceState(null,'',url.pathname+url.search+url.hash);}
 if(!sample())return null;
 const ids=S.cfg.accounts.personas.map(p=>p.id);
 return [as,stored()].find(id=>id&&ids.includes(id))||ids[0]||null;
}
function bind(){
 window.addEventListener('hashchange',render);
 document.addEventListener('yocv:draft',event=>{if(event.detail?.offline)S.offline=true;renderDraftBits();});
 $('#menu-button').onclick=()=>openDrawer('#menu-drawer');
 $('#avatar-button').onclick=()=>{S.list=false;openDrawer('#user-drawer');};
 $('#login-button').onclick=()=>{S.list=true;openDrawer('#user-drawer');};
 $('#yoid-info').onclick=()=>$('#yoid-dialog').showModal();
 $('#about-button').onclick=()=>$('#about-dialog').showModal();
 $('#reset-button').onclick=()=>confirm(copy.resetTitle,copy.resetCopy,copy.resetAction,()=>{window.YoCVApp.clearDraft();S.open={};render();notify(copy.resetDone);});
 $('#confirm-action').onclick=()=>{$('#confirm-dialog').close();const action=pendingAction;pendingAction=null;action?.();};
 document.addEventListener('click',event=>{
  const t=event.target;
  if(t instanceof HTMLDialogElement&&t.open){const r=t.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)t.close();return;}
  if(t.closest('#view'))return;
  const close=t.closest('.close-dialog');if(close){close.closest('dialog')?.close();pendingAction=null;return;}
  if(t.closest('dialog.drawer a')){closeDrawers();return;}
  const button=t.closest('button');if(!button||button.disabled)return;
  const d=button.dataset;
  if(d.account!==undefined){chooseAccount(d.account);return;}
  if(d.toggle){const card=button.closest('.section-card'),key=(card.closest('dialog')?'d-':'')+d.toggle,open=!S.open[key];S.open[key]=open;card.toggleAttribute('open',open);button.setAttribute('aria-expanded',String(open));return;}
  switch(d.action){
   case 'login':S.list=true;openDrawer('#user-drawer');break;
   case 'signout':signOut();break;
   case 'switch':S.list=!S.list;openDrawer('#user-drawer');break;
   case 'about':closeDrawers();$('#about-dialog').showModal();break;
  }
 });
}
async function boot(){
 let cfg;
 try{
  const res=await fetch('/api/cv/config',{cache:'no-store'});
  if(!res.ok)throw new Error('config '+res.status);
  cfg=await res.json();
 }catch{
  S.offline=true;
  cfg={copy:window.YoCVCopy.en,rules:window.YoCVRules.RULES,roles:[],accounts:{source:null,personas:[]},mode:{mode:'sample',provider:'browser-local',model:null}};
 }
 S.cfg=cfg;copy=cfg.copy||copy;
 cv=window.YoCVApp.mount(document.querySelector('#view'),{copy,cfg,offline:S.offline,confirm,notify});
 bind();
 if(S.offline||!cfg.accounts.source){render();return;}
 const id=resolvePerson();
 if(sample()&&!id){render();return;}
 await signIn(id);
}
window.YoID={signIn,signOut,openTab:r=>{location.hash=r;},render,person:()=>who(),record:()=>S.record,views};
boot();
})();
