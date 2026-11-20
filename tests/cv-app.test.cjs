'use strict';
// The app shell, Step 1 and Step 2 (plan Task 15a): the review payload, and the routes and copy app.js runs on.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {newCvState,reviewPayload}=require('../core.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const {entry}=JSON.parse(read('tests/fixtures/cv-thandi.json'));
test('reviewPayload never carries the name, contacts, the place or the optional fields outside knownWords',()=>{
  const s={...newCvState(),sessionId:'a'.repeat(24),role:'Hairdresser',entries:[entry],contact:{name:'Thandi Mokoena',phone:'+27735550147',email:'t@example.org',town:'Khayelitsha',education:'Matric'},optional:{photo:'data:image/png;base64,xx',dateOfBirth:'2002-03-15',idNumber:'0203150000000',stateOfOrigin:''}};
  const {knownWords,...rest}=reviewPayload(s);
  const p=JSON.stringify(rest);
  assert.deepEqual(knownWords,['Khayelitsha','Thandi','Mokoena']);
  assert.ok(!/Thandi|Mokoena|\+27|example\.org|Khayelitsha|Matric|data:image|2002-03-15|0203150000000|"place"/.test(p));
});
test('app.js runs Steps 1 and 2 on the new routes and copy, not the old flow',()=>{
  const s=read('app.js');
  for(const route of ['/api/cv/config','/api/cv/record','/api/cv/menu'])assert.ok(s.includes(route),route);
  assert.ok(!s.includes('/api/generate')&&!s.includes('sample-credential')&&!s.includes('Amina'));
  for(const k of ['copy.stepRecord','copy.stepWork','copy.stepReview','copy.stepCv','copy.recordOffline','copy.roleOffline'])assert.ok(s.includes(k),k);
  assert.ok(/wallet\s*===\s*'unavailable'/.test(s)&&s.includes('copy.walletUnavailable'),'Wallet not available is shown');
  assert.ok(s.includes('window.YoCVCopy')&&s.includes('window.YoCVRules'),'the offline start reads the browser files');
  assert.ok(!s.includes('Start the YoCV server with npm start'));
  for(const k of ['copy.modeLive','copy.modeSample','copy.modeOffline'])assert.ok(s.includes(k),k);
  assert.ok(!/marital|religion/i.test(s),'never collected (spec 10)');
  assert.ok(s.includes('copy.labelYoma'),'Step 1 heading Confirmed from Yoma');
  assert.ok(s.includes('credential.skills')||s.includes('.skills.map'),'spec 6 rule 6: each credential lists its skills');
});
test('index.html loads the catalogue and the rules before core.js and app.js, and the server serves them',()=>{
  const html=read('index.html');
  const at=f=>html.indexOf('src="'+f+'"');
  assert.ok(at('cv-copy.js')>0&&at('cv-copy.js')<at('cv-rules.js')&&at('cv-rules.js')<at('core.js')&&at('core.js')<at('app.js'));
  assert.ok(/<body class="yocv-app"/.test(html));
  const server=read('server.js');
  for(const f of ["'/cv-copy.js'","'/cv-rules.js'"])assert.ok(server.includes(f),f);
});
