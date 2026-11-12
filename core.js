(function(root){
  'use strict';
  const labels={self:'Self-reported',document:'Document awaiting verification',verified:'Issuer-recorded achievement · representative Yoma sample'};
  const builtInCredential={id:'credential-demo',title:'Introduction to digital skills',issuer:'Demo Learning Partner',date:'2026-09-12',dates:'September 2026',statement:'Completed Introduction to digital skills.',sourceLabel:'Demo Learning Partner',synthetic:true,sample:false};
  const credential={...builtInCredential};
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function shortQuote(text,max=240){
    const s=String(text??'');
    if(s.length<=max)return s;
    return s.slice(0,max).replace(/\s+$/,'')+'…';
  }
  function monthYear(iso){
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return '';
    return months[d.getUTCMonth()]+' '+d.getUTCFullYear();
  }
  function setCredential(fixture){
    if(fixture!=null&&(typeof fixture!=='object'||!fixture.id||!fixture.title))throw new Error('A credential fixture needs an id and a title.');
    for(const key of Object.keys(credential))delete credential[key];
    if(fixture==null){Object.assign(credential,builtInCredential);return credential;}
    const attributes=Array.isArray(fixture.attributes)?fixture.attributes:[];
    const attr=name=>{const found=attributes.find(a=>a&&a.name===name);return found&&found.valueDisplay!=null?String(found.valueDisplay).trim():'';};
    const title=String(fixture.title).trim();
    const issuer=String(fixture.issuer||'').trim();
    const issuerShort=issuer.replace(/\s*\([^)]*\)\s*$/,'').trim();
    const organisation=attr('Organization_Name');
    const statement='Completed '+title+'.';
    const summary=attr('Opportunity_Summary');
    const dateIssued=fixture.dateIssued?String(fixture.dateIssued):'';
    const dates=monthYear(dateIssued);
    Object.assign(credential,{
      id:String(fixture.id),
      title,
      issuer,
      date:dates?dateIssued.slice(0,10):'',
      dates,
      statement,
      summary:summary||statement,
      sourceLabel:organisation&&issuerShort?organisation+' via '+issuerShort:organisation||issuer||'Issuer',
      sourceMeta:{artifactType:fixture.artifactType??null,schemaType:fixture.schemaType??null},
      synthetic:false,
      sample:true
    });
    return credential;
  }
  function polish(sentence){
    let s=sentence.trim().replace(/^[•\-]\s*/,'').replace(/^(I|We)\s+/i,'');
    s=s.replace(/^helped\s+/i,'Helped ').replace(/^looked after\s+/i,'Cared for ').replace(/^was responsible for\s+/i,'Took responsibility for ').replace(/^used to\s+/i,'').replace(/^also\s+/i,'');
    if(!s)return '';
    return s[0].toUpperCase()+s.slice(1).replace(/[.!?]+$/,'')+'.';
  }
  function localExperienceClaims(input){
    const experience=String(input.experience??'').trim();
    if(experience.length<12||experience.split(/\s+/).length<3||(experience.match(/\p{L}{2,}/gu)||[]).length<3)throw new Error('Tell us one concrete responsibility, such as who you helped and what you did.');
    if(experience.length>4000)throw new Error('Keep your experience under 4,000 characters for this demo.');
    const source={sourceId:'experience',sourceLabel:input.context||'Your experience',sourceText:experience,category:'self',originalCategory:'self',context:input.context||'',dates:input.dates||'',decision:'pending',edited:false};
    const sentences=experience.split(/\n+|(?<=[.!?])\s+/).map(s=>({sourceQuote:s.trim(),text:polish(s)})).filter(s=>s.text);
    const claims=sentences.slice(0,3).map(({text,sourceQuote},i)=>({...source,id:'experience-'+i,kind:'experience',text,originalText:text,sourceQuote,generated:'local',reason:'Clear wording based on what you told us. Check that it still describes your responsibility accurately.'}));
    const skillRules=[[/customer|shop|sell|sold|enquir/i,'Customer communication','Retail assistant'],[/schedule|appoint|plan|organis|organiz|care|sibling/i,'Organisation','Customer support assistant'],[/volunteer|community|team|garden|clean.?up/i,'Teamwork','Community outreach assistant'],[/stock|pack|order/i,'Attention to detail','Retail assistant'],[/computer|spreadsheet|digital/i,'Basic digital skills','Customer support assistant']];
    const matches=skillRules.filter(([pattern])=>pattern.test(experience));
    const chosen=matches.find(x=>x[2]===input.role)||matches[0];
    if(chosen){
      const evidence=sentences.find(s=>chosen[0].test(s.sourceQuote));
      claims.push({...source,id:'skill-0',kind:'skill',text:chosen[1],originalText:chosen[1],sourceQuote:evidence?evidence.sourceQuote:experience,generated:'local',reason:'Suggested from your tasks, not independently assessed. Include this skill only if you feel it accurately describes you.'});
    }
    return claims;
  }
  function evidenceClaims(input){
    const claims=[];
    if(input.credential){
      const claim={id:'credential-0',kind:'learning',text:credential.statement,originalText:credential.statement,sourceId:credential.id,sourceLabel:credential.sourceLabel||credential.issuer,sourceText:credential.summary||credential.statement,category:'verified',originalCategory:'verified',decision:'pending',edited:false,dates:credential.dates||'',context:credential.title,reason:credential.synthetic?'This synthetic credential represents course completion only. It does not establish workplace proficiency.':'This representative sample credential records course completion only. It does not establish workplace proficiency.'};
      if(credential.sourceMeta)claim.sourceMeta={...credential.sourceMeta};
      claims.push(claim);
    }
    if(input.document?.statement?.trim()){
      const statement=String(input.document.statement).trim().slice(0,2000);
      claims.push({id:'document-0',kind:'experience',text:polish(statement),originalText:polish(statement),sourceId:'document-demo',sourceLabel:String(input.document.name||'Selected document'),sourceText:statement,category:'document',originalCategory:'document',decision:'pending',edited:false,context:'Supporting statement',dates:'',reason:'This is the statement you supplied about a document. Its contents have not been read or verified.'});
    }
    return claims;
  }
  function generateClaims(input){return localExperienceClaims(input).concat(evidenceClaims(input));}
  function reviewClaim(claim,decision,editedText){
    if(!['accepted','rejected','pending'].includes(decision))throw new Error('Invalid review decision.');
    const text=editedText===undefined?claim.text:String(editedText).trim();
    if(decision==='accepted'&&(!text||text.length>1500))throw new Error('Use between 1 and 1,500 characters for a claim.');
    const changed=text!==claim.text;
    return {...claim,text,decision,edited:claim.edited||changed,category:changed?'self':claim.category,originalCategory:claim.originalCategory||claim.category,sourceDates:claim.sourceDates??claim.dates??'',dates:changed&&(claim.originalCategory||claim.category)==='verified'?'':claim.dates};
  }
  function canExport(claims){return claims.length>0&&claims.every(c=>['accepted','rejected'].includes(c.decision))&&claims.some(c=>c.decision==='accepted');}
  function isLive(generation){return !!generation&&generation.mode==='live';}
  function rejectedCount(generation){return generation&&Array.isArray(generation.rejected)?generation.rejected.length:0;}
  function describeGeneration(generation){
    if(!generation)return 'Local sample templates; no live AI call';
    const base=isLive(generation)?'Live AI generation ('+[generation.provider,generation.model].filter(Boolean).join(', ')+')':'Local sample templates; no live AI call';
    const n=rejectedCount(generation);
    return n?base+'; '+n+' suggestion'+(n===1?'':'s')+' rejected by grounding checks':base;
  }
  function skillLine(c){
    const yoma=c.yomaSkill&&c.yomaSkill.name;
    return yoma&&yoma!==c.text?c.text+' (Yoma skill: '+yoma+')':c.text;
  }
  function buildTextCV(profile,role,claims,generation){
    if(!canExport(claims))throw new Error('Review every claim and accept at least one before exporting.');
    const yes=claims.filter(c=>c.decision==='accepted');
    const lines=[profile.name||'Your name',role,[profile.city,profile.email,profile.phone].filter(Boolean).join(' · '),'','EXPERIENCE'];
    yes.filter(c=>c.kind==='experience').forEach(c=>{const heading=[c.context,c.dates].filter(Boolean).join(' | ');lines.push((heading?heading+'\n':'')+'• '+c.text);});
    const skills=yes.filter(c=>c.kind==='skill');if(skills.length)lines.push('','SKILLS',skills.map(skillLine).join(' · '));
    const learning=yes.filter(c=>c.kind==='learning');if(learning.length)lines.push('','LEARNING',...learning.map(c=>'• '+c.text+(c.dates?' ('+c.dates+')':'')));
    const footer=generation?'YoCV prototype · '+(isLive(generation)?'Live AI generation':'Sample generation')+' · Demonstration record':'YoCV prototype · Sample generation · Synthetic demonstration record';
    lines.push('','Supporting sources and evidence categories are available in the separate evidence record.',footer);
    return lines.join('\n');
  }
  function buildEvidence(profile,role,claims,generation){
    const record={title:'YoCV demonstration evidence record',synthetic:true,generationMode:describeGeneration(generation),notice:'User approval confirms wording, not independent verification. Synthetic credentials are demonstration fixtures.',name:profile.name||'Your name',role,claims:claims.map(c=>({...c,evidenceLabel:labels[c.category],includedInCV:c.decision==='accepted'}))};
    if(generation)record.generation={...generation};
    return record;
  }
  const api={labels,credential,escapeHTML,shortQuote,setCredential,localExperienceClaims,evidenceClaims,generateClaims,reviewClaim,canExport,buildTextCV,buildEvidence};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YoCV=api;
})(typeof globalThis!=='undefined'?globalThis:this);
