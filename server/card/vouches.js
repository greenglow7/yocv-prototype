'use strict';
/* YoVouch vouch store (spec sections 5 and 9.6). This file owns <dir>/.hashkey.json: 32 random bytes that key
   every phone-number hash (voucherKey, ownerPhoneHash, linkedPhoneHash). It is separate from .keys.json,
   which sign.js writes only when a PEM is missing. */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

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

module.exports={loadOrCreateHashKey};
