'use strict';
// Server access to the YoCV copy catalogue (cv-copy.js at the root, which the browser loads too).
const COPY=require('../../cv-copy.js');

// English only for now. An unknown key, a key that is not a string, or an unfilled {slot} throws.
function t(key,vars={}){
  const value=Object.prototype.hasOwnProperty.call(COPY.en,key)?COPY.en[key]:undefined;
  if(typeof value!=='string')throw new Error('unknown copy key: '+key);
  return value.replace(/\{(\w+)\}/g,(m,slot)=>{
    if(vars==null||vars[slot]==null)throw new Error('unfilled slot {'+slot+'} in '+key);
    return String(vars[slot]);
  });
}

// The catalogue for a language; any language without its own falls back to English.
function copyFor(lang='en'){return Object.prototype.hasOwnProperty.call(COPY,lang)?COPY[lang]:COPY.en;}

module.exports={COPY,t,copyFor};
