const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {STRINGS,shell,FLOW_CSS,footer,publicPage}=require('../server/card/render.js');
const {COPY,LANGS,LANG_NAMES,PLAN_ADDITIONS,t,splitOptions}=require('../server/card/copy.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');

const SPEC=path.join(__dirname,'..','docs','superpowers','specs','2026-11-16-yovouch-design.md');
const PUBLIC_URL='https://yocard.example';
function sampleRecord(){
 return {cardId:'ABCDEFGHJK',code:'K7PQ2M',publishedAt:'2026-11-12T10:05:00.000Z',trade:'Hairdresser',
  selfDeclared:{headline:'Braids in Khayelitsha',services:[{name:'Braids',priceFrom:150,priceTo:400,currency:'ZAR'}],area:'Khayelitsha',hours:'Mon-Sat',languages:['English'],notes:''},
  confirms:[],disclosed:{completions:[],skills:[]},
  user:{id:'u-thandi',displayName:'Thandi Mokoena',firstName:'Thandi',photoURL:null,country:'South Africa',city:'Khayelitsha',phoneNumberConfirmed:true,phoneLast3:'147',opportunityCountCompleted:0},
  whatsapp:{enabled:false},accountSource:'sample',snapshotReadAt:'2026-11-12T10:00:00.000Z'};
}

const NOT_STRINGS=['7F3K2A','code sent to their phone','texted from','within three minutes','within about four minutes','REQUEST','card.html','STRINGS'];
const have=new Set([
 ...Object.values(STRINGS).map(v=>typeof v==='function'?v('§','§','§','§'):v),
 STRINGS.limitsShort('§','sms'),STRINGS.limitsLong('§','sms'),
 ...Object.entries(COPY).filter(([k])=>!PLAN_ADDITIONS.includes(k)).map(([,v])=>v.replace(/\{[^}]+\}/g,'§'))]);

test('every section 17 string is in STRINGS or COPY, verbatim',()=>{
 const spec=fs.readFileSync(SPEC,'utf8').split('## 17. Exact copy appendix')[1];
 const wanted=[...spec.matchAll(/`([^`]+)`/g)].map(m=>m[1]).filter(s=>!NOT_STRINGS.includes(s)).map(s=>s.replace(/<[^>]+>/g,'§'));
 for(const s of wanted)assert.ok(have.has(s),'missing: '+s);
});

test('labels read exactly as section 4.2',()=>{
 assert.equal(STRINGS.labelCustomerCode('3 November 2026'),'Said by a customer · code matched on 3 November 2026 · confirmed by them, not by Yoma');
 assert.equal(STRINGS.labelCustomerTexted('16 November 2026','Thandi'),"Said by a customer · code texted from their phone on 16 November 2026 · filled in on Thandi's phone · confirmed by them, not by Yoma");
 assert.equal(STRINGS.limitsShort('Thandi','sms'),"A matched code shows you had Thandi's code in about the last four minutes. It does not show the work was done.");
 assert.ok(STRINGS.limitsLong('Thandi','ivr').includes('within about four minutes of it appearing'));
 assert.ok(STRINGS.limitsLong('Thandi','web').includes('within three minutes of it appearing'));
 assert.equal(STRINGS.whenEarlier('Paving','once'),'Paving, earlier, once.');
});

test('no vouch string overstates',()=>{
 const all=[...have,...PLAN_ADDITIONS.map(k=>COPY[k])].join('\n');
 for(const bad of ['Recorded in person','Vouched in person','in the same place','co-presence','You are with','verified by Yoma'])
  assert.ok(!all.includes(bad),bad);
 assert.equal(all.split('in person').length-1,1);                 // only "Show your ID in person only"
});

test('every vouch tier label keeps "confirmed by them, not by Yoma"',()=>{
 const labels=[STRINGS.labelCustomerCode('d'),STRINGS.labelCustomerTexted('d','A'),STRINGS.labelCustomerDemo('d','A'),STRINGS.labelCustomerSms('d'),STRINGS.labelCustomerCall('d'),STRINGS.labelCustomerRequest,
  STRINGS.labelWorkerCode('A','d'),STRINGS.labelWorkerSms('A','d'),STRINGS.labelWorkerRequest('A'),STRINGS.labelReferral('O','J','d','T')];
 for(const l of labels)assert.ok(l.endsWith('confirmed by them, not by Yoma'),l);
});

test('t falls back to English, fills slots, refuses gaps; splitOptions splits the stem',()=>{
 assert.equal(t('adultsOnly','zu'),'YoVouch is for adults. Thank you anyway.');
 assert.equal(t('codeOld','en',{first:'Thandi'}),'This code is older than 3 minutes. Ask Thandi to show the current one.');
 assert.equal(t('weHeard','en',{transcript:'{first}'}),'We heard: "{first}"');
 assert.throws(()=>t('codeOld','en',{}));
 assert.throws(()=>t('noSuchKey'));
 assert.deepEqual(splitOptions(COPY.when),{stem:'When:',options:['this month','last month','earlier']});
 assert.deepEqual(splitOptions(COPY.adultQ),{stem:'Are you 18 or older?',options:['Yes','No']});
 assert.deepEqual(LANGS,['en','zu','xh','sw','pcm']);
 assert.equal(LANG_NAMES.pcm,'Pidgin');
 for(const k of PLAN_ADDITIONS)assert.equal(typeof COPY[k],'string',k);
});

test('shell without fonts and the new tokens',()=>{
 const html=shell({title:'x',body:'',fonts:false,css:FLOW_CSS});
 assert.ok(!html.includes('fonts.googleapis.com')&&!html.includes('preconnect'));
 assert.ok(Buffer.byteLength(FLOW_CSS)<=900);
 const page=publicPage({record:sampleRecord(),publicUrl:PUBLIC_URL});
 for(const tok of ['--orange:#f9ab3e','--awaiting-tint:#fdeed8','--awaiting:#8a5a00'])assert.ok(page.includes(tok));
 assert.ok(page.includes('fonts.googleapis.com'),'the card page keeps its fonts by default');
});

// Testing log (Task 21): the done page prints the withdraw link as text, and at 360 px the unbroken URL pushed the
// page to 376 px. Flow pages break a long word or link inside main, within the 900-byte budget.
test('a long printed link wraps on a 360 px flow page',()=>{
 assert.match(FLOW_CSS,/main\{[^}]*overflow-wrap:anywhere/);
 assert.ok(Buffer.byteLength(FLOW_CSS)<=900);
});

test('the honesty helper passes a flow page and catches a bad one',()=>{
 const good=shell({title:'x',body:'<p>Hi</p>'+footer(null),fonts:false,css:FLOW_CSS});
 assertHonestPage(good);
 assert.throws(()=>assertHonestPage(good.replace('</main>','<p>Recorded in person</p></main>')));
 assert.throws(()=>assertHonestPage(shell({title:'x',body:footer(null)})));
 assert.doesNotThrow(()=>assertHonestPage(shell({title:'x',body:footer(null)}),{fonts:true}));
 assertPrivateHeaders({headers:{'cache-control':'no-store','referrer-policy':'no-referrer'}});
 assertPrivateHeaders({headers:new Headers({'cache-control':'private, no-store','referrer-policy':'no-referrer'})});
 assert.throws(()=>assertPrivateHeaders({headers:{'cache-control':'no-store'}}));
});
