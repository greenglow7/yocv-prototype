(function(root){
  'use strict';
  const labels={self:'Self-reported',document:'Document awaiting verification',verified:'Issuer-recorded achievement · representative Yoma sample'};
  const builtInCredential={id:'credential-demo',title:'Introduction to digital skills',issuer:'Demo Learning Partner',date:'2026-09-12',dates:'September 2026',statement:'Completed Introduction to digital skills.',sourceLabel:'Demo Learning Partner',synthetic:true,sample:false};
  const credential={...builtInCredential};
  const MONTHS=Object.freeze(['January','February','March','April','May','June','July','August','September','October','November','December']);
  const WEEKDAYS=Object.freeze(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function shortQuote(text,max=240){
    const s=String(text??'');
    if(s.length<=max)return s;
    return s.slice(0,max).replace(/\s+$/,'')+'…';
  }
  function monthYear(iso){
    const d=new Date(iso);
    if(Number.isNaN(d.getTime()))return '';
    return MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear();
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
  // Spec 3 and spec 7 checks 1 and 2: contact details, numbers and proper nouns, read the same way in the browser and on the server.
  const PLACEHOLDER=/\[(?:name|contact)\d+\]/g;
  function contactsIn(text){
    const s=String(text??''),out=[];
    for(const m of s.matchAll(/\S+@\S+\.\S+/g)){
      const lead=/^[("'<[]*/.exec(m[0])[0].length,raw=m[0].slice(lead).replace(/[.,;:!?)\]'">]+$/,'');
      out.push({raw,index:m.index+lead});
    }
    // A run of digit groups is a phone from its first group on which 7 or more digits follow and that starts with + or 0,
    // or is one group with no separator, so '2025 2026' is not a phone and '2025 071 000 0000' still finds it.
    for(const m of s.matchAll(/\+?\d+(?:[ -]\d+)*/g)){
      const parts=[...m[0].matchAll(/\+?\d+/g)];
      const p=parts.find((p,g)=>{const tail=m[0].slice(p.index);return tail.replace(/\D/g,'').length>=7&&(/^[+0]/.test(tail)||g===parts.length-1);});
      if(!p)continue;
      const raw=m[0].slice(p.index),index=m.index+p.index;
      if(!out.some(c=>index<c.index+c.raw.length&&c.index<index+raw.length))out.push({raw,index});
    }
    return out.sort((a,b)=>a.index-b.index);
  }
  const SMALL=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const TENS=['twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  const VAGUE=['dozens','hundreds','thousands'];
  function numbersIn(text){
    const s=String(text??''),out=[];
    const spans=contactsIn(s).map(c=>[c.index,c.index+c.raw.length]).concat([...s.matchAll(PLACEHOLDER)].map(m=>[m.index,m.index+m[0].length]));
    const free=i=>!spans.some(([a,b])=>i>=a&&i<b);
    for(const m of s.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g))if(free(m.index))out.push({value:Number(m[0].replace(/,/g,'')),raw:m[0],index:m.index});
    const w=[...s.matchAll(/\p{L}+/gu)].filter(m=>free(m.index)).map(m=>({w:m[0].toLowerCase(),index:m.index,end:m.index+m[0].length}));
    // The word at j when it follows word j-1 across a space or a hyphen only, so a comma ends a number.
    const next=j=>j>0&&j<w.length&&/^(?:\s+|-)$/.test(s.slice(w[j-1].end,w[j].index))?w[j].w:null;
    const below100=j=>{
      const a=SMALL.indexOf(w[j].w);if(a>=0)return {v:a,n:1};
      const t=TENS.indexOf(w[j].w);if(t<0)return null;
      const u=SMALL.indexOf(next(j+1)??'');return u>=1&&u<=9?{v:20+10*t+u,n:2}:{v:20+10*t,n:1};
    };
    // After 'hundred' at j-1: an optional 'and' and a number below 100.
    const hundred=(base,j)=>{
      const r=next(j)==='and'&&next(j+1)?below100(j+1):null;if(r)return {v:base+r.v,n:3+r.n};
      const q=next(j)?below100(j):null;return q?{v:base+q.v,n:2+q.n}:{v:base,n:2};
    };
    for(let i=0;i<w.length;){
      const x=w[i].w,nx=next(i+1);let r=null;
      if(VAGUE.includes(x))r={v:null,n:1};
      else if(x==='dozen')r={v:12,n:1};
      else if((x==='a'||x==='one')&&nx==='dozen')r={v:12,n:2};
      else if((x==='a'||x==='one')&&nx==='thousand')r={v:1000,n:2};
      else if(x==='a'&&nx==='hundred')r=hundred(100,i+2);
      else{const b=below100(i);r=b&&b.n===1&&b.v>=1&&b.v<=9&&nx==='hundred'?hundred(b.v*100,i+2):b;}
      if(r){out.push({value:r.v,raw:s.slice(w[i].index,w[i+r.n-1].end),index:w[i].index});i+=r.n;}else i++;
    }
    return out.sort((a,b)=>a.index-b.index);
  }
  function allowedNumbers(fields,extra=[]){
    const f=fields||{},set=new Set(),add=t=>{for(const n of numbersIn(t))if(n.value!=null)set.add(n.value);};
    for(const k of ['title','what','forWhom','outcome'])add(f[k]);
    const value=f.number?.value;
    if(typeof value==='number'){if(Number.isFinite(value))set.add(value);}else if(value!=null)add(value);
    for(const m of [f.months?.start,f.months?.end]){const y=/^(\d{4})-\d{2}$/.exec(String(m??''));if(y)set.add(Number(y[1]));}
    for(const n of extra)if(Number.isFinite(n))set.add(n);
    return set;
  }
  // Words with their position, flagged when sentence-initial: the first word, or the first after . ! ? or a newline.
  function wordsIn(text){
    const s=String(text??''),out=[];let end=-1;
    for(const m of s.matchAll(/\[(?:name|contact)\d+\]|\p{L}[\p{L}\p{M}\p{N}]*/gu)){
      const initial=end<0||/[.!?]['"’”)\]]*(?:\s|$)|\n/.test(s.slice(end,m.index));
      end=m.index+m[0].length;
      if(m[0][0]!=='[')out.push({word:m[0],index:m.index,initial});
    }
    return out;
  }
  const NOT_NAMES=new Set(['I',...MONTHS,...WEEKDAYS,...WEEKDAYS.map(d=>d+'s')]);
  function properNouns(text){return wordsIn(text).filter(w=>!w.initial&&/^\p{Lu}/u.test(w.word)&&!NOT_NAMES.has(w.word)).map(({word,index})=>({word,index}));}
  function maskNames(fields,{role='',verbs=[],known=[]}={}){
    const out={...fields},map={},keys=['title','what','forWhom','outcome'].filter(k=>typeof out[k]==='string');
    const tag=(store,kind,raw)=>{if(!store.has(raw)){const p='['+kind+(store.size+1)+']';store.set(raw,p);map[p]=raw;}return store.get(raw);};
    const swap=(s,spans)=>{let r='',at=0;for(const x of spans){r+=s.slice(at,x.index)+x.to;at=x.index+x.len;}return r+s.slice(at);};
    const words=t=>String(t??'').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
    const contacts=new Map(),names=new Map();
    for(const k of keys)out[k]=swap(out[k],contactsIn(out[k]).map(c=>({index:c.index,len:c.raw.length,to:tag(contacts,'contact',c.raw)})));
    const keep=new Set([...words(role),...verbs.flatMap(v=>String(v).split('|').map(f=>words(f)[0]))]);
    const knownWords=new Set(known.flatMap(words));
    const mask=new Set();
    for(const k of keys)for(const w of properNouns(out[k]))if(!keep.has(w.word.toLowerCase()))mask.add(w.word);
    for(const k of keys)out[k]=swap(out[k],wordsIn(out[k]).filter(w=>mask.has(w.word)||knownWords.has(w.word.toLowerCase())).map(w=>({index:w.index,len:w.word.length,to:tag(names,'name',w.word)})));
    return {fields:out,map};
  }
  // A [contactN] placeholder is never restored, so a contact detail cannot come back from the model.
  function restoreNames(text,map={}){return String(text??'').replace(/\[name\d+\]/g,p=>Object.hasOwn(map,p)?map[p]:p);}
  const api={labels,credential,MONTHS,WEEKDAYS,escapeHTML,shortQuote,setCredential,localExperienceClaims,evidenceClaims,generateClaims,reviewClaim,canExport,buildTextCV,buildEvidence,contactsIn,numbersIn,allowedNumbers,properNouns,maskNames,restoreNames};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YoCV=api;
})(typeof globalThis!=='undefined'?globalThis:this);
