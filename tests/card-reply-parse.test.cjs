'use strict';
// Plan Task 9: the listing parser, the two-grade fee detector, the post store and POST /api/reply/parse.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {listingSchema,detectFees,detectDocuments,asksForIdByMessage,hasContact,ruleParse,parsePost,docMessages}=require('../server/card/reply.js');
const {runSweep}=require('../server/card/sweep.js');
const {NOW,bootVouch,post}=require('./helpers/vouch-boot.cjs');

const DAY=86400000;
const AMARA_POST='Hardware shop needs a counter assistant, Trans Ekulu, must have valid ID, start Monday, call 08031234567';
const OUTCOME={fee_request:'fee_refusal',id_by_message:'id_by_message',no_contact:'no_contact',no_job:'no_job'};
const outcome=r=>r.refusal?OUTCOME[r.refusal.reason]:r.flags.feeWarning?'fee_warning':'reply';
const empty={text:'',sourceQuote:''};
// A live provider that returns the given listing and records what it was sent.
function fakeModel(listing){
 const calls=[];
 return {name:'azure-openai',model:'test',calls,async complete(req){calls.push(req);return typeof listing==='function'?listing(req):JSON.parse(JSON.stringify(listing));}};
}
function fakeLiveProvider(){return {name:'azure-openai',model:'test',async complete(){throw new Error('not called');}};}

test('fee refusal grade', () => {
  for (const t of ['Pay R250 for training before you start', 'Send R300 registration fee to apply, then start Monday', 'Uniform R150, pay first, call 0821234567', 'KSh 500 processing fee, send to secure your place 0712345678', 'Airtime first R50 then we call you'])
    assert.ok(detectFees(t).feeRequest, t);
  assert.equal(detectFees('Pay R250 for training before you start').feeRequest.quote, 'Pay R250 for training');
  for (const t of ['Pay KSh 1000 to secure your place, 0712345678', 'Send N5000 now, 08031234567', 'Deposit R200 on M-Pesa first'])
    assert.ok(detectFees(t).feeRequest, t);
});
test('a wage is not a fee request', () => {
  for (const t of ['Pay: R300/day, uniform provided, call 0821234567', 'We pay R250 a day, training provided, call 0821234567', 'Good pay R5000 per month, training provided']) {
    const f = detectFees(t);
    assert.equal(f.feeRequest, null, t); assert.ok(f.feeWarning, t);
  }
  assert.deepEqual(detectFees('Cleaner needed in Soweto, R200 per day, call 0821234567'), {feeRequest:null, feeWarning:null});
});
test('warning grade, still drafted', async () => {
  const r = await parsePost('Need 2 general labourers, Pinetown site, R250/day, training provided, call 0821234567');
  assert.equal(r.refusal, null); assert.ok(r.flags.feeWarning);
  assert.ok(r.warning.startsWith('This post mentions ') && r.warning.endsWith('If they ask you to pay anything, stop: never pay before the work is done.'));
  assert.equal(r.warning.slice(0, 46), 'This post mentions R250/day, training provided');
  assert.equal(r.parsed.area.text, 'Pinetown'); assert.equal(r.parsed.pay.text, 'R250/day');
});
test('the four refusals with their strings', async () => {
  assert.ok((await parsePost('Pay R250 for training before you start, call 0821234567')).refusal.message.startsWith('This post asks for money ('));
  assert.equal((await parsePost('Cleaner needed urgently, good pay')).refusal.message, 'This post gives no number and no place to go. YoVouch cannot write a reply with nowhere to send it.');
  assert.equal((await parsePost('Driver needed, send ID photo and bank details on WhatsApp 0821234567')).refusal.message, 'This post asks you to send an ID photo or bank details by message. Do not send them. Show your ID in person only.');
  assert.equal((await parsePost('hi')).refusal.message, 'I could not find a job in this message. Paste the text of the post.');
  assert.equal((await parsePost('https://jobs.example.com/x/123')).refusal.reason, 'no_job');
  assert.equal((await parsePost('Pay R250 for training before you start, call 0821234567')).refusal.message, 'This post asks for money (Pay R250 for training). Real employers never charge to apply, to train, for a uniform or for a medical. No reply was drafted. Never pay before the work is done.');
});
test('Amara post, rule-based', async () => {
  const r = await parsePost(AMARA_POST);
  assert.equal(r.parsed.area.text, 'Trans Ekulu'); assert.deepEqual(r.flags.documents, ['ID']);
  assert.equal(r.parsed.pay.text, ''); assert.equal(r.mode, 'sample');
  assert.equal(r.parsed.work.text, 'counter assistant'); assert.equal(r.parsed.start.text, 'Monday');
  assert.equal(r.parsed.contact.text, '08031234567');
  assert.deepEqual(r.parsed.documents, [{text:'ID', sourceQuote:'must have valid ID'}]);
  assert.deepEqual(r.flags, {feeRequest:false, feeWarning:false, documents:['ID'], asksForIdByMessage:false, noContact:false});
  assert.deepEqual(ruleParse(AMARA_POST), r.parsed);
});
test('documents, ID by message and contact detectors', () => {
  assert.deepEqual(detectDocuments('Security guard, valid driver\'s licence and police clearance, ID copy, own boots, NIN and BVN, call 0821234567'),
    ["Driver's licence", 'Police clearance', 'ID copy', 'Own boots', 'NIN', 'BVN']);
  assert.deepEqual(detectDocuments('Matric, a smartphone, own tools, a guarantor and two references'), ['Matric', 'Smartphone', 'Own tools', 'Guarantor', 'References']);
  assert.deepEqual(detectDocuments('Certificate of good conduct needed, I\'d like a valid ID'), ['Certificate of good conduct', 'ID']);
  assert.deepEqual(detectDocuments('Cleaner in Ikeja, call 08031234567'), []);
  assert.equal(asksForIdByMessage('Inbox me your ID number and a selfie'), true);
  assert.equal(asksForIdByMessage('Bring your ID on the first day, call 0821234567'), false);
  assert.equal(hasContact('call 082 123 4567'), true);
  assert.equal(hasContact('Come to Glamour Hair on Monday'), true);
  assert.equal(hasContact('come to the shop, 3 days'), false);
  assert.equal(hasContact('R250/day, 5 days'), false);
});
test('document messages name the item', () => {
  assert.deepEqual(docMessages(['ID']), ['The post asks for an ID. We will write exactly what you say.', 'The post asks for an ID. Reply 1 I have it, 2 leave it out.']);
  assert.deepEqual(docMessages(['Own boots']), ['The post asks for: Own boots. We will write exactly what you say.', 'The post asks for: Own boots. Reply 1 I have it, 2 leave it out.']);
});
test('the listing schema is strict and describes the quote', () => {
  const s = listingSchema();
  assert.equal(s.additionalProperties, false);
  assert.deepEqual(s.required, ['work', 'area', 'pay', 'start', 'contact', 'documents', 'money_asked']);
  assert.equal(s.properties.pay.properties.sourceQuote.description, 'at least eight characters of the surrounding text');
  assert.equal(s.properties.documents.items.additionalProperties, false);
  assert.ok(!JSON.stringify(s).includes('minItems') && !JSON.stringify(s).includes('maxItems'));
});
test('model fields need a quote; empty fields skip the checks', async () => {
  const text = 'Cleaner needed in Soweto, R300 a day, start Monday, call 0821234567';
  const base = {work:{text:'Cleaner', sourceQuote:'Cleaner needed in Soweto'}, area:{text:'Soweto', sourceQuote:'needed in Soweto'}, start:{text:'Monday', sourceQuote:'start Monday'},
    contact:{text:'[number]', sourceQuote:'call [number]'}, documents:[], money_asked:[empty]};
  const model = fakeModel({...base, pay:{text:'R300', sourceQuote:'R300'}});
  const r = await parsePost(text, {provider:model});
  assert.equal(r.mode, 'live'); assert.equal(r.parsed.pay.text, '');
  assert.ok(r.rejected.some(x => x.field === 'pay' && x.reason === 'quote_not_in_source'));
  assert.equal(r.parsed.work.text, 'Cleaner'); assert.equal(r.parsed.contact.text, '0821234567');
  assert.equal(model.calls[0].schemaName, 'yovouch_listing');
  assert.ok(!JSON.stringify(model.calls[0].messages).includes('0821234567'), 'the model never sees the phone number');
  const quiet = await parsePost(text, {provider:fakeModel({...base, pay:empty})});
  assert.deepEqual(quiet.rejected, []); assert.deepEqual(quiet.parsed.money_asked, []);
  const invented = await parsePost(text, {provider:fakeModel({...base, pay:{text:'R350 a day', sourceQuote:'Soweto, R300 a day'}})});
  assert.ok(invented.rejected.some(x => x.field === 'pay' && x.reason === 'invented_number'));
  const down = await parsePost(text, {provider:{name:'azure-openai', async complete(){throw new Error('provider down');}}});
  assert.equal(down.mode, 'sample'); assert.equal(down.parsed.pay.text, 'R300 a day');
  const scam = fakeModel(base);
  assert.equal((await parsePost('Pay R250 for training before you start, call 0821234567', {provider:scam})).refusal.reason, 'fee_request');
  assert.equal(scam.calls.length, 0, 'a refused post never reaches the model');
});
test('twenty fixture posts', async () => {
  const posts = require('./fixtures/posts.json');
  assert.equal(posts.length, 20);
  for (const p of posts) assert.equal(outcome(await parsePost(p.text)), p.expect, p.text);
  const asked = [];
  for (const p of posts.filter(x => x.expect === 'reply')) { const r = await parsePost(p.text); if (r.flags.documents.length) asked.push(...r.flags.documents); assert.ok(r.parsed.work.text, p.text); assert.ok(r.parsed.area.text, p.text); }
  assert.deepEqual(asked.sort(), ["Driver's licence", 'Own boots', 'Police clearance']);
});
test('route returns messages and stores the post', async () => {
  const {base, vouch, clock} = await bootVouch();
  const r = await post(base, '/api/reply/parse', {text:AMARA_POST});
  assert.equal(r.messages[0], 'Post read. Work: counter assistant. Area: Trans Ekulu. Pay: not stated. Asked for: ID. No fee asked. Send one voice note of up to 20 seconds, or type: how you would get there, when you can start, and the closest work you have done.');
  assert.deepEqual(r.messages.slice(1), ['The post asks for an ID. We will write exactly what you say.', 'The post asks for an ID. Reply 1 I have it, 2 leave it out.', 'Sample mode: template extraction, no model call']);
  assert.deepEqual(r.documents, ['ID']); assert.equal(r.refusal, null); assert.equal(r.warning, null);
  const stored = vouch.postStore.get(r.jobPostId);
  assert.equal(stored.postedAt, new Date(NOW).toISOString());
  assert.equal(stored.createdAt, stored.postedAt); assert.equal(stored.expiresAt, new Date(NOW + 60 * DAY).toISOString());
  assert.equal(stored.rawText, AMARA_POST); assert.deepEqual(stored.flags, r.flags);
  assert.match(r.jobPostId, /^[A-Z2-9]{10}$/);
  assert.equal((await post(base, '/api/reply/parse', {text:'<Media omitted>'})).messages[0], 'I could not read this. Paste the text of the post.');
  assert.equal((await post(base, '/api/reply/parse', {text:'image omitted'})).messages[0], 'I could not read this. Paste the text of the post.');
  assert.equal((await post(base, '/api/reply/parse', {text:'   '})).messages[0], 'I could not read this. Paste the text of the post.');
  const warned = await post(base, '/api/reply/parse', {text:'Need 2 general labourers, Pinetown site, R250/day, training provided, call 0821234567'});
  assert.ok(warned.messages[0].startsWith('This post mentions ')); assert.ok(warned.messages[1].startsWith('Post read. Work: 2 general labourers. Area: Pinetown. Pay: R250/day. Asked for: nothing.'));
  const refused = await post(base, '/api/reply/parse', {text:'Uniform R150, pay first, call 0821234567'});
  assert.equal(refused.jobPostId, null); assert.equal(refused.messages.length, 1); assert.equal(refused.messages[0], refused.refusal.message);
  const logged = vouch.events.read().filter(e => e.type === 'parser_refused').map(e => e.reason);
  assert.deepEqual(logged, ['cannot_read', 'cannot_read', 'cannot_read', 'fee_request']);
  void clock;
});
test('the in-flight guard covers the model call', async () => {
  const {base} = await bootVouch({provider:fakeLiveProvider(), maxInFlight:0});
  const res = await fetch(base + '/api/reply/parse', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({text:AMARA_POST})});
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), {error:{code:'busy', message:'The server is busy, try again in a moment.', retryable:true}});
});
test('sweep deletes posts after 60 days', async () => {
  const {vouch, clock} = await bootVouch();
  const id = vouch.postStore.create({rawText:AMARA_POST, parsed:ruleParse(AMARA_POST), flags:{}});
  clock.t += 59 * DAY; runSweep(vouch); assert.ok(vouch.postStore.get(id));
  clock.t += 2 * DAY; runSweep(vouch); assert.equal(vouch.postStore.get(id), null);
});
