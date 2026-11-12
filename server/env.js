'use strict';
// Tiny .env parser. No dependency on dotenv.
const fs=require('node:fs');

function stripInlineComment(value){
  // A comment starts at an unquoted '#' preceded by whitespace (or at position 0).
  let out='',quote=null;
  for(let i=0;i<value.length;i++){
    const ch=value[i];
    if(quote){if(ch===quote)quote=null;out+=ch;continue;}
    if(ch==='"'||ch==="'"){quote=ch;out+=ch;continue;}
    if(ch==='#'&&(i===0||/\s/.test(value[i-1])))break;
    out+=ch;
  }
  return out.trim();
}

function unquote(value){
  if(value.length>=2){
    const first=value[0],last=value[value.length-1];
    if((first==='"'&&last==='"')||(first==="'"&&last==="'"))return value.slice(1,-1);
  }
  return value;
}

function parseEnv(text){
  const result={};
  String(text??'').split(/\r?\n/).forEach(raw=>{
    const line=raw.trim();
    if(!line||line.startsWith('#'))return;
    const eq=line.indexOf('=');
    if(eq<=0)return;
    let key=line.slice(0,eq).trim();
    if(key.startsWith('export '))key=key.slice(7).trim();
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))return;
    result[key]=unquote(stripInlineComment(line.slice(eq+1).trim()));
  });
  return result;
}

function loadEnvFile(path){
  let text;
  try{text=fs.readFileSync(path,'utf8');}catch{return {};}
  return parseEnv(text);
}

module.exports={parseEnv,loadEnvFile};
