(function(root){
  'use strict';
  const MONTHS=Object.freeze(['January','February','March','April','May','June','July','August','September','October','November','December']);
  const WEEKDAYS=Object.freeze(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
  function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function shortQuote(text,max=240){
    const s=String(text??'');
    if(s.length<=max)return s;
    return s.slice(0,max).replace(/\s+$/,'')+'…';
  }
  // Spec 3 and spec 7 checks 1 and 2: contact details, numbers and proper nouns, read the same way in the browser and on the server.
  const PLACEHOLDER=/\[(?:name|contact)\d+\]/g;
  function contactsIn(text){
    const s=String(text??''),out=[];
    for(const m of s.matchAll(/\S+@\S+\.\S+/g)){
      const lead=/^[("'<[]*/.exec(m[0])[0].length,raw=m[0].slice(lead).replace(/[.,;:!?)\]'">]+$/,'');
      out.push({raw,index:m.index+lead});
    }
    // A run of digit groups joined by spaces, hyphens, dots, slashes or brackets is a phone from its first group on which
    // 9 or more digits follow, or 7 or more that start with + or 0, or a last group alone. So '2025 2026' is not a phone,
    // and '071.000.0000', '(071) 000 0000', '27 71 000 0000' and '803 123 4567' are masked whole.
    for(const m of s.matchAll(/\(?\+?\d+(?:[ \-./()]+\d+)*/g)){
      const parts=[...m[0].matchAll(/\+?\d+/g)],digits=t=>t.replace(/\D/g,'').length;
      const p=parts.find((p,g)=>{const tail=m[0].slice(p.index),n=digits(tail);return n>=9||(n>=7&&(/^[+0]/.test(tail)||g===parts.length-1));});
      if(!p)continue;
      const start=p===parts[0]?0:p.index,raw=m[0].slice(start),index=m.index+start; // a leading bracket goes with its group
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
    const below1000=j=>{const b=below100(j);return b&&b.n===1&&b.v>=1&&b.v<=9&&next(j+1)==='hundred'?hundred(b.v*100,j+2):b;};
    // After 'thousand' at j-1 (n words so far): an optional 'and' and a number below 1000, so 'two thousand and fifty' is 2050.
    const thousand=(base,n,j)=>{const a=next(j)==='and'&&next(j+1)?1:0,q=next(j+a)?below1000(j+a):null;return q&&q.v>=1&&q.v<=999?{v:base+q.v,n:n+a+q.n}:{v:base,n};};
    for(let i=0;i<w.length;){
      const x=w[i].w,nx=next(i+1);let r=null;
      if(VAGUE.includes(x))r={v:null,n:1};
      else if(x==='dozen')r={v:12,n:1};
      else if((x==='a'||x==='one')&&nx==='dozen')r={v:12,n:2};
      else if(x==='a'&&nx==='thousand')r=thousand(1000,2,i+2);
      else{
        // 'N thousand' (1 to 999) multiplies, so 'two thousand' is 2000, never 2 (final review finding 2).
        const b=x==='a'&&nx==='hundred'?hundred(100,i+2):below1000(i);
        r=b&&b.v>=1&&b.v<=999&&next(i+b.n)==='thousand'?thousand(b.v*1000,b.n+1,i+b.n+1):b;
      }
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
  // A period after a title or an abbreviation (Mr. Dlamini, e.g.) ends no sentence, so the surname is still a proper noun.
  const ABBREV=new Set(['mr','mrs','ms','dr','prof','st','mt','no','e','g','vs']);
  function wordsIn(text){
    const s=String(text??''),out=[];let end=-1,prev='';
    for(const m of s.matchAll(/\[(?:name|contact)\d+\]|\p{L}[\p{L}\p{M}\p{N}]*/gu)){
      const gap=s.slice(end,m.index);
      const initial=end<0||(/[.!?]['"’”)\]]*(?:\s|$)|\n/.test(gap)&&!(ABBREV.has(prev)&&/^\.\s*$/.test(gap)));
      end=m.index+m[0].length;prev=m[0].toLowerCase();
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
    // A vague plural (dozens, hundreds) passes only when the person wrote that word themselves.
    const nums=numbersIn(s),allowed=allowedNumbers(f,extraNumbers);
    if(nums.some(n=>n.value==null?!fw.has(n.raw.toLowerCase()):!allowed.has(n.value)))return fail('invented_number');
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
  // The lead-in a person types before the verb: I, I was, I'm, I've been, we used to, and so on.
  const LEAD_IN=/^\s*(?:i|we)(?:'m|'ve\s+been|\s+(?:am|was|were|also|used\s+to|would|usually|still|just))*\s+/i;
  // Common bare verbs that are not on the list. A clause that opens with one has a verb, so no opener is put in front of it;
  // the opening check then says whether it can open a CV line.
  const BARE_VERBS=new Set(['did','do','does','had','have','got','get','went','go','took','take','gave','give','made','used','am','was','were','sold','ran']);
  function templateBullet(fields,rules,{nowIso}={}){
    const f=fields||{},what=clean(String(f.what??'').replace(LEAD_IN,''));
    if(!what)return null;
    const m=/^(\p{L}[\p{L}\p{M}]*)(?:\s+(\p{L}[\p{L}\p{M}]*))?/u.exec(what),one=m?m[1].toLowerCase():'',two=m&&m[2]?one+' '+m[2].toLowerCase():'';
    const forms=new Set([...(rules?.verbs||[]).flatMap(v=>String(v).split('|')),...Object.values(rules?.roleUpgradeForms||{}).flat()]),whom=String(f.forWhom??'').trim();
    // The clause has a verb when it opens with a listed verb, a role-upgrade form (the person's own word), an -ed or -ing word or a bare verb.
    const hasVerb=forms.has(one)||forms.has(two)||BARE_VERBS.has(one)||/(?:ed|ing)$/.test(one);
    const chip=OPENERS[whom.toLowerCase()]||'',opener=hasVerb?'':chip||'Worked on';
    // The people are named once: a chip opener names them, and a clause that already says 'for' keeps its own words.
    const addWhom=!!whom&&!(opener&&chip)&&!/\bfor\b/i.test(what);
    const head=(opener?opener+' '+lowerFirst(what,f):what.replace(/^\p{Ll}/u,c=>c.toUpperCase()))+(addWhom?' for '+whom:'');
    const n=monthsBetween(f.months?.start,f.months?.end,nowIso),s=monthLabel(f.months?.start),e=monthLabel(f.months?.end);
    const span=n==null?'':!e?' since '+s:n===1?' in '+s:' from '+s+' to '+e;
    const num=f.number,value=num&&num.value!=null&&String(num.value).trim()!==''?String(num.value).trim():'',hedge=num&&num.hedge&&num.hedge!=='exactly'?num.hedge+' ':'';
    const lead=value?hedge+value:'',numPart=value?', '+lead+(num.unit?' '+String(num.unit).trim():''):'';
    const freq=String(f.frequency??'').trim(),outcome=clean(f.outcome);
    for(const [fq,out] of [[freq,outcome],[freq,''],['','']]){
      const before=head+(fq?' '+fq:'')+span,text=before+numPart+(out?'; '+out:'')+'.';
      if(len(text)<=180){
        const used=['what',((opener&&chip)||addWhom)&&'forWhom',fq&&'frequency',span&&'months',value&&'number',out&&'outcome'].filter(Boolean);
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
    const cv={
      name:trim(c.name),contact:{phone:trim(c.phone),email:trim(c.email),town:trim(c.town)},
      profile:chosenText(pd,state.profile?.text),experience,
      skills:(state.skills||[]).filter(s=>decisionOf(state,'skill:'+s.name).decision==='accepted').map(s=>({name:s.name,label:s.label})),
      learning:learningItems(state,copy).map(l=>l.line),education:trim(c.education),
      optional:{photo:trim(o.photo),dateOfBirth:trim(o.dateOfBirth),idNumber:trim(o.idNumber),stateOfOrigin:trim(o.stateOfOrigin)},
      sample:state.record?.source!=='token'
    };
    cv.verify=verifyFor(state.verify,cv);
    return cv;
  }
  // The QR check (spec 2026-11-25-yocv-qr-verify-design): only what the check holds goes in the fingerprint, so a
  // contact change keeps the QR and a changed line drops it. Only an http(s) URL and an svg the server drew print.
  const cvFingerprint=cv=>JSON.stringify([cv.name,cv.experience,cv.skills,cv.learning]);
  function verifyFor(v,cv){
    if(!v||typeof v!=='object'||v.fp!==cvFingerprint(cv))return null;
    if(!/^https?:\/\/[^\s"<>]+$/i.test(String(v.url??''))||!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"[^<]*><rect [^<]*\/><path d="[Mhvz0-9 -]*" fill="#[0-9a-f]{6}"\/><\/svg>$/.test(String(v.qrSvg??'')))return null;
    return {url:String(v.url),code:trim(v.code),qrSvg:String(v.qrSvg),expiresAt:trim(v.expiresAt)};
  }
  // The close of the journey (spec 2026-11-25-yocv-journey-close-design). state.checks lists every check made on this
  // page, with its withdraw secret, so one made before the CV changed can still be withdrawn. Nothing here goes to Yoma.
  function withdrawnCheck(state,checkId,atIso){
    const checks=(state.checks||[]).map(c=>c.checkId===checkId?{...c,withdrawnAt:atIso}:c);
    return {...state,checks,verify:state.verify?.checkId===checkId?null:state.verify};
  }
  const canApply=(state,copy)=>!state.application&&Boolean(buildCv(state,copy).verify);
  // journey is data/journey.json as the config serves it: the listing and the outgoing handoff's name and id.
  function applied(state,journey,atIso){
    const l=journey.listing,o=journey.outgoing||{};
    return {...state,application:{id:trim(o.id),name:trim(o.name),listingId:String(l.id),title:String(l.title),organisation:String(l.organisation),sentAt:atIso,code:trim(state.verify?.code)}};
  }
  // The incoming handoff (the Skill Credential from SkillLens) carries its shared name wherever it is shown.
  function handoffOf(credential,journey,copy){
    const h=journey?.incoming;
    return h&&credential?.walletId&&credential.walletId===h.id?fill(copy.handoffFrom,{name:h.name,from:h.from}):'';
  }
  // The mocked Yo-ID lines, oldest first. dateOf turns an ISO time into the date the page prints.
  // A live check gets a withdraw button in the list (button) unless it is the one printed on the paper, whose button
  // sits under its QR. One made before the CV changed is still live on the server, so it keeps its button.
  function yoidItems(state,copy,dateOf){
    const onPaper=buildCv(state,copy).verify?state.verify.checkId:null;
    const out=(state.checks||[]).map(c=>({kind:'check',checkId:c.checkId,live:!c.withdrawnAt,button:!c.withdrawnAt&&c.checkId!==onPaper,
      text:c.withdrawnAt?fill(copy.yoidCheckWithdrawn,{code:c.code,made:dateOf(c.madeAt),date:dateOf(c.withdrawnAt)})
        :fill(copy.yoidCheck,{code:c.code,made:dateOf(c.madeAt),until:dateOf(c.expiresAt)})}));
    const a=state.application;
    if(a)out.push({kind:'application',text:fill(copy.yoidApplication,{name:a.name||copy.applicationName,title:a.title,organisation:a.organisation,date:dateOf(a.sentAt)})});
    return out;
  }
  const qrSrc=svg=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
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
    if(cv.verify)s+='<div class="cv-verify"><img class="cv-qr" src="'+E(qrSrc(cv.verify.qrSvg))+'" alt="'+E(copy.verifyScan)+'" width="112" height="112">'
      +'<div><p class="cv-verify-title">'+E(copy.verifyScan)+'</p><p>'+E(fill(copy.verifyCode,{code:cv.verify.code}))+'</p><p class="cv-verify-url">'+E(cv.verify.url)+'</p></div></div>';
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
    if(cv.verify)blocks.push([copy.verifyScan+': '+cv.verify.url,fill(copy.verifyCode,{code:cv.verify.code})]);
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
  // The app state (plan Shared shapes, CvState): every field empty, null or 0.
  function newCvState(){
    return {step:0,maxStep:0,sessionId:null,selector:null,record:null,role:'',include:{completions:[],credentials:[],selfAttested:[]},entries:[],
      contact:{name:'',phone:'',email:'',town:'',education:''},optional:{photo:'',dateOfBirth:'',idNumber:'',stateOfOrigin:''},
      review:null,decisions:{},handAdded:[],skills:[],profile:null,generation:null,offline:false,checks:[],application:null};
  }
  // The body of POST /api/cv/review. Each entry goes without its place; contact and optional fields never go.
  // knownWords lists the words of every place, the name and the town once each, only so the server can mask them.
  function reviewPayload(state){
    const words=v=>String(v??'').split(/[\s,]+/).filter(Boolean),c=state.contact||{};
    const entries=(state.entries||[]).map(e=>({title:e.title,what:e.what,forWhom:e.forWhom,frequency:e.frequency,months:{start:e.months?.start??'',end:e.months?.end??''},
      number:e.number?{value:e.number.value,unit:e.number.unit,hedge:e.number.hedge}:null,outcome:e.outcome,confirm:{...e.confirm}}));
    const knownWords=[...new Set([...(state.entries||[]).flatMap(e=>words(e.place)),...words(c.name),...words(c.town)])];
    return {sessionId:state.sessionId,role:state.role,include:state.include,entries,knownWords};
  }
  // Spec 5 Step 3. decide never checks: app.js records an edit only after /api/cv/check or checkCvText answers ok.
  function decide(state,key,decision,text){
    return {...state,decisions:{...(state.decisions||{}),[key]:decision==='edited'?{decision,text:String(text??'')}:{decision}}};
  }
  const DECIDED=['accepted','edited','left_out'],taken=(state,key)=>['accepted','edited'].includes(decisionOf(state,key).decision);
  const bulletKeys=state=>(state.review?.entries||[]).flatMap(d=>(d.proposals||[]).map((p,j)=>d.index+':'+j));
  // Every proposal, skill and the profile (when there is one) decided, and at least one bullet on the CV.
  function readyForCv(state){
    const keys=[...bulletKeys(state),...(state.skills||[]).map(s=>'skill:'+s.name),...(state.profile?['profile']:[])];
    return keys.every(k=>DECIDED.includes(decisionOf(state,k).decision))&&bulletKeys(state).some(k=>taken(state,k));
  }
  // EntryFields: what the checks compare against, without the place and the confirm choice.
  const entryFields=e=>({title:trim(e?.title),what:trim(e?.what),forWhom:trim(e?.forWhom),frequency:trim(e?.frequency),months:{start:trim(e?.months?.start),end:trim(e?.months?.end)},
    number:e?.number?{value:e.number.value,unit:e.number.unit,hedge:e.number.hedge}:null,outcome:trim(e?.outcome)});
  // Spec 10: the profile line reads accepted skills and entries with an accepted or edited bullet, nothing else.
  function profileInput(state){
    return {role:trim(state.role),
      skills:(state.skills||[]).filter(s=>decisionOf(state,'skill:'+s.name).decision==='accepted').map(s=>({name:s.name,level:s.level})),
      entries:(state.entries||[]).filter((e,i)=>(draftFor(state,i)?.proposals||[]).some((p,j)=>taken(state,i+':'+j))).map(entryFields)};
  }
  // The review with no server: the template and the core checks per entry, as sample mode, and no skills.
  function offlineReview(state,rules,nowIso){
    const role=trim(state.role);
    const entries=(state.entries||[]).map((e,index)=>{
      const fields=entryFields(e),t=templateBullet(fields,rules,{nowIso}),proposals=[],rejected=[];
      const r=t&&checkCvText(t.text,{fields,role,kind:'bullet'},rules);
      if(r&&r.ok)proposals.push({text:t.text,origin:'template',templateWording:false,sourceQuote:fields.what,sourceFields:[...t.sourceFields],usedNumbers:numbersIn(t.text).map(n=>n.raw),highlight:t.highlight,checks:r.checks});
      else if(r)rejected.push({kind:'bullet',text:t.text,reason:r.reason});
      return {index,proposals,rejected,skills:[],needsDetail:!proposals.length};
    });
    return {entries,skills:[],generation:{mode:'sample-offline',provider:'browser-local',model:null,durationMs:0}};
  }
  const api={MONTHS,WEEKDAYS,escapeHTML,shortQuote,contactsIn,numbersIn,allowedNumbers,properNouns,maskNames,restoreNames,checkCvText,monthLabel,monthsBetween,templateBullet,profileLine,buildCv,renderCvHtml,buildCvText,buildCvRecord,cvFingerprint,renderRecordHtml,newCvState,withdrawnCheck,canApply,applied,handoffOf,yoidItems,reviewPayload,decide,readyForCv,profileInput,offlineReview};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YoCV=api;
})(typeof globalThis!=='undefined'?globalThis:this);
