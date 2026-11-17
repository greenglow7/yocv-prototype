#!/usr/bin/env node
'use strict';
/* Prepared demo assets (spec 14, plan Task 18). seedDemo builds the YoVouch system over the card store at dir with
   the sample account source and drives the same services the routes call (no HTTP route, no model call):
     Thandi   three customer vouches: a QR scan with released words, a worker's-phone scan bound by a YES text
              (sms_bind, chips only) and an SMS vouch (sms_origin, chips only)
     Bongani  one completion; vouches for Sipho on the typed path: Paving, words and the hello.webm clip, released
     Sipho    area Umlazi; his confirmed English reply to the Pinetown post (the inbox reply)
     Amara    the accepted Sample Skills Trust referral for the Trans Ekulu post
     Ayo, Bola, Chidi   throwaway bongani cards that vouched A to B, B to C and C to A within three days
   The voucher numbers are sample numbers. Every step runs on a seed clock in the recent past, so the live code of
   every card is untouched. beat3 is extractAnswers over a prepared model output (tests/fixtures/beat3.json).
   With oldCode, <dir>/demo-old-code.svg is Thandi's QR at counterAt(now) - 3, for the screenshot scan in beat 2.
   CLI: node scripts/seed-demo.js [dataDir] [--old-code]   (dataDir defaults to data/cards) */
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {createCardStore}=require('../server/card/store.js');
const {loadOrCreateKey}=require('../server/card/sign.js');
const {createAccountSource}=require('../server/card/account.js');
const {runDraft,validateSelfDeclared,validateConfirms}=require('../server/card/draft.js');
const {buildRecord}=require('../server/card/routes.js');
const {buildVouchSystem,issueVouchFields,indexCard,myUrl}=require('../server/card/vouch-system.js');
const {createReplyService}=require('../server/card/reply-routes.js');
const {extractAnswers,answersText,buildReplyLines,fitReply}=require('../server/card/reply.js');
const {experienceShort,sourceLabel}=require('../server/card/vouch-lines.js');
const {counterAt,qrTag,scanUrl,spokenCode,formatSpoken,STEP_SECONDS}=require('../server/card/vouchcode.js');
const {localTime}=require('../server/card/pages.js');
const {fullDate,escapeHtml}=require('../server/card/render.js');
const {ALPHABET}=require('../server/card/store.js');
const {t}=require('../server/card/copy.js');
const {qrSvg}=require('../server/qr.js');

const ROOT=path.join(__dirname,'..');
const MIN=60000,HOUR=60*MIN,DAY=24*HOUR;
const ORG='Sample Skills Trust',DEMO_ORG_KEY='demo-sample-skills-trust';
const PINETOWN='Need 2 general labourers, Pinetown site, R250/day, training provided, must have own boots, call 0821234567';
const TRANS_EKULU='Hardware shop needs a counter assistant, Trans Ekulu, must have valid ID, start Monday, call 08031234567';
// The plan pins "in 2025"; Amara's Customer Care Basics completion is dated 2026, so the referral number check
// (statementOk) refuses 2025. The demo sentence uses the completion year.
const STATEMENT='Amara completed our customer care programme in 2026 and we refer her for this post.';
const SIPHO_SAYS='two taxis, about an hour, I know the route, from Monday.';
const BEAT3_TRANSCRIPT='I did braids, I can start Monday.';
const CLIP_FILE=path.join(ROOT,'tests','fixtures','hello.webm');
const BEAT3_FILE=path.join(ROOT,'tests','fixtures','beat3.json');
// Sample voucher numbers (South Africa, read with yovouch.smsCountry). None is a persona's number.
const NUMBERS={nomsa:'0825550101',worker:'0825550102',zodwa:'0825550103'};
const RING=[{first:'Ayo',phone:'+27715550171'},{first:'Bola',phone:'+27715550172'},{first:'Chidi',phone:'+27715550173'}];

function must(ok,what){if(!ok)throw new Error('seed-demo: '+what);return ok;}

// The length of a WebM file in whole seconds (at least 1), from Segment > Info > Duration and TimecodeScale.
function webmSeconds(buf){
  const vint=(p,keep)=>{const f=buf[p];let n=1;while(n<=8&&!(f&(0x80>>(n-1))))n++;let v=keep?f:f&(0xff>>n),ones=(v===(0xff>>n));
    for(let i=1;i<n;i++){v=v*256+buf[p+i];ones=ones&&buf[p+i]===0xff;}return {n,v,unknown:!keep&&ones};};
  function* elements(start,end){
    for(let p=start;p<end;){
      const id=vint(p,true),size=vint(p+id.n,false),data=p+id.n+size.n,stop=size.unknown?end:Math.min(end,data+size.v);
      yield {id:id.v,data,stop};p=stop;
    }
  }
  const find=(id,start,end)=>{for(const e of elements(start,end))if(e.id===id)return e;return null;};
  const seg=find(0x18538067,0,buf.length),info=seg&&find(0x1549A966,seg.data,seg.stop);
  if(!info)return null;
  let scale=1000000,dur=null;
  for(const e of elements(info.data,info.stop)){
    if(e.id===0x2AD7B1)scale=buf.readUIntBE(e.data,e.stop-e.data);
    if(e.id===0x4489)dur=e.stop-e.data===8?buf.readDoubleBE(e.data):buf.readFloatBE(e.data);
  }
  return dur===null?null:Math.max(1,Math.round(dur*scale/1e9));
}

async function seedDemo({dir,publicUrl,now=Date.now,oldCode=false,yoma=null,orgKey=DEMO_ORG_KEY,random=crypto.randomBytes}={}){
  must(dir,'dir is required');
  const base=now();
  let at=base;
  const clock=()=>at;
  const store=createCardStore(dir,{now:clock,random});
  const key=loadOrCreateKey(dir);
  const config={yomaAccessToken:'',yovouch:{sim:true,orgKeys:{[ORG]:orgKey}}};
  const accountSource=createAccountSource({config,yoma,now:clock});
  const system=buildVouchSystem({config,store,key,accountSource,provider:null,publicUrl,now:clock,random});
  const {service,sms,vouchStore}=system;
  const replyService=createReplyService(system);

  // ---- Cards, published as POST /api/card/publish does: template draft, the same checks, every item disclosed ----
  function cardCode(){const b=random(6);let s='';for(let i=0;i<6;i++)s+=ALPHABET[b[i]%ALPHABET.length];return s;}
  async function publish(persona,{area,user={}}={}){
    const snap=await accountSource.read({persona});
    const snapshot={...snap,user:{...snap.user,...user}};
    const [trade,label]={thandi:['hair','hairdresser'],sipho:['labourer','general labourer'],bongani:['labourer','general labourer'],amara:['tailor','tailor']}[persona];
    const description='I do '+label+' work in '+(area||snapshot.user.city)+'. Careful and on time.';
    const draft=await runDraft({snapshot,trade,description,provider:null,now:clock});
    const organisationNames=[...new Set(snapshot.completions.map(c=>c.organizationName).filter(Boolean))];
    const self=validateSelfDeclared({...draft.selfDeclared,...(area?{area}:{})},{description,organisationNames});
    must(!self.rejected.length,'self-declared fields for '+persona);
    const confirms=validateConfirms(draft.confirms,snapshot);
    must(!confirms.rejected.length,'confirms for '+persona);
    const disclose={completions:snapshot.completions.map(c=>c.evidenceId),skills:snapshot.skills.map(s=>s.evidenceId),photo:false,whatsapp:false};
    const record=buildRecord({snapshot,trade,selfDeclared:self.value,confirms:confirms.lines,disclose,code:cardCode(),generation:draft.generation,now:clock,personaId:persona});
    const {cardToken,fields}=issueVouchFields(system,{user:snapshot.user});
    const {cardId}=store.create(record,fields);
    indexCard(system,cardId,store.get(cardId),{phoneConfirmed:snapshot.user.phoneNumberConfirmed});
    return {cardId,cardToken,myUrl:myUrl(system,cardId,cardToken)};
  }
  const secretOf=card=>store.get(card.cardId).vouch.secret;
  const qrProof=card=>{const s=counterAt(at);return {method:'qr',t:s,k:qrTag(secretOf(card),s)};};
  const opened=r=>must(r.ok&&r.vouchToken,'open refused: '+r.code)&&r.vouchToken;
  const ok=(r,what)=>must(r&&r.ok!==false,what+(r?.code?': '+r.code:''))&&r;

  // ---- The ring (beat 5): three cards four days ago, then A to B, B to C and C to A, a day apart ----
  at=base-4*DAY;
  const ring=[];
  for(const [i,r] of RING.entries())ring.push(await publish('bongani',{user:{firstName:r.first,displayName:r.first,phoneNumber:r.phone,id:'sample-ring-'+(i+1)}}));
  for(let i=0;i<3;i++){
    at=base-(3-i)*DAY;
    const from=ring[i],to=ring[(i+1)%3];
    const token=opened(await service.open({cardId:to.cardId,proof:qrProof(to),voucher:{kind:'worker',cardId:from.cardId,cardToken:from.cardToken},channel:'web'}));
    ok(service.setChips(token,{work:'Loading',when:'this month',howOften:'a few times',hireAgain:'yes'}),'ring chips');
    ok(service.setDisclose(token,{showMe:'customer',showCard:true}),'ring disclose');
    ok(service.confirm(token,{adult:true,consent:true}),'ring confirm');
  }

  // ---- The four sample cards, two hours ago ----
  at=base-2*HOUR;
  const thandi=await publish('thandi'),sipho=await publish('sipho',{area:'Umlazi'}),bongani=await publish('bongani'),amara=await publish('amara');

  // Thandi 1: Zodwa vouches by SMS with the spoken code and the card number (chips only).
  at=base-100*MIN;
  let token,bind;
  const texts=['VOUCH '+store.get(thandi.cardId).smsId+' '+formatSpoken(spokenCode(secretOf(thandi),counterAt(at))),'2 1 3 1','Zodwa','YES'];
  let last=[];
  for(const text of texts)last=(await sms.handle({from:NUMBERS.zodwa,text})).replies;
  must(/^Published/.test(String(last[0]||'')),'SMS vouch: '+last.join(' | '));
  // Thandi 2: a customer records on Thandi's own phone and binds by texting YES from theirs (chips only).
  at=base-90*MIN;
  token=opened(await service.open({cardId:thandi.cardId,proof:qrProof(thandi),onWorkerPhone:true,channel:'web'}));
  ok(service.setChips(token,{work:'Weave',when:'this month',howOften:'once',hireAgain:'yes'}),'worker phone chips');
  ok(service.setDisclose(token,{showMe:'customer'}),'worker phone disclose');
  bind=ok(service.issueBind(token),'worker phone bind');
  await sms.handle({from:NUMBERS.worker,text:'YES '+bind.sessionCode});
  ok(service.confirm(token,{adult:true,consent:true}),'worker phone confirm');
  // Thandi 3, the newest, so it leads the size-limited card page: Nomsa scans at the door, adds her words and binds her
  // phone with the YES text; Thandi releases the words.
  at=base-80*MIN;
  token=opened(await service.open({cardId:thandi.cardId,proof:qrProof(thandi),channel:'web'}));
  ok(service.setChips(token,{work:'Braids',when:'this month',howOften:'a few times',hireAgain:'yes'}),'scan chips');
  ok(service.setWords(token,{text:'She did my braids three times this year.'}),'scan words');
  ok(service.setDisclose(token,{showMe:'name',firstName:'Nomsa'}),'scan disclose');
  bind=ok(service.issueBind(token),'scan bind');
  await sms.handle({from:NUMBERS.nomsa,text:'YES '+bind.sessionCode});
  const scanned=ok(service.confirm(token,{adult:true,consent:true}),'scan confirm');
  at=base-70*MIN;
  must(vouchStore.showWords(scanned.vouchId,thandi.cardId),'release the scan words');

  // Sipho: Bongani types Sipho's card number and code on his own page, adds his words and the clip.
  at=base-60*MIN;
  const audio=fs.readFileSync(CLIP_FILE),seconds=must(webmSeconds(audio),'hello.webm has no duration');
  token=opened(await service.open({cardRef:store.get(sipho.cardId).smsId,proof:{method:'code',code:spokenCode(secretOf(sipho),counterAt(at))},
    voucher:{kind:'worker',cardId:bongani.cardId,cardToken:bongani.cardToken},channel:'web'}));
  ok(service.setChips(token,{work:'Paving',when:'this month',howOften:'once',hireAgain:'yes'}),'paving chips');
  ok(service.setWords(token,{text:'he arrived before me both days'}),'paving words');
  ok(service.setClip(token,{audio,contentType:'audio/webm',seconds}),'paving clip');
  ok(service.setDisclose(token,{showMe:'customer',attachClip:true,showCard:true}),'paving disclose');
  const paving=ok(service.confirm(token,{adult:true,consent:true}),'paving confirm');
  at=base-40*MIN;
  must(vouchStore.showWords(paving.vouchId,sipho.cardId),'release the paving words and clip');

  // Amara: the referral request for the Trans Ekulu post, the organisation's sentence and Amara's YES.
  at=base-38*MIN;
  const ekulu=await replyService.parse(TRANS_EKULU);
  must(ekulu.jobPostId,'Trans Ekulu post');
  const completion=store.get(amara.cardId).record.disclosed.completions.find(c=>c.title==='Customer Care Basics'&&c.organizationName===ORG);
  const rq=ok(service.createReferralRequestForCard(amara.cardId,{jobPostId:ekulu.jobPostId,evidenceId:must(completion,'Customer Care Basics').evidenceId}),'referral request');
  const org=ok(service.orgOpen(rq.requestId,orgKey),'organisation key');
  const sent=ok(service.orgSend(org.referToken,STATEMENT),'referral statement');
  at=base-35*MIN;
  ok(service.acceptReferralForCard(sent.vouchId,amara.cardId,'yes'),'referral accepted');

  // The inbox reply (beat 1): Sipho's typed answers to the Pinetown post, line 2 on Bongani's vouch, confirmed.
  // The code's keyword rule would fall back to Sipho's own words here (the post says "general labourers", the vouch
  // says "Paving"); the prepared reply carries the spec 6.1 line 2, built from the vouch record with its own label.
  at=base-30*MIN;
  const pinetown=await replyService.parse(PINETOWN);
  must(pinetown.jobPostId,'Pinetown post');
  const d=await replyService.draft({cardId:sipho.cardId,jobPostId:pinetown.jobPostId,text:SIPHO_SAYS,lang:'en',documentAnswer:{'Own boots':'yes'}});
  const pave=vouchStore.get(paving.vouchId).record,siphoRecord=store.get(sipho.cardId).record;
  const line2=t('line2','en',{text:experienceShort(pave,{nowMs:at,country:siphoRecord.user.country}),source:sourceLabel(pave,'Sipho')});
  const lines=fitReply(d.lines.map((l,i)=>i===1?line2:l));
  system.replyStore.update(d.replyId,r=>({...r,lines,linesInSourceLang:lines,sources:r.sources.map((s,i)=>i===1?'vouch:'+paving.vouchId:s)}));
  await replyService.confirm(d.replyId,lines,'en',{cardId:sipho.cardId});

  // Beat 3: the prepared model output that added "5 years", through the same checks as a live extraction.
  const output=JSON.parse(fs.readFileSync(BEAT3_FILE,'utf8'));
  const prepared={name:'prepared',model:null,async complete(){return JSON.parse(JSON.stringify(output));}};
  const ex=await extractAnswers({transcript:BEAT3_TRANSCRIPT,provider:prepared,organisationNames:[],trade:'Hairdresser'});
  const answers=answersText(ex),thandiRecord=store.get(thandi.cardId).record;
  const beatLines=buildReplyLines({card:thandiRecord,firstName:'Thandi',answers,documents:[],clipCount:0,cardUrl:publicUrl+'/c/'+thandi.cardId,
    experience:{text:answers.experience,source:t('srcStated','en',{first:'Thandi'})}});
  const beat3={transcript:BEAT3_TRANSCRIPT,output,answers,rejected:ex.rejected.map(({field,reason})=>({field,reason})),lines:[beatLines[1],beatLines[3]]};

  // The old code: Thandi's QR three steps back, which every scan window has closed.
  let oldCodeFile=null;
  if(oldCode){
    const step=counterAt(base)-3,made=step*STEP_SECONDS*1000;
    const qr=qrSvg(scanUrl(publicUrl,thandi.cardId,step,qrTag(secretOf(thandi),step)),{cellSize:4,margin:4});
    const size=Number(/width="(\d+)"/.exec(qr)[1]),h=size+44;
    const caption='Prepared old code, shown at '+localTime(made,'South Africa')+' on '+fullDate(new Date(made).toISOString())+' (South Africa time). Not a live code.';
    const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size+' '+h+'" width="'+size+'" height="'+h+'" role="img" aria-label="'+escapeHtml(caption)+'">'+
      '<rect width="'+size+'" height="'+h+'" fill="#ffffff"/>'+qr.replace('<svg ','<svg x="0" y="0" ')+
      '<text x="'+(size/2)+'" y="'+(size+16)+'" font-family="system-ui,sans-serif" font-size="9" text-anchor="middle" fill="#1a1024">'+
      escapeHtml(caption.split(' (')[0])+'</text><text x="'+(size/2)+'" y="'+(size+32)+'" font-family="system-ui,sans-serif" font-size="9" text-anchor="middle" fill="#1a1024">'+
      escapeHtml('('+caption.split(' (')[1])+'</text></svg>';
    oldCodeFile=path.join(dir,'demo-old-code.svg');
    fs.writeFileSync(oldCodeFile,svg);
  }

  const cards={thandi,sipho,bongani,amara,ring};
  fs.writeFileSync(path.join(dir,'demo.json'),JSON.stringify({inboxReplyId:d.replyId,beat3,cards},null,2),{mode:0o600});
  return {cards,inboxReplyId:d.replyId,oldCodeFile};
}

async function main(argv){
  const {loadConfig}=require('../server/config.js');
  const {createYomaClient}=require('../server/yoma.js');
  const args=argv.slice(2),oldCode=args.includes('--old-code');
  const dir=path.resolve(args.find(a=>!a.startsWith('--'))||path.join(ROOT,'data','cards'));
  const config=loadConfig({cwd:ROOT});
  const publicUrl=String(config.publicUrl||('http://'+config.host+':'+config.port)).replace(/\/+$/,'');
  const r=await seedDemo({dir,publicUrl,oldCode,yoma:createYomaClient({baseUrl:config.yomaBase}),orgKey:config.yovouch.orgKeys[ORG]||DEMO_ORG_KEY});
  const named=[['Thandi',r.cards.thandi],['Sipho',r.cards.sipho],['Bongani',r.cards.bongani],['Amara',r.cards.amara],...r.cards.ring.map((c,i)=>[RING[i].first,c])];
  for(const [name,c] of named)console.log(name.padEnd(8)+c.myUrl);
  console.log('Reply   '+publicUrl+'/r/'+r.inboxReplyId+'  (id '+r.inboxReplyId+')');
  if(r.oldCodeFile)console.log('Old code '+r.oldCodeFile+' (open it on the laptop for the beat 2 screenshot scan)');
  console.log('Prepared assets in '+path.join(dir,'demo.json')+'. Beat 3 is at '+publicUrl+'/demo/beat3 with YOVOUCH_SIM=1.');
}

module.exports={seedDemo,webmSeconds};

if(require.main===module)main(process.argv).catch(err=>{console.error(err?.message||err);process.exit(1);});
