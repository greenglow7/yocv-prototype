'use strict';
// Local adapter (spec §5.5): wraps the template bullet in core.js so
// sample mode runs through the same pipeline, validators and metadata.
// It deliberately has no complete(): the YoCard draft pipeline treats a
// provider without complete() as sample mode and uses its own local draft.
const {ProviderError}=require('./errors.js');
const {RULES}=require('../../cv-rules.js');

// A menu name counts only as a whole phrase in the answer, any case.
const namedIn=(name,text)=>new RegExp('(?<![\\p{L}\\p{N}])'+String(name).trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','iu').test(String(text??''));

function createLocalProvider(core,{rules=RULES}={}){
  if(!core||typeof core.templateBullet!=='function')throw new ProviderError('provider_not_configured','The local provider needs core.templateBullet.',{retryable:false});
  return {
    name:'local',
    model:null,
    // Spec 7: the template bullet, and a skill only when the person named it in what or outcome.
    async cvBullets({entry,menuNames,nowIso}={}){
      const e=entry||{},r=core.templateBullet(e,rules,{nowIso});
      const bullets=r?[{text:r.text,usedNumbers:core.numbersIn(r.text).map(n=>n.raw),sourceFields:r.sourceFields,sourceQuote:String(e.what??'').trim()}]:[];
      const skills=[];
      for(const name of Array.isArray(menuNames)?menuNames:[]){
        if(!String(name??'').trim())continue;
        const answer=[e.what,e.outcome].find(t=>namedIn(name,t));
        if(answer)skills.push({name,sourceQuote:String(answer).trim()});
      }
      return {bullets,skills};
    }
  };
}

module.exports={createLocalProvider};
