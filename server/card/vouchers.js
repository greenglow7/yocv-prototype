'use strict';
/* Voucher keys (spec sections 4.3, 5.4 and 9.6). A phone number is only ever stored as
   HMAC-SHA256(hashKey, E.164); normalisePhone turns the gateway's or the form's format into E.164 so
   +27825550131, 27825550131 and 0825550131 all hash alike. Voucher files hold the caps, the YES-text binds,
   the demo OTP sends and the per-sender wrong codes, one file per keyed hash. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const DIAL_CODES={'South Africa':'27',Kenya:'254',Nigeria:'234',Ghana:'233',Uganda:'256',Tanzania:'255'};
const KEY_PATTERN=/^[0-9a-f]{64}$/;

function normalisePhone(raw,country){
  if(typeof raw!=='string'&&typeof raw!=='number')return null;
  const s=String(raw).trim(),digits=s.replace(/\D/g,''),dial=DIAL_CODES[country];
  let e164=null;
  if(s.startsWith('+'))e164=digits;
  else if(digits.startsWith('00'))e164=digits.slice(2);
  else if(dial&&digits.startsWith(dial))e164=digits;
  else if(dial&&digits.startsWith('0'))e164=dial+digits.slice(1);
  return e164&&/^[1-9]\d{7,14}$/.test(e164)?'+'+e164:null;
}
function keyedHash(hashKey,e164){return crypto.createHmac('sha256',hashKey).update(String(e164)).digest('hex');}

function emptyFile(){return {sessions:[],binds:[],otpSentAt:[],wrongCodes:[],lastSeen:null};}
function createVoucherFiles(dir,{now=Date.now}={}){
  if(!dir)throw new Error('createVoucherFiles needs a directory');
  const root=path.join(dir,'vouchers');
  function fileOf(key){
    if(typeof key!=='string'||!KEY_PATTERN.test(key))throw new TypeError('voucher key must be 64 hex characters');
    return path.join(root,key+'.json');
  }
  function read(key){
    const file=fileOf(key);
    let data=null;
    try{data=JSON.parse(fs.readFileSync(file,'utf8'));}catch(err){if(err?.code&&err.code!=='ENOENT')throw err;}
    const out=emptyFile();
    if(data&&typeof data==='object')for(const k of Object.keys(out))if(k==='lastSeen'?typeof data[k]==='string':Array.isArray(data[k]))out[k]=data[k];
    return out;
  }
  function update(key,mutate){
    const file=fileOf(key),data=read(key);
    mutate(data);
    data.lastSeen=new Date(now()).toISOString();
    fs.mkdirSync(root,{recursive:true});
    fs.writeFileSync(file+'.tmp',JSON.stringify(data));
    fs.renameSync(file+'.tmp',file);
    return data;
  }
  return {read,update};
}

module.exports={DIAL_CODES,normalisePhone,keyedHash,createVoucherFiles};
