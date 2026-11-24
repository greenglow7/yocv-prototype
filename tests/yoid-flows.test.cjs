'use strict';
// The Yo-ID shell's flows (plan 2026-11-22, Review Focus 1 to 4 and the final review): yoid.js and app.js run in a vm
// context against a small element stub, a scripted fetch and a Map-backed sessionStorage, and the tests drive
// window.YoID and window.YoCVApp and read the state back instead of matching the source text.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {readCvRecord}=require('../server/cv/record.js');
const {createAccountSource}=require('../server/card/account.js');
const {loadConfig}=require('../server/config.js');
const {NOW,fakeYoma}=require('./helpers/vouch-boot.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const SRC={yoid:read('yoid.js'),app:read('app.js')};
const copy=require('../cv-copy.js').en;
const rules=require('../cv-rules.js').RULES;
const records={};let personas=[];
test.before(async()=>{
  const config={...loadConfig({env:{},cwd:fs.mkdtempSync(path.join(os.tmpdir(),'yoid-flows-'))}),yomaAccessToken:''};
  const accountSource=createAccountSource({config,yoma:fakeYoma(),now:()=>NOW});
  personas=accountSource.listPersonas().map(p=>({id:p.id,displayName:p.displayName,firstName:p.firstName,trade:p.trade,city:p.city}));
  for(const id of ['thandi','sipho'])records[id]=await readCvRecord({accountSource,selector:{persona:id}});
  assert.equal(records.thandi.completions.length,3);assert.equal(records.sipho.completions.length,0);
});
const settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));};
/* An element: innerHTML, hidden, attributes, dialog open state and listeners. querySelector looks for a tag in its own
   innerHTML by class and one attribute, enough for the focus targets the shell and the app use. */
function makeDom(){
  const dom={activeElement:null,els:new Map(),listeners:{},windowListeners:{}};
  class El{
    constructor(id){Object.assign(this,{id,innerHTML:'',textContent:'',hidden:false,open:false,title:'',onclick:null,attrs:{},dataset:{},listeners:{}});this.classList={add:()=>{},remove:()=>{}};}
    setAttribute(k,v){this.attrs[k]=String(v);}
    getAttribute(k){return this.attrs[k]??null;}
    toggleAttribute(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
    focus(){dom.activeElement=this;}
    contains(){return false;}
    closest(){return null;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    querySelectorAll(){return [];}
    querySelector(sel){
      const classes=[...sel.matchAll(/\.([\w-]+)/g)].map(m=>m[1]),attr=/\[([\w-]+)=["']?([\w-]+)["']?\]/.exec(sel),tag=/^([a-z][\w-]*)/.exec(sel);
      const hit=(this.innerHTML.match(/<[a-z][^>]*>/g)||[]).find(t=>(!tag||t.startsWith('<'+tag[1]+' ')||t.startsWith('<'+tag[1]+'>'))
        &&classes.every(c=>new RegExp(`class="(?:[^"]*\\s)?${c}(?:\\s|")`).test(t))&&(!attr||t.includes(`${attr[1]}="${attr[2]}"`)));
      return hit?{tag:hit,focus(){dom.activeElement={tag:hit};}}:null;
    }
  }
  const byId=id=>{if(!dom.els.has(id))dom.els.set(id,new El(id));return dom.els.get(id);};
  dom.el=byId;
  dom.document={
    get activeElement(){return dom.activeElement;},
    querySelector(sel){const m=/^#([\w-]+)$/.exec(sel);if(m)return byId(m[1]);if(sel==='.language')return byId('language');return null;},
    querySelectorAll(sel){return sel==='dialog.drawer[open]'?['menu-drawer','user-drawer'].map(byId).filter(d=>d.open):[];},
    getElementById:byId,
    addEventListener(type,fn){(dom.listeners[type]??=[]).push(fn);},
    dispatchEvent(ev){for(const fn of dom.listeners[ev.type]||[])fn(ev);return true;}
  };
  dom.click=target=>dom.document.dispatchEvent({type:'click',target,clientX:0,clientY:0});
  return dom;
}
/* The stand-in for app.js when a test only needs the shell: the draft the shell asks about and a log of the calls. */
function stubApp(){
  const calls=[],draft={step:0,accepted:0,ready:false,dirty:false};
  const api={mount:()=>({showStep(n){calls.push(['showStep',n]);},goOffline(){calls.push(['goOffline']);}}),
    useRecord:(r,s,id)=>calls.push(['useRecord',r,s,id]),clearDraft:()=>{calls.push(['clearDraft']);Object.assign(draft,{step:0,dirty:false});},draftStatus:()=>({...draft})};
  return {calls,draft,api};
}
/* Boot the shell: online or with no server, at a hash, with the real app.js or the stub. The record read can be held
   back (net.hold) and released later (net.release()). */
async function boot({online=true,hash='',app='real'}={}){
  const dom=makeDom(),storage=new Map(),history=[],fetches=[];
  const net={online,hold:false,release:null};
  const cfg={copy,rules,roles:[],accounts:{source:'sample',personas},mode:{mode:'sample',provider:'local',model:null}};
  const ctx={
    document:dom.document,
    sessionStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
    location:{href:'http://127.0.0.1:4173/'+hash,hash,pathname:'/',search:''},
    history:{replaceState:(s,t,url)=>{history.push(url);if(url.startsWith('#'))ctx.location.hash=url;}},
    fetch:async(url,opts={})=>{
      fetches.push({url,opts});
      if(!net.online)throw new TypeError('Failed to fetch');
      if(url.startsWith('/api/cv/config'))return {ok:true,status:200,json:async()=>cfg};
      if(url.startsWith('/api/cv/menu'))return {ok:true,status:200,json:async()=>({menu:[],source:'none'})};
      if(url==='/api/cv/record'){
        const body=JSON.parse(opts.body),record=records[body.persona];
        if(net.hold)await new Promise(r=>{net.release=r;});
        if(!net.online)throw new TypeError('Failed to fetch');
        if(!record)return {ok:false,status:404,json:async()=>({error:{code:'unknown_persona',message:'Unknown persona'}})};
        return {ok:true,status:200,json:async()=>({sessionId:'session-'+body.persona,record})};
      }
      throw new Error('unexpected fetch '+url);
    },
    setTimeout:(fn,ms)=>{const t=setTimeout(fn,ms);t.unref?.();return t;},clearTimeout,setImmediate,URL,AbortController,console,
    CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},
    HTMLDialogElement:class{},CSS:{escape:s=>s},scrollTo:()=>{},scrollY:0,Date
  };
  ctx.window=ctx;ctx.addEventListener=(type,fn)=>{(dom.windowListeners[type]??=[]).push(fn);};
  ctx.YoCVCopy=require('../cv-copy.js');ctx.YoCVRules=require('../cv-rules.js');ctx.YoCV=require('../core.js');
  let stub=null;
  if(app==='real')ctx.YoCVApp=undefined;else{stub=stubApp();ctx.YoCVApp=stub.api;}
  vm.createContext(ctx);
  if(app==='real')vm.runInContext(SRC.app,ctx,{filename:'app.js'});
  vm.runInContext(SRC.yoid,ctx,{filename:'yoid.js'});
  await settle();
  const el=dom.el;
  return {ctx,dom,el,storage,history,fetches,net,stub,YoID:ctx.YoID,YoCVApp:ctx.YoCVApp,
    tabView:()=>el('tab-view').innerHTML,cvView:()=>el('view').innerHTML,drawer:()=>el('user-drawer').innerHTML,
    show:route=>{ctx.location.hash=route;ctx.YoID.render();}};
}
const thandiTitle=()=>records.thandi.completions[0].title;
const closeButton=dialog=>({closest:sel=>sel==='.close-dialog'?{closest:()=>dialog}:null});
const button=dataset=>({closest:sel=>sel==='button'?{disabled:false,dataset,closest:()=>null}:null});

test('boot signs in as the first persona, reads the record and stores only the id',async()=>{
  const s=await boot();
  assert.equal(s.YoID.person().id,'thandi');assert.equal(s.YoID.record(),records.thandi);
  assert.deepEqual([...s.storage.entries()],[['yoid.person','thandi']]);
  assert.equal(s.el('avatar-button').hidden,false);assert.equal(s.el('login-button').hidden,true);
  assert.ok(s.el('greeting').innerHTML.includes('Thandi'));
  assert.ok(s.tabView().includes(copy.openCv),'the Overview CV card');
});
test('Review Focus 1: a switch with a draft asks first; Cancel keeps the draft and the person, Switch clears and signs in',async()=>{
  const s=await boot({app:'stub'});
  const {calls,draft}=s.stub,confirmDialog=s.el('confirm-dialog');
  draft.step=1;draft.dirty=true;
  const before=calls.length;
  s.YoID.chooseAccount('sipho');
  assert.equal(confirmDialog.open,true,'the confirm dialog opened');
  assert.equal(s.el('confirm-title').textContent,copy.switchTitle);assert.equal(s.el('confirm-copy').textContent,copy.switchCopy);assert.equal(s.el('confirm-action').textContent,copy.switchAccount);
  assert.equal(s.YoID.person().id,'thandi');assert.ok(!calls.slice(before).some(c=>c[0]==='clearDraft'),'nothing cleared before the answer');
  s.dom.click(closeButton(confirmDialog));
  assert.equal(confirmDialog.open,false);
  s.el('confirm-action').onclick();await settle();
  assert.equal(s.YoID.person().id,'thandi','Cancel: the person stays');assert.equal(s.YoID.record(),records.thandi);
  assert.deepEqual(draft,{step:1,accepted:0,ready:false,dirty:true},'Cancel: the draft stays');
  assert.ok(!calls.slice(before).some(c=>c[0]==='clearDraft'));
  s.YoID.chooseAccount('sipho');
  assert.equal(confirmDialog.open,true);
  s.el('confirm-action').onclick();await settle();
  assert.equal(confirmDialog.open,false);
  assert.ok(calls.slice(before).some(c=>c[0]==='clearDraft'),'Switch: the draft is cleared');
  assert.equal(s.YoID.person().id,'sipho');assert.equal(s.YoID.record(),records.sipho);
  assert.deepEqual([...s.storage.entries()],[['yoid.person','sipho']]);
  assert.equal(draft.step,0);
  const afterSwitch=calls.length;
  s.YoID.chooseAccount('thandi');await settle();
  assert.equal(confirmDialog.open,false,'no draft: no question');assert.equal(s.YoID.person().id,'thandi');
  s.YoID.chooseAccount('thandi');await settle();
  assert.equal(calls.slice(afterSwitch).filter(c=>c[0]==='clearDraft').length,1,'the same account again does nothing');
});
test('Review Focus 2: a reload on #/cv/3 with no draft lands on CV step 1 and corrects the hash',async()=>{
  const s=await boot({hash:'#/cv/3'});
  assert.equal(s.ctx.location.hash,'#/cv');
  assert.ok(s.history.includes('#/cv'),'the hash was corrected with replaceState');
  assert.equal(s.YoCVApp.draftStatus().step,0);
  assert.equal(s.el('view').hidden,false,'the CV tab is shown');
  assert.ok(s.cvView().includes(copy.labelYoma)&&s.cvView().includes(thandiTitle()),'step 1 with the record');
  assert.ok(!s.cvView().includes(copy.stepReview+'</h2>'),'not the review');
});
test('showStep clamps a step above maxStep to step 1 on a fresh state',()=>{
  const dom=makeDom(),history=[];
  const ctx={document:dom.document,location:{hash:'#/cv/3'},history:{replaceState:(s,t,url)=>history.push(url)},scrollTo:()=>{},
    CustomEvent:class{constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout,clearTimeout,AbortController,console};
  ctx.window=ctx;ctx.YoCVCopy=require('../cv-copy.js');ctx.YoCVRules=require('../cv-rules.js');ctx.YoCV=require('../core.js');
  vm.createContext(ctx);vm.runInContext(SRC.app,ctx,{filename:'app.js'});
  const cfg={copy,rules,roles:[],accounts:{source:'sample',personas},mode:{mode:'sample'}};
  const cv=ctx.YoCVApp.mount(dom.el('view'),{copy,cfg,offline:false,confirm(){},notify(){}});
  cv.showStep(2);
  assert.equal(ctx.YoCVApp.draftStatus().step,0);
  assert.deepEqual(history,['#/cv']);
  assert.ok(dom.el('view').innerHTML.includes('<h2 class="step-title" tabindex="-1">'+copy.labelYoma),'step 1 rendered');
  cv.showStep(3);
  assert.equal(ctx.YoCVApp.draftStatus().step,0);assert.deepEqual(history,['#/cv','#/cv']);
});
test('Review Focus 3: sign out leaves no name, no record and nothing in sessionStorage; Log in signs in again',async()=>{
  const s=await boot({hash:'#/cv'});
  assert.ok(s.cvView().includes(thandiTitle()));
  s.YoID.signOut();
  assert.equal(s.YoID.person(),null);assert.equal(s.YoID.record(),null);
  assert.equal(s.storage.size,0,'sessionStorage empty');
  assert.equal(s.el('avatar-button').hidden,true);assert.equal(s.el('login-button').hidden,false);
  assert.equal(s.el('avatar-button').attrs['aria-label'],copy.drawerAccount);
  assert.ok(!s.el('greeting').innerHTML.includes('Thandi'));
  for(const r of ['#/','#/wallet','#/passport','#/opportunities','#/skills','#/cv']){s.show(r);assert.ok(s.tabView().includes(copy.signedOutTitle)&&s.tabView().includes(copy.signedOutBody),r);}
  assert.equal(s.el('view').hidden,true,'the CV container is hidden while signed out');
  assert.ok(!s.cvView().includes(thandiTitle()),'the record left the CV tab');
  assert.equal(s.YoCVApp.draftStatus().step,0);
  s.el('login-button').onclick();
  const rows=[...s.drawer().matchAll(/data-account="([\w-]+)"/g)].map(m=>m[1]);
  assert.deepEqual(rows,personas.map(p=>p.id),'Log in lists the six people');
  s.YoID.chooseAccount('sipho');await settle();
  assert.equal(s.YoID.person().id,'sipho');assert.equal(s.YoID.record(),records.sipho);
  assert.deepEqual([...s.storage.entries()],[['yoid.person','sipho']]);
  assert.equal(s.el('login-button').hidden,true);
});
test('Review Focus 4: with no server every tab renders, the CV tab keeps the typed-role path and the drawer offers no one',async()=>{
  const s=await boot({online:false});
  assert.equal(s.YoID.person(),null);assert.equal(s.YoID.record(),null);
  assert.ok(s.el('greeting').innerHTML.includes(copy.greetingNoName));
  assert.equal(s.el('footer-mode').textContent,copy.modeOffline+'.');
  for(const r of ['#/','#/wallet','#/passport','#/opportunities','#/skills']){
    assert.doesNotThrow(()=>s.show(r),r);
    assert.ok(s.tabView().includes(copy.recordOffline),r+' shows the offline notice');
    assert.ok(!/undefined|NaN|null</.test(s.tabView()),r);
  }
  s.show('#/cv');
  assert.equal(s.el('view').hidden,false);
  assert.ok(s.cvView().includes('id="role-offline"')&&s.cvView().includes(copy.recordOffline),'typed-role path');
  s.el('avatar-button').onclick();
  assert.ok(!s.drawer().includes('data-account='),'no account to choose');
  assert.ok(s.drawer().includes(copy.recordOffline));
});
test('offline after online: the drawer lists only the person read before, and a failed switch shows no stale record',async()=>{
  const s=await boot({hash:'#/cv'});
  assert.ok(s.cvView().includes(thandiTitle()));
  s.net.online=false;
  // The server is gone and app.js has noticed (a failed review announces offline through yocv:draft, as goOffline does).
  s.dom.document.dispatchEvent({type:'yocv:draft',detail:{step:0,accepted:0,ready:false,dirty:false,offline:true}});
  assert.equal(s.el('footer-mode').textContent,copy.modeOffline+'.');
  s.el('login-button').onclick(); // the account list in the drawer
  assert.deepEqual([...s.drawer().matchAll(/data-account="([\w-]+)"/g)].map(m=>m[1]),['thandi'],'one account offline');
  assert.ok(s.drawer().includes('data-action="switch"'),'the record in memory keeps the Switch account pill');
  s.YoID.signIn('sipho');
  await settle();
  assert.equal(s.YoID.person().id,'sipho');assert.equal(s.YoID.record(),null);
  assert.ok(!s.cvView().includes(thandiTitle()),'the previous record left the CV tab');
  assert.ok(s.cvView().includes(copy.recordOffline),'the CV tab shows its offline step 1');
  assert.ok(!s.cvView().includes(records.thandi.user.displayName),'no previous contact name');
  s.show('#/skills');
  assert.ok(s.tabView().includes(copy.recordOffline)&&!s.tabView().includes('Cosmetics'),'no previous skills');
  assert.equal(s.el('footer-mode').textContent,copy.modeOffline+'.');
});
test('between sign-in and the record the CV tab shows the reading note, not the previous person',async()=>{
  const s=await boot({hash:'#/cv'});
  assert.ok(s.cvView().includes(thandiTitle()));
  s.net.hold=true;
  const done=s.YoID.signIn('sipho');
  await settle();
  assert.ok(s.net.release,'the record read is pending');
  assert.equal(s.YoID.person().id,'sipho');
  assert.ok(s.cvView().includes(copy.reading)&&!s.cvView().includes(thandiTitle()),'no stale ticks while reading');
  s.show('#/skills');
  assert.ok(s.tabView().includes(copy.reading)&&!s.tabView().includes('Cosmetics'),'the record tabs say the shell is reading');
  s.show('#/cv');
  s.net.release();await done;await settle();
  assert.equal(s.YoID.record(),records.sipho);
  assert.ok(s.cvView().includes(copy.recordEmpty)&&!s.cvView().includes(thandiTitle()));
});
test('Switch account keeps keyboard focus inside the drawer on open and on close',async()=>{
  const s=await boot({app:'stub'});
  s.el('avatar-button').onclick();
  assert.equal(s.el('user-drawer').open,true);
  s.dom.click(button({action:'switch'}));
  assert.ok(s.drawer().includes('class="account-row current"'),'the list opened');
  assert.ok(s.dom.activeElement?.tag?.includes('account-row current')&&s.dom.activeElement.tag.includes('data-account="thandi"'),'focus on the current row, got '+s.dom.activeElement?.tag);
  s.dom.click(button({action:'switch'}));
  assert.ok(!s.drawer().includes('account-row'),'the list closed');
  assert.ok(s.dom.activeElement?.tag?.includes('data-action="switch"'),'focus back on the Switch account pill, got '+s.dom.activeElement?.tag);
});
