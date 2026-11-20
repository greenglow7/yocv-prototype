'use strict';
// The role skill menu (spec 5 Step 1, spec 13). Each name in data/role-skills.json is looked up in Yoma's taxonomy;
// only exact matches are kept, and a name that reads as a credential or an inflation word is dropped.
const {RULES}=require('../../cv-rules.js');

const CREDENTIAL_LIKE=/certif|licens|diploma|degree/i;
const str=v=>v==null?'':String(v);
const words=t=>str(t).toLowerCase().split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
const overstated=name=>words(name).some(w=>RULES.inflationStems.some(st=>w.startsWith(st)));
const isUnavailable=err=>err?.code==='yoma_unavailable'||err?.name==='YomaUnavailable';
const menuEntry=item=>({id:item.id,name:item.name,infoURL:item.infoURL??null});

async function buildSkillMenu(role,{yoma,roleSkills}={}){
  const names=Array.isArray(roleSkills?.[role]?.skillNames)?roleSkills[role].skillNames:[];
  if(!names.length||!yoma||typeof yoma.skillByName!=='function')return {menu:[],source:'none'};
  const results=await Promise.allSettled(names.map(name=>yoma.skillByName(name)));
  const menu=[],seen=new Set();
  let answered=0,fromCache=false;
  for(const result of results){
    if(result.status==='rejected'){
      if(isUnavailable(result.reason))continue;
      throw result.reason; // yoma_bad_request or an unexpected failure is a programming error: surface it
    }
    answered++;
    const {item,source}=result.value||{};
    if(source==='cache')fromCache=true;
    if(!item||!item.id||!item.name)continue;
    if(CREDENTIAL_LIKE.test(item.name)||overstated(item.name)||seen.has(item.id))continue;
    seen.add(item.id);
    menu.push(menuEntry(item));
  }
  if(!answered)return {menu:[],source:'none'};
  return {menu,source:fromCache?'cache':'live'};
}

// The role picker rows, in file order.
function roleList(roleSkills){
  return Object.entries(roleSkills||{}).map(([name,r])=>({name,description:str(r?.description),tradeId:r?.tradeId??null}));
}

module.exports={buildSkillMenu,roleList};
