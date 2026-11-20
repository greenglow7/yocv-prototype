'use strict';
// The CV bullet and profile checks (spec 6 rule 5, spec 7 checks 1 to 7).
// The lists live once, in cv-rules.js (plan Deviations 1 and 4); the shared validators in server/validate.js are reused unchanged.
const {INFLATION,INFLATION_STEMS,ROLE_UPGRADE,ROLE_UPGRADE_FORMS,VERBS,RULES}=require('../../cv-rules.js');
const {checkCvText}=require('../../core.js');
const {quoteInSource,noBannedClaims,dedupe}=require('../validate.js');

const fail=reason=>({ok:false,reason});

function checkBullet({text,sourceQuote}={},ctx={}){
  const r=checkCvText(text,{...ctx,kind:'bullet'},RULES);
  if(!r.ok)return r;
  if(!noBannedClaims(text).ok)return fail('overstated');
  const f=ctx.fields||{};
  if(!quoteInSource(sourceQuote,[f.title,f.what,f.forWhom,f.outcome].join('\n')).ok)return fail('quote_not_found');
  return {ok:true,checks:[...r.checks,'quote']};
}

// No opening and no quote (plan Deviations 10); Yoma may be named.
function checkProfile(text,ctx={}){
  const r=checkCvText(text,{...ctx,kind:'profile',extraNames:[...(ctx.extraNames||[]),'Yoma']},RULES);
  if(!r.ok)return r;
  return noBannedClaims(text).ok?r:fail('overstated');
}

function checkBullets(bullets,ctx){
  const passed=[],rejected=[];
  for(const b of bullets||[]){const r=checkBullet(b,ctx);if(r.ok)passed.push(b);else rejected.push({text:b?.text,reason:r.reason});}
  const {kept,rejected:dupes}=dedupe(passed);
  return {kept,rejected:[...rejected,...dupes.map(d=>({text:d.text,reason:d.reason}))]};
}

module.exports={INFLATION,INFLATION_STEMS,ROLE_UPGRADE,ROLE_UPGRADE_FORMS,VERBS,RULES,checkBullet,checkProfile,checkBullets};
