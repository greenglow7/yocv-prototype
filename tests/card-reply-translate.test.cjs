'use strict';
// Plan Task 15: translation with the back-translation confirmation (spec 6.4, 7.6 step 5, 9.3).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {translateLines,translateReply}=require('../server/card/reply.js');
const {tierItem}=require('../server/card/vouch-lines.js');
const {bootVouch,publishPersona,post}=require('./helpers/vouch-boot.cjs');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');

const PINETOWN='Need 2 general labourers, Pinetown site, R250/day, training provided, must have own boots, call 0821234567';
const ZU_SPEECH='Ngizothatha amatekisi amabili. Ngiqala ngoMsombuluko. Ngenze umsebenzi wokwakha.';
const EN='In English: ',ZU='Ngesizulu: ';
const textOf=req=>/<<<TEXT>>>\n([\s\S]*)\n<<<END>>>/.exec(req.messages.at(-1).content)[1];
// A fake model: every other schema fails (the rules take over); a translation prefixes each line.
function translator({addNumber=false,dropLine=false,fail=false}={}){
  const calls=[];
  return {name:'azure-openai',model:'x',calls,async complete(req){
    if(req.schemaName!=='yovouch_translate')throw new Error('rules only');
    calls.push(req);
    if(fail)throw new Error('provider down');
    assert.deepEqual(req.schema,{type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false});
    const toEnglish=/ to English\./.test(req.messages[0].content);
    let lines=textOf(req).split('\n').map(l=>toEnglish?EN+l:ZU+l.replace(EN,''));
    if(toEnglish&&addNumber)lines=lines.map((l,i)=>i===1?l+' for 5 years':l);
    if(dropLine)lines=lines.slice(1);
    return {text:lines.join('\n')};
  }};
}
async function zuReply(opts={}){
  const provider=opts.provider===undefined?translator(opts):opts.provider;
  const b=await bootVouch({provider});
  const card=await publishPersona(b.base,'sipho',{area:'Umlazi'});
  const p=await post(b.base,'/api/reply/parse',{text:PINETOWN});
  const d=await post(b.base,'/api/reply/draft',{cardId:card.cardId,cardToken:card.cardToken,jobPostId:p.jobPostId,text:ZU_SPEECH,lang:'zu',documentAnswer:{'Own boots':'yes'}});
  return {...b,...card,provider,rid:d.replyId,zuLines:d.lines,replyFile:id=>path.join(b.dir,'replies',id+'.json')};
}
const html=async(base,route)=>{const res=await fetch(base+route);return {res,text:await res.text()};};

test('no English is stored or returned before the YES, then YES releases it with the honest label', async () => {
  const {base,vouch,cardId,cardToken,rid,zuLines,replyFile,provider}=await zuReply();
  const englishLine1=EN+zuLines[0];
  const c=await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
  assert.equal(c.forward,undefined); assert.equal(c.backTranslation.length,6);
  assert.deepEqual(c.messages,['Is this what you said?']);
  assert.equal(c.backTranslation[0],ZU+zuLines[0]); assert.equal(c.backTranslation[5],zuLines[5]);
  assert.ok(!JSON.stringify(c).includes(EN));
  const r=vouch.replyStore.get(rid);
  assert.equal(r.lines,null); assert.deepEqual(r.linesInSourceLang,zuLines); assert.equal(r.confirmedLang,'zu');
  assert.equal(r.translation.by,'model'); assert.deepEqual(r.translation.backTranslation,c.backTranslation); assert.equal(r.translation.confirmedBySpeaker,false);
  assert.ok(!fs.readFileSync(replyFile(rid),'utf8').includes(englishLine1));
  assert.ok(!fs.readFileSync(replyFile(rid),'utf8').includes(EN));
  const before=await html(base,'/r/'+rid);
  assertPrivateHeaders(before.res); assertHonestPage(before.text);
  assert.ok(!before.text.includes(englishLine1)&&!before.text.includes(EN)&&before.text.includes(c.backTranslation[0]));
  assert.ok(before.text.includes('<div class="small">'+c.backTranslation[0]+'</div>'));
  assert.ok(!before.text.includes('Translated from'));
  // The model got lines 1 to 5 only: no name, no card id, no card link.
  assert.equal(provider.calls.length,2);
  for(const req of provider.calls){const s=JSON.stringify(req);assert.ok(!s.includes('Sipho')&&!s.includes(cardId)&&!s.includes('yocard.example'),s);}
  assert.equal(textOf(provider.calls[0]).split('\n').length,5);
  // YES.
  const y=await post(base,`/api/reply/${rid}/back-translation`,{cardId,cardToken,answer:'yes'});
  assert.ok(y.forward.includes(englishLine1));
  assert.ok(y.forward.startsWith('Forward this to the number in the post. YoVouch never messages employers.'));
  assert.ok(!y.forward.includes('isiZulu'),'no language label goes to the employer');
  const s=vouch.replyStore.get(rid);
  assert.equal(s.lines[0],englishLine1); assert.equal(s.lines.length,6); assert.equal(s.lines[5],zuLines[5]);
  assert.equal(s.translation.confirmedBySpeaker,true); assert.equal(s.translation.confirmedAt,new Date(vouch.now()).toISOString());
  const after=await html(base,'/r/'+rid);
  assertHonestPage(after.text);
  assert.ok(after.text.includes('Translated from isiZulu by AI. Sipho confirmed the isiZulu wording.'));
  assert.ok(after.text.includes(englishLine1)&&!after.text.includes(ZU));
  assert.ok(!after.text.includes('Not translated'));
  // Nothing is pending after the YES.
  const again=await fetch(base+`/api/reply/${rid}/back-translation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId,cardToken,answer:'yes'})});
  assert.equal(again.status,409);
  const bad=await fetch(base+`/api/reply/${rid}/back-translation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId,cardToken:'0'.repeat(16),answer:'yes'})});
  assert.equal(bad.status,404);
});

test('a NO returns to the edit loop; a second NO gives Not translated', async () => {
  const {base,vouch,cardId,cardToken,rid,zuLines}=await zuReply();
  await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
  const no=await post(base,`/api/reply/${rid}/back-translation`,{cardId,cardToken,answer:'no'});
  assert.ok(no.messages[0].startsWith('Reply 1 to get the English reply'),no.messages[0]);
  let r=vouch.replyStore.get(rid);
  assert.equal(r.translation.backTranslation,null); assert.equal(r.translation.noCount,1); assert.equal(r.lines,null);
  assert.equal((await fetch(base+'/r/'+rid)).status,404,'back in the edit loop, the page closes');
  const late=await fetch(base+`/api/reply/${rid}/back-translation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId,cardToken,answer:'yes'})});
  assert.equal(late.status,409,'the English is gone after a NO');
  const c=await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
  assert.equal(c.backTranslation.length,6,'the next confirm translates again');
  const no2=await post(base,`/api/reply/${rid}/back-translation`,{cardId,cardToken,answer:'No.'});
  assert.deepEqual(no2,{forward:null,notTranslated:true});
  r=vouch.replyStore.get(rid);
  assert.equal(r.lines,null); assert.equal(r.translation.backTranslation,null); assert.equal(r.translation.confirmedBySpeaker,false);
  assert.ok(!fs.readFileSync(path.join(vouch.replyStore.dir,rid+'.json'),'utf8').includes(EN));
  const pg=await html(base,'/r/'+rid);
  assert.equal(pg.res.status,200); assert.ok(pg.text.includes('Not translated')&&pg.text.includes('Ngizothatha'));
  // After the second NO a confirm translates no more.
  const c3=await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
  assert.deepEqual(c3,{forward:null,lines:zuLines,notTranslated:true});
  const odd=await fetch(base+`/api/reply/${rid}/back-translation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId,cardToken,answer:'maybe'})});
  assert.equal(odd.status,400);
});

test('model unavailable: own-language lines and Not translated', async () => {
  for(const provider of [null,translator({fail:true})]){
    const {base,vouch,cardId,cardToken,rid,zuLines}=await zuReply({provider});
    const c=await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
    assert.deepEqual(c,{forward:null,lines:zuLines,notTranslated:true});
    const r=vouch.replyStore.get(rid);
    assert.equal(r.lines,null); assert.equal(r.translation.by,'none'); assert.equal(r.translation.backTranslation,null);
    const pg=await html(base,'/r/'+rid);
    assert.ok(pg.text.includes('Not translated')&&pg.text.includes('Ngizothatha')&&!pg.text.includes(EN));
  }
});

test('an English line with an added number fails the check', async () => {
  const reply={lang:'zu',confirmedLang:'zu',transcript:ZU_SPEECH,linesInSourceLang:['Sipho · General labourer · Umlazi · to the job: amatekisi','Experience: ukwakha (stated by Sipho, not checked)',
    'Confirmed from Yoma: phone confirmed (not an ID check)','Available: ngoMsombuluko (stated by Sipho)','Own boots: yes (stated by Sipho)','Card: https://yocard.example/c/ABCDEFGHJK · tail']};
  assert.equal(await translateReply(reply,{provider:translator({addNumber:true}),transcript:ZU_SPEECH}),null);
  const ok=await translateReply(reply,{provider:translator(),transcript:ZU_SPEECH,firstName:'Sipho'});
  assert.equal(ok.english[1],EN+reply.linesInSourceLang[1]); assert.equal(ok.english.length,6); assert.equal(ok.back.length,6);
  assert.equal(ok.back[1],ZU+reply.linesInSourceLang[1]);
  assert.equal(await translateReply(reply,{provider:null,transcript:ZU_SPEECH}),null);
  assert.equal(await translateReply({...reply,lang:'en',confirmedLang:'en'},{provider:translator(),transcript:ZU_SPEECH}),null);
  const banned=translator();banned.complete=async req=>({text:textOf(req).split('\n').map(l=>l+' certified').join('\n')});
  assert.equal(await translateReply(reply,{provider:banned,transcript:ZU_SPEECH}),null);
  const phone={...reply,linesInSourceLang:reply.linesInSourceLang.map((l,i)=>i===3?'Available: call 0821234567 (stated by Sipho)':l)};
  assert.equal(await translateReply(phone,{provider:translator(),transcript:ZU_SPEECH}),null,'a phone number is never sent to the model');
  // translateLines: one call, the lines joined by a newline, null on a different line count.
  const tl=translator();
  assert.deepEqual(await translateLines(['a b','c d'],'zu','en',tl),[EN+'a b',EN+'c d']);
  assert.equal(tl.calls.length,1); assert.equal(tl.calls[0].schemaName,'yovouch_translate'); assert.equal(textOf(tl.calls[0]),'a b\nc d');
  assert.equal(await translateLines(['a b','c d'],'zu','en',translator({dropLine:true})),null);
  // Over HTTP the added number means no English at all.
  const {base,vouch,cardId,cardToken,rid,zuLines}=await zuReply({addNumber:true});
  const c=await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
  assert.deepEqual(c,{forward:null,lines:zuLines,notTranslated:true});
  assert.equal(vouch.replyStore.get(rid).lines,null);
});

test('the English waits in memory for 30 minutes, and an edit drops it', async () => {
  const {base,vouch,clock,cardId,cardToken,rid,zuLines}=await zuReply();
  await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
  clock.t+=31*60000;
  const late=await fetch(base+`/api/reply/${rid}/back-translation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId,cardToken,answer:'yes'})});
  assert.equal(late.status,409);
  assert.equal(vouch.replyStore.get(rid).lines,null);
  await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:zuLines,lang:'zu'});
  const e=await post(base,`/api/reply/${rid}/edit`,{cardId,cardToken,line:4,text:'4 ngoLwesibili'});
  assert.equal(e.ok,true);
  const r=vouch.replyStore.get(rid);
  assert.equal(r.translation.backTranslation,null); assert.equal(r.lines,null);
  const stale=await fetch(base+`/api/reply/${rid}/back-translation`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cardId,cardToken,answer:'yes'})});
  assert.equal(stale.status,409,'an edit drops the waiting English');
  // After a YES, an edit puts the English away again until the next YES.
  const c=await post(base,`/api/reply/${rid}/confirm`,{cardId,cardToken,lines:e.lines,lang:'zu'});
  assert.ok(c.backTranslation[3].includes('ngoLwesibili'));
  await post(base,`/api/reply/${rid}/back-translation`,{cardId,cardToken,answer:'yes'});
  assert.ok(vouch.replyStore.get(rid).lines[3].startsWith(EN));
  await post(base,`/api/reply/${rid}/edit`,{cardId,cardToken,line:4,text:'4 ngoLwesithathu'});
  const x=vouch.replyStore.get(rid);
  assert.equal(x.lines,null); assert.equal(x.translation.confirmedBySpeaker,false); assert.equal(x.translation.confirmedAt,null);
});

test('vouch words are never translated', async () => {
  const words='Wenza umsebenzi omuhle kakhulu';
  const record={vouchId:'Q7M2PX4KLW',cardId:'ABCDEFGHJK',kind:'customer',lang:'zu',proof:{method:'qr',channel:'web',onWorkerPhone:false},
    voucher:{label:'a customer',phoneConfirmedBy:'sms_bind'},fields:{work:'Braids',words,when:'2026-11',howOften:'once',hireAgain:'yes'},
    line:'Braids, November 2026, once. Would hire again: yes. "'+words+'"',flags:[],visits:1,confirmedAt:'2026-11-16T14:00:00.000Z'};
  const item=tierItem(record,'Sipho',{nowMs:Date.parse('2026-11-16T15:00:00Z')});
  assert.ok(item.line.includes(words)); assert.ok(!/translat/i.test(JSON.stringify(item)));
  // On the card page the voucher's words show in isiZulu and the model is never asked to translate them.
  const {base,vouch,cardId,provider}=await zuReply();
  vouch.vouchStore.create({record:{...record,cardId},channel:'web'});
  const pg=await html(base,'/c/'+cardId);
  assert.ok(pg.text.includes(words)); assert.ok(!pg.text.includes(EN)&&!pg.text.includes('Translated from'));
  assert.ok(provider.calls.every(req=>!JSON.stringify(req).includes(words)));
});
