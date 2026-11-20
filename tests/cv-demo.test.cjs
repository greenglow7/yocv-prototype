'use strict';
// Plan Task 17: the prepared refused CV suggestion (sim only) and the YoCV demo beats (spec 7, 11).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {assertHonestPage}=require('./helpers/honesty.cjs');
const {bootVouch,page}=require('./helpers/vouch-boot.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('the prepared example is sim only, labelled, and refused by the real checks',async()=>{
  const {base}=await bootVouch({env:{sim:true}});
  const html=await page(base,'/demo/cv-rejected');
  assertHonestPage(html); // tests/helpers/honesty.cjs, as every YoVouch page test does
  for(const s of ['Prepared example. Not a live call.','Braided hair for over 50 customers a week since March 2025.','invented_number','template wording','about 40 customers a week','Not operated by Yoma or UNICEF'])assert.ok(html.includes(s),s);
  assert.ok(!/verified by Yoma/i.test(html));
  const visible=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,'').replace(/<[^>]*>/g,' ');
  assert.ok(!/\blive\b/i.test(visible.split('Not a live call.').join('')),'no generation mode beside the prepared label');
  const {base:off}=await bootVouch();
  assert.equal((await fetch(off+'/demo/cv-rejected')).status,404);
  const gw=await bootVouch({env:{sim:true,gatewaySecret:'s3cret'}});
  assert.equal((await fetch(gw.base+'/demo/cv-rejected')).status,404,'a real gateway turns the demo pages off');
});
test('the demo script names every beat of spec 11',()=>{
  const s=read('presentation/demo-script.md');
  for(const beat of ['Thandi','Hairdresser','about 40 customers a week','over 50','Confirmed from Yoma','Vouched by a customer, confirmed by them, not by Yoma','MODEL_PROVIDER','integration/yoma/README.md'])assert.ok(s.includes(beat),beat);
  assert.ok(!s.includes('Amina'),'the old YoCV beats are replaced, not kept beside the new ones');
});
