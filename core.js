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
  // Spec 7 checks 1 to 4 and 6 on a bullet or the profile line, the same online and offline. The quote and duplicate checks run on the server.
  // rules is RULES from cv-rules.js, passed in, so this file never reads window.YoCVRules.
  function checkCvText(text,ctx,rules){
    const s=String(text??'').trim(),{fields:f={},role='',kind='bullet',extraNumbers=[],extraNames=[]}=ctx||{},fail=reason=>({ok:false,reason});
    const lower=t=>String(t??'').toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
    const fw=new Set(lower([f.title,f.what,f.forWhom,f.frequency,f.number?.unit,f.outcome].join('\n'))),tw=lower(s);
    // 1. numbers: each one the person gave, their hedge kept before their number, a month only one they chose.
    const nums=numbersIn(s),allowed=allowedNumbers(f,extraNumbers);
    if(nums.some(n=>n.value==null||!allowed.has(n.value)))return fail('invented_number');
    const hedge=f.number?.hedge,value=f.number?.value;
    if(hedge==='about'||hedge==='at least'){
      const vals=typeof value==='number'?[value]:numbersIn(value).map(n=>n.value),before=new RegExp('\\b'+hedge+'\\s+$','i');
      if(nums.some(n=>vals.includes(n.value)&&!before.test(s.slice(0,n.index))))return fail('hedge_dropped');
    }
    const chosen=[f.months?.start,f.months?.end].map(m=>/^\d{4}-(\d{2})$/.exec(String(m??''))).filter(Boolean).map(m=>MONTHS[Number(m[1])-1]);
    if(wordsIn(s).some(w=>MONTHS.includes(w.word)&&!chosen.includes(w.word)&&!fw.has(w.word.toLowerCase())))return fail('invented_number');
    // 2. names: contact details stay in the contact line; every name and weekday comes from the person.
    if(/\[contact/i.test(s)||contactsIn(s).length)return fail('contact_detail');
    if(/\[name/i.test(s))return fail('invented_name');
    const known=new Set([...fw,...lower(role),...extraNames.flatMap(lower)]);
    if(properNouns(s).some(w=>!known.has(w.word.toLowerCase())))return fail('invented_name');
    const day=w=>w.replace(/s$/,''),days=WEEKDAYS.map(d=>d.toLowerCase()),theirDays=new Set([...fw].map(day));
    if(tw.some(w=>days.includes(day(w))&&!theirDays.has(day(w))))return fail('invented_name');
    // 3. overstatement: no inflation stem; a role-upgrade word only when the person used a form of it ('own' counts for owned).
    if(tw.some(w=>rules.inflationStems.some(st=>w.startsWith(st))))return fail('overstated');
    const theirs=new Set(lower([f.what,f.outcome].join('\n'))),forms=rules.roleUpgradeForms;
    const permitted=new Set(Object.keys(forms).filter(k=>forms[k].some(x=>theirs.has(x))||(k==='owned'&&theirs.has('own'))).flatMap(k=>forms[k]));
    if(tw.some(w=>!permitted.has(w)&&Object.values(forms).some(list=>list.includes(w))))return fail('overstated');
    // 4. opening (bullets only): a listed verb, an allowed role-upgrade form, or an -ed or -ing word from their own answer.
    if(kind!=='profile'){
      if(/^(?:responsible for|helped with|duties included)\b/i.test(s))return fail('weak_opening');
      const m=/^(\p{L}[\p{L}\p{M}]*)(?:\s+(\p{L}[\p{L}\p{M}]*))?/u.exec(s),one=m?m[1].toLowerCase():'',two=m&&m[2]?one+' '+m[2].toLowerCase():'';
      const verbs=new Set(rules.verbs.flatMap(v=>v.split('|')));
      if(!one||!(verbs.has(one)||verbs.has(two)||permitted.has(one)||(/(?:ed|ing)$/.test(one)&&theirs.has(one))))return fail('weak_opening');
    }
    // 6. length in code points, one sentence, no exclamation mark.
    const n=[...s].length;
    if(n<40||n>180)return fail('length');
    if(/[.!?] \p{Lu}/u.test(s))return fail('not_one_sentence');
    if(s.includes('!'))return fail('exclamation');
    return {ok:true,checks:kind==='profile'?['numbers','names','overstatement','length']:['numbers','names','overstatement','opening','length']};
  }
  // Spec 7 and 10: the template sentence, the profile line and the months between two 'YYYY-MM' values.
  const ym=v=>{const m=/^(\d{4})-(\d{2})$/.exec(String(v??''));return m&&+m[2]>=1&&+m[2]<=12?+m[1]*12+(+m[2]-1):null;};
  function monthLabel(v){const n=ym(v);return n==null?'':MONTHS[n%12]+' '+Math.floor(n/12);}
  // Both ends count; an empty end counts to the month of nowIso. null for no start, a reversed span or a month after now.
  function monthsBetween(start,end,nowIso){
    const d=new Date(nowIso),now=Number.isNaN(d.getTime())?null:d.getUTCFullYear()*12+d.getUTCMonth();
    const a=ym(start),b=String(end??'')===''?now:ym(end);
    return a==null||b==null||now==null||a>b||b>now?null:b-a+1;
  }
  const len=s=>[...s].length;
  const OPENERS={'customers':'Worked with customers on','a family business':'Worked in a family business on','a household':'Worked for a household on','a community group':'Volunteered with a community group on','an employer':'Worked for an employer on'};
  // Lower the first letter, unless the first word is capitalised mid-sentence in the answers, is a month or weekday, or the second word is capitalised.
  function lowerFirst(s,f){
    const ws=wordsIn(s),first=ws[0]?.word||'',low=first.toLowerCase();
    if(!first||NOT_NAMES.has(first)||/^\p{Lu}/u.test(ws[1]?.word||''))return s;
    const caps=[f.title,f.what,f.forWhom,f.frequency,f.number?.unit,f.outcome].some(t=>wordsIn(t).some(w=>!w.initial&&/^\p{Lu}/u.test(w.word)&&w.word.toLowerCase()===low));
    return caps?s:s.replace(/^\p{Lu}/u,c=>c.toLowerCase());
  }
  const clean=t=>String(t??'').trim().replace(/[\s.!?,;:]+$/,'').replace(/\s*[.!?]+\s+|\s*\n+\s*/g,', ');
  function templateBullet(fields,rules,{nowIso}={}){
    const f=fields||{},what=clean(String(f.what??'').replace(/^\s*i(?:\s+was)?\s+/i,''));
    if(!what)return null;
    const m=/^(\p{L}[\p{L}\p{M}]*)(?:\s+(\p{L}[\p{L}\p{M}]*))?/u.exec(what),one=m?m[1].toLowerCase():'',two=m&&m[2]?one+' '+m[2].toLowerCase():'';
    const forms=new Set((rules?.verbs||[]).flatMap(v=>String(v).split('|'))),whom=String(f.forWhom??'').trim();
    const opener=forms.has(one)||forms.has(two)?'':OPENERS[whom.toLowerCase()]||'Worked on';
    const head=(opener?opener+' '+lowerFirst(what,f):what.replace(/^\p{Ll}/u,c=>c.toUpperCase()))+(!opener&&whom?' for '+whom:'');
    const n=monthsBetween(f.months?.start,f.months?.end,nowIso),s=monthLabel(f.months?.start),e=monthLabel(f.months?.end);
    const span=n==null?'':!e?' since '+s:n===1?' in '+s:' from '+s+' to '+e;
    const num=f.number,value=num&&num.value!=null&&String(num.value).trim()!==''?String(num.value).trim():'',hedge=num&&num.hedge&&num.hedge!=='exactly'?num.hedge+' ':'';
    const lead=value?hedge+value:'',numPart=value?', '+lead+(num.unit?' '+String(num.unit).trim():''):'';
    const freq=String(f.frequency??'').trim(),outcome=clean(f.outcome);
    for(const [fq,out] of [[freq,outcome],[freq,''],['','']]){
      const before=head+(fq?' '+fq:'')+span,text=before+numPart+(out?'; '+out:'')+'.';
      if(len(text)<=180){
        const used=['what',(opener?OPENERS[whom.toLowerCase()]:whom)&&'forWhom',fq&&'frequency',span&&'months',value&&'number',out&&'outcome'].filter(Boolean);
        return {text,highlight:value?[before.length+2,before.length+2+lead.length]:null,sourceFields:used};
      }
    }
    return null;
  }
  // The two strongest skills (S1 first, then input order) and the longest entry by months, as a natural list after '<Role> with'.
  function profileLine({role,skills=[],entries=[],nowIso}={}){
    const top=(skills||[]).map((s,i)=>({...s,i})).sort((a,b)=>String(a.level).localeCompare(String(b.level))||a.i-b.i).slice(0,2);
    const s1=top.filter(s=>s.level==='S1').map(s=>String(s.name).toLowerCase()),parts=[];
    if(s1.length)parts.push(s1.join(' and ')+' recorded on Yoma');
    for(const s of top)if(s.level!=='S1')parts.push(String(s.name).toLowerCase());
    let best=null,months=null;
    for(const e of entries||[]){const n=monthsBetween(e?.months?.start,e?.months?.end,nowIso);if(n!=null&&String(e.title??'').trim()&&(months==null||n>months)){best=e;months=n;}}
    if(best)parts.push(months+' month'+(months===1?'':'s')+' of '+lowerFirst(String(best.title).trim(),best));
    const r=String(role??'').trim().replace(/^\p{Ll}/u,c=>c.toUpperCase());
    if(!r||!parts.length)return null;
    const text=r+' with '+(parts.length>1?parts.slice(0,-1).join(', ')+' and ':'')+parts[parts.length-1]+'.';
    return len(text)<40?null:{text,months};
  }
  // Spec 10 and 11: the one-column CV, its text version and the evidence record. Every printed string comes from copy.
  const fill=(t,v={})=>String(t??'').replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?'':String(v[k]));
  const trim=v=>String(v??'').trim();
  const CONFIRM_KINDS=['none','person','completion','vouch'];
  const draftFor=(state,i)=>(state.review?.entries||[]).find(d=>d.index===i)||null;
  const decisionOf=(state,key)=>state.decisions?.[key]||{decision:'pending'};
  // The wording an accepted or edited item prints: its own text, or the edit's text. Anything else prints nothing.
  const chosenText=(d,text)=>d.decision==='accepted'?trim(text)||null:d.decision==='edited'&&typeof d.text==='string'?trim(d.text)||null:null;
  function monthsText(months,copy){
    const start=monthLabel(months?.start),end=monthLabel(months?.end);
    return !start?'':!end?fill(copy.cvMonthsOpen,{start}):start===end?start:fill(copy.cvMonthsRange,{start,end});
  }
  // One line per ticked opportunity, in record order; a ticked credential replaces its linked completion (plan Deviations 7).
  function learningItems(state,copy){
    const r=state.record||{},inc=state.include||{},creds=(r.credentials||[]).filter(c=>(inc.credentials||[]).includes(c.id)),used=new Set(),out=[];
    const cred=c=>{used.add(c.id);out.push({line:fill(copy.learningCredential,{title:c.title,issuer:c.issuer||copy.issuerNotStated,month:c.month}),skills:[...(c.skills||[])]});};
    for(const c of r.completions||[]){
      const w=creds.find(x=>x.completionId===c.evidenceId);
      if(w)cred(w);else if((inc.completions||[]).includes(c.evidenceId))out.push({line:fill(copy.learningCompletion,{title:c.title,organisation:c.organizationName,month:c.month}),skills:(c.skills||[]).map(s=>s?.name??String(s))});
    }
    for(const c of creds)if(!used.has(c.id))cred(c);
    return out;
  }
  // Newest first by end month: an open end first, an entry with no months last.
  const endKey=m=>ym(m?.start)==null?-Infinity:trim(m?.end)===''?Infinity:ym(m.end)??-Infinity;
  function buildCv(state,copy){
    const c=state.contact||{},o=state.optional||{},pd=decisionOf(state,'profile');
    const experience=(state.entries||[]).map((e,i)=>({e,bullets:(draftFor(state,i)?.proposals||[]).map((p,j)=>chosenText(decisionOf(state,i+':'+j),p.text)).filter(Boolean)}))
      .filter(x=>x.bullets.length).sort((a,b)=>endKey(b.e.months)-endKey(a.e.months)||0)
      .map(({e,bullets})=>({title:trim(e.title),place:trim(e.place),months:monthsText(e.months,copy),bullets}));
    return {
      name:trim(c.name),contact:{phone:trim(c.phone),email:trim(c.email),town:trim(c.town)},
      profile:chosenText(pd,state.profile?.text),experience,
      skills:(state.skills||[]).filter(s=>decisionOf(state,'skill:'+s.name).decision==='accepted').map(s=>({name:s.name,label:s.label})),
      learning:learningItems(state,copy).map(l=>l.line),education:trim(c.education),
      optional:{photo:trim(o.photo),dateOfBirth:trim(o.dateOfBirth),idNumber:trim(o.idNumber),stateOfOrigin:trim(o.stateOfOrigin)},
      sample:state.record?.source!=='token'
    };
  }
  const contactLine=cv=>[cv.contact.phone,cv.contact.email,cv.contact.town].filter(Boolean).join(' · ');
  const optionalLines=(cv,copy)=>[['cvDateOfBirth','dateOfBirth'],['cvIdNumber','idNumber'],['cvStateOfOrigin','stateOfOrigin']].filter(([,k])=>cv.optional[k]).map(([l,k])=>fill(copy.cvOptionalLine,{label:copy[l],value:cv.optional[k]}));
  const metaLine=e=>[e.place,e.months].filter(Boolean).join(' · ');
  // No table, no columns: headings, paragraphs and lists, every value escaped.
  function renderCvHtml(cv,copy,{headingLevel=1}={}){
    const E=escapeHTML,h=(n,t,cls)=>'<h'+(headingLevel+n)+(cls?' class="'+cls+'"':'')+'>'+E(t)+'</h'+(headingLevel+n)+'>',ul=items=>'<ul>'+items.map(t=>'<li>'+E(t)+'</li>').join('')+'</ul>';
    const photo=/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(cv.optional.photo)?'<img class="cv-photo" src="'+E(cv.optional.photo)+'" alt="'+E(fill(copy.cvPhotoAlt,{name:cv.name}))+'">':'';
    const contact=contactLine(cv);
    let s='<article class="cv-paper">'+photo+h(0,cv.name,'cv-name')+(contact?'<p class="cv-contact">'+E(contact)+'</p>':'')+optionalLines(cv,copy).map(l=>'<p class="cv-contact">'+E(l)+'</p>').join('');
    if(cv.profile)s+='<p class="cv-profile">'+E(cv.profile)+'</p>';
    if(cv.experience.length)s+=h(1,copy.cvExperience)+cv.experience.map(e=>'<div class="cv-entry">'+h(2,e.title)+(metaLine(e)?'<p class="cv-dates">'+E(metaLine(e))+'</p>':'')+ul(e.bullets)+'</div>').join('');
    if(cv.skills.length)s+=h(1,copy.cvSkills)+ul(cv.skills.map(k=>fill(copy.cvSkillLine,k)));
    if(cv.learning.length)s+=h(1,copy.learningHeading)+ul(cv.learning);
    if(cv.education)s+=h(1,copy.cvEducation)+'<p>'+E(cv.education)+'</p>';
    s+='<p class="cv-references">'+E(copy.cvReferences)+'</p>';
    if(cv.sample)s+='<p class="cv-sample-note">'+E(copy.cvSampleFooter)+'</p>';
    return s+'</article>';
  }
  function buildCvText(cv,copy){
    const blocks=[[cv.name,contactLine(cv),...optionalLines(cv,copy)].filter(Boolean)];
    if(cv.profile)blocks.push([cv.profile]);
    if(cv.experience.length)blocks.push([copy.cvExperience,...cv.experience.flatMap((e,k)=>[...(k?['']:[]),e.title,...(metaLine(e)?[metaLine(e)]:[]),...e.bullets.map(b=>'- '+b)])]);
    if(cv.skills.length)blocks.push([copy.cvSkills,...cv.skills.map(k=>'- '+fill(copy.cvSkillLine,k))]);
    if(cv.learning.length)blocks.push([copy.learningHeading,...cv.learning.map(l=>'- '+l)]);
    if(cv.education)blocks.push([copy.cvEducation,cv.education]);
    blocks.push([copy.cvReferences]);
    if(cv.sample)blocks.push([copy.cvSampleFooter]);
    return blocks.map(b=>b.join('\n')).join('\n\n');
  }
  // The evidence record: the name's first word in the number notes, never the phone, email, town or an optional field.
  function buildCvRecord(state,copy){
    const g=state.generation||null,r=state.record||null;
    const first=trim(r?.user?.firstName)||trim(state.contact?.name).split(/\s+/)[0],note=raw=>raw+' ('+fill(copy.statedBy,{first})+')';
    const entries=(state.entries||[]).map((e,i)=>{
      const d=draftFor(state,i),n=e.number||null,c=e.confirm||{kind:'none'},notes=[];
      if(n&&trim(n.value)!=='')notes.push(note([n.hedge,n.value,n.unit].map(trim).filter(Boolean).join(' ')));
      for(const k of ['what','outcome'])for(const x of numbersIn(e[k]))if(x.value!=null)notes.push(note(x.raw));
      const lc=c.kind==='completion'?(r?.completions||[]).find(x=>x.evidenceId===c.completionId):null;
      return {index:i,title:trim(e.title),place:trim(e.place),months:{start:trim(e.months?.start),end:trim(e.months?.end)},
        answers:{what:trim(e.what),forWhom:trim(e.forWhom),frequency:trim(e.frequency),number:n?{...n}:null,outcome:trim(e.outcome)},
        numberNotes:notes,linkedCompletion:lc?{evidenceId:lc.evidenceId,title:lc.title,organizationName:lc.organizationName}:null,confirm:{...c},
        proposals:(d?.proposals||[]).map((p,j)=>{const dec=decisionOf(state,i+':'+j);return {text:p.text,origin:p.origin,templateWording:!!p.templateWording,decision:dec.decision,finalText:chosenText(dec,p.text),sourceQuote:p.sourceQuote,sourceFields:[...(p.sourceFields||[])]};}),
        rejected:(d?.rejected||[]).map(x=>({...x}))};
    });
    const pd=state.decisions?.profile;
    return {
      title:copy.recordTitle,createdAt:new Date().toISOString(),
      modeLabel:g?.mode==='live'?fill(copy.modeLive,{model:g.model||g.provider}):g?.mode==='sample-offline'?copy.modeOffline:copy.modeSample,
      generation:g?{...g}:null,account:{source:r?.source??null,fictional:r?r.fictional===true:true},notice:copy.recordNotice,entries,
      profile:{text:pd?.text??state.profile?.text??null,decision:pd?.decision??'pending'},
      skills:(state.skills||[]).filter(s=>decisionOf(state,'skill:'+s.name).decision==='accepted').map(s=>JSON.parse(JSON.stringify(s))),
      learning:learningItems(state,copy)
    };
  }
  // Every source is its own line; no total of vouches or sources is printed (AGENTS rule 6).
  function renderRecordHtml(record,copy){
    const E=escapeHTML,p=(t,cls)=>'<p'+(cls?' class="'+cls+'"':'')+'>'+E(t)+'</p>',li=t=>'<li>'+t+'</li>',ul=items=>items.length?'<ul>'+items.join('')+'</ul>':p(copy.recordNone);
    const g=record.generation,a=record.account||{};
    let s='<article class="cv-record">'+p(record.modeLabel,'mode-label')+'<h1>'+E(record.title)+'</h1>'+p(record.notice)+p(fill(copy.recordMade,{date:record.createdAt}));
    if(g)s+=p(fill(copy.recordGeneration,{provider:g.provider,model:g.model||copy.recordNoModel,ms:g.durationMs}));
    s+=p(a.source==='token'?copy.recordAccountToken:a.source?copy.cvSampleFooter+'.':copy.recordAccountNone);
    s+='<h2>'+E(copy.cvExperience)+'</h2>';
    for(const e of record.entries||[]){
      const x=e.answers||{},n=x.number,meta=[e.place,monthsText(e.months,copy)].filter(Boolean).join(' · ');
      s+='<section class="record-row"><h3>'+E(e.title)+'</h3>'+(meta?p(meta):'')+'<h4>'+E(copy.recordAnswers)+'</h4><dl>'
        +[[copy.qWhat,x.what],[copy.qForWhom,x.forWhom],[copy.qOften,[x.frequency,monthsText(e.months,copy)].filter(Boolean).join(', ')],
          [copy.qNumber,n?[n.hedge,n.value,n.unit].map(trim).filter(Boolean).join(' '):''],[copy.qBetter,x.outcome]]
          .map(([q,v])=>'<dt>'+E(q)+'</dt><dd>'+E(v||copy.recordNone)+'</dd>').join('')+'</dl>'
        +'<h4>'+E(copy.recordNumbers)+'</h4>'+ul(e.numberNotes.map(t=>li(E(t))))
        +'<h4>'+E(copy.recordConfirm)+'</h4>'+p(copy.confirmChips[CONFIRM_KINDS.indexOf(e.confirm?.kind)]||copy.recordNone)
        +(e.linkedCompletion?p(fill(copy.recordLinked,{title:e.linkedCompletion.title,organisation:e.linkedCompletion.organizationName})):'')
        +'<h4>'+E(copy.recordProposals)+'</h4>'+ul(e.proposals.map(x=>li(p(x.text)
          +p([x.origin==='model'?copy.originModel:copy.originTemplate,x.templateWording?copy.templateWording:'',copy['decision_'+x.decision]||x.decision].filter(Boolean).join(' · '))
          +(x.finalText?p(fill(copy.recordFinal,{text:x.finalText})):'')+p(fill(copy.recordQuote,{quote:x.sourceQuote}))+p(fill(copy.recordFields,{fields:x.sourceFields.join(', ')})))))
        +'<h4>'+E(copy.recordRejected)+'</h4>'+ul(e.rejected.map(x=>li(E(fill(copy.recordRejectedLine,{text:x.text,reason:copy['reason_'+x.reason]||x.reason,code:x.reason})))))+'</section>';
    }
    const pr=record.profile||{};
    s+='<h2>'+E(copy.recordProfile)+'</h2>'+p(pr.text||copy.recordNone)+p(copy['decision_'+pr.decision]||pr.decision);
    s+='<h2>'+E(copy.recordSkills)+'</h2>'+ul((record.skills||[]).map(k=>li(E(fill(copy.cvSkillLine,k))+ul((k.sources||[]).map(x=>li(E(fill(copy.recordSource,x))+(x.quote?' '+E(fill(copy.recordQuote,{quote:x.quote})):'')))))));
    s+='<h2>'+E(copy.learningHeading)+'</h2>'+ul((record.learning||[]).map(l=>li(E(l.line)+(l.skills.length?' '+E(fill(copy.recordLearningSkills,{skills:l.skills.join(', ')})):''))));
    return s+'</article>';
  }
  const api={labels,credential,MONTHS,WEEKDAYS,escapeHTML,shortQuote,setCredential,localExperienceClaims,evidenceClaims,generateClaims,reviewClaim,canExport,buildTextCV,buildEvidence,contactsIn,numbersIn,allowedNumbers,properNouns,maskNames,restoreNames,checkCvText,monthLabel,monthsBetween,templateBullet,profileLine,buildCv,renderCvHtml,buildCvText,buildCvRecord,renderRecordHtml};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YoCV=api;
})(typeof globalThis!=='undefined'?globalThis:this);
