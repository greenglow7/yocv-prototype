'use strict';
// Shared page checks for YoVouch (plan Task 1): the footer honesty strings, the visibility line, no
// overstating words, and no third-party font on private flow pages.
const assert=require('node:assert/strict');
const {STRINGS}=require('../../server/card/render.js');
const OVERSTATING=['Recorded in person','Vouched in person','in the same place','co-presence','You are with'];

function assertHonestPage(html,{fonts=false}={}){
  const foot=(String(html).match(/<footer>[\s\S]*?<\/footer>/)||[''])[0];
  assert.ok(foot.includes(STRINGS.notOperated),'footer: '+STRINGS.notOperated);
  assert.ok(foot.includes(STRINGS.signedBy),'footer: '+STRINGS.signedBy);
  assert.ok(html.includes(STRINGS.whoCanSee),STRINGS.whoCanSee);
  for(const bad of OVERSTATING)assert.ok(!html.includes(bad),'overstates: '+bad);
  assert.ok(!html.split('Show your ID in person only').join('').includes('in person'),'overstates: in person');
  assert.ok(!/verified by Yoma/i.test(html),'verified by Yoma');
  if(!fonts)assert.ok(!html.includes('fonts.googleapis.com'),'no Google Fonts on this page');
}

// Accepts a fetch Response (headers.get) or a Node response with a plain headers object.
function assertPrivateHeaders(res){
  const get=name=>typeof res?.headers?.get==='function'?res.headers.get(name):res?.headers?.[name];
  assert.ok(String(get('cache-control')||'').includes('no-store'),'cache-control no-store');
  assert.equal(get('referrer-policy'),'no-referrer');
}

module.exports={assertHonestPage,assertPrivateHeaders};
