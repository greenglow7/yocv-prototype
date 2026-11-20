'use strict';
/* The CV record (spec 5 Step 1): what Yoma holds for the person, read once and shown under `Confirmed from Yoma`.
   Completions come from the YoCard account source. Credentials follow Yoma's wallet model (SSICredential): title,
   issuer and date are top-level, and skills come only from `itemsDisplay` of `Opportunity_Skills`, never parsed
   from `valueDisplay`. Sample mode reads the persona's own `credentials` and `selfAttestedSkills`. Token mode
   searches the wallet, reads each credential's detail, and keeps only `Issued` ones; a wallet Yoma cannot serve
   (SSI off, 503, network) gives `wallet:'unavailable'` without failing the record. No email, no date of birth,
   and no credential attribute other than the skill names ever leaves this module. */

const {monthYear}=require('../card/render.js');
const PERSONAS=require('../card/personas.json');

const WALLET_SEARCH={schemaType:'Opportunity',pageNumber:1,pageSize:50};
const str=v=>v==null?null:String(v);
const list=v=>Array.isArray(v)?v:[];
const norm=t=>String(t??'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const isUnavailable=err=>err?.code==='yoma_unavailable'||err?.name==='YomaUnavailable';

function credentialSkills(credential){
  const names=[];
  for(const a of list(credential?.attributes))if(a?.name==='Opportunity_Skills')for(const item of list(a.itemsDisplay)){
    const name=String(item?.name??'').trim();
    if(name&&!names.includes(name))names.push(name);
  }
  return names;
}

function issuerOf(credential){
  const issuer=String(credential?.issuer??'').trim();
  return issuer&&!/yoma/i.test(issuer)?issuer:null;
}

const selfAttestedOf=skills=>list(skills).filter(s=>s&&typeof s==='object')
  .map((s,i)=>({evidenceId:'a'+(i+1),id:str(s.id),name:str(s.name),infoURL:str(s.infoURL)}));

async function readWallet(accountSource){
  try{
    const search=await accountSource.request('POST','/ssi/wallet/user/search',WALLET_SEARCH);
    const ids=list(search?.items).map(item=>str(item?.id)).filter(Boolean);
    const details=await Promise.all(ids.map(id=>accountSource.request('POST','/ssi/wallet/user/'+encodeURIComponent(id))));
    return {wallet:'available',details};
  }catch(err){
    if(isUnavailable(err))return {wallet:'unavailable',details:[]};
    throw err;
  }
}

async function readSelfAttested(accountSource){
  try{return selfAttestedOf(await accountSource.request('GET','/user/skills?type=SelfAttested'));}
  catch(err){if(isUnavailable(err))return [];throw err;}
}

// `titles[i]` lists the titles completion i answers to: the one read (live from Yoma when reachable) and, in sample
// mode, the persona's stored one, which is the title its sample credential carries.
function linkCredentials(details,completions,titles){
  const credentials=[],credentialsLeftOut=[];
  for(const d of list(details).filter(d=>d&&typeof d==='object')){
    if(d.status!=='Issued'){credentialsLeftOut.push({walletId:str(d.id),title:str(d.title),status:str(d.status)});continue;}
    const at=completions.findIndex((c,i)=>titles[i].some(t=>t&&t===norm(d.title)));
    credentials.push({id:'w'+(credentials.length+1),walletId:str(d.id),title:str(d.title),issuer:issuerOf(d),dateIssued:str(d.dateIssued),
      month:monthYear(d.dateIssued),skills:credentialSkills(d),completionId:at<0?null:completions[at].evidenceId});
  }
  return {credentials,credentialsLeftOut};
}

async function readCvRecord({accountSource,selector,personas=PERSONAS}={}){
  const snapshot=await accountSource.read(selector);
  const sample=snapshot.source==='sample';
  const persona=sample?personas.find(p=>p.id===selector?.persona):null;
  const completions=list(snapshot.completions).map(c=>({evidenceId:c.evidenceId,title:c.title,organizationName:c.organizationName,
    dateCompleted:c.dateCompleted,month:monthYear(c.dateCompleted),opportunityId:c.opportunityId,skills:list(c.skills)}));
  const titles=completions.map((c,i)=>[norm(c.title),norm(persona?.completions?.[i]?.title)]);
  const {wallet,details}=sample?{wallet:'sample',details:list(persona?.credentials)}:await readWallet(accountSource);
  const selfAttested=sample?selfAttestedOf(persona?.selfAttestedSkills):await readSelfAttested(accountSource);
  const u=snapshot.user||{};
  const {credentials,credentialsLeftOut}=linkCredentials(details,completions,titles);
  return {
    source:sample?'sample':'token',
    fictional:sample,
    user:{id:str(u.id),firstName:str(u.firstName),displayName:str(u.displayName),city:str(u.city),phoneNumber:str(u.phoneNumber)},
    completions,credentials,selfAttested,credentialsLeftOut,wallet
  };
}

module.exports={readCvRecord,credentialSkills,issuerOf};
