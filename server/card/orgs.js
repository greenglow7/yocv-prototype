'use strict';
/* YoVouch organisations (spec 5.1, 7.5). The repository sees no stable organisation id on completions, so an
   organisation is keyed by its name: orgKeyOf(name) is the trimmed, lower-cased name, and the file is
   <dir>/orgs/<that key with each run outside [a-z0-9] replaced by '-'>.json = {orgName, orgKeyHash, orgId, createdAt}.
   Only the hash of the organisation's YoVouch key is stored; check() compares it in constant time. In the
   prototype every key is a demo key from YOVOUCH_ORG_KEY_<NAME>. */
const fs=require('node:fs');
const path=require('node:path');
const {hashSecret,secretsMatch}=require('./store.js');

const orgKeyOf=name=>String(name??'').trim().toLowerCase();
const fileKey=name=>orgKeyOf(name).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

function createOrgStore(dir,{now=Date.now}={}){
  if(!dir)throw new Error('createOrgStore needs a directory');
  const root=path.join(dir,'orgs');
  const fileOf=name=>{const k=fileKey(name);return k?path.join(root,k+'.json'):null;};
  function get(orgName){
    const file=fileOf(orgName);
    if(!file)return null;
    try{const org=JSON.parse(fs.readFileSync(file,'utf8'));return orgKeyOf(org?.orgName)===orgKeyOf(orgName)?org:null;}
    catch(err){if(err?.code&&err.code!=='ENOENT')throw err;return null;}
  }
  // Creates the file, or refreshes the key hash of an existing one (a rotated demo key); orgId and createdAt stay.
  function ensure(orgName,orgKey){
    const file=fileOf(orgName);
    if(!file||typeof orgKey!=='string'||!orgKey)throw new Error('ensure needs an organisation name and key');
    const before=get(orgName);
    const org={orgName:before?.orgName||String(orgName).trim(),orgKeyHash:hashSecret(orgKey),orgId:before?.orgId??null,createdAt:before?.createdAt||new Date(now()).toISOString()};
    if(before&&before.orgKeyHash===org.orgKeyHash)return before;
    fs.mkdirSync(root,{recursive:true});
    fs.writeFileSync(file+'.tmp',JSON.stringify(org));
    fs.renameSync(file+'.tmp',file);
    return org;
  }
  const check=(orgName,orgKey)=>{const org=get(orgName);return Boolean(org)&&secretsMatch(org.orgKeyHash,orgKey);};
  return {ensure,get,check};
}

module.exports={orgKeyOf,createOrgStore};
