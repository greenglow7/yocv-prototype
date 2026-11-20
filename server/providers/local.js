'use strict';
// Local adapter (spec §5.5): wraps the rule-based generator in core.js so
// sample mode runs through the same pipeline, validators and metadata.
// It deliberately has no complete(): the YoCard draft pipeline treats a
// provider without complete() as sample mode and uses its own local draft.
const {ProviderError}=require('./errors.js');
const {RULES}=require('../../cv-rules.js');

// The rule-based generator uses plain-language skill names. Map each to the
// Yoma (Lightcast) skill names it corresponds to, in preference order; the
// first alias present in the request's skill menu is used. Unmatched names are
// passed through unchanged and the pipeline records them as skill_not_in_menu.
const SKILL_ALIASES={
  'customer communication':['Customer Service','Customer Support','Interpersonal Communications'],
  'organisation':['Organizational Skills','Scheduling','Time Management'],
  'teamwork':['Teamwork'],
  'attention to detail':['Stock Control','Inventory Management','Record Keeping'],
  'basic digital skills':['Digital Literacy','Computer Literacy']
};
function toYomaName(name,menuNames){
  const aliases=SKILL_ALIASES[String(name).trim().toLowerCase()];
  if(!aliases||!Array.isArray(menuNames))return name;
  const lower=menuNames.map(n=>String(n).toLowerCase());
  const hit=aliases.find(a=>lower.includes(a.toLowerCase()));
  return hit||name;
}

// A menu name counts only as a whole phrase in the answer, any case.
const namedIn=(name,text)=>new RegExp('(?<![\\p{L}\\p{N}])'+String(name).trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\p{L}\\p{N}])','iu').test(String(text??''));

function createLocalProvider(core,{rules=RULES}={}){
  if(!core||typeof core.localExperienceClaims!=='function')throw new ProviderError('provider_not_configured','The local provider needs core.localExperienceClaims.',{retryable:false});
  return {
    name:'local',
    model:null,
    async generate(input){
      const experience=String(input?.experience??'');
      const claims=core.localExperienceClaims({role:input?.role,experience,context:input?.context,dates:input?.dates});
      const output={experience:[],skills:[]};
      for(const claim of claims){
        if(!claim||typeof claim!=='object')continue;
        const sourceQuote=String(claim.sourceQuote??claim.sourceText??experience);
        const reason=String(claim.reason??'');
        if(claim.kind==='skill')output.skills.push({name:toYomaName(String(claim.text??''),input?.menuNames),sourceQuote,reason});
        else if(claim.kind==='experience')output.experience.push({text:String(claim.text??''),sourceQuote,reason});
      }
      return {output};
    },
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
