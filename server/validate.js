'use strict';
// Grounding validators for YoCV generation (spec section 6).
// Per-claim validators return {ok:true} or {ok:false, reason}. List helpers return plain data.

const OK={ok:true};
const BANNED=/\b(certified|verified|licensed|qualified|award|degree|diploma)\b/i;

function normalise(text){
  return String(text??'')
    .toLowerCase()
    .replace(/[‘’‚‛′]/g,"'")
    .replace(/[“”„‟″]/g,'"')
    .replace(/\s+/g,' ')
    .trim();
}

function quoteInSource(quote,experience){
  const q=normalise(quote);
  if(q.length<8)return {ok:false,reason:'quote_not_in_source'};
  return normalise(experience).includes(q)?OK:{ok:false,reason:'quote_not_in_source'};
}

function noInventedNumbers(text,sources={}){
  const allowed=new Set([sources.experience,sources.context,sources.dates].flatMap(s=>String(s??'').match(/\d+/g)||[]));
  const found=String(text??'').match(/\d+/g)||[];
  return found.every(n=>allowed.has(n))?OK:{ok:false,reason:'invented_number'};
}

function lengthOk(text){
  const length=String(text??'').trim().length;
  return length>=1&&length<=180?OK:{ok:false,reason:'length'};
}

function noBannedClaims(text){
  return BANNED.test(String(text??''))?{ok:false,reason:'asserts_credential'}:OK;
}

function resolveSkill(name,menu){
  const wanted=normalise(name);
  if(!wanted||!Array.isArray(menu))return null;
  return menu.find(entry=>normalise(entry?.name)===wanted)||null;
}

function dedupe(claims){
  const seen=new Set(),kept=[],rejected=[];
  for(const claim of claims||[]){
    const key=normalise(claim?.text);
    if(seen.has(key))rejected.push({...claim,reason:'duplicate'});
    else{seen.add(key);kept.push(claim);}
  }
  return {kept,rejected};
}

module.exports={normalise,quoteInSource,noInventedNumbers,lengthOk,noBannedClaims,resolveSkill,dedupe};
