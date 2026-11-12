'use strict';
/* YoCard record signing (spec section 3.5). One P-256 key per server, created on first use and
   stored as PEM in <dir>/.keys.json. Records are signed as compact JWS (ES256, IEEE P1363
   signatures as JOSE requires). The signature proves a card is what the worker published on this
   prototype; it is signed by YoCard, not by Yoma. */

const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');

const ISSUER='yocard-prototype';
const KEY_FILE='.keys.json';

function kidOf(publicPem){return crypto.createHash('sha256').update(publicPem).digest('hex').slice(0,16);}
function b64url(input){return Buffer.from(input).toString('base64url');}
function fromB64url(text){return Buffer.from(String(text),'base64url');}

function loadOrCreateKey(dir){
  if(!dir)throw new Error('loadOrCreateKey needs a directory');
  fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,KEY_FILE);
  let stored=null;
  if(fs.existsSync(file)){
    try{stored=JSON.parse(fs.readFileSync(file,'utf8'));}catch{stored=null;}
  }
  if(!stored||typeof stored.privatePem!=='string'||typeof stored.publicPem!=='string'){
    const pair=crypto.generateKeyPairSync('ec',{namedCurve:'P-256'});
    const privatePem=pair.privateKey.export({format:'pem',type:'pkcs8'});
    const publicPem=pair.publicKey.export({format:'pem',type:'spki'});
    stored={kid:kidOf(publicPem),privatePem,publicPem};
    fs.writeFileSync(file,JSON.stringify(stored,null,2),{mode:0o600});
  }
  const privateKey=crypto.createPrivateKey(stored.privatePem);
  const publicKey=crypto.createPublicKey(stored.publicPem);
  const kid=typeof stored.kid==='string'&&stored.kid?stored.kid:kidOf(stored.publicPem);
  return {privateKey,publicKey,kid};
}

function signRecord(key,record,{now=Date.now}={}){
  if(!key?.privateKey)throw new Error('signRecord needs a key with a privateKey');
  const header=b64url(JSON.stringify({alg:'ES256',typ:'JWT',kid:key.kid}));
  const payload=b64url(JSON.stringify({iss:ISSUER,sub:record?.cardId??null,iat:Math.floor(now()/1000),record}));
  const data=header+'.'+payload;
  const signature=crypto.sign('sha256',Buffer.from(data),{key:key.privateKey,dsaEncoding:'ieee-p1363'});
  return data+'.'+signature.toString('base64url');
}

function verifyJwt(key,jwt){
  if(!key?.publicKey||typeof jwt!=='string')return null;
  const parts=jwt.split('.');
  if(parts.length!==3||!parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)))return null;
  let header,payload;
  try{
    header=JSON.parse(fromB64url(parts[0]).toString('utf8'));
    payload=JSON.parse(fromB64url(parts[1]).toString('utf8'));
  }catch{return null;}
  if(!header||header.alg!=='ES256')return null;
  if(header.kid!==undefined&&key.kid!==undefined&&header.kid!==key.kid)return null;
  const signature=fromB64url(parts[2]);
  if(signature.length!==64)return null;
  let ok=false;
  try{ok=crypto.verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:key.publicKey,dsaEncoding:'ieee-p1363'},signature);}
  catch{ok=false;}
  return ok&&payload&&typeof payload==='object'?payload:null;
}

function jwks(key){
  if(!key?.publicKey)throw new Error('jwks needs a key with a publicKey');
  const {kty,crv,x,y}=key.publicKey.export({format:'jwk'});
  return {keys:[{kty,crv,x,y,kid:key.kid,use:'sig',alg:'ES256'}]};
}

module.exports={ISSUER,loadOrCreateKey,signRecord,verifyJwt,jwks};
