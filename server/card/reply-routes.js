'use strict';
/* Reply by Voice routes (spec 9.5, plan Tasks 9 and 10), delegated from createCardRouter. handle(req,res,url)
   returns false when the request is not a reply route, otherwise a promise that resolves to true once the
   response is sent.
     POST /api/reply/parse                {text} -> {jobPostId, parsed, flags, refusal, warning, documents, messages}
     POST /api/reply/draft                {cardId, cardToken, jobPostId, text, lang, documentAnswer, clipIds} -> {replyId, lines, messages, rejected}
                                          or a voice note (audio/webm or audio/mp4, headers x-card-id, x-card-token,
                                          x-job-post-id, x-lang, x-clip-seconds at most 20) -> the same plus {transcript}
     POST /api/reply/:replyId/self-clip   audio, x-card-id, x-card-token, x-clip-seconds at most 16 -> {clipIds, lines}
     POST /api/reply/:replyId/edit        {cardId, cardToken, line, text} -> {ok, lines} | {ok:false, reason}
     POST /api/reply/:replyId/confirm     {cardId, cardToken, lines, lang} -> {forward} for English; otherwise
                                          {backTranslation, messages:['Is this what you said?']} | {forward:null, lines, notTranslated:true}
     POST /api/reply/:replyId/back-translation {cardId, cardToken, answer} -> yes {forward}; first no {messages:[menu]};
                                          second no {forward:null, notTranslated:true} (plan Task 15)
     POST /api/reply/:replyId/forwarded   {cardId, cardToken} -> {forwardedAt}, set once
     GET  /r/:replyId                     the reply page: the lines, clip links, private headers, honest footer;
                                          404 until the worker confirms, and line 2 turns neutral once its vouch is gone
     GET  /r/:replyId/clip                the self clip in its stored type, linked on /r/ as "Said by <first>" (plan
                                          addition); 404 until the worker confirms, 410 once the card is withdrawn
   The routes are thin: they read the body, check the card token and call createReplyService, so the WhatsApp
   handler (Task 16) calls the same functions. A model call goes through system.withSlot, the router's in-flight
   guard, and a full guard answers 503 busy. A refusal stores no post and logs parser_refused with its reason.
   Every reply route answers 404 "No card with this code" unless the card token matches.
   Translation (spec 6.4, plan Task 15): the English waits in the in-memory pendingEnglish map for 30 minutes and is
   written to the record and returned only after the back-translation YES. An edit, a new self clip or a new
   confirm drops it. */
const {translateReply,parsePost,docMessages,isMediaOnly,extractAnswers,postOrganisations,answersText,chooseExperience,buildReplyLines,line6,fitReply,smsReply,editLine,detectDocuments,MAX_CLIPS}=require('./reply.js');
const {audioType,isAudio,clipSeconds,CONFIDENCE_FLOOR,MAX_AUDIO_BYTES}=require('./transcribe.js');
const {t,LANGS}=require('./copy.js');
const {STRINGS}=require('./render.js');
const {validId,secretsMatch}=require('./store.js');
const {cardFields}=require('./events.js');
const {computeFlags,burstHeld,workerEdges,cardCreatedMs}=require('./flags.js');
const {replyPage,errorPage}=require('./pages.js');
const {sendPrivateJSON,sendPage}=require('./vouch-routes.js');

const REPLY_API=/^\/api\/reply\/([A-Z2-9]{10})\/(edit|confirm|back-translation|forwarded|self-clip)$/;
const REPLY_PAGE=/^\/r\/([A-Z2-9]{10})(\/clip)?$/;
const MAX_NOTE_SECONDS=20,MAX_SELF_SECONDS=16,PENDING_MS=30*60000;
const isPlainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=v=>typeof v==='string'?v:'';
const list=v=>Array.isArray(v)?v:[];
const iso=ms=>new Date(ms).toISOString();
function sendError(res,status,code,message,retryable=false){sendPrivateJSON(res,status,{error:{code,message,retryable}});}
function fail(status,code,message){const err=new Error(message);err.status=status;err.code=code;return err;}

function createReplyService(system){
  const {events,store}=system;
  // replyId -> {english, at}: the English before the back-translation YES, never on disk (spec 6.4).
  const pendingEnglish=new Map();
  function pendingFor(replyId){
    const nowMs=system.now();
    for(const [id,p] of pendingEnglish)if(nowMs-p.at>PENDING_MS)pendingEnglish.delete(id);
    return pendingEnglish.get(replyId)||null;
  }
  // A non-English reply whose lines changed: the English and the back-translation go, until the next YES.
  const untranslated=r=>r.lang==='en'?{}:{lines:null,translation:{...(r.translation||{}),backTranslation:null,confirmedBySpeaker:false,confirmedAt:null}};
  function refused(refusal,channel,{parsed=null,flags=null}={}){
    events.log('parser_refused',{reason:refusal.reason,channel});
    return {jobPostId:null,parsed,flags,refusal,warning:null,documents:flags?.documents||[],messages:[refusal.message]};
  }
  async function parse(text,{channel='web',lang='en'}={}){
    if(isMediaOnly(text))return refused({reason:'cannot_read',message:t('cannotRead',lang)},channel);
    const run=()=>parsePost(text,{provider:system.liveModel?system.provider:null,now:system.now});
    const r=system.liveModel?await system.withSlot(run):await run();
    if(r.refusal)return refused(r.refusal,channel,{flags:r.flags});
    const jobPostId=system.postStore.create({rawText:text,parsed:r.parsed,flags:r.flags});
    const p=r.parsed,ns=t('notStated',lang),documents=r.flags.documents;
    const messages=[];
    if(r.warning)messages.push(r.warning);
    messages.push(t('postRead',lang,{work:p.work.text||ns,area:p.area.text||ns,pay:p.pay.text||ns,documents:documents.join(', ')||'nothing'}));
    messages.push(...docMessages(documents,lang));
    if(r.mode==='sample')messages.push(t('sampleMode',lang));
    return {jobPostId,parsed:p,flags:r.flags,refusal:null,warning:r.warning,documents,messages};
  }

  // ---- Draft (plan Task 10) ----
  const firstOf=entry=>str(entry?.record?.user?.firstName);
  const langOf=v=>LANGS.includes(v)?v:'en';
  function liveCard(cardId){
    const entry=validId(cardId)?store.get(cardId):null;
    if(!entry?.record)throw fail(404,'not_found',STRINGS.notFound);
    if(entry.withdrawnAt)throw fail(410,'card_withdrawn',t('cardWithdrawn'));
    return entry;
  }
  // The card snapshot's organisation names: each disclosed completion's and skill's organisation (spec 8).
  const organisationsOf=record=>[...new Set([...list(record?.disclosed?.completions).map(c=>str(c?.organizationName)),
    ...list(record?.disclosed?.skills).flatMap(s=>list(s?.organizations).map(o=>str(o?.name)))].filter(Boolean))];
  // The line 5 items of a stored post: the detector's labels, two at most.
  const documentsOf=post=>list(post?.flags?.documents).length?list(post.flags.documents):detectDocuments(post?.rawText);
  function vouchContext(cardId,nowMs){
    return {files:system.vouchStore.listForCard(cardId),flags:computeFlags(workerEdges(system.vouchStore,nowMs),nowMs)};
  }
  // Released, unflagged, live vouch clips, newest first: the default attachment and the allowed choices.
  function clipChoices(entry,files,flags,nowMs){
    const hold=burstHeld(files,cardCreatedMs(entry),nowMs);
    return files.filter(f=>system.vouchStore.isLive(f,nowMs)&&f.record.clip?.url&&!f.record.clip.expired&&!(flags.get(f.record.vouchId)||[]).length&&!hold.has(f.record.vouchId))
      .sort((a,b)=>(Date.parse(b.record.confirmedAt)||0)-(Date.parse(a.record.confirmedAt)||0)).map(f=>f.record.vouchId);
  }
  function menuFor(record,lang){
    const org=str(list(record?.disclosed?.completions)[0]?.organizationName);
    return org?t('replyMenu',lang,{org}):t('replyMenuNoOrg',lang);
  }

  async function draft({cardId,jobPostId,text,lang,documentAnswer,clipIds,channel='web',transcription=null}={}){
    const entry=liveCard(cardId),record=entry.record,first=firstOf(entry),language=langOf(lang),nowMs=system.now();
    const post=validId(jobPostId)?system.postStore.get(jobPostId):null;
    if(!post)throw fail(404,'not_found','No post with this id. Paste the post again.');
    const transcript=str(text).trim();
    if(!transcript)throw fail(400,'invalid_input','Type your answers: how you would get there, when you can start, and the closest work you have done.');
    const organisationNames=organisationsOf(record),base={transcript,post,organisationNames,trade:record.trade};
    let ex,down=false;
    if(system.liveModel){
      try{ex=await system.withSlot(()=>extractAnswers({...base,provider:system.provider}));}
      catch(err){if(err?.code==='busy')throw err;down=true;ex=await extractAnswers(base);}
    }else ex=await extractAnswers(base);
    const answers=answersText(ex);
    const {files,flags}=vouchContext(entry.cardId,nowMs);
    const experience=chooseExperience({card:record,vouches:files,post,firstName:first,jobPostId:post.jobPostId,nowMs,answers,flags});
    const documents=documentsOf(post),items=documents.slice(0,2);
    const answer=Object.fromEntries(items.map(item=>[item,isPlainObject(documentAnswer)&&documentAnswer[item]==='yes'?'yes':'not stated']));
    const choices=clipChoices(entry,files,flags,nowMs);
    const clips=Array.isArray(clipIds)?[...new Set(clipIds.filter(id=>choices.includes(id)))].slice(0,MAX_CLIPS):choices.slice(0,MAX_CLIPS);
    const lines=fitReply(buildReplyLines({card:record,firstName:first,answers,experience,documents:items,documentAnswer:answer,clipCount:clips.length,
      cardUrl:system.publicUrl+'/c/'+entry.cardId}));
    const warnings=[...(documents.length?['document_requested']:[]),...(post.flags?.feeWarning?['fee_warning']:[])];
    const replyId=system.replyStore.create({cardId:entry.cardId,jobPostId:post.jobPostId,post:{rawText:post.rawText,parsed:post.parsed},transcript,
      lines:language==='en'?lines:null,linesInSourceLang:lines,
      sources:['card+transcript',experience.sourceTag,'record','transcript',documents.length?'tap':'record','record'],
      lang:language,confirmedLang:null,translation:{by:'none',from:language,backTranslation:null,confirmedBySpeaker:false,confirmedAt:null},
      clipIds:clips,warnings,edits:[],sms:null,createdAt:iso(nowMs),confirmedAt:null,forwardedAt:null,
      generation:{mode:ex.mode,rejected:ex.rejected,...(transcription?{transcription}:{})}});
    events.log('reply_drafted',{...cardFields(entry),replyId,jobPostId:post.jobPostId,channel});
    const L=(key,vars)=>t(key,language,vars);
    const messages=[...(down?[L('voiceDown')]:[]),L('hereIsReply'),...lines,
      ...(documents.length>2?[L('tooManyDocs',{item1:items[0],item2:items[1]})]:[]),menuFor(record,language),...(system.liveModel?[]:[L('sampleMode')])];
    return {replyId,lines,messages,rejected:ex.rejected};
  }

  // A voice note: transcribed inside the in-flight guard, then drafted from the transcript. Its raw audio is kept
  // as <replyId>.raw.<ext> until the worker confirms (spec 9.7). Template mode or a failure asks for typed answers;
  // a confidence under 0.6 asks again (spec 8). At 20 seconds the recorder stopped, so messages start with cutAt20.
  async function draftAudio({cardId,jobPostId,audio,contentType,seconds,lang,channel='web'}={}){
    const entry=liveCard(cardId),language=langOf(lang);
    if(!(validId(jobPostId)&&system.postStore.get(jobPostId)))throw fail(404,'not_found','No post with this id. Paste the post again.');
    const tr=system.transcriber;
    if(!tr||tr.template)return {replyId:null,transcript:null,typed:true,messages:[t('sampleMode',language)]};
    let r;
    try{r=await system.withSlot(()=>tr.transcribe({audio,contentType,lang:language}));}
    catch(err){
      if(err?.code==='busy')throw err;
      events.log('transcription_failed',{lang:language,channel,...cardFields(entry)});
      return {replyId:null,transcript:null,typed:true};
    }
    const said=str(r?.text).trim();
    if(!said||(r.confidence!=null&&r.confidence<CONFIDENCE_FLOOR))return {message:t('hearBadly',language)};
    const d=await draft({cardId,jobPostId,text:said,lang:language,channel,transcription:'model'});
    system.replyStore.saveClip(d.replyId,{data:audio,contentType},{raw:true});
    return {...d,transcript:said,unclear:list(r.unclear),confidence:r.confidence??null,
      messages:[...(seconds>=MAX_NOTE_SECONDS?[t('cutAt20',language)]:[]),...d.messages]};
  }
  // The worker's own clip (spec 6.1 line 6): replaces any earlier one, joins clipIds as self:<replyId> on top of
  // the vouch clips, and rebuilds line 6's count. Line 6 changed, so the confirmation reopens.
  function selfClip(replyId,{cardId,audio,contentType,seconds}={}){
    const entry=liveCard(cardId),reply=ownReply(replyId,entry.cardId);
    const saved=system.replyStore.saveClip(replyId,{data:audio,contentType});
    const self='self:'+replyId,clipIds=[...list(reply.clipIds).filter(id=>id!==self),self];
    const six=line6(clipIds.length,system.publicUrl+'/c/'+entry.cardId,firstOf(entry));
    const swap=v=>Array.isArray(v)&&v.length===6?v.map((l,i)=>i===5?six:l):v;
    pendingEnglish.delete(replyId);
    const next=system.replyStore.update(replyId,r=>({...r,clipIds,lines:swap(r.lines),linesInSourceLang:swap(r.linesInSourceLang),
      selfClip:{url:'/r/'+replyId+'/clip',contentType:saved.contentType,seconds,bytes:saved.bytes,sha256:saved.sha256},confirmedAt:null,confirmedLang:null,...untranslated(r)}));
    return {clipIds:next.clipIds,lines:next.linesInSourceLang};
  }

  function ownReply(replyId,cardId){
    const reply=validId(replyId)?system.replyStore.get(replyId):null;
    if(!reply||reply.cardId!==cardId)throw fail(404,'not_found','No reply with this id.');
    return reply;
  }
  // Re-runs the checks on that line only; any edit reopens the confirmation (plan decision).
  function edit(replyId,line,text,{cardId}={}){
    const entry=liveCard(cardId),reply=ownReply(replyId,entry.cardId);
    const r=editLine(reply,line,text,{firstName:firstOf(entry),organisationNames:[...organisationsOf(entry.record),...postOrganisations(reply.post)],documents:documentsOf(reply.post).slice(0,2),nowMs:system.now()});
    if(!r.ok)return r;
    pendingEnglish.delete(replyId);
    const next=system.replyStore.update(replyId,()=>({...r.reply,confirmedAt:null,confirmedLang:null,...untranslated(r.reply)}));
    return {ok:true,lines:next.linesInSourceLang};
  }
  // The worker confirms the own-language lines verbatim; the one-SMS reply is frozen then. English goes out at
  // once. Any other language is translated inside the in-flight guard and the back-translation is returned; with no
  // model, a failed check, a provider error or after a second NO the own-language lines stay, Not translated.
  async function confirm(replyId,lines,lang,{cardId,channel='web'}={}){
    const entry=liveCard(cardId),reply=ownReply(replyId,entry.cardId),nowMs=system.now();
    const own=list(reply.linesInSourceLang);
    if(!Array.isArray(lines)||lines.length!==own.length||lines.some((l,i)=>l!==own[i]))throw fail(409,'lines_changed','The lines changed. Read them again.');
    const english=reply.lang==='en',confirmedLang=LANGS.includes(lang)?lang:reply.lang;
    pendingEnglish.delete(replyId);
    let tr=null;
    if(!english&&system.liveModel&&(Number(reply.translation?.noCount)||0)<2){
      try{tr=await system.withSlot(()=>translateReply({...reply,confirmedLang},{provider:system.provider,transcript:reply.transcript,firstName:firstOf(entry)}));}
      catch(err){if(err?.code==='busy')throw err;tr=null;}
    }
    const {files,flags}=vouchContext(entry.cardId,nowMs);
    const sms=smsReply({card:entry.record,vouches:files,publicUrl:system.publicUrl,nowMs,flags});
    system.replyStore.update(replyId,r=>{
      r.confirmedLang=confirmedLang;r.confirmedAt=iso(nowMs);r.sms=sms;
      if(!english){r.lines=null;r.translation={...(r.translation||{}),by:tr?'model':'none',from:r.lang,backTranslation:tr?tr.back:null,confirmedBySpeaker:false,confirmedAt:null};}
    });
    system.replyStore.deleteRaw(replyId); // raw voice-note audio goes once the reply is confirmed (spec 9.7)
    events.log('reply_confirmed',{...cardFields(entry),replyId,channel});
    if(english&&Array.isArray(reply.lines))return {forward:t('forwardThis')+'\n'+reply.lines.join('\n')};
    if(!tr)return {forward:null,lines:own,notTranslated:true};
    pendingEnglish.set(replyId,{english:tr.english,at:nowMs});
    return {backTranslation:tr.back,messages:[t('isThisWhat',reply.lang)]};
  }
  // The back-translation answer (spec 7.6 step 5). YES writes the waiting English and returns the forward text; the
  // first NO goes back to the edit loop (the page closes until the next confirm); the second NO ends untranslated.
  async function backTranslate(replyId,answer,{cardId}={}){
    const entry=liveCard(cardId),reply=ownReply(replyId,entry.cardId),nowMs=system.now();
    const a=str(answer).trim().toLowerCase().replace(/[\s.!]+$/,'');
    const said=a==='yes'||a==='y'||a==='1'?'yes':a==='no'||a==='n'||a==='2'?'no':null;
    if(!said)throw fail(400,'invalid_input','Answer yes or no.');
    const tr=reply.translation||{},waiting=pendingFor(replyId);
    if(reply.lang==='en'||!reply.confirmedAt||!Array.isArray(tr.backTranslation)||!waiting)throw fail(409,'not_pending','Nothing is waiting for your answer. Confirm the lines again.');
    pendingEnglish.delete(replyId);
    if(said==='yes'){
      system.replyStore.update(replyId,r=>{r.lines=waiting.english.slice();r.translation={...r.translation,confirmedBySpeaker:true,confirmedAt:iso(nowMs)};});
      return {forward:t('forwardThis',reply.lang)+'\n'+waiting.english.join('\n')};
    }
    const noCount=(Number(tr.noCount)||0)+1;
    if(noCount>=2){
      system.replyStore.update(replyId,r=>{r.lines=null;r.translation={...r.translation,by:'none',backTranslation:null,confirmedBySpeaker:false,noCount:2};});
      return {forward:null,notTranslated:true};
    }
    system.replyStore.update(replyId,r=>{r.lines=null;r.confirmedAt=null;r.confirmedLang=null;r.translation={...r.translation,backTranslation:null,noCount};});
    return {messages:[menuFor(entry.record,reply.lang)]};
  }
  function forwarded(replyId,{cardId}={}){
    const entry=liveCard(cardId);
    ownReply(replyId,entry.cardId);
    const r=system.replyStore.update(replyId,x=>{if(!x.forwardedAt)x.forwardedAt=iso(system.now());});
    return {forwardedAt:r.forwardedAt};
  }
  // The reply page's clips: only lines still live with a released clip (a withdrawal holds at read time).
  // The worker's own clip follows, labelled "Said by <first>", until scripts/measure.js --delete-clips expires it.
  function pageClips(reply,nowMs,firstName=''){
    const self='self:'+reply.replyId;
    return [...list(reply.clipIds).filter(id=>id!==self).map(id=>system.vouchStore.get(id)).filter(f=>f?.record&&system.vouchStore.isLive(f,nowMs)&&f.record.clip?.url&&!f.record.clip.expired)
      .map(f=>({href:'/v/'+f.record.vouchId+'/clip',text:STRINGS.playClip(f.record.clip.seconds,Math.round(Number(f.record.clip.bytes||0)/1024))})),
      ...(list(reply.clipIds).includes(self)&&reply.selfClip?.url?[{href:'/r/'+reply.replyId+'/clip',text:t('saidBy','en',{first:str(firstName)})}]:[])];
  }
  // The reply page's line 2: when it rests on a vouch or referral that is no longer live (withdrawn, withdrawn
  // quietly past withdrawAfter, or hidden), the line turns neutral at read time (spec 5.6, Review Focus 4).
  function pageReply(reply,firstName,nowMs){
    const m=/^(?:vouch|referral):([A-Z2-9]{10})$/.exec(str(list(reply?.sources)[1]));
    if(!m)return reply;
    const f=system.vouchStore.get(m[1]);
    if(f?.record&&system.vouchStore.isLive(f,nowMs))return reply;
    const neutral=t('line2','en',{text:t('notStated'),source:t('srcStated','en',{first:str(firstName)})});
    const swap=v=>Array.isArray(v)&&v.length>1?v.map((l,i)=>i===1?neutral:l):v;
    const tr=reply.translation;
    return {...reply,lines:swap(reply.lines),linesInSourceLang:swap(reply.linesInSourceLang),
      ...(tr&&Array.isArray(tr.backTranslation)?{translation:{...tr,backTranslation:swap(tr.backTranslation)}}:{})};
  }
  return {parse,draft,draftAudio,selfClip,edit,confirm,backTranslate,forwarded,pageClips,pageReply,organisationsOf};
}

function createReplyRouter(system){
  const readJSONBody=req=>require('../../server.js').readJSONBody(req);
  const readRawBody=(req,maxBytes)=>require('../../server.js').readRawBody(req,maxBytes);
  const sampleMode=!system.liveModel;
  async function body(req,res){
    let payload;
    try{payload=await readJSONBody(req);}
    catch(err){
      if(err?.code==='invalid_input'||err?.name==='InputError'){sendError(res,400,'invalid_input',err.message);return undefined;}
      throw err;
    }
    if(!isPlainObject(payload)){sendError(res,400,'invalid_input','Send a JSON object.');return undefined;}
    return payload;
  }
  // The card token gate every worker action passes; the owner secret never matches it.
  function tokenOk(payload){
    const cardId=str(payload.cardId),entry=validId(cardId)?system.store.get(cardId):null;
    return Boolean(entry?.record)&&secretsMatch(entry.cardTokenHash,str(payload.cardToken));
  }
  async function run(res,fn){
    try{sendPrivateJSON(res,200,await fn());}
    catch(err){
      if(err?.code==='busy')return sendError(res,503,'busy',err.message,true);
      if(err?.status)return sendError(res,err.status,err.code,err.message);
      throw err;
    }
  }
  async function apiParse(req,res){
    const payload=await body(req,res);
    if(payload===undefined)return;
    await run(res,()=>system.replyService.parse(str(payload.text)));
  }
  async function withCard(req,res,fn){
    const payload=await body(req,res);
    if(payload===undefined)return;
    if(!tokenOk(payload))return sendError(res,404,'not_found',STRINGS.notFound);
    await run(res,()=>fn(payload));
  }
  // An audio body: the card comes in headers, since the body is the clip. Answers undefined once it has replied.
  async function withAudio(req,res,maxSeconds,fn){
    let audio;
    try{audio=await readRawBody(req,MAX_AUDIO_BYTES);}
    catch(err){if(err?.code==='invalid_input')return sendError(res,400,'invalid_input',err.message);throw err;}
    const h=req.headers,cardId=str(h['x-card-id']);
    if(!tokenOk({cardId,cardToken:str(h['x-card-token'])}))return sendError(res,404,'not_found',STRINGS.notFound);
    const contentType=audioType(h['content-type']),seconds=clipSeconds(h['x-clip-seconds'],maxSeconds);
    if(!contentType)return sendError(res,400,'invalid_input','Send audio/webm or audio/mp4.');
    if(!seconds)return sendError(res,400,'invalid_input','x-clip-seconds must be a whole number from 1 to '+maxSeconds+'.');
    if(!audio.length)return sendError(res,400,'invalid_input','The clip is empty.');
    await run(res,()=>fn({cardId,audio,contentType,seconds,headers:h}));
  }
  const svc=()=>system.replyService;
  const apiDraftAudio=(req,res)=>withAudio(req,res,MAX_NOTE_SECONDS,a=>svc().draftAudio({cardId:a.cardId,jobPostId:str(a.headers['x-job-post-id']),
    audio:a.audio,contentType:a.contentType,seconds:a.seconds,lang:str(a.headers['x-lang'])}));
  const apiDraft=(req,res)=>withCard(req,res,p=>svc().draft({cardId:p.cardId,jobPostId:str(p.jobPostId),text:p.text,lang:p.lang,documentAnswer:p.documentAnswer,clipIds:p.clipIds}));
  function apiReply(req,res,replyId,action){
    if(action==='self-clip')return withAudio(req,res,MAX_SELF_SECONDS,a=>svc().selfClip(replyId,a));
    if(action==='edit')return withCard(req,res,p=>svc().edit(replyId,p.line,str(p.text),{cardId:p.cardId}));
    if(action==='confirm')return withCard(req,res,p=>svc().confirm(replyId,p.lines,p.lang,{cardId:p.cardId}));
    if(action==='back-translation')return withCard(req,res,p=>svc().backTranslate(replyId,p.answer,{cardId:p.cardId}));
    return withCard(req,res,p=>svc().forwarded(replyId,{cardId:p.cardId}));
  }
  function page(res,replyId){
    const reply=system.replyStore.get(replyId),entry=reply?system.store.get(reply.cardId):null;
    if(!reply||!entry?.record)return sendPage(res,404,errorPage({message:'No reply with this id.',sampleMode}));
    if(entry.withdrawnAt)return sendPage(res,410,errorPage({message:t('cardWithdrawn'),sampleMode}));
    // No line is published before the worker confirms it; an edit clears confirmedAt, so the page closes again.
    if(!reply.confirmedAt)return sendPage(res,404,errorPage({message:'This reply is not confirmed yet.',sampleMode}));
    const first=entry.record.user?.firstName||'',nowMs=system.now();
    sendPage(res,200,replyPage({reply:svc().pageReply(reply,first,nowMs),firstName:first,clips:svc().pageClips(reply,nowMs,first),sampleMode}));
  }
  // The self clip, served as recorded; the same gates as the page, and only while it is still in clipIds.
  function selfClipFile(res,replyId){
    const reply=system.replyStore.get(replyId),entry=reply?system.store.get(reply.cardId):null;
    if(!reply||!entry?.record)return sendError(res,404,'not_found','No reply with this id.');
    if(entry.withdrawnAt)return sendError(res,410,'card_withdrawn',t('cardWithdrawn'));
    const clip=reply.confirmedAt&&list(reply.clipIds).includes('self:'+replyId)?system.replyStore.readClip(replyId):null;
    if(!clip)return sendError(res,404,'not_found','No clip for this reply.');
    res.writeHead(200,{'content-type':clip.contentType,'content-length':clip.data.length,'cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'});
    res.end(clip.data);
  }
  function handle(req,res,url){
    const pathname=url.pathname,method=req.method;
    const wrap=p=>Promise.resolve(p).then(()=>true);
    const notAllowed=()=>wrap(sendError(res,405,'method_not_allowed','Method not allowed.'));
    if(pathname==='/api/reply/parse')return method==='POST'?wrap(apiParse(req,res)):notAllowed();
    if(pathname==='/api/reply/draft')return method==='POST'?wrap(isAudio(req.headers['content-type'])?apiDraftAudio(req,res):apiDraft(req,res)):notAllowed();
    const api=REPLY_API.exec(pathname);
    if(api)return method==='POST'?wrap(apiReply(req,res,api[1],api[2])):notAllowed();
    const r=REPLY_PAGE.exec(pathname);
    if(r)return method==='GET'||method==='HEAD'?wrap(r[2]?selfClipFile(res,r[1]):page(res,r[1])):notAllowed();
    if(pathname.startsWith('/r/'))return wrap(sendPage(res,404,errorPage({message:'No reply with this id.',sampleMode})));
    return false;
  }
  return {handle};
}

module.exports={createReplyService,createReplyRouter};
