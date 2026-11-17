'use strict';
// Plan Task 19: the simulated contractor inbox (spec 3.4, 13, 14 beat 1), sim only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertHonestPage}=require('./helpers/honesty.cjs');
const {NOW,bootVouch}=require('./helpers/vouch-boot.cjs');
const {seedDemo}=require('../scripts/seed-demo.js');

const SIM_WA='Simulated WhatsApp. No message was sent.';
const NOTE='Run node scripts/seed-demo.js to add the six-line reply.';
const POST='Need 2 general labourers, Pinetown site, 3 weeks, must have own boots, R250/day';
const count=(html,s)=>html.split(s).length-1;

test('after the seed the inbox shows forty replies and the six-line reply', async () => {
  const {base,dir,vouch}=await bootVouch({env:{sim:true}});
  const r=await seedDemo({dir,publicUrl:'https://yocard.example',now:()=>NOW});
  const res=await fetch(base+'/demo/inbox');
  assert.equal(res.status,200);
  const html=await res.text();
  assertHonestPage(html);
  assert.equal(count(html,'class="msg"'),41);
  assert.equal(html,await (await fetch(base+'/demo/inbox')).text(),'the same HTML on every load');
  assert.ok(html.includes(SIM_WA)&&html.includes(POST));
  assert.equal(count(html,'Here is my ID photo'),2);
  assert.equal(count(html,'Please send R50 for transport first'),1);
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  for(const line of vouch.replyStore.get(r.inboxReplyId).lines)assert.ok(html.includes(esc(line)),line);
  assert.ok(html.includes('href="/c/'+r.cards.sipho.cardId+'"'),'a link to the card');
  assert.ok(!html.includes(NOTE));
});

test('without a seed the inbox has the forty replies and the developer note', async () => {
  const {base}=await bootVouch({env:{sim:true}});
  const html=await (await fetch(base+'/demo/inbox')).text();
  assert.equal(count(html,'class="msg"'),40);
  assert.ok(html.includes(NOTE)&&html.includes(SIM_WA));
  assertHonestPage(html);
});

test('the inbox exists only with YOVOUCH_SIM=1', async () => {
  const {base}=await bootVouch();
  assert.equal((await fetch(base+'/demo/inbox')).status,404);
  const gw=await bootVouch({env:{sim:true,gatewaySecret:'s3cret'}});
  assert.equal((await fetch(gw.base+'/demo/inbox')).status,404);
});
