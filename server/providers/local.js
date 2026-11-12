'use strict';
// Local adapter (spec §5.5): wraps the rule-based generator in core.js so
// sample mode runs through the same pipeline, validators and metadata.
const {ProviderError}=require('./errors.js');

function createLocalProvider(core){
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
        if(claim.kind==='skill')output.skills.push({name:String(claim.text??''),sourceQuote,reason});
        else if(claim.kind==='experience')output.experience.push({text:String(claim.text??''),sourceQuote,reason});
      }
      return {output};
    }
  };
}

module.exports={createLocalProvider};
