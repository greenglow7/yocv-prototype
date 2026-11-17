'use strict';
/* Reply by Voice routes (spec 9.5, plan Task 9), delegated from createCardRouter. handle(req,res,url) returns
   false when the request is not a reply route, otherwise a promise that resolves to true once the response is sent.
     POST /api/reply/parse  {text} -> {jobPostId, parsed, flags, refusal, warning, documents, messages}
   The routes are thin: they read the body and call createReplyService, so the WhatsApp handler (Task 16) calls
   the same functions. A model call goes through system.withSlot, the router's in-flight guard, and a full guard
   answers 503 busy. A refusal stores no post and logs parser_refused with its reason. */
const {parsePost,docMessages,isMediaOnly}=require('./reply.js');
const {t}=require('./copy.js');
const {sendPrivateJSON}=require('./vouch-routes.js');

const isPlainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function sendError(res,status,code,message,retryable=false){sendPrivateJSON(res,status,{error:{code,message,retryable}});}

function createReplyService(system){
  const {events}=system;
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
  return {parse};
}

function createReplyRouter(system){
  const readJSONBody=req=>require('../../server.js').readJSONBody(req);
  async function apiParse(req,res){
    let payload;
    try{payload=await readJSONBody(req);}
    catch(err){
      if(err?.code==='invalid_input'||err?.name==='InputError')return sendError(res,400,'invalid_input',err.message);
      throw err;
    }
    if(!isPlainObject(payload))return sendError(res,400,'invalid_input','Send a JSON object.');
    try{sendPrivateJSON(res,200,await system.replyService.parse(typeof payload.text==='string'?payload.text:''));}
    catch(err){
      if(err?.code==='busy')return sendError(res,503,'busy',err.message,true);
      throw err;
    }
  }
  function handle(req,res,url){
    const wrap=p=>Promise.resolve(p).then(()=>true);
    if(url.pathname==='/api/reply/parse')return wrap(req.method==='POST'?apiParse(req,res):sendError(res,405,'method_not_allowed','Method not allowed.'));
    return false;
  }
  return {handle};
}

module.exports={createReplyService,createReplyRouter};
