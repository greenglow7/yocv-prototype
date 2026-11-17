'use strict';
/* Reply by Voice routes (spec 9.5, plan Tasks 9 and 10), delegated from createCardRouter. handle(req,res,url)
   returns false when the request is not a reply route, otherwise a promise that resolves to true once the
   response is sent.
     POST /api/reply/parse                {text} -> {jobPostId, parsed, flags, refusal, warning, documents, messages}
     POST /api/reply/draft                {cardId, cardToken, jobPostId, text, lang, documentAnswer, clipIds} -> {replyId, lines, messages, rejected}
     POST /api/reply/:replyId/edit        {cardId, cardToken, line, text} -> {ok, lines} | {ok:false, reason}
     POST /api/reply/:replyId/confirm     {cardId, cardToken, lines, lang} -> {forward} | {forward:null, lines, notTranslated:true}
     POST /api/reply/:replyId/forwarded   {cardId, cardToken} -> {forwardedAt}, set once
     GET  /r/:replyId                     the reply page: the lines, clip links, private headers, honest footer
   The routes are thin: they read the body, check the card token and call createReplyService, so the WhatsApp
   handler (Task 16) calls the same functions. A model call goes through system.withSlot, the router's in-flight
   guard, and a full guard answers 503 busy. A refusal stores no post and logs parser_refused with its reason.
   Every reply route answers 404 "No card with this code" unless the card token matches. */
const {parsePost,docMessages,isMediaOnly,extractAnswers,postOrganisations,answersText,chooseExperience,buildReplyLines,fitReply,smsReply,editLine,detectDocuments,MAX_CLIPS}=require('./reply.js');
const {t,LANGS}=require('./copy.js');
const {STRINGS}=require('./render.js');
const {validId,secretsMatch}=require('./store.js');
const {cardFields}=require('./events.js');
const {computeFlags,burstHeld,workerEdges,cardCreatedMs}=require('./flags.js');
const {replyPage,errorPage}=require('./pages.js');
const {sendPrivateJSON,sendPage}=require('./vouch-routes.js');

const REPLY_API=/^\/api\/reply\/([A-Z2-9]{10})\/(edit|confirm|forwarded)$/;
const REPLY_PAGE=/^\/r\/([A-Z2-9]{10})$/;
const isPlainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=v=>typeof v==='string'?v:'';
const list=v=>Array.isArray(v)?v:[];
const iso=ms=>new Date(ms).toISOString();
function sendError(res,status,code,message,retryable=false){sendPrivateJSON(res,status,{error:{code,message,retryable}});}
function fail(status,code,message){const err=new Error(message);err.status=status;err.code=code;return err;}

function createReplyService(system){
  const {events,store}=system;
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

  async function draft({cardId,jobPostId,text,audio,lang,documentAnswer,clipIds,channel='web'}={}){
    void audio; // a voice note arrives with Task 11; this task drafts from typed text
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
      generation:{mode:ex.mode,rejected:ex.rejected}});
    events.log('reply_drafted',{...cardFields(entry),replyId,jobPostId:post.jobPostId,channel});
    const L=(key,vars)=>t(key,language,vars);
    const messages=[...(down?[L('voiceDown')]:[]),L('hereIsReply'),...lines,
      ...(documents.length>2?[L('tooManyDocs',{item1:items[0],item2:items[1]})]:[]),menuFor(record,language),...(system.liveModel?[]:[L('sampleMode')])];
    return {replyId,lines,messages,rejected:ex.rejected};
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
    const next=system.replyStore.update(replyId,()=>({...r.reply,confirmedAt:null,confirmedLang:null}));
    return {ok:true,lines:next.linesInSourceLang};
  }
  // The worker confirms the own-language lines verbatim; the one-SMS reply is frozen then.
  function confirm(replyId,lines,lang,{cardId,channel='web'}={}){
    const entry=liveCard(cardId),reply=ownReply(replyId,entry.cardId),nowMs=system.now();
    const own=list(reply.linesInSourceLang);
    if(!Array.isArray(lines)||lines.length!==own.length||lines.some((l,i)=>l!==own[i]))throw fail(409,'lines_changed','The lines changed. Read them again.');
    const {files,flags}=vouchContext(entry.cardId,nowMs);
    const sms=smsReply({card:entry.record,vouches:files,publicUrl:system.publicUrl,nowMs,flags});
    system.replyStore.update(replyId,r=>{r.confirmedLang=LANGS.includes(lang)?lang:r.lang;r.confirmedAt=iso(nowMs);r.sms=sms;});
    events.log('reply_confirmed',{...cardFields(entry),replyId,channel});
    if(reply.lang==='en'&&Array.isArray(reply.lines))return {forward:t('forwardThis')+'\n'+reply.lines.join('\n')};
    return {forward:null,lines:own,notTranslated:true};
  }
  function forwarded(replyId,{cardId}={}){
    const entry=liveCard(cardId);
    ownReply(replyId,entry.cardId);
    const r=system.replyStore.update(replyId,x=>{if(!x.forwardedAt)x.forwardedAt=iso(system.now());});
    return {forwardedAt:r.forwardedAt};
  }
  // The reply page's clips: only lines still live with a released clip (a withdrawal holds at read time).
  function pageClips(reply,nowMs){
    return list(reply.clipIds).map(id=>system.vouchStore.get(id)).filter(f=>f?.record&&system.vouchStore.isLive(f,nowMs)&&f.record.clip?.url&&!f.record.clip.expired)
      .map(f=>({href:'/v/'+f.record.vouchId+'/clip',text:STRINGS.playClip(f.record.clip.seconds,Math.round(Number(f.record.clip.bytes||0)/1024))}));
  }
  return {parse,draft,edit,confirm,forwarded,pageClips,organisationsOf};
}

function createReplyRouter(system){
  const readJSONBody=req=>require('../../server.js').readJSONBody(req);
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
  const svc=()=>system.replyService;
  const apiDraft=(req,res)=>withCard(req,res,p=>svc().draft({cardId:p.cardId,jobPostId:str(p.jobPostId),text:p.text,lang:p.lang,documentAnswer:p.documentAnswer,clipIds:p.clipIds}));
  function apiReply(req,res,replyId,action){
    if(action==='edit')return withCard(req,res,p=>svc().edit(replyId,p.line,str(p.text),{cardId:p.cardId}));
    if(action==='confirm')return withCard(req,res,p=>svc().confirm(replyId,p.lines,p.lang,{cardId:p.cardId}));
    return withCard(req,res,p=>svc().forwarded(replyId,{cardId:p.cardId}));
  }
  function page(res,replyId){
    const reply=system.replyStore.get(replyId),entry=reply?system.store.get(reply.cardId):null;
    if(!reply||!entry?.record)return sendPage(res,404,errorPage({message:'No reply with this id.',sampleMode}));
    if(entry.withdrawnAt)return sendPage(res,410,errorPage({message:t('cardWithdrawn'),sampleMode}));
    sendPage(res,200,replyPage({reply,firstName:entry.record.user?.firstName||'',clips:svc().pageClips(reply,system.now()),sampleMode}));
  }
  function handle(req,res,url){
    const pathname=url.pathname,method=req.method;
    const wrap=p=>Promise.resolve(p).then(()=>true);
    const notAllowed=()=>wrap(sendError(res,405,'method_not_allowed','Method not allowed.'));
    if(pathname==='/api/reply/parse')return method==='POST'?wrap(apiParse(req,res)):notAllowed();
    if(pathname==='/api/reply/draft')return method==='POST'?wrap(apiDraft(req,res)):notAllowed();
    const api=REPLY_API.exec(pathname);
    if(api)return method==='POST'?wrap(apiReply(req,res,api[1],api[2])):notAllowed();
    const r=REPLY_PAGE.exec(pathname);
    if(r)return method==='GET'||method==='HEAD'?wrap(page(res,r[1])):notAllowed();
    if(pathname.startsWith('/r/'))return wrap(sendPage(res,404,errorPage({message:'No reply with this id.',sampleMode})));
    return false;
  }
  return {handle};
}

module.exports={createReplyService,createReplyRouter};
