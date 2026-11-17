const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {STEP_SECONDS,BATCH_STEPS,counterAt,hotp,spokenCode,formatSpoken,qrTag,newSecret,normaliseSpoken,normaliseCardRef,scanUrl,codeBatch,createCodeService}=require('../server/card/vouchcode.js');
const {DIAL_CODES,normalisePhone,keyedHash,createVoucherFiles}=require('../server/card/vouchers.js');
const {loadOrCreateHashKey}=require('../server/card/vouches.js');
const {createCardStore}=require('../server/card/store.js');
const {encodeQr}=require('../server/qr.js');

const SEC='3132333435363738393031323334353637383930';            // ASCII "12345678901234567890"
const NOW=Date.parse('2026-11-16T14:40:12Z');                    // counter 19942666
const ID='ABCDEFGHJK';
const K=crypto.createHash('sha256').update('test hash key').digest();
const K64='a'.repeat(64);
const QR={method:'qr',t:19942666,k:'CEX8WJKP'};
const pick=r=>({ok:r.ok,step:r.step});
function tempDir(){return fs.mkdtempSync(path.join(os.tmpdir(),'yocard-vouchcode-'));}
function setup({withdrawn=false}={}){
 const dir=tempDir(),clock={t:NOW};
 const random=n=>n===10?Buffer.from([0,1,2,3,4,5,6,7,8,9]):crypto.randomBytes(n);
 const store=createCardStore(dir,{random,now:()=>clock.t});
 const {cardId}=store.create({code:'7F3K2A',trade:'Hairdresser'},{smsId:'48213',vouch:{secret:SEC,usedSteps:[],failedAttempts:[],lockedUntil:null}});
 assert.equal(cardId,ID);
 if(withdrawn)store.update(ID,e=>{e.withdrawnAt=new Date(NOW).toISOString();});
 const voucherFiles=createVoucherFiles(dir,{now:()=>clock.t});
 const codes=createCodeService({store,voucherFiles,now:()=>clock.t});
 return {dir,clock,store,voucherFiles,codes};
}

test('constants',()=>{
 assert.equal(STEP_SECONDS,90); assert.equal(BATCH_STEPS,10);
 assert.equal(formatSpoken('483201'),'483 201');
 assert.match(newSecret(),/^[0-9a-f]{40}$/);
 assert.equal(newSecret(n=>Buffer.alloc(n,1)),'01'.repeat(20));
 assert.equal(DIAL_CODES['South Africa'],'27');
});

test('HOTP core matches RFC 6238 Appendix B SHA-256',()=>{
 const seed=Buffer.from('12345678901234567890123456789012');
 for(const [t,want] of [[59,'46119246'],[1111111109,'68084774'],[1111111111,'67062674'],[1234567890,'91819424'],[2000000000,'90698825'],[20000000000,'77737706']])
  assert.equal(hotp(seed,Math.floor(t/30),8),want);
});

test('spec clock: counter, spoken code, QR tag, payload',()=>{
 assert.equal(counterAt(NOW),19942666);
 assert.equal(spokenCode(SEC,19942666),'697855');
 assert.equal(spokenCode(SEC,19942665),'134326');
 assert.equal(qrTag(SEC,19942666),'CEX8WJKP');
 assert.equal(qrTag(SEC,19942664),'HR4Q8QG8');
 const url=scanUrl('https://yocard.example','ABCDEFGHJK',19942666,'CEX8WJKP');
 assert.equal(url,'https://yocard.example/s/ABCDEFGHJK?t=19942666&k=CEX8WJKP');
 assert.equal(Buffer.byteLength(url),57);
 assert.equal(encodeQr(url).version,4);
});

test('scan window is two steps, SMS and IVR three, never forward',()=>{
 const {codes}=setup();
 assert.deepEqual(pick(codes.verify(ID,{method:'code',code:'134326'},{channel:'web'})),{ok:true,step:19942665});
 assert.equal(codes.verify(ID,{method:'code',code:'100839'},{channel:'web'}).code,'code_expired'); // 19942664
 assert.equal(codes.verify(ID,{method:'code',code:'100839'},{channel:'sms'}).ok,true);
 assert.equal(codes.verify(ID,{method:'code',code:'100839'},{channel:'ivr'}).ok,true);
 assert.equal(codes.verify(ID,{method:'code',code:'252298'},{channel:'sms'}).code,'code_expired'); // 19942663
 assert.equal(codes.verify(ID,{method:'code',code:'714836'},{channel:'web'}).code,'code_wrong');   // 19942667
 assert.equal(codes.verify(ID,{method:'qr',t:19942664,k:'HR4Q8QG8'}).code,'code_expired');
 assert.equal(codes.verify(ID,{method:'qr',t:19942666,k:'CEX8WJKQ'}).code,'code_wrong');
 assert.equal(codes.verify(ID,{method:'qr',t:19942667,k:qrTag(SEC,19942667)}).code,'code_wrong');
 const ok=codes.verify(ID,QR);
 assert.equal(ok.ok,true); assert.equal(ok.step,19942666); assert.equal(ok.provedAt,new Date(NOW).toISOString());
});

test('single use only when consumed',()=>{
 const {codes,store}=setup();
 assert.equal(codes.verify(ID,QR,{}).ok,true);                 // GET: nothing consumed
 assert.equal(codes.verify(ID,QR,{consume:true}).ok,true);
 assert.equal(codes.verify(ID,QR,{consume:true}).code,'code_used');
 assert.equal(codes.verify(ID,{method:'code',code:'697855'}).code,'code_used');
 assert.deepEqual(store.get(ID).vouch.usedSteps,[19942666]);
 store.update(ID,e=>{e.vouch.usedSteps=Array.from({length:10},(_,i)=>19942650+i);});
 assert.equal(codes.verify(ID,{method:'code',code:'134326'},{consume:true}).ok,true);
 assert.ok(store.get(ID).vouch.usedSteps.length<=10);
 assert.equal(store.get(ID).vouch.usedSteps.at(-1),19942665);
});

test('sixth wrong spoken code locks for 10 minutes, QR stays open',()=>{
 const {codes,clock,store}=setup();
 assert.equal(codes.lockState(ID),null);
 for(let i=0;i<5;i++)assert.equal(codes.verify(ID,{method:'code',code:'000000'}).code,'code_wrong');
 const r=codes.verify(ID,{method:'code',code:'000000'});
 assert.equal(r.code,'card_locked'); assert.equal(r.until,new Date(NOW+600000).toISOString());
 assert.deepEqual(codes.lockState(ID),{until:new Date(NOW+600000).toISOString(),reason:'wrong_codes'});
 assert.equal(codes.verify(ID,{method:'code',code:'697855'}).code,'card_locked');
 assert.equal(codes.verify(ID,{method:'qr',t:19942666,k:'CEX8WJKP'}).ok,true);
 clock.t=NOW+600001;
 assert.equal(codes.lockState(ID),null);
 assert.equal(codes.verify(ID,{method:'code',code:spokenCode(SEC,counterAt(clock.t))}).ok,true);
 assert.ok(store.get(ID).vouch.failedAttempts.length<6);
});

test('wrong codes older than 10 minutes do not count toward the lock',()=>{
 const {codes,clock}=setup();
 for(let i=0;i<5;i++)codes.verify(ID,{method:'code',code:'000000'});
 clock.t=NOW+600001;
 assert.equal(codes.verify(ID,{method:'code',code:'000000'}).code,'code_wrong');
});

test('expired and malformed codes: expired never counts, malformed is wrong',()=>{
 const {codes,store}=setup();
 for(let i=0;i<8;i++)assert.equal(codes.verify(ID,{method:'code',code:'100839'}).code,'code_expired');
 assert.deepEqual(store.get(ID).vouch.failedAttempts,[]);
 assert.equal(codes.verify(ID,{method:'code',code:'abc'}).code,'code_wrong');
 assert.equal(codes.verify(ID,{method:'code'}).code,'code_wrong');
 assert.equal(codes.verify(ID,{method:'qr',t:'x',k:'CEX8WJKP'}).code,'code_wrong');
 assert.equal(codes.verify(ID,null).code,'code_wrong');
 assert.equal(store.get(ID).vouch.failedAttempts.length,3);
});

test('missing and withdrawn cards',()=>{
 const {codes}=setup();
 assert.equal(codes.verify('ZZZZZZZZZZ',QR).code,'not_found');
 assert.equal(codes.verify('../x',QR).code,'not_found');
 assert.equal(setup({withdrawn:true}).codes.verify(ID,QR).code,'card_withdrawn');
});

test('sender ignored after 10 wrong codes in an hour',()=>{
 const {codes,clock,voucherFiles,dir}=setup();
 for(let i=0;i<9;i++)codes.recordSenderWrong(K64);
 assert.equal(codes.senderBlocked(K64),false);
 codes.recordSenderWrong(K64);
 assert.equal(codes.senderBlocked(K64),true);
 assert.equal(voucherFiles.read(K64).wrongCodes.length,10);
 assert.ok(fs.existsSync(path.join(dir,'vouchers',K64+'.json')));
 clock.t=NOW+3600001; assert.equal(codes.senderBlocked(K64),false);
 assert.equal(codes.senderBlocked('b'.repeat(64)),false);
});

test('batch is 10 steps from the current one',()=>{
 const b=codeBatch(SEC,NOW);
 assert.equal(b.serverNow,'2026-11-16T14:40:12.000Z'); assert.equal(b.stepSeconds,90);
 assert.equal(b.fromCounter,19942666); assert.equal(b.codes.length,10);
 assert.deepEqual(b.codes[0],{spoken:'697855',qr:'CEX8WJKP'}); assert.deepEqual(b.codes[1],{spoken:'714836',qr:'D7ZYKYYF'});
});

test('Review Focus 1: codes typed as shown',()=>{
 assert.equal(normaliseSpoken('483 201'),'483201'); assert.equal(normaliseSpoken(' 483-201 '),'483201');
 assert.equal(normaliseSpoken('483.201.'),'483201');
 assert.equal(normaliseSpoken('48320'),null); assert.equal(normaliseSpoken('4832011'),null); assert.equal(normaliseSpoken(null),null);
 assert.deepEqual(normaliseCardRef('7f3k2a'),{cardCode:'7F3K2A'}); assert.deepEqual(normaliseCardRef('48 213'),{smsId:'48213'});
 assert.equal(normaliseCardRef('7F3K21'),null); assert.equal(normaliseCardRef('4821'),null); assert.equal(normaliseCardRef(undefined),null);
 const {codes,store}=setup();
 assert.equal(codes.verify(ID,{method:'code',code:'697 855'}).ok,true);
 assert.equal(codes.verify(ID,{method:'code',code:'697-855'},{channel:'sms'}).ok,true);
 assert.deepEqual(store.get(ID).vouch.failedAttempts,[]);
});

test('Review Focus 2: phone formats hash alike',()=>{
 const want=keyedHash(K,'+27825550131');
 assert.match(want,/^[0-9a-f]{64}$/);
 for(const raw of ['+27825550131','27825550131','0825550131','+27 82 555 0131','082-555-0131'])
  assert.equal(keyedHash(K,normalisePhone(raw,'South Africa')),want);
 assert.equal(normalisePhone('0712345678','Kenya'),'+254712345678');
 assert.equal(normalisePhone('12','South Africa'),null);
 assert.equal(normalisePhone('+12','South Africa'),null);
 assert.equal(normalisePhone('825550131','South Africa'),null);
 assert.equal(normalisePhone('0825550131','Atlantis'),null);
 assert.equal(normalisePhone(null,'South Africa'),null);
});

test('voucher files are keyed by a 64-hex hash only',()=>{
 const {voucherFiles}=setup();
 assert.deepEqual(voucherFiles.read(K64),{sessions:[],binds:[],otpSentAt:[],wrongCodes:[],lastSeen:null});
 const f=voucherFiles.update(K64,file=>{file.binds.push({at:'x'});});
 assert.equal(f.binds.length,1); assert.equal(f.lastSeen,new Date(NOW).toISOString());
 assert.equal(voucherFiles.read(K64).binds.length,1);
 for(const bad of ['../x','A'.repeat(64),'a'.repeat(63),'',null])assert.throws(()=>voucherFiles.read(bad));
});

test('resolveCard uses codes.json and smsids.json',()=>{
 const {codes,store}=setup();
 store.indexSet('smsids','48213',ID);
 assert.equal(codes.resolveCard({smsId:'48213'}),ID); assert.equal(codes.resolveCard({cardCode:'ZZZZZZ'}),null);
 assert.equal(codes.resolveCard({cardCode:'7F3K2A'}),ID);
 assert.equal(codes.resolveCard({smsId:'99999'}),null); assert.equal(codes.resolveCard(null),null);
});

test('hash key is created once and reused',()=>{
 const dir=tempDir();
 const a=loadOrCreateHashKey(dir),b=loadOrCreateHashKey(dir);
 assert.equal(a.length,32); assert.ok(a.equals(b));
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'.hashkey.json'),'utf8')).hashKey,a.toString('hex'));
});
