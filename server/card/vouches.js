'use strict';
/* YoVouch vouch store (spec sections 5 and 9.6). This file owns <dir>/.hashkey.json: 32 random bytes that key
   every phone-number hash (voucherKey, ownerPhoneHash, linkedPhoneHash). It is separate from .keys.json,
   which sign.js writes only when a PEM is missing.
   Each vouch is <dir>/vouches/<vouchId>.json = {record, held, private}: record is the signed public part,
   held the words and clip the worker has not released yet (spec 5.7), private what is never published
   (spec 9.1). Clips live in <dir>/vouches/clips/<vouchId>.<webm|m4a>. A withdrawal holds at read time
   through isLive; the sweep (sweep.js) only tidies files afterwards. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {ALPHABET,validId,hashSecret,secretsMatch}=require('./store.js');
const {buildLine}=require('./vouch-lines.js');
const {t}=require('./copy.js');

const DAY_MS=86400000;
const QUIET_MS=72*3600000;
const RECENT_MS=30*DAY_MS;
const CAP_DAY=3,CAP_CARDS=3,CAP_WORKER=5;
const CLIP_EXTS=['webm','m4a'];

function loadOrCreateHashKey(dir,{random=crypto.randomBytes}={}){
  const file=path.join(dir,'.hashkey.json');
  const parse=()=>{
    const hex=JSON.parse(fs.readFileSync(file,'utf8'))?.hashKey;
    if(typeof hex!=='string'||!/^[0-9a-f]{64}$/.test(hex))throw new Error('.hashkey.json is not a 32-byte hex key');
    return Buffer.from(hex,'hex');
  };
  if(fs.existsSync(file))return parse();
  fs.mkdirSync(dir,{recursive:true});
  try{fs.writeFileSync(file,JSON.stringify({hashKey:random(32).toString('hex')}),{flag:'wx',mode:0o600});}
  catch(err){if(err?.code!=='EEXIST')throw err;}
  return parse();
}

const iso=ms=>new Date(ms).toISOString();
const ms=v=>{const n=Date.parse(v);return Number.isNaN(n)?null:n;};
const within=(at,nowMs,span)=>{const n=ms(at);return n!==null&&n>nowMs-span&&n<=nowMs;};

// The moment a vouch stopped counting: withdrawnAt, or a quiet withdrawAfter that has passed.
function withdrawnAtOf(file,nowMs){
  const p=file?.private||{};
  if(p.withdrawnAt)return p.withdrawnAt;
  const after=ms(p.withdrawAfter);
  return after!==null&&after<=nowMs?p.withdrawAfter:null;
}
// Live as far as the file itself says: not withdrawn, not hidden, a referral only once accepted.
function fileLive(file,nowMs){
  if(!file?.record)return false;
  if(withdrawnAtOf(file,nowMs)||file.private?.hiddenAt)return false;
  return !(file.record.kind==='organisation'&&!file.record.acceptedAt);
}

function createVouchStore(dir,{now=Date.now,random=crypto.randomBytes,cardStore=null}={}){
  if(!dir)throw new Error('createVouchStore needs a directory');
  const root=path.join(dir,'vouches'),clips=path.join(root,'clips');
  const fileOf=id=>path.join(root,id+'.json');
  function write(file,id){
    fs.mkdirSync(root,{recursive:true});
    fs.writeFileSync(fileOf(id)+'.tmp',JSON.stringify(file));
    fs.renameSync(fileOf(id)+'.tmp',fileOf(id));
  }
  function get(vouchId){
    if(!validId(vouchId))return null;
    try{return JSON.parse(fs.readFileSync(fileOf(vouchId),'utf8'));}
    catch(err){if(err?.code&&err.code!=='ENOENT')throw err;return null;}
  }
  function newId(){
    for(let i=0;i<20;i++){
      const bytes=random(10);let id='';
      for(let j=0;j<10;j++)id+=ALPHABET[bytes[j]%ALPHABET.length];
      if(!fs.existsSync(fileOf(id)))return id;
    }
    throw new Error('could not allocate a vouch id');
  }
  // The SMS secret is typed back by hand, so it uses the store alphabet; the web secret is 16 hex.
  function newSecret(channel){
    if(channel!=='sms'&&channel!=='ivr')return random(8).toString('hex');
    const bytes=random(6);let out='';
    for(let j=0;j<6;j++)out+=ALPHABET[bytes[j]%ALPHABET.length];
    return out;
  }
  // clip = {data, contentType, seconds}: written in the browser's own container and held with the words (spec 6.3, 9.6).
  function writeClip(vouchId,{data,contentType,seconds}){
    const ext=contentType==='audio/mp4'?'m4a':'webm';
    fs.mkdirSync(clips,{recursive:true});
    fs.writeFileSync(path.join(clips,vouchId+'.'+ext),data);
    return {url:'/v/'+vouchId+'/clip',contentType:ext==='m4a'?'audio/mp4':'audio/webm',seconds,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')};
  }
  function readClip(vouchId){
    if(!validId(vouchId))return null;
    for(const ext of CLIP_EXTS){
      try{return fs.readFileSync(path.join(clips,vouchId+'.'+ext));}
      catch(err){if(err?.code!=='ENOENT')throw err;}
    }
    return null;
  }
  function create({record,held=null,private:priv={},channel='web',clip=null}={}){
    const vouchId=newId(),withdrawSecret=newSecret(channel);
    if(clip?.data&&held)held={...held,clip:writeClip(vouchId,clip)};
    const file={record:{...record,vouchId},held:held||null,
      private:{voucherKey:null,withdrawnAt:null,withdrawAfter:null,hiddenAt:null,editedFields:[],rawTranscript:null,rejected:[],
        ...(priv&&typeof priv==='object'?priv:{}),withdrawSecretHash:hashSecret(withdrawSecret)}};
    write(file,vouchId);
    return {vouchId,withdrawSecret};
  }
  function update(vouchId,mutate){
    const file=get(vouchId);
    if(!file)return null;
    const next=mutate(file)??file;
    write(next,vouchId);
    return next;
  }
  // Every file, tombstones included, oldest confirmation first.
  function listAll(){
    let names=[];
    try{names=fs.readdirSync(root);}catch(err){if(err?.code!=='ENOENT')throw err;}
    return names.filter(n=>n.endsWith('.json')&&validId(n.slice(0,-5))).map(n=>get(n.slice(0,-5))).filter(Boolean)
      .sort((a,b)=>(ms(a.record?.confirmedAt)??0)-(ms(b.record?.confirmedAt)??0));
  }
  const withRecord=pred=>listAll().filter(f=>f.record&&pred(f));
  const listForCard=cardId=>withRecord(f=>f.record.cardId===cardId);
  const listByVoucherCard=cardId=>withRecord(f=>f.record.voucher?.cardId===cardId);
  const listByVoucherKey=key=>withRecord(f=>Boolean(key)&&f.private?.voucherKey===key);

  function deleteClip(vouchId){
    if(!validId(vouchId))return false;
    let gone=false;
    for(const ext of CLIP_EXTS){
      const file=path.join(clips,vouchId+'.'+ext);
      if(fs.existsSync(file)){fs.rmSync(file,{force:true});gone=true;}
    }
    return gone;
  }
  // 'now' sets withdrawnAt and deletes the clip; 'quiet' sets withdrawAfter to a random moment in the next 72 hours.
  function applyWithdraw(vouchId,mode){
    if(mode!=='now'&&mode!=='quiet')return null;
    const nowMs=now();
    const file=update(vouchId,f=>{
      if(!f.record||f.private.withdrawnAt)return;
      if(mode==='now'){f.private.withdrawnAt=iso(nowMs);return;}
      if(!f.private.withdrawAfter){
        const r=random(4).readUInt32BE(0)/0x100000000;
        f.private.withdrawAfter=iso(nowMs+60000+Math.floor(r*(QUIET_MS-60000)));
      }
    });
    if(file?.private?.withdrawnAt)deleteClip(vouchId);
    return file?.record?file:null;
  }
  function withdraw(vouchId,secret,mode){
    const file=get(vouchId);
    const s=typeof secret==='string'&&/^[a-z2-9]{6}$/i.test(secret)?secret.toUpperCase():secret;
    if(!file?.record||!secretsMatch(file.private?.withdrawSecretHash,s))return {ok:false};
    const done=applyWithdraw(vouchId,mode);
    return done?{ok:true,file:done}:{ok:false};
  }
  // No secret: for the vouching worker's own page, the organisation page and STOP, which prove the voucher otherwise.
  const withdrawAs=(vouchId,mode)=>applyWithdraw(vouchId,mode);

  function setHidden(vouchId,cardId,hidden){
    const file=get(vouchId);
    if(!file?.record||file.record.cardId!==cardId||withdrawnAtOf(file,now()))return false;
    update(vouchId,f=>{f.private.hiddenAt=hidden?(f.private.hiddenAt||iso(now())):null;});
    return true;
  }
  // Releases held words and clip into the public part and rebuilds the line (spec 5.7). confirmedAt is unchanged.
  function showWords(vouchId,cardId){
    const file=get(vouchId);
    if(!file?.record||file.record.cardId!==cardId||withdrawnAtOf(file,now()))return null;
    if(!file.held)return file;
    return update(vouchId,f=>{
      const r=f.record,h=f.held;
      r.fields={...r.fields,words:h.words??null,wordsSource:h.wordsSource??null};
      r.clip=h.clip??null;
      r.wordsShownAt=iso(now());
      r.line=buildLine(r.kind,r.fields,{statement:r.statement,restsOn:r.restsOn,jobPost:r.jobPost,at:r.acceptedAt});
      f.held=null;
    });
  }
  // The reduced file a withdrawn vouch keeps (spec 9.7).
  function tombstone(vouchId,withdrawnAt){
    const file=get(vouchId);
    if(!file?.record)return null;
    deleteClip(vouchId);
    const stone={vouchId,cardId:file.record.cardId,withdrawnAt};
    write(stone,vouchId);
    return stone;
  }

  // A draft referral the worker declined is deleted outright: it was never on the card (spec 7.5 step 6).
  function remove(vouchId){
    if(!validId(vouchId))return false;
    deleteClip(vouchId);
    try{fs.rmSync(fileOf(vouchId));return true;}catch{return false;}
  }
  const publicPart=file=>file?.record??null;
  function isLive(file,nowMs=now()){
    if(!fileLive(file,nowMs))return false;
    return !(cardStore&&cardStore.get(file.record.cardId)?.withdrawnAt);
  }

  return {dir:root,create,get,update,listAll,listForCard,listByVoucherCard,listByVoucherKey,withdraw,withdrawAs,
    hide:(vouchId,cardId)=>setHidden(vouchId,cardId,true),show:(vouchId,cardId)=>setHidden(vouchId,cardId,false),
    showWords,deleteClip,readClip,tombstone,remove,publicPart,isLive};
}

// ---- Caps (spec 5.4). They count sessions that reached confirm, never refusals. ----
// 3 sessions per number per day; 3 different cards per number per 30 days (a card already among them is fine).
function capFor(voucherFile,cardId,nowMs){
  const sessions=Array.isArray(voucherFile?.sessions)?voucherFile.sessions:[];
  if(sessions.filter(s=>within(s?.at,nowMs,DAY_MS)).length>=CAP_DAY)return 'voucher_cap_day';
  const cards=new Set(sessions.filter(s=>within(s?.at,nowMs,RECENT_MS)).map(s=>s.cardId));
  return !cards.has(cardId)&&cards.size>=CAP_CARDS?'voucher_cap_cards':null;
}
// A live vouch by this voucher key for this card in the last 30 days: a second match adds a visit instead.
function recentFor(files,cardId,nowMs){
  const hits=(Array.isArray(files)?files:[]).filter(f=>f?.record?.cardId===cardId&&fileLive(f,nowMs)&&within(f.record.confirmedAt,nowMs,RECENT_MS));
  return hits.sort((a,b)=>ms(b.record.confirmedAt)-ms(a.record.confirmedAt))[0]||null;
}
function isSelfVouch(entry,voucherKey){
  return typeof voucherKey==='string'&&voucherKey!==''&&(entry?.ownerPhoneHash===voucherKey||entry?.linkedPhoneHash===voucherKey);
}
// 5 worker vouches given per voucher card per 90 days. A withdrawn one still reached confirm, so it still counts.
function workerCapReached(files,nowMs){
  return (Array.isArray(files)?files:[]).filter(f=>f?.record?.kind==='worker'&&within(f.record.confirmedAt,nowMs,90*DAY_MS)).length>=CAP_WORKER;
}
// The voucher's message for a cap code (plan addition: one place for the three strings).
function capMessage(code,lang='en'){
  return t({voucher_cap_day:'capDay',voucher_cap_cards:'capCards',worker_cap:'workerCap'}[code]||'capDay',lang);
}

module.exports={loadOrCreateHashKey,createVouchStore,capFor,recentFor,isSelfVouch,workerCapReached,capMessage,withdrawnAtOf,fileLive};
