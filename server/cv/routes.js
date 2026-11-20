'use strict';
/* The YoCV routes (spec 5, 8). Every JSON answer is no-store.
     GET  /api/cv/config        copy, rules, roles, sample accounts, model mode
     GET  /api/cv/menu?role=    the role's skill menu, checked against Yoma's taxonomy
     POST /api/cv/record        reads the Yoma record and opens a session
     POST /api/cv/review        drafts the bullets and combines the skills
     POST /api/cv/check         checks the person's own edit of a bullet or the profile line
     POST /api/cv/skills        recombines the skills with fresh vouches, no model call
     POST /api/cv/docx          the CV the page built, as a Word file. No session, nothing stored.
     POST /api/cv/draft         the RapidPro webhook: no account, no session, S3 skills only. Mounted only with
                                YOCV_SERVICE_SECRET, which x-yocv-service-secret must match.
     GET  /demo/cv-rejected     the prepared refused suggestion (plan Task 17), only when YOVOUCH_SIM=1 and no gateway
                                secret, as every /demo page. It runs tests/fixtures/cv-rejected.json through the real checks.
   Sessions live in memory, 30 minutes from their last use. A session holds the record without the phone number,
   which goes to the browser only for the contact prefill (plan Deviations 9). The place an entry names and its
   confirm choice never reach draftEntries: the place only adds words to mask. Nothing here is saved to disk. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {copyFor,t}=require('./copy.js');
const {RULES,checkBullet,checkProfile}=require('./validate.js');
const {draftEntry,draftEntries}=require('./draft.js');
const {buildSkillMenu,roleList}=require('./menu.js');
const {readCvRecord}=require('./record.js');
const {vouchSources,combineSkills}=require('./skills.js');
const {ProviderError}=require('../providers/errors.js');
const {gatewaySecretOk,sendPage}=require('../card/vouch-routes.js');
const {flowPage}=require('../card/pages.js');
const {createLocalProvider}=require('../providers/local.js');
const {cvToDocx}=require('./docx.js');

const SESSION_TTL_MS=30*60*1000;
const MAX_SESSIONS=1000;
const SESSION_ID=/^[0-9a-f]{24}$/;
const MAX_ENTRIES=3,MAX_NUMBER=100000,MAX_WORDS=40,MAX_WORD=60,MAX_HAND=20,MAX_CHECK_TEXT=1000,MAX_MONTHS=1200;
const CONFIRM_KINDS=['none','person','completion','vouch'];
const COPY=copyFor();
const DOCX_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DRAFT_NOTICE='Draft. Nothing is saved until the person confirms it.';
const PREPARED_FILE=path.join(__dirname,'..','..','tests','fixtures','cv-rejected.json');
const YM=/^(\d{4})-(0[1-9]|1[0-2])$/;
const str=v=>v==null?'':String(v);
const list=v=>Array.isArray(v)?v:[];
const points=s=>[...s].length;
const words=s=>String(s??'').split(/[\s,]+/).filter(Boolean);
const ymOf=v=>{const m=YM.exec(v);return m?+m[1]*12+(+m[2]-1):null;};
const isPlainObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const isUnavailable=err=>err?.code==='yoma_unavailable'||err?.name==='YomaUnavailable';
const isProviderError=err=>err instanceof ProviderError||(err&&typeof err.code==='string'&&err.code.startsWith('provider_'));
const stringList=(v,max,maxLength)=>Array.isArray(v)&&v.length<=max&&v.every(w=>typeof w==='string'&&points(w)<=maxLength);
const fieldsOf=({confirm,...fields})=>fields;
// A trimmed string of min to max code points; absent counts as ''. null when it does not fit.
function text(v,min,max){
  if(v==null)v='';
  if(typeof v!=='string')return null;
  const t=v.trim(),n=points(t);
  return n<min||n>max?null:t;
}

// The Step 2 entries (spec 5). Returns {entries} without place, or {fields:[path], message} for the first field that fails.
function validateEntries(entries,{include,now=Date.now,webhook=false}={}){
  const bad=(field,key)=>({fields:[field],message:COPY[key]});
  if(!Array.isArray(entries)||entries.length<1||entries.length>MAX_ENTRIES)return bad('entries','errEntries');
  const d=new Date(now()),current=d.getUTCFullYear()*12+d.getUTCMonth(),ticked=new Set(list(include?.completions).map(str));
  const out=[];
  for(const [i,e] of entries.entries()){
    const at=k=>'entries.'+i+(k?'.'+k:'');
    if(!isPlainObject(e))return bad(at(''),'errEntries');
    const title=text(e.title,2,60),what=text(e.what,20,400),forWhom=text(e.forWhom,0,80),outcome=text(e.outcome,0,200);
    if(title===null)return bad(at('title'),'errTitle');
    if(text(e.place,0,60)===null)return bad(at('place'),'errPlace');
    if(what===null)return bad(at('what'),'errWhat');
    if(forWhom===null)return bad(at('forWhom'),'errForWhom');
    const frequency=e.frequency??'';
    if(frequency!==''&&!COPY.frequencyChips.includes(frequency))return bad(at('frequency'),'errFrequency');
    const m=e.months??{},start=m.start??'',end=m.end??'';
    if(!isPlainObject(m)||![start,end].every(v=>v===''||(typeof v==='string'&&YM.test(v))))return bad(at('months'),'errMonths');
    const a=ymOf(start),b=ymOf(end);
    if((end&&!start)||a>current||b>current||(b!=null&&a>b))return bad(at('months'),'errMonths');
    let number=null;
    if(e.number!=null){
      const n=e.number;
      if(!isPlainObject(n)||!Number.isInteger(n.value)||n.value<0||n.value>MAX_NUMBER)return bad(at('number.value'),'errNumber');
      if(!COPY.unitChips.includes(n.unit))return bad(at('number.unit'),'errNumber');
      if(!COPY.hedgeChips.includes(n.hedge))return bad(at('number.hedge'),'errNumber');
      number={value:n.value,unit:n.unit,hedge:n.hedge};
    }
    if(outcome===null)return bad(at('outcome'),'errOutcome');
    const entry={title,what,forWhom,frequency,months:{start,end},number,outcome};
    if(!webhook){
      const c=e.confirm;
      if(!isPlainObject(c))return bad(at('confirm'),'errConfirm');
      if(!CONFIRM_KINDS.includes(c.kind))return bad(at('confirm.kind'),'errConfirm');
      if(c.kind==='completion'&&!ticked.has(str(c.completionId)))return bad(at('confirm.completionId'),'errConfirm');
      entry.confirm=c.kind==='completion'?{kind:c.kind,completionId:str(c.completionId)}:{kind:c.kind};
    }
    out.push(entry);
  }
  return {entries:out};
}

// The Step 1 ticks: ids from this record only. Returns {include} or {fields:[path]}.
function validateInclude(include,record){
  if(include!=null&&!isPlainObject(include))return {fields:['include']};
  const ids={completions:list(record.completions).map(c=>c.evidenceId),credentials:list(record.credentials).map(c=>c.id),selfAttested:list(record.selfAttested).map(a=>a.evidenceId)};
  const out={};
  for(const [k,known] of Object.entries(ids)){
    const v=include?.[k]??[];
    if(!Array.isArray(v)||!v.every(id=>typeof id==='string'&&known.includes(id)))return {fields:['include.'+k]};
    out[k]=[...new Set(v)];
  }
  return {include:out};
}

// The Cv the page built (plan Task 14), for the Word file: strings and lists of strings only, the photo dropped.
// Returns the Cv, or null when a field is not in that form.
function validateCv(cv){
  let ok=isPlainObject(cv);
  const s=v=>v==null?'':typeof v==='string'?v:(ok=false,'');
  const obj=v=>v==null?{}:isPlainObject(v)?v:(ok=false,{});
  const arr=(v,f)=>v==null?[]:Array.isArray(v)?v.map(f):(ok=false,[]);
  if(!ok)return null;
  const c=obj(cv.contact),o=obj(cv.optional);
  const out={name:s(cv.name),contact:{phone:s(c.phone),email:s(c.email),town:s(c.town)},profile:cv.profile==null?null:s(cv.profile),
    experience:arr(cv.experience,e=>{const x=obj(e);return {title:s(x.title),place:s(x.place),months:s(x.months),bullets:arr(x.bullets,s)};}),
    skills:arr(cv.skills,k=>{const x=obj(k);return {name:s(x.name),label:s(x.label)};}),
    learning:arr(cv.learning,s),education:s(cv.education),
    optional:{photo:'',dateOfBirth:s(o.dateOfBirth),idNumber:s(o.idNumber),stateOfOrigin:s(o.stateOfOrigin)},sample:cv.sample!==false};
  return ok?out:null;
}

function sendJSON(res,status,payload){
  const body=JSON.stringify(payload);
  res.writeHead(status,{'content-type':'application/json; charset=utf-8','content-length':Buffer.byteLength(body),'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(body);
}
function sendError(res,status,code,message,retryable=false,details={}){sendJSON(res,status,{error:{code,message,retryable:Boolean(retryable),...details}});}
const invalid=(res,fields,message)=>sendError(res,400,'invalid_input',message,false,{fields});

function createCvRouter({config,provider,core,yoma,roleSkills,accountSource,cardStore,vouchStore,chipSkills,now=Date.now,readJSONBody,maxInFlight=4,random=crypto.randomBytes}={}){
  if(!accountSource||!core||typeof readJSONBody!=='function')throw new Error('createCvRouter needs accountSource, core and readJSONBody');
  const roleKeys=Object.keys(roleSkills||{});
  const serviceSecret=str(config?.yocv?.serviceSecret);
  const live=Boolean(provider)&&provider.name!=='local'&&typeof provider.cvBullets==='function';
  let localProvider=provider?.name==='local'&&typeof provider.cvBullets==='function'?provider:null;
  const getLocal=()=>localProvider||(localProvider=createLocalProvider(core));
  const sessions=new Map();
  let inFlight=0;

  function prune(){
    const t=now();
    for(const [id,s] of sessions)if(t-s.usedAt>SESSION_TTL_MS)sessions.delete(id);
    while(sessions.size>MAX_SESSIONS)sessions.delete(sessions.keys().next().value);
  }
  // Every route that names a session renews it, and moves it to the back of the eviction order.
  function sessionOf(id){
    prune();
    const s=typeof id==='string'&&SESSION_ID.test(id)?sessions.get(id):null;
    if(!s)return null;
    s.usedAt=now();
    sessions.delete(id);sessions.set(id,s);
    return s;
  }
  async function readBody(req,res){
    let body;
    try{body=await readJSONBody(req);}
    catch(err){
      if(err?.code==='invalid_input'||err?.name==='InputError'){invalid(res,[],err.message);return null;}
      throw err;
    }
    if(!isPlainObject(body)){invalid(res,[],COPY.errBody);return null;}
    return body;
  }
  // A body with a live session, or null once the answer is sent.
  async function withSession(req,res){
    const body=await readBody(req,res);
    if(!body)return null;
    const s=sessionOf(body.sessionId);
    if(!s){sendError(res,410,'session_expired',COPY.errSession,false);return null;}
    return {body,s};
  }
  async function withSlot(res,fn){
    if(inFlight>=maxInFlight)return sendError(res,503,'busy',COPY.errBusy,true);
    inFlight++;
    try{return await fn();}finally{inFlight--;}
  }
  const ownerOf=s=>({source:s.record.source,personaId:s.record.source==='sample'?s.selector.persona:null,userId:s.record.source==='token'?s.record.user.id:null});
  const vouchesOf=s=>vouchSources({cardStore,vouchStore,owner:ownerOf(s),chipSkills,copy:COPY,nowMs:now()}).sources;

  function cvConfig(res){
    const sample=accountSource.kind==='sample';
    sendJSON(res,200,{copy:COPY,rules:RULES,roles:roleList(roleSkills),
      accounts:{source:accountSource.kind,personas:sample?accountSource.listPersonas().map(p=>({id:p.id,displayName:p.displayName,trade:p.trade,city:p.city??null})):[]},
      mode:{mode:live?'live':'sample',provider:live?str(provider.name):'local',model:live?(provider.model??null):null}});
  }

  async function menu(res,url){
    const role=url.searchParams.get('role');
    if(!role||!roleKeys.includes(role))return invalid(res,['role'],COPY.errRole);
    sendJSON(res,200,await buildSkillMenu(role,{yoma,roleSkills}));
  }

  async function record(req,res){
    const body=await readBody(req,res);
    if(!body)return;
    const selector=accountSource.kind==='sample'?{persona:body.persona}:{};
    let rec;
    try{rec=await readCvRecord({accountSource,selector});}
    catch(err){
      if(err?.code==='unknown_persona')return sendError(res,400,'unknown_persona',COPY.errPersona,false,{fields:['persona']});
      if(err?.code==='yoma_auth')return sendError(res,502,'yoma_auth',err.message,false);
      if(isUnavailable(err))return sendError(res,502,'yoma_unavailable',COPY.errYoma,true);
      throw err;
    }
    prune();
    const sessionId=random(12).toString('hex'),{phoneNumber,...user}=rec.user;
    sessions.set(sessionId,{record:{...rec,user},selector,usedAt:now()});
    sendJSON(res,200,{sessionId,record:rec});
  }

  async function review(req,res){
    const got=await withSession(req,res);
    if(!got)return;
    const {body,s}=got;
    if(typeof body.role!=='string'||!roleKeys.includes(body.role))return invalid(res,['role'],COPY.errRole);
    const inc=validateInclude(body.include,s.record);
    if(inc.fields)return invalid(res,inc.fields,COPY.errInclude);
    const v=validateEntries(body.entries,{include:inc.include,now});
    if(v.fields)return invalid(res,v.fields,v.message);
    const knownWords=body.knownWords??[];
    if(!stringList(knownWords,MAX_WORDS,MAX_WORD))return invalid(res,['knownWords'],COPY.errBody);
    const mode=body.mode??null;
    if(mode!==null&&mode!=='live'&&mode!=='sample')return invalid(res,['mode'],COPY.errBody);
    if(mode==='live'&&!live)return sendError(res,502,'provider_not_configured',new ProviderError('provider_not_configured').message,false);
    const chosen=mode!=='sample'&&live?provider:getLocal();
    const u=s.record.user,{completions,credentials}=inc.include;
    const known=[u.firstName,...words(u.displayName),...words(u.city),...knownWords,...body.entries.flatMap(e=>words(e.place))].filter(Boolean);
    const learningTitles=[...new Set([...s.record.completions.filter(c=>completions.includes(c.evidenceId)),...s.record.credentials.filter(c=>credentials.includes(c.id))].map(x=>str(x.title)).filter(Boolean))];
    // The newest review of a session is the one its check and skills calls read: an older one that answers later
    // still gets its own reply, but writes nothing (the page has dropped it).
    const run=s.reviewRun=(s.reviewRun||0)+1;
    return withSlot(res,async()=>{
      try{
        const {menu:items}=await buildSkillMenu(body.role,{yoma,roleSkills});
        const {entries:drafts,generation}=await draftEntries({role:body.role,entries:v.entries.map(fieldsOf),provider:chosen,menu:items,learningTitles,known,now});
        const interview=drafts.flatMap(d=>d.skills.map(k=>({entryIndex:d.index,...k})));
        if(s.reviewRun===run)Object.assign(s,{role:body.role,include:inc.include,entries:v.entries,interview,menu:items});
        const {skills,rejected}=combineSkills({record:s.record,include:inc.include,vouches:vouchesOf(s),interview,menu:items,copy:COPY});
        sendJSON(res,200,{entries:drafts,skills,skillsRejected:rejected,menu:items,generation});
      }catch(err){
        if(isProviderError(err))return sendError(res,502,err.code,err.message,err.retryable);
        throw err;
      }
    });
  }

  // The entry the profile line names: the one with these months, else the longest, as profileLine picks.
  function profileFields(entries,months){
    const nowIso=new Date(now()).toISOString(),span=e=>core.monthsBetween(e.months.start,e.months.end,nowIso);
    const match=months==null?null:entries.find(e=>span(e)===months);
    if(match)return fieldsOf(match);
    let best=null,most=null;
    for(const e of entries){const n=span(e);if(n!=null&&(most==null||n>most)){best=e;most=n;}}
    return best?fieldsOf(best):{};
  }

  async function check(req,res){
    const got=await withSession(req,res);
    if(!got)return;
    const {body,s}=got,entries=s.entries||[];
    if(typeof body.text!=='string'||points(body.text)>MAX_CHECK_TEXT)return invalid(res,['text'],COPY.errBody);
    let r;
    if(body.kind==='bullet'){
      const e=Number.isInteger(body.entryIndex)?entries[body.entryIndex]:null;
      if(!e)return invalid(res,['entryIndex'],COPY.errBody);
      r=checkBullet({text:body.text,sourceQuote:e.what.trim()},{fields:fieldsOf(e),role:s.role});
    }else if(body.kind==='profile'){
      const months=body.months??null,skillNames=body.skillNames??[];
      if(months!==null&&!(Number.isInteger(months)&&months>=1&&months<=MAX_MONTHS))return invalid(res,['months'],COPY.errBody);
      if(!stringList(skillNames,MAX_HAND,MAX_WORD))return invalid(res,['skillNames'],COPY.errBody);
      r=checkProfile(body.text,{fields:profileFields(entries,months),role:s.role,kind:'profile',extraNumbers:months===null?[]:[months],extraNames:skillNames.flatMap(words)});
    }else return invalid(res,['kind'],COPY.errBody);
    sendJSON(res,200,r.ok?{ok:true,checks:r.checks}:{ok:false,reason:r.reason,message:COPY['reason_'+r.reason]??r.reason});
  }

  async function skills(req,res){
    const got=await withSession(req,res);
    if(!got)return;
    const {body,s}=got;
    const inc=validateInclude(body.include,s.record);
    if(inc.fields)return invalid(res,inc.fields,COPY.errInclude);
    const handAdded=body.handAdded??[];
    if(!Array.isArray(handAdded)||handAdded.length>MAX_HAND||!handAdded.every(h=>isPlainObject(h)&&typeof h.name==='string'))return invalid(res,['handAdded'],COPY.errBody);
    // Only the name is taken: a hand-added skill must be on the menu, and its Yoma id comes from there.
    const {skills:out,rejected}=combineSkills({record:s.record,include:inc.include,vouches:vouchesOf(s),interview:s.interview||[],
      handAdded:handAdded.map(h=>({name:h.name})),menu:s.menu||[],copy:COPY});
    sendJSON(res,200,{skills:out,skillsRejected:rejected});
  }

  // The Word file (spec 10). Only a record read with a token can leave out the sample line: with sample accounts
  // every CV is a sample, whatever the page sent.
  async function docx(req,res){
    const body=await readBody(req,res);
    if(!body)return;
    const cv=validateCv(body.cv);
    if(!cv)return invalid(res,['cv'],COPY.errBody);
    if(accountSource.kind!=='token')cv.sample=true;
    const file=cvToDocx(cv,COPY);
    res.writeHead(200,{'content-type':DOCX_TYPE,'content-disposition':'attachment; filename="cv.docx"','content-length':file.length,'cache-control':'no-store','x-content-type-options':'nosniff'});
    res.end(file);
  }

  // The webhook (spec 8): the same draft as Step 3, with no account, so the skills are the interview's only (S3).
  // The place only adds words to mask. Nothing is stored.
  async function draft(req,res){
    if(!gatewaySecretOk(String(req.headers['x-yocv-service-secret']||''),serviceSecret))return sendError(res,403,'forbidden','Unknown service.');
    const body=await readBody(req,res);
    if(!body)return;
    if(typeof body.role!=='string'||!roleKeys.includes(body.role))return invalid(res,['role'],COPY.errRole);
    const v=validateEntries(body.entries,{now,webhook:true});
    if(v.fields)return invalid(res,v.fields,v.message);
    const known=body.entries.flatMap(e=>words(e.place));
    return withSlot(res,async()=>{
      try{
        const {menu:items}=await buildSkillMenu(body.role,{yoma,roleSkills});
        const {entries:drafts,generation}=await draftEntries({role:body.role,entries:v.entries,provider:live?provider:getLocal(),menu:items,learningTitles:[],known,now});
        const seen=new Set(),skillsOut=[];
        for(const k of drafts.flatMap(d=>d.skills))if(!seen.has(k.name)){seen.add(k.name);skillsOut.push({name:k.name,yomaSkill:k.yomaSkill,level:'S3'});}
        sendJSON(res,200,{draft:true,
          bullets:drafts.flatMap(d=>d.proposals.map(p=>({entryIndex:d.index,text:p.text,checks:p.checks}))),
          skills:skillsOut,
          rejected:drafts.flatMap(d=>d.rejected.filter(r=>r.kind==='bullet').map(r=>({entryIndex:d.index,text:r.text,reason:r.reason}))),
          generation:{mode:generation.mode,provider:generation.provider,model:generation.model},
          notice:DRAFT_NOTICE});
      }catch(err){
        if(isProviderError(err))return sendError(res,502,err.code,err.message,err.retryable);
        throw err;
      }
    });
  }

  // GET /demo/cv-rejected: the fixture's model output through draftEntry, read fresh on each load, so a change to the
  // checks changes the page. No generation mode is printed: this is no live call and no sample run.
  async function cvRejected(res){
    const {role,entry,output}=JSON.parse(fs.readFileSync(PREPARED_FILE,'utf8'));
    const prepared={name:'prepared',model:'none',async cvBullets(){return output;}};
    const d=await draftEntry({role,entry,index:0,provider:prepared,menu:[],known:words(entry.place),now});
    const H=core.escapeHTML,n=entry.number,m=entry.months;
    const when=m.end?t('cvMonthsRange',{start:core.monthLabel(m.start),end:core.monthLabel(m.end)}):t('cvMonthsOpen',{start:core.monthLabel(m.start)});
    const answers=[[t('fieldTitle'),entry.title],[t('fieldPlace'),entry.place],[t('qWhat'),entry.what],[t('qForWhom'),entry.forWhom],
      [t('qOften'),[entry.frequency,when].filter(Boolean).join(', ')],[t('qNumber'),n?[n.hedge,n.value,n.unit].filter(Boolean).join(' '):''],[t('qBetter'),entry.outcome]]
      .filter(([,v])=>str(v).trim()).map(([k,v])=>'<dt>'+H(k)+'</dt><dd>'+H(v)+'</dd>').join('');
    const refused=d.rejected.filter(r=>r.kind==='bullet').map(r=>'<li>'+H(t('recordRejectedLine',{text:r.text,reason:COPY['reason_'+r.reason]??r.reason,code:r.reason}))+'</li>').join('');
    const shown=d.proposals.map(p=>'<li>'+H(p.text)+(p.templateWording?' <span class="small">('+H(COPY.templateWording)+')</span>':'')+'</li>').join('');
    const body='<section><h1>'+H(COPY.preparedExample)+'</h1><p>'+H(role)+'</p><h2>'+H(t('recordAnswers'))+'</h2><dl>'+answers+'</dl>'+
      '<h2>'+H(t('recordRejected'))+'</h2><ul>'+refused+'</ul><h2>'+H(t('recordProposals'))+'</h2><ul>'+shown+'</ul></section>';
    sendPage(res,200,flowPage({title:COPY.preparedExample,body,css:'dt{font-weight:600}dd{margin:0 0 8px}'}));
  }
  const simOn=Boolean(config?.yovouch?.sim)&&!config?.yovouch?.gatewaySecret;

  const POST={'/api/cv/record':record,'/api/cv/review':review,'/api/cv/check':check,'/api/cv/skills':skills,'/api/cv/docx':docx};
  if(serviceSecret)POST['/api/cv/draft']=draft;
  function handle(req,res,url){
    const p=url.pathname,m=req.method;
    const notAllowed=()=>Promise.resolve(sendError(res,405,'method_not_allowed','Method not allowed.',false));
    if(p==='/api/cv/config'||p==='/api/cv/menu'){
      if(m!=='GET'&&m!=='HEAD')return notAllowed();
      return p==='/api/cv/config'?Promise.resolve(cvConfig(res)):menu(res,url);
    }
    if(p==='/demo/cv-rejected'&&simOn)return m==='GET'||m==='HEAD'?cvRejected(res):notAllowed();
    if(!Object.hasOwn(POST,p))return null;
    return m==='POST'?POST[p](req,res):notAllowed();
  }

  return {handle,sessions};
}

module.exports={createCvRouter,validateEntries,SESSION_TTL_MS};
