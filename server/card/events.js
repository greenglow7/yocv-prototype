'use strict';
/* YoVouch events log (spec 9.6 and 15): one JSON line per event in <dir>/events.jsonl, with ids, channel and
   timestamps only. log() refuses anything that looks like a phone number and the keys phone, from and name,
   so no number or name can reach the file by accident. Card-scoped events spread cardFields(entry). Hex tokens
   (vouchToken, card token, secrets) are never logged: they are not ids, and a run of nine digits would trip the check. */
const fs=require('node:fs');
const path=require('node:path');

const PHONE_LIKE=/\+?\d{9,}/;
const BANNED_KEYS=new Set(['phone','from','name']);

function check(value,where){
  if(value==null||typeof value==='boolean')return;
  if(typeof value==='object'){
    for(const [k,v] of Object.entries(value)){
      if(BANNED_KEYS.has(k))throw new Error('event field not allowed: '+k);
      check(v,k);
    }
    return;
  }
  if(PHONE_LIKE.test(String(value)))throw new Error('event field looks like a phone number: '+where);
}

function createEventLog(dir,{now=Date.now}={}){
  const file=path.join(dir,'events.jsonl');
  function log(type,fields={}){
    if(typeof type!=='string'||!/^[a-z_]+$/.test(type))throw new Error('bad event type');
    check(fields,'fields');
    const line={at:new Date(now()).toISOString(),type,...fields};
    fs.mkdirSync(dir,{recursive:true});
    fs.appendFileSync(file,JSON.stringify(line)+'\n');
    return line;
  }
  function read(){
    let text='';
    try{text=fs.readFileSync(file,'utf8');}catch{return [];}
    const out=[];
    for(const row of text.split('\n')){if(!row)continue;try{out.push(JSON.parse(row));}catch{/* a torn line is skipped */}}
    return out;
  }
  return {log,read};
}

// The card fields every card-scoped event carries: the id, and demo for a card built from a sample persona.
function cardFields(entry){return {cardId:entry?.cardId??entry?.record?.cardId??null,demo:entry?.record?.accountSource==='sample'};}

module.exports={createEventLog,cardFields};
