#!/usr/bin/env node
'use strict';
/* The section 15 counts (spec 15, plan Task 20), read from <dataDir>/events.jsonl and the vouch and reply files.
   Every count is printed with its denominator and never as a percentage; every zero is printed. Events with
   demo:true (cards built from a sample persona) are left out of every row and counted only in "Demo events";
   vouch and reply files on such a card are left out the same way. Flags are recomputed on the page, so the stored
   record.flags is the source for "Flags fired". Organisation referrals are not request vouches: they are left out of
   the reply rate and the channel split and counted in their own row. Hires and gender live on the study sheet only.
   deleteClips is the end-of-pilot step: every file in vouches/clips and replies/clips goes, and each record's clip
   becomes {expired:true}.
   CLI: node scripts/measure.js [dataDir] [--sent N]   prints the counts (dataDir defaults to data/cards)
        node scripts/measure.js [dataDir] --delete-clips   prints "Deleted <n> clips" */
const fs=require('node:fs');
const path=require('node:path');
const {createEventLog}=require('../server/card/events.js');
const {createVouchStore}=require('../server/card/vouches.js');
const {createReplyStore}=require('../server/card/reply.js');
const {validId}=require('../server/card/store.js');

const HOUR=3600000;
const CHANNELS=['qr','code','worker_phone','sms','ivr','request'];
const list=v=>Array.isArray(v)?v:[];
const ms=v=>{const n=Date.parse(v);return Number.isNaN(n)?null:n;};
const round1=n=>Math.round(n*10)/10;
function median(xs){
  const s=[...xs].sort((a,b)=>a-b),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function tally(items){const out=new Map();for(const k of items)out.set(k,(out.get(k)||0)+1);return [...out].sort((a,b)=>String(a[0]).localeCompare(String(b[0])));}

// A card built from a sample persona: its files are demo data, like its events.
function demoCards(dir){
  const seen=new Map();
  return cardId=>{
    if(!seen.has(cardId)){
      let demo=false;
      if(validId(cardId))try{demo=JSON.parse(fs.readFileSync(path.join(dir,cardId+'.json'),'utf8'))?.record?.accountSource==='sample';}catch{/* no card file */}
      seen.set(cardId,demo);
    }
    return seen.get(cardId);
  };
}

// The channel a confirmed vouch came through: the slow channels first, then a request link, the worker's phone, a scan.
function channelOf(e){
  if(e.channel==='sms'||e.channel==='ivr')return e.channel;
  if(e.method==='request')return 'request';
  if(e.onWorkerPhone===true)return 'worker_phone';
  return e.method==='qr'?'qr':'code';
}

function measure(dataDir,{sent=null}={}){
  const dir=path.resolve(dataDir),isDemo=demoCards(dir);
  const all=createEventLog(dir).read(),events=all.filter(e=>e.demo!==true);
  const of=type=>events.filter(e=>e.type===type);
  const vouchFiles=createVouchStore(dir).listAll().filter(f=>f.record&&ms(f.record.confirmedAt)!==null&&!isDemo(f.record.cardId));
  const replies=createReplyStore(dir).listAll().filter(r=>r.confirmedAt&&!isDemo(r.cardId));
  const out=[],row=(measure,count,denominator,line)=>out.push({measure,count,denominator,line});
  const group=(name,pairs)=>{if(!pairs.length)return row(name,0,null,name+': 0');for(const [k,n] of pairs)row(name+' '+k,n,null,name+' '+k+': '+n);};

  const requests=of('request_created').filter(e=>e.kind!=='referral');
  const confirmed=of('vouch_confirmed'),own=confirmed.filter(e=>e.kind!=='organisation');
  const byRequest=own.filter(e=>e.method==='request');
  if(Number.isInteger(sent)&&sent>=0)row('Reply rate',byRequest.length,sent,'Reply rate: '+byRequest.length+' of '+sent);
  else row('Reply rate',byRequest.length,null,'Reply rate: '+byRequest.length+' confirmed request vouches; requests sent not entered ('+requests.length+' request links created)');

  const createdAt=new Map(requests.map(e=>[e.requestId,ms(e.at)]));
  const hours=byRequest.map(e=>createdAt.has(e.requestId)&&ms(e.at)!==null?round1((ms(e.at)-createdAt.get(e.requestId))/HOUR):null).filter(h=>h!==null);
  row('Time to reply (hours)',hours.length,null,'Time to reply (hours): '+(hours.length?'median '+round1(median(hours))+'; each '+hours.join(', '):'0 replies'));

  const unchangedV=vouchFiles.filter(f=>!list(f.private?.editedFields).length).length;
  row('Unchanged vouches',unchangedV,vouchFiles.length,'Unchanged vouches: '+unchangedV+' of '+vouchFiles.length);
  const unchangedR=replies.filter(r=>!list(r.edits).length).length;
  row('Unchanged replies',unchangedR,replies.length,'Unchanged replies: '+unchangedR+' of '+replies.length);
  // Each record counts once per field it changed, however many times it changed it.
  group('Edited',tally([...vouchFiles.flatMap(f=>[...new Set(list(f.private?.editedFields))].map(x=>'vouch '+x)),
    ...replies.flatMap(r=>[...new Set(list(r.edits).map(x=>x?.line))].filter(Number.isInteger).map(n=>'reply line '+n))]));

  const channels=new Map(tally(own.map(channelOf)));
  for(const c of CHANNELS)row('Channel '+c,channels.get(c)||0,null,'Channel '+c+': '+(channels.get(c)||0));
  const referrals=confirmed.length-own.length;
  row('Referrals accepted',referrals,null,'Referrals accepted: '+referrals);

  group('Code refusals',tally(of('code_refused').map(e=>e.reason||'unknown')));
  group('Parser refusals',tally(of('parser_refused').map(e=>e.reason||'unknown')));
  group('Transcription failures',tally(of('transcription_failed').map(e=>e.lang||'unknown')));
  group('Flags fired',tally(vouchFiles.flatMap(f=>list(f.record.flags))));

  const forwarded=replies.filter(r=>r.forwardedAt).length;
  row('Reply forward rate',forwarded,replies.length,'Reply forward rate: '+forwarded+' of '+replies.length);
  const demo=all.length-events.length;
  row('Demo events',demo,null,'Demo events: '+demo);
  row('Hires and gender',null,null,'Hires and gender: from the study sheet, not in any record');

  const text=['YoVouch pilot counts (spec 15). Each count with its denominator. Demo events are left out of every row.',...out.map(r=>r.line)].join('\n');
  return {rows:out.map(({line,...r})=>r),text};
}

// The end-of-pilot step (spec 9.7 and 15): every clip file goes and each record keeps clip: {expired: true}.
function deleteClips(dataDir){
  const dir=path.resolve(dataDir);
  let deleted=0;
  for(const sub of [['vouches','clips'],['replies','clips']]){
    const root=path.join(dir,...sub);
    let names=[];
    try{names=fs.readdirSync(root);}catch(err){if(err?.code!=='ENOENT')throw err;}
    for(const n of names){
      const file=path.join(root,n);
      if(!fs.statSync(file).isFile())continue;
      fs.rmSync(file,{force:true});deleted++;
    }
  }
  const live=c=>c&&typeof c==='object'&&!c.expired;
  const vouches=createVouchStore(dir);
  for(const f of vouches.listAll()){
    if(!f.record||(!live(f.record.clip)&&!live(f.held?.clip)))continue;
    vouches.update(f.record.vouchId,x=>{if(live(x.record.clip))x.record.clip={expired:true};if(live(x.held?.clip))x.held.clip={expired:true};});
  }
  const replies=createReplyStore(dir);
  for(const r of replies.listAll())if(live(r.selfClip))replies.update(r.replyId,x=>{x.selfClip={expired:true};});
  return {deleted};
}

function main(argv){
  const args=argv.slice(2);
  const at=args.indexOf('--sent');
  let sent=null;
  if(at!==-1){
    const v=args[at+1];
    if(!/^\d+$/.test(String(v??'')))throw new Error('--sent needs a whole number: the requests the workers said they sent');
    sent=Number(v);args.splice(at,2);
  }
  const dir=path.resolve(args.find(a=>!a.startsWith('--'))||path.join(__dirname,'..','data','cards'));
  if(args.includes('--delete-clips')){console.log('Deleted '+deleteClips(dir).deleted+' clips');return;}
  console.log(measure(dir,{sent}).text);
}

module.exports={measure,deleteClips};

if(require.main===module){try{main(process.argv);}catch(err){console.error(err?.message||err);process.exit(1);}}
