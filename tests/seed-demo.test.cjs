'use strict';
// Plan Task 18: the prepared demo assets (spec 14) and the sim-only beat 3 page.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {counterAt,qrTag}=require('../server/card/vouchcode.js');
const {assertHonestPage}=require('./helpers/honesty.cjs');
const {NOW,bootVouch,page}=require('./helpers/vouch-boot.cjs');
const {seedDemo}=require('../scripts/seed-demo.js');

const PUBLIC_URL='https://yocard.example';

test('seedDemo prepares every asset the six beats need', async () => {
  const {base,dir,store,vouch}=await bootVouch({env:{sim:true}});
  const r=await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW,oldCode:true});
  for(const c of [r.cards.thandi,r.cards.sipho,r.cards.bongani,r.cards.amara,...r.cards.ring]){
    assert.match(c.cardId,/^[A-Z2-9]{10}$/); assert.match(c.cardToken,/^[0-9a-f]{16}$/);
    assert.equal(c.myUrl,PUBLIC_URL+'/my/'+c.cardId+'/'+c.cardToken);
  }
  assert.equal(r.cards.ring.length,3);
  // Thandi: a QR scan with released words, a worker's-phone vouch (sms_bind) and an SMS vouch (sms_origin).
  const thandi=vouch.vouchStore.listForCard(r.cards.thandi.cardId);
  assert.equal(thandi.length,3);
  const by=m=>thandi.filter(f=>f.record.voucher.phoneConfirmedBy===m);
  assert.equal(by('sms_bind').length,2); assert.equal(by('sms_origin').length,1);
  const scan=thandi.find(f=>f.record.proof.method==='qr'&&!f.record.proof.onWorkerPhone);
  assert.equal(scan.record.fields.words,'She did my braids three times this year.'); assert.equal(scan.held,null);
  assert.ok(thandi.some(f=>f.record.proof.onWorkerPhone===true&&!f.record.fields.words));
  assert.ok(by('sms_origin')[0].record.proof.channel==='sms'&&!by('sms_origin')[0].record.fields.words);
  const thandiPage=await page(base,'/c/'+r.cards.thandi.cardId);
  assert.ok(thandiPage.includes('She did my braids three times this year.'));
  // Sipho: Bongani's worker vouch with words and a clip, released; the clip link carries the file's own length.
  const sipho=await page(base,'/c/'+r.cards.sipho.cardId);
  assert.ok(sipho.includes("Vouched by another worker · Bongani's card")&&/Play \d+-second clip/.test(sipho));
  assert.ok(sipho.includes('Play 2-second clip'),'hello.webm lasts 2.086 seconds');
  assert.ok(sipho.includes('he arrived before me both days')&&sipho.includes('Umlazi'));
  const [paving]=vouch.vouchStore.listForCard(r.cards.sipho.cardId);
  assert.equal(paving.record.voucher.cardId,r.cards.bongani.cardId); assert.equal(paving.record.fields.work,'Paving');
  const clip=await fetch(base+paving.record.clip.url);
  assert.equal(clip.status,200);
  assert.deepEqual(Buffer.from(await clip.arrayBuffer()),fs.readFileSync(path.join(__dirname,'fixtures','hello.webm')));
  // Amara: the accepted referral from the fictional Sample Skills Trust for the Trans Ekulu post.
  const amara=await page(base,'/c/'+r.cards.amara.cardId);
  assert.ok(amara.includes('Referred by Sample Skills Trust')&&amara.includes('Trans Ekulu'));
  // The triangle of throwaway cards.
  for(const c of r.cards.ring)assert.ok((await page(base,'/c/'+c.cardId)).includes('Part of a group that vouched for each other'));
  assert.ok((await page(base,'/c/'+r.cards.ring[1].cardId)).includes('Part of a group that vouched for each other'));
  assert.deepEqual(r.cards.ring.map(c=>store.get(c.cardId).record.user.firstName),['Ayo','Bola','Chidi']);
  // The inbox reply: Sipho's confirmed English six lines for the Pinetown post.
  const reply=vouch.replyStore.get(r.inboxReplyId);
  assert.equal(reply.lines.length,6); assert.equal(reply.cardId,r.cards.sipho.cardId);
  assert.equal(reply.confirmedLang,'en'); assert.ok(reply.confirmedAt); assert.ok(reply.post.rawText.includes('Pinetown'));
  assert.equal(reply.lines[0],'Sipho · General labourer · Umlazi · to the job: two taxis, about an hour, I know the route');
  assert.ok(reply.lines[1].startsWith('Experience: paving, this month, once')&&reply.lines[1].endsWith('(vouched by another worker, code matched)'));
  assert.equal(reply.lines[4],'Own boots: yes (stated by Sipho)');
  assert.ok(reply.lines[5].startsWith('Card with 1 clip: '+PUBLIC_URL+'/c/'+r.cards.sipho.cardId));
  assert.ok((await page(base,'/r/'+r.inboxReplyId)).includes('Own boots: yes (stated by Sipho)'));
  // demo.json and beat 3.
  const demo=JSON.parse(fs.readFileSync(path.join(dir,'demo.json'),'utf8'));
  assert.equal(demo.inboxReplyId,r.inboxReplyId); assert.deepEqual(demo.cards,r.cards);
  assert.deepEqual(demo.beat3.rejected,[{field:'experience',reason:'invented_number'}]);
  assert.equal(demo.beat3.transcript,'I did braids, I can start Monday.');
  // The old code: a QR at counterAt(now) - 3, outside every window.
  assert.equal(r.oldCodeFile,path.join(dir,'demo-old-code.svg'));
  assert.ok(fs.readFileSync(r.oldCodeFile,'utf8').startsWith('<svg'));
  assert.equal(vouch.codes.verify(r.cards.thandi.cardId,{method:'qr',t:counterAt(NOW)-3,k:qrTag(store.get(r.cards.thandi.cardId).vouch.secret,counterAt(NOW)-3)}).code,'code_expired');
  // The live code is untouched by the seed: the current step is still open on the scan page.
  assert.ok(!store.get(r.cards.thandi.cardId).vouch.usedSteps.includes(counterAt(NOW)));
  assert.ok(!JSON.stringify(vouch.events.read()).includes('+27'),'events carry ids only');
});

test('without --old-code no screenshot is written', async () => {
  const {dir}=await bootVouch();
  const r=await seedDemo({dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  assert.equal(r.oldCodeFile,null); assert.ok(!fs.existsSync(path.join(dir,'demo-old-code.svg')));
});

test('beat 3 page is sim only and labelled', async () => {
  const sim=await bootVouch({env:{sim:true}});
  assert.equal((await fetch(sim.base+'/demo/beat3')).status,404,'no prepared demo yet');
  await seedDemo({dir:sim.dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  const res=await fetch(sim.base+'/demo/beat3');
  assert.equal(res.status,200);
  const html=await res.text();
  assertHonestPage(html);
  for(const s of ['Prepared example: a model output that added "5 years". Not a live call.','invented_number','I did braids, I can start Monday.',
    'braids for 5 years','Experience: not stated (stated by Thandi, not checked)','Available: I can start Monday (stated by Thandi)'])assert.ok(html.includes(s),s);
  const off=await bootVouch();
  await seedDemo({dir:off.dir,publicUrl:PUBLIC_URL,now:()=>NOW});
  assert.equal((await fetch(off.base+'/demo/beat3')).status,404);
});
