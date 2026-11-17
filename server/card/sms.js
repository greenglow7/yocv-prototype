'use strict';
/* The SMS handler (spec 7.3, 9.5). One entry point for the gateway webhook and the simulator. Every call
   normalises the sender (a + number needs no country; a local one is read with yovouch.smsCountry), tells the
   outbox it texted first, and passes every reply through outbox.send. Commands bound to the sender: YES <session
   code> (binds a web vouch session, no reply), CODE, VOUCH <ref> <code> (or V), L and REMOVE <vouchId> <secret>.
   The four-message vouch keeps a conversation per sender key in memory for 30 minutes; any other text with no
   conversation gets no reply. REQUEST, STOP, REPLY and the one-question fallback arrive with later tasks.
   Worker variant (spec 7.4, plan Task 13): a VOUCH from a number in numbers/ whose card is not the target runs
   the worker path, with the worker menu, no name step and the voucher card's label in the read-back. */
const {normalisePhone,keyedHash}=require('./vouchers.js');
const {t,LANGS}=require('./copy.js');
const {spokenCode,formatSpoken,counterAt,normaliseCardRef,normaliseSpoken}=require('./vouchcode.js');
const {chipsFor}=require('./vouch-service.js');
const {HOW_OFTEN,HIRE_AGAIN}=require('./vouch-lines.js');
const {isSelfVouch,withdrawnAtOf}=require('./vouches.js');
const {cardFields}=require('./events.js');

const STATE_MS=30*60*1000,THREAD_MS=15*60*1000;
const WHEN=['this month','last month','earlier'],HOW=Object.keys(HOW_OFTEN),HIRE=Object.keys(HIRE_AGAIN);
// Refusals that read as smsCodeWrong (no name before a code matches), and those that count against the sender.
const CODE_WRONG=new Set(['not_found','code_wrong','code_expired','code_used','card_locked','card_withdrawn']);
const SENDER_WRONG=new Set(['not_found','code_wrong','card_locked']);
const NAME=/^\p{L}[\p{L}' -]{0,29}$/u;
const NO_CHIP='\u0000';

// Trim, collapse spaces, upper-case and drop a trailing . ! or , so "yes k7m2px." reads "YES K7M2PX".
function normaliseText(text){return String(text??'').trim().replace(/\s+/g,' ').toUpperCase().replace(/[.!,]+$/,'').trim();}
// The same without the upper-casing, for a first name or the two words.
function cleanText(text){return String(text??'').trim().replace(/\s+/g,' ').replace(/[.!,]+$/,'').trim();}
// A copy string; a chip the trade does not have is dropped with its number ("1 work done 4 other").
function render(key,lang,vars={}){return t(key,lang,vars).replace(new RegExp(' \\d '+NO_CHIP,'g'),'');}
// "1 1 2 1" or "1,1,2,1": Q1 1 to 3 picks a chip (4 is other), Q2 1 to 3, Q3 1 to 4, Q4 1 to 2.
function parseAnswers(text,nChips){
  const parts=String(text).replace(/,/g,' ').trim().split(/\s+/);
  if(parts.length!==4||!parts.every(p=>/^\d$/.test(p)))return null;
  const [a,b,c,d]=parts.map(Number);
  if(!(a===4||(a>=1&&a<=nChips))||b<1||b>3||c<1||c>4||d<1||d>2)return null;
  return {q1:a,when:WHEN[b-1],howOften:HOW[c-1],hireAgain:HIRE[d-1]};
}

function createSmsHandler(system){
  const {yv,outbox,service,codes,store}=system;
  const states=new Map(),threads=new Map();
  const now=()=>system.now();
  const langOf=v=>LANGS.includes(v)?v:'en';
  const e164Of=(raw,country)=>normalisePhone(raw,country)||normalisePhone(raw,yv?.smsCountry);
  const keyOf=(raw,country)=>{const e=e164Of(raw,country);return e?keyedHash(system.hashKey,e):null;};
  const firstOf=entry=>entry?.record?.user?.firstName||'';

  function prune(){
    const at=now();
    for(const [k,s] of states)if(at-s.at>STATE_MS)states.delete(k);
    for(const [k,list] of threads){while(list.length&&at-list[0].at>THREAD_MS)list.shift();if(!list.length)threads.delete(k);}
  }
  function stateOf(key){prune();return states.get(key)||null;}
  // A new conversation replaces the sender's last one and ends its vouch session.
  function begin(key,fields){
    const old=states.get(key);
    if(old?.vouchToken&&old.vouchToken!==fields.vouchToken)system.sessions.delete(old.vouchToken);
    const st={step:null,vouchToken:null,cardId:null,lang:'en',lastPrompt:null,...fields,at:now()};
    states.set(key,st);
    return st;
  }
  function end(key){const st=states.get(key);if(st?.vouchToken)system.sessions.delete(st.vouchToken);states.delete(key);}
  // A reply that L can send again in another language.
  function say(st,key,vars={}){st.lastPrompt={key,vars};return render(key,st.lang,vars);}

  function code(senderKey){
    const cardId=store.indexGet('numbers',senderKey),entry=cardId?store.get(cardId):null;
    if(!entry?.record||entry.withdrawnAt||!entry.vouch?.secret)return [t('smsNoCard','en',{url:system.publicUrl+'/card.html'})];
    const lang=langOf(entry.vouch.lang);
    if(entry.record.user?.phoneNumberConfirmed!==true)return [t('smsNoPhone',lang)];
    const c=spokenCode(entry.vouch.secret,counterAt(now()));
    const st=begin(senderKey,{cardId,lang});
    return [say(st,'smsCode',{spoken:formatSpoken(c),smsId:entry.smsId,code:c,shortcode:yv?.shortcode||'12345',callback:yv?.callbackNumber||''})];
  }

  async function vouch(raw,senderKey,refText,codeText){
    const replyLang=langOf(stateOf(senderKey)?.lang);
    const ref=normaliseCardRef(refText),spoken=normaliseSpoken(codeText);
    const cardId=ref?codes.resolveCard(ref):null,entry=cardId?store.get(cardId):null;
    const wrong=count=>{if(count)codes.recordSenderWrong(senderKey);return [t('smsCodeWrong',replyLang,{first:'the worker'})];};
    if(!entry?.record||!spoken)return wrong(true);
    const e164=e164Of(raw,entry.record.user?.country),voucherKey=keyedHash(system.hashKey,e164);
    const lang=langOf(entry.vouch?.lang),first=firstOf(entry);
    // The sender's own card, from the Yoma-confirmed number index; on another card it is the vouching worker.
    // A local number is read in the target's country first, then in the shortcode's market (Review Focus 2).
    const indexKey=[voucherKey,senderKey].find(k=>store.indexGet('numbers',k)),senderCard=indexKey?store.indexGet('numbers',indexKey):null;
    const worker=Boolean(senderCard)&&senderCard!==cardId;
    const r=await service.open({cardId,proof:{method:'code',code:spoken},voucher:worker?{kind:'worker',cardId:senderCard}:{kind:'customer'},
      voucherKey:worker?indexKey:voucherKey,phoneLast3:e164.slice(-3),channel:'sms',lang});
    if(!r.ok){
      if(CODE_WRONG.has(r.code))return wrong(SENDER_WRONG.has(r.code));
      if(r.code==='voucher_recent'){
        const st=begin(senderKey,{step:'recent',cardId,lang,existingVouchId:r.existingVouchId,voucherKey});
        return [say(st,'recent',{first})];
      }
      end(senderKey);
      return [r.message];
    }
    const chips=chipsFor(entry.record.tradeId).filter(c=>c!=='Other').slice(0,3);
    const st=begin(senderKey,{step:'answers',vouchToken:r.vouchToken,cardId,lang,chips,voucherKey,worker});
    const [chip1=NO_CHIP,chip2=NO_CHIP,chip3=NO_CHIP]=chips.map(c=>c.toLowerCase());
    return [say(st,worker?'smsVouchMenuWorker':'smsVouchMenu',{first,trade:String(entry.record.trade||'').toLowerCase(),chip1,chip2,chip3})];
  }

  function remove(raw,senderKey,vouchId,secret){
    const lang=langOf(stateOf(senderKey)?.lang),nothing=[t('smsNothing',lang)];
    const file=system.vouchStore.get(vouchId);
    if(!file?.record||withdrawnAtOf(file,now()))return nothing;
    const entry=store.get(file.record.cardId);
    if(!file.private?.voucherKey||file.private.voucherKey!==keyOf(raw,entry?.record?.user?.country))return nothing;
    if(!system.vouchStore.withdraw(vouchId,secret,'now').ok)return nothing;
    system.events.log('vouch_withdrawn',{vouchId,...cardFields(entry||{cardId:file.record.cardId}),mode:'now',by:'sms'});
    return [t('smsRemoved',lang)];
  }

  // L, then a digit: the conversation's language, and vouch.lang when the sender owns the card. Resends the last prompt.
  function setLang(raw,senderKey,st,digit){
    const lang=LANGS[digit-1];
    st.lang=lang;st.step=st.prevStep??null;st.prevStep=undefined;
    const session=st.vouchToken?system.sessions.get(st.vouchToken):null;
    if(session)session.lang=lang;
    const entry=st.cardId?store.get(st.cardId):null;
    if(entry?.vouch&&isSelfVouch(entry,keyOf(raw,entry.record?.user?.country)))store.update(st.cardId,e=>{e.vouch.lang=lang;});
    return st.lastPrompt?[render(st.lastPrompt.key,lang,st.lastPrompt.vars)]:[];
  }

  function readback(senderKey,st,first){
    const rec=service.preview(st.vouchToken);
    if(!rec){end(senderKey);return [t('sessionEnded',st.lang,{first})];}
    st.step='confirm';
    return [say(st,'smsReadback',{first,line:rec.line,name:rec.voucher.label})];
  }
  // A refusal from the session (it ended, or the card was withdrawn) ends the conversation.
  function failed(senderKey,st,r,first){
    if(r.code==='session_ended'||r.code==='card_withdrawn'){end(senderKey);return [r.message||t('sessionEnded',st.lang,{first})];}
    return null;
  }

  function step(raw,senderKey,st,cmd,text){
    const entry=st.cardId?store.get(st.cardId):null,first=firstOf(entry),lang=st.lang;
    if(st.step==='answers'){
      const a=parseAnswers(cmd,st.chips.length);
      if(!a)return [render('smsNotUnderstood',lang)];
      if(a.q1===4){st.pending=a;st.step='two_words';return [say(st,'smsTwoWords',{first})];}
      const r=service.setChips(st.vouchToken,{work:st.chips[a.q1-1],when:a.when,howOften:a.howOften,hireAgain:a.hireAgain});
      if(!r.ok)return failed(senderKey,st,r,first)||[render('smsNotUnderstood',lang)];
      if(st.worker)return readback(senderKey,st,first);   // a worker line shows the card, never a name with digits
      st.step='name';
      return [say(st,'smsShowName')];
    }
    if(st.step==='two_words'){
      const a=st.pending;
      const r=service.setChips(st.vouchToken,{work:'Other',other:text,when:a.when,howOften:a.howOften,hireAgain:a.hireAgain});
      if(!r.ok)return failed(senderKey,st,r,first)||[say(st,'smsTwoWords',{first})];
      if(st.worker)return readback(senderKey,st,first);
      st.step='name';
      return [say(st,'smsShowName')];
    }
    if(st.step==='name'){
      const r=cmd==='NONE'?service.setDisclose(st.vouchToken,{showMe:'customer'})
        :NAME.test(text)?service.setDisclose(st.vouchToken,{showMe:'name',firstName:text}):{ok:false};
      if(!r.ok)return failed(senderKey,st,r,first)||[say(st,'smsShowName')];
      return readback(senderKey,st,first);
    }
    if(st.step==='confirm'){
      if(cmd==='NO'){end(senderKey);return [t('smsCancelled',lang)];}
      if(cmd!=='YES')return [render(st.lastPrompt.key,lang,st.lastPrompt.vars)];
      const r=service.confirm(st.vouchToken,{adult:true,consent:true});
      end(senderKey);
      if(!r.ok)return [r.message||t('sessionEnded',lang,{first})];
      return [t('smsPublished',lang,{vouchId:r.vouchId,secret:r.withdrawSecret})];
    }
    if(st.step==='recent'){
      if(cmd==='NO'){end(senderKey);return [t('smsCancelled',lang)];}
      if(cmd!=='YES')return [render(st.lastPrompt.key,lang,st.lastPrompt.vars)];
      const r=service.addVisit({vouchId:st.existingVouchId,voucherKey:st.voucherKey,channel:'sms',lang});
      end(senderKey);
      return [r.ok?t('visitAdded',lang,{first}):r.message];
    }
    return [];
  }

  // The replies for one inbound text. raw is the sender as the gateway gave it; senderKey its keyed hash.
  async function route(raw,senderKey,cmd,text){
    if(codes.senderBlocked(senderKey))return [];
    let m;
    if((m=/^YES ([A-Z2-9]{6})$/.exec(cmd))){service.bindBySms(raw,m[1]);return [];}
    if(cmd==='CODE')return code(senderKey);
    if((m=/^(?:VOUCH|V) (\S+) (.+)$/.exec(cmd)))return vouch(raw,senderKey,m[1],m[2]);
    if((m=/^REMOVE (\S+) (\S+)$/.exec(cmd)))return remove(raw,senderKey,m[1],m[2]);
    const st=stateOf(senderKey);
    if(cmd==='L'){
      const s=st||begin(senderKey,{});
      if(s.step!=='lang'){s.prevStep=s.step;s.step='lang';}
      return [t('langMenu',s.lang)];
    }
    if(!st)return [];
    st.at=now();
    if(st.step==='lang')return /^[1-5]$/.test(cmd)?setLang(raw,senderKey,st,Number(cmd)):[t('langMenu',st.lang)];
    return step(raw,senderKey,st,cmd,text);
  }

  async function handle({from,text,channel='sms'}={}){
    void channel; // the WhatsApp handler (Task 16) reuses this entry point
    const raw=String(from??''),e164=normalisePhone(raw,yv?.smsCountry);
    if(!e164)return {replies:[]};
    outbox.inbound(e164);
    const replies=await route(raw,keyedHash(system.hashKey,e164),normaliseText(text),cleanText(text));
    for(const msg of replies)outbox.send(e164,msg);
    // The simulator keeps the thread in memory for 15 minutes, like the outbox, so /demo/phone can list it.
    if(yv?.sim){
      const list=threads.get(e164)||[];
      list.push({dir:'in',text:String(text??''),at:now()},...replies.map(r=>({dir:'out',text:r,at:now()})));
      threads.set(e164,list);
    }
    return {replies};
  }
  // The simulated thread for a typed sample number, oldest first.
  function thread(from){
    prune();
    const e164=normalisePhone(String(from??''),yv?.smsCountry);
    return e164?(threads.get(e164)||[]).map(({dir,text})=>({dir,text})):[];
  }
  return {handle,thread};
}

module.exports={createSmsHandler,normaliseText,parseAnswers};
