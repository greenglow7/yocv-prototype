(function(root){
  'use strict';
  const labels={self:'Self-reported',document:'Document awaiting verification',verified:'Issuer-verified achievement · synthetic demo'};
  const credential={id:'credential-demo',title:'Introduction to digital skills',issuer:'Demo Learning Partner',date:'2026-09-12',statement:'Completed Introduction to digital skills.',synthetic:true};
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function polish(sentence){
    let s=sentence.trim().replace(/^[•\-]\s*/,'').replace(/^(I|We)\s+/i,'');
    s=s.replace(/^helped\s+/i,'Helped ').replace(/^looked after\s+/i,'Cared for ').replace(/^was responsible for\s+/i,'Took responsibility for ').replace(/^used to\s+/i,'').replace(/^also\s+/i,'');
    if(!s)return '';
    return s[0].toUpperCase()+s.slice(1).replace(/[.!?]+$/,'')+'.';
  }
  function generateClaims(input){
    const experience=String(input.experience??'').trim();
    if(experience.length<12||experience.split(/\s+/).length<3)throw new Error('Tell us one concrete responsibility, such as who you helped and what you did.');
    if(experience.length>4000)throw new Error('Keep your experience under 4,000 characters for this demo.');
    const source={sourceId:'experience',sourceLabel:input.context||'Your experience',sourceText:experience,category:'self',originalCategory:'self',context:input.context||'',dates:input.dates||'',decision:'pending',edited:false};
    const sentences=experience.split(/\n+|(?<=[.!?])\s+/).map(polish).filter(Boolean).slice(0,3);
    const claims=sentences.map((text,i)=>({...source,id:'experience-'+i,kind:'experience',text,originalText:text,reason:'Clear wording based on what you told us. Check that it still describes your responsibility accurately.'}));
    const skillRules=[[/customer|shop|sell|sold|enquir/i,'Customer communication','Retail assistant'],[/schedule|appoint|plan|organis|organiz|care|sibling/i,'Organisation','Customer support assistant'],[/volunteer|community|team|garden|clean.?up/i,'Teamwork','Community outreach assistant'],[/stock|pack|order/i,'Attention to detail','Retail assistant'],[/computer|spreadsheet|digital/i,'Basic digital skills','Customer support assistant']];
    const matches=skillRules.filter(([pattern])=>pattern.test(experience));
    const chosen=matches.find(x=>x[2]===input.role)||matches[0];
    if(chosen)claims.push({...source,id:'skill-0',kind:'skill',text:chosen[1],originalText:chosen[1],reason:'Suggested from your tasks, not independently assessed. Include this skill only if you feel it accurately describes you.'});
    if(input.credential)claims.push({id:'credential-0',kind:'learning',text:credential.statement,originalText:credential.statement,sourceId:credential.id,sourceLabel:credential.issuer,sourceText:credential.statement,category:'verified',originalCategory:'verified',decision:'pending',edited:false,dates:'September 2026',context:credential.title,reason:'This synthetic credential represents course completion only. It does not establish workplace proficiency.'});
    if(input.document?.statement?.trim()){
      const statement=String(input.document.statement).trim().slice(0,2000);
      claims.push({id:'document-0',kind:'experience',text:polish(statement),originalText:polish(statement),sourceId:'document-demo',sourceLabel:String(input.document.name||'Selected document'),sourceText:statement,category:'document',originalCategory:'document',decision:'pending',edited:false,context:'Supporting statement',dates:'',reason:'This is the statement you supplied about a document. Its contents have not been read or verified.'});
    }
    return claims;
  }
  function reviewClaim(claim,decision,editedText){
    if(!['accepted','rejected','pending'].includes(decision))throw new Error('Invalid review decision.');
    const text=editedText===undefined?claim.text:String(editedText).trim();
    if(decision==='accepted'&&(!text||text.length>1500))throw new Error('Use between 1 and 1,500 characters for a claim.');
    const changed=text!==claim.text;
    return {...claim,text,decision,edited:claim.edited||changed,category:changed?'self':claim.category,originalCategory:claim.originalCategory||claim.category,sourceDates:claim.sourceDates??claim.dates??'',dates:changed&&(claim.originalCategory||claim.category)==='verified'?'':claim.dates};
  }
  function canExport(claims){return claims.length>0&&claims.every(c=>['accepted','rejected'].includes(c.decision))&&claims.some(c=>c.decision==='accepted');}
  function buildTextCV(profile,role,claims){
    if(!canExport(claims))throw new Error('Review every claim and accept at least one before exporting.');
    const yes=claims.filter(c=>c.decision==='accepted');
    const lines=[profile.name||'Your name',role,[profile.city,profile.email,profile.phone].filter(Boolean).join(' · '),'','EXPERIENCE'];
    yes.filter(c=>c.kind==='experience').forEach(c=>{const heading=[c.context,c.dates].filter(Boolean).join(' | ');lines.push((heading?heading+'\n':'')+'• '+c.text);});
    const skills=yes.filter(c=>c.kind==='skill');if(skills.length)lines.push('','SKILLS',skills.map(c=>c.text).join(' · '));
    const learning=yes.filter(c=>c.kind==='learning');if(learning.length)lines.push('','LEARNING',...learning.map(c=>'• '+c.text+(c.dates?' ('+c.dates+')':'')));
    lines.push('','Supporting sources and evidence categories are available in the separate evidence record.','YoCV prototype · Sample generation · Synthetic demonstration record');
    return lines.join('\n');
  }
  function buildEvidence(profile,role,claims){return {title:'YoCV demonstration evidence record',synthetic:true,generationMode:'Local sample templates; no live AI call',notice:'User approval confirms wording, not independent verification. Synthetic credentials are demonstration fixtures.',name:profile.name||'Your name',role,claims:claims.map(c=>({...c,evidenceLabel:labels[c.category],includedInCV:c.decision==='accepted'}))};}
  const api={labels,credential,escapeHTML,generateClaims,reviewClaim,canExport,buildTextCV,buildEvidence};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YoCV=api;
})(typeof globalThis!=='undefined'?globalThis:this);
