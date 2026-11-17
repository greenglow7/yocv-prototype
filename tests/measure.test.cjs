'use strict';
// Plan Task 20: the section 15 counts from events.jsonl and the record files, and the end-of-pilot clip deletion.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createEventLog}=require('../server/card/events.js');
const {createVouchStore}=require('../server/card/vouches.js');
const {createReplyStore}=require('../server/card/reply.js');
const {tierItem}=require('../server/card/vouch-lines.js');
const {measure,deleteClips}=require('../scripts/measure.js');

const T0=Date.parse('2026-11-02T08:00:00Z'),HOUR=3600000;
const CARD='ABCDEFGHJK',SCRIPT=path.join(__dirname,'..','scripts','measure.js');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'yovouch-measure-'));
const rid=i=>'RQ'+'ABCDEFGHJKLMNPQR'[i]+'AAAAAAA';
const line=(text,start)=>text.split('\n').find(l=>l.startsWith(start));

function pilotDir(){
  const dir=tmp(),clock={t:T0},events=createEventLog(dir,{now:()=>clock.t});
  for(let i=0;i<14;i++)events.log('request_created',{requestId:rid(i),cardId:CARD,demo:false,kind:'vouch'});
  // Five real request vouches 2, 4, 6, 8 and 10 hours after their request; a sixth on a demo card.
  for(let i=0;i<6;i++){
    clock.t=T0+(i+1)*2*HOUR;
    events.log('vouch_confirmed',{vouchId:'VQ'+'ABCDEF'[i]+'AAAAAAA',cardId:CARD,demo:i===5,channel:'web',method:'request',kind:'customer',onWorkerPhone:false,requestId:rid(i)});
  }
  for(let i=0;i<2;i++)events.log('vouch_confirmed',{vouchId:'VX'+'AB'[i]+'AAAAAAA',cardId:CARD,demo:false,channel:'web',method:'qr',kind:'customer',onWorkerPhone:false});
  events.log('code_refused',{reason:'code_expired',channel:'web'});
  events.log('code_refused',{reason:'code_used',channel:'web'});
  const vouches=createVouchStore(dir);
  vouches.create({record:{cardId:CARD,kind:'customer',confirmedAt:new Date(T0).toISOString(),flags:[]},private:{editedFields:[]}});
  vouches.create({record:{cardId:CARD,kind:'worker',confirmedAt:new Date(T0).toISOString(),flags:['ring']},private:{editedFields:['work']}});
  const replies=createReplyStore(dir);
  replies.create({cardId:CARD,edits:[],confirmedAt:new Date(T0).toISOString(),forwardedAt:new Date(T0).toISOString()});
  replies.create({cardId:CARD,edits:[{line:4,from:'a',to:'b',at:new Date(T0).toISOString()}],confirmedAt:new Date(T0).toISOString(),forwardedAt:null});
  replies.create({cardId:CARD,edits:[],confirmedAt:null,forwardedAt:null});
  return dir;
}

test('measure prints every section 15 count with its denominator, the zeros, and no percentage', () => {
  const dir=pilotDir();
  const {rows,text}=measure(dir,{sent:14});
  assert.deepEqual(rows.find(r=>r.measure==='Reply rate'),{measure:'Reply rate',count:5,denominator:14});
  for(const want of ['Reply rate: 5 of 14','Demo events: 1','Code refusals code_expired: 1','Code refusals code_used: 1','Channel qr: 2','Channel request: 5',
    'Channel code: 0','Channel worker_phone: 0','Channel sms: 0','Channel ivr: 0','Transcription failures: 0','Parser refusals: 0',
    'Time to reply (hours): median 6; each 2, 4, 6, 8, 10','Unchanged vouches: 1 of 2','Unchanged replies: 1 of 2','Edited vouch work: 1','Edited reply line 4: 1',
    'Flags fired ring: 1','Reply forward rate: 1 of 2','Hires and gender: from the study sheet, not in any record'])
    assert.ok(text.split('\n').includes(want),want+'\n'+text);
  assert.ok(!text.includes('%')&&!JSON.stringify(rows).includes('%'));
  for(const r of rows)assert.deepEqual(Object.keys(r),['measure','count','denominator']);
  assert.equal(line(measure(dir).text,'Reply rate'),'Reply rate: 5 confirmed request vouches; requests sent not entered (14 request links created)');
});

test('measure on an empty directory prints every zero', () => {
  const {text}=measure(tmp());
  for(const want of ['Reply rate: 0 confirmed request vouches; requests sent not entered (0 request links created)','Demo events: 0','Code refusals: 0',
    'Flags fired: 0','Edited: 0','Unchanged vouches: 0 of 0','Reply forward rate: 0 of 0','Channel qr: 0','Time to reply (hours): 0 replies'])
    assert.ok(text.split('\n').includes(want),want+'\n'+text);
});

test('measure leaves every prepared demo record and event out', async () => {
  const {seedDemo}=require('../scripts/seed-demo.js');
  const dir=tmp();
  await seedDemo({dir,publicUrl:'https://yocard.example',now:()=>Date.parse('2026-11-16T14:40:12Z')});
  const {text}=measure(dir);
  assert.ok(Number(/^Demo events: (\d+)$/m.exec(text)[1])>0,text);
  for(const want of ['Unchanged vouches: 0 of 0','Unchanged replies: 0 of 0','Reply forward rate: 0 of 0','Channel qr: 0','Channel sms: 0','Flags fired: 0'])
    assert.ok(text.split('\n').includes(want),want+'\n'+text);
});

test('deleteClips removes every vouch and reply clip and marks each record clip expired', () => {
  const dir=tmp(),vouches=createVouchStore(dir),replies=createReplyStore(dir);
  const data=fs.readFileSync(path.join(__dirname,'fixtures','hello.webm'));
  const {vouchId}=vouches.create({record:{cardId:CARD,kind:'customer',confirmedAt:new Date(T0).toISOString(),proof:{channel:'web'},line:'x'},
    held:{words:null,wordsSource:null,clip:null},clip:{data,contentType:'audio/webm',seconds:2}});
  vouches.showWords(vouchId,CARD);
  assert.ok(vouches.get(vouchId).record.clip.url);
  const replyId=replies.create({cardId:CARD,edits:[],confirmedAt:new Date(T0).toISOString()});
  const saved=replies.saveClip(replyId,{data,contentType:'audio/webm'});
  replies.update(replyId,r=>{r.selfClip={url:'/r/'+replyId+'/clip',...saved,seconds:2};});
  assert.deepEqual(deleteClips(dir),{deleted:2});
  assert.deepEqual(fs.readdirSync(path.join(dir,'vouches','clips')),[]);
  assert.deepEqual(fs.readdirSync(path.join(dir,'replies','clips')),[]);
  const rec=vouches.get(vouchId).record;
  assert.deepEqual(rec.clip,{expired:true});
  assert.equal(tierItem(rec,'Thandi').clip.text,'clip expired');
  assert.deepEqual(replies.get(replyId).selfClip,{expired:true});
  assert.equal(replies.readClip(replyId),null);
  assert.deepEqual(deleteClips(dir),{deleted:0});
});

test('the CLI prints the counts, takes --sent and deletes clips', () => {
  const dir=pilotDir();
  const run=(...args)=>spawnSync(process.execPath,[SCRIPT,dir,...args],{encoding:'utf8'});
  const a=run('--sent','14');
  assert.equal(a.status,0,a.stderr); assert.ok(a.stdout.includes('Reply rate: 5 of 14')&&!a.stdout.includes('%'));
  const b=run('--delete-clips');
  assert.equal(b.status,0,b.stderr); assert.equal(b.stdout.trim(),'Deleted 0 clips');
  const c=run('--sent','many');
  assert.notEqual(c.status,0); assert.match(c.stderr,/--sent/);
});
