'use strict';
/* The WhatsApp handler (spec 7.6, 9.5, plan Task 16). One entry point for the gateway webhook and the simulator.
   Like the SMS handler it normalises the sender, tells the outbox it wrote first, and passes every reply through
   outbox.send. State per sender key lives in memory for 24 hours: {lang, cardId, step, jobPostId, replyId,
   pendingDocs, linkAttempts}.
     First contact: waHello (and waWhichCard when the number is not linked); a digit 1 to 5 sets the language.
     Linking: a number in numbers/ is linked with no step. Otherwise a 6-character reply that matches a card's
       vouch.linkCode (hash compare, 10 minutes, 3 attempts per sender in 10 minutes) stores linkedPhoneHash,
       writes numbers/<hash>.json as {cardId, linked:true} and clears the code.
     A pasted post goes to replyService.parse; each asked document's 1 or 2 fills documentAnswer in turn; the typed
       answer goes to replyService.draft. Menu: 1 confirm (and YES or NO to the back-translation), 2 <n> <text>
       (or <n> <text>) edits a line, 3 waits for a self clip, 4 asks the first disclosed completion's organisation.
     "Send me my words" gives the newest reply's transcript. YES or NO with no step answers a waiting referral.
   With sim every reply list ends with simWa, which is a label and never sent. The simulator response also carries
   step and lang, and jobPostId, replyId, rejected and forward when a step sets them, so thread.js can record, attach
   a self clip and forward. The webhook answers {replies} only. */
const {normalisePhone,keyedHash}=require('./vouchers.js');
const {t,LANGS}=require('./copy.js');
const {STRINGS}=require('./render.js');
const {secretsMatch}=require('./store.js');
const {withdrawnAtOf}=require('./vouches.js');
const {cardFields}=require('./events.js');
const {normaliseText}=require('./sms.js');

const STATE_MS=24*60*60*1000,LINK_MS=10*60*1000,LINK_ATTEMPTS=3;
const LINK_CODE=/^[A-Z2-9]{6}$/;
const EDIT=/^(?:2\s+)?([1-6])\s+(.+)$/s;
const MENU_STEPS=new Set(['menu','self_clip']);

function createWaHandler(system){
  const {yv,outbox,store}=system;
  const states=new Map();
  const now=()=>system.now();
  const langOf=v=>LANGS.includes(v)?v:'en';
  const svc=()=>system.replyService;

  function prune(){const at=now();for(const [k,s] of states)if(at-s.at>STATE_MS)states.delete(k);}
  // The card a sender key names through numbers/ (the Yoma-confirmed number, or a linked one).
  const cardOf=key=>store.indexGet('numbers',key);
  function menu(entry,lang){
    const org=String(entry?.record?.disclosed?.completions?.[0]?.organizationName||'');
    return org?t('replyMenu',lang,{org}):t('replyMenuNoOrg',lang);
  }
  // A thrown service error (status and message) reads as its message; anything else is a server fault.
  async function attempt(fn){
    try{return await fn();}
    catch(err){if(err?.status||err?.code==='busy')return {error:err.message};throw err;}
  }

  // ---- Linking (spec 7.6 step 1) ----
  function link(key,st,cmd){
    const nowMs=now(),code=cmd.replace(/[\s-]/g,'');
    st.linkAttempts=st.linkAttempts.filter(at=>nowMs-at<LINK_MS);
    if(st.linkAttempts.length>=LINK_ATTEMPTS)return [t('waLinkWrong',st.lang)];
    const cardId=store.list().find(id=>{
      const lc=store.get(id)?.vouch?.linkCode;
      return lc&&Date.parse(lc.expiresAt)>nowMs&&secretsMatch(lc.hash,code);
    });
    const entry=cardId?store.get(cardId):null;
    if(!entry?.record||entry.withdrawnAt){st.linkAttempts.push(nowMs);return [t('waLinkWrong',st.lang)];}
    const old=entry.linkedPhoneHash;
    if(old&&old!==key&&old!==entry.ownerPhoneHash&&cardOf(old)===cardId)store.indexDelete('numbers',old);
    store.update(cardId,e=>{e.linkedPhoneHash=key;e.vouch.linkCode=null;});
    store.indexSet('numbers',key,cardId,{linked:true});
    system.events.log('whatsapp_linked',{...cardFields(entry),channel:'wa'});
    st.cardId=cardId;st.linkAttempts=[];
    return [t('waLinked',st.lang)];
  }

  // ---- The reply flow (spec 7.6 steps 2 to 5) ----
  async function parsePost(st,text){
    const r=await attempt(()=>svc().parse(text,{channel:'wa',lang:st.lang}));
    if(r.error)return [r.error];
    if(!r.jobPostId){st.step=null;return r.messages;}                     // a refusal ends the flow
    Object.assign(st,{jobPostId:r.jobPostId,replyId:null,pendingDocs:r.documents.slice(0,2),documentAnswer:{},postAt:now()});
    st.step=st.pendingDocs.length?'docs':'answers';
    st.extra={jobPostId:r.jobPostId};
    return r.messages;
  }
  async function draft(st,text){
    const r=await attempt(()=>svc().draft({cardId:st.cardId,jobPostId:st.jobPostId,text,lang:st.lang,documentAnswer:st.documentAnswer,channel:'wa'}));
    if(r.error)return [r.error];
    st.replyId=r.replyId;st.step='menu';st.pendingDocs=[];
    st.extra={jobPostId:st.jobPostId,replyId:r.replyId,rejected:r.rejected};
    return r.messages;
  }
  // A reply drafted for this post on the web route (the thread page's recorder) joins the chat at its menu.
  function adopt(st){
    if(!st.jobPostId||!['docs','answers'].includes(st.step))return;
    const r=system.replyStore.listAll().filter(x=>x.cardId===st.cardId&&x.jobPostId===st.jobPostId&&x.replyId!==st.replyId&&Date.parse(x.createdAt)>=st.postAt)
      .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    if(r){st.replyId=r.replyId;st.step='menu';st.pendingDocs=[];}
  }
  // The forward text is the instruction, then the six lines as one message the worker forwards alone.
  function forwardOf(st,forward){
    const at=forward.indexOf('\n'),six=forward.slice(at+1);
    st.step=null;st.extra={replyId:st.replyId,forward:six};
    return [forward.slice(0,at),six];
  }
  function notTranslated(st,lines){
    st.step=null;st.extra={replyId:st.replyId,forward:lines.join('\n')};
    return [STRINGS.notTranslated,lines.join('\n')];
  }
  async function confirm(st){
    const reply=system.replyStore.get(st.replyId);
    const r=await attempt(()=>svc().confirm(st.replyId,reply?.linesInSourceLang,st.lang,{cardId:st.cardId,channel:'wa'}));
    if(r.error)return [r.error];
    if(r.forward)return forwardOf(st,r.forward);
    if(r.backTranslation){st.step='back';return [...r.messages,r.backTranslation.join('\n')];}
    return notTranslated(st,r.lines||[]);
  }
  async function backTranslate(st,entry,cmd){
    const r=await attempt(()=>svc().backTranslate(st.replyId,cmd.toLowerCase(),{cardId:st.cardId}));
    if(r.error)return [r.error];
    if(r.forward)return forwardOf(st,r.forward);
    if(r.notTranslated)return notTranslated(st,system.replyStore.get(st.replyId)?.linesInSourceLang||[]);
    st.step='menu';
    return r.messages||[menu(entry,st.lang)];
  }
  async function edit(st,entry,line,text){
    const r=await attempt(()=>svc().edit(st.replyId,Number(line),text,{cardId:st.cardId}));
    if(r.error)return [r.error];
    if(!r.ok)return [t('waEditRefused',st.lang)];
    st.step='menu';
    return [t('hereIsReply',st.lang),...r.lines,menu(entry,st.lang)];
  }
  function refer(st,entry){
    const c=entry.record.disclosed?.completions?.[0];
    if(!c?.organizationName)return [menu(entry,st.lang)];
    const r=system.service.createReferralRequestForCard(st.cardId,{jobPostId:st.jobPostId,evidenceId:c.evidenceId});
    return [r.ok?r.text:r.message];
  }
  async function menuStep(st,entry,cmd,text){
    let m;
    if(cmd==='1')return confirm(st);
    if(cmd==='3'){st.step='self_clip';return [t('waSelfClip',st.lang)];}
    if(cmd==='4')return refer(st,entry);
    if((m=EDIT.exec(text)))return edit(st,entry,m[1],m[2].trim());
    return [st.step==='self_clip'?t('waSelfClip',st.lang):menu(entry,st.lang)];
  }
  function docAnswer(st,cmd){
    const item=st.pendingDocs.shift();
    st.documentAnswer[item]=cmd==='1'?'yes':'not stated';
    if(st.pendingDocs.length)return [t('docAskItem',st.lang,{item:st.pendingDocs[0]})];
    st.step='answers';
    return [];
  }
  function myWords(st){
    const r=system.replyStore.listAll().filter(x=>x.cardId===st.cardId).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
    return [t('yourWords',st.lang,{transcript:String(r?.transcript||'').trim()||t('notStated',st.lang)})];
  }
  function waitingReferral(cardId){
    const nowMs=now();
    return system.vouchStore.listForCard(cardId).filter(f=>f.record?.kind==='organisation'&&!f.record.acceptedAt&&!withdrawnAtOf(f,nowMs)).at(-1)||null;
  }

  async function linked(st,entry,cmd,text){
    if(!entry?.record||entry.withdrawnAt){st.step=null;return [t('cardWithdrawn',st.lang)];}
    if(cmd===t('sendMyWords','en').toUpperCase()||cmd===t('sendMyWords',st.lang).toUpperCase())return myWords(st);
    adopt(st);
    if(st.step==='docs')return cmd==='1'||cmd==='2'?docAnswer(st,cmd):draft(st,text);
    if(st.step==='answers')return draft(st,text);
    if(st.step==='back')return backTranslate(st,entry,cmd);
    if(MENU_STEPS.has(st.step))return menuStep(st,entry,cmd,text);
    if(cmd==='YES'||cmd==='NO'){
      const f=waitingReferral(st.cardId);
      if(f){const r=system.service.acceptReferralForCard(f.record.vouchId,st.cardId,cmd.toLowerCase());return [r.message];}
    }
    return parsePost(st,text);
  }

  async function route(key,cmd,text){
    prune();
    let st=states.get(key);
    if(!st){
      st={lang:'en',cardId:cardOf(key),step:'lang',jobPostId:null,replyId:null,pendingDocs:[],documentAnswer:{},linkAttempts:[],at:now()};
      states.set(key,st);
      return [t('waHello','en'),...(st.cardId?[]:[t('waWhichCard','en')])];
    }
    st.at=now();st.extra=null;
    st.cardId=cardOf(key);
    if(st.step==='lang'){
      st.step=null;
      if(/^[1-5]$/.test(cmd)){st.lang=LANGS[Number(cmd)-1];return st.cardId?[]:[t('waWhichCard',st.lang)];}
    }
    if(!st.cardId)return LINK_CODE.test(cmd.replace(/[\s-]/g,''))?link(key,st,cmd):[t('waWhichCard',st.lang)];
    return linked(st,store.get(st.cardId),cmd,text);
  }

  async function handle({from,text}={},{sim=false}={}){
    const e164=normalisePhone(String(from??''),yv?.smsCountry);
    if(!e164)return {replies:sim?[t('simWa')]:[]};
    outbox.inbound(e164);
    const key=keyedHash(system.hashKey,e164),body=String(text??'').trim();
    const replies=await route(key,normaliseText(body),body);
    for(const msg of replies)outbox.send(e164,msg);
    if(!sim)return {replies};
    const st=states.get(key);
    return {replies:[...replies,t('simWa',langOf(st?.lang))],step:st?.step??null,lang:langOf(st?.lang),...(st?.extra||{})};
  }
  return {handle};
}

module.exports={createWaHandler};
