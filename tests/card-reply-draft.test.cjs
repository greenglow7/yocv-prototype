'use strict';
// Plan Task 10: the six-line reply, the edit loop, the reply page and the one-SMS reply.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {extractAnswers,ruleAnswers,answersText,chooseExperience,buildReplyLines,fitReply,smsReply,editLine,createReplyStore}=require('../server/card/reply.js');
const {sourceLabel,experienceShort,smsShort}=require('../server/card/vouch-lines.js');
const {t}=require('../server/card/copy.js');
const {runSweep}=require('../server/card/sweep.js');
const {NOW,bootVouch,publishPersona,post}=require('./helpers/vouch-boot.cjs');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');

const N=NOW,DAY=86400000,HOUR=3600000;
const iso=ms=>new Date(ms).toISOString();
const cp=s=>Array.from(s).length;
const PINETOWN='Need 2 general labourers, Pinetown site, R250/day, training provided, must have own boots, call 0821234567';
const sipho={cardId:'ABCDEFGHJK',code:'7F3K2A',trade:'General labourer',tradeId:'labourer',publishedAt:'2026-10-01T08:00:00.000Z',
 selfDeclared:{headline:'',services:[],area:'Umlazi',hours:'',languages:[],notes:''},confirms:[],disclosed:{completions:[],skills:[]},
 user:{firstName:'Sipho',country:'South Africa',city:'Durban',phoneNumberConfirmed:true,phoneLast3:'131',opportunityCountCompleted:0}};
const thandi={...sipho,cardId:'BCDEFGHJKL',code:'K7PQ2M',trade:'Hairdresser',tradeId:'hair',selfDeclared:{...sipho.selfDeclared,area:'Khayelitsha'},
 disclosed:{completions:[{evidenceId:'ev1',title:'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro',organizationName:'Alison Learning'}],skills:[]},
 user:{...sipho.user,firstName:'Thandi',opportunityCountCompleted:1}};
// A vouch file {record, held, private} on `card`.
function vf(id,{card=sipho,kind='customer',work='Braids',words=null,held=null,at=N-DAY,method='qr',onWorkerPhone=false,phoneConfirmedBy='sms_bind',
 from=null,withdrawAfter=null,withdrawnAt=null,hiddenAt=null,clip=null,extra={}}={}){
 return {record:{vouchId:id,cardId:card.cardId,kind,proof:{method,step:1,provedAt:iso(at),channel:'web',onWorkerPhone},
  voucher:{label:kind==='worker'?"Bongani's card":'a customer',firstName:kind==='worker'?'Bongani':null,phoneLast3:null,phoneConfirmedBy,cardId:from,orgName:null},
  fields:{work,words,wordsSource:words?'typed':null,when:'2026-11',howOften:'once',hireAgain:'yes'},line:work+', November 2026, once. Would hire again: yes.',
  lang:'en',wordsShownAt:words?iso(at):null,clip,flags:[],visits:1,confirmedAt:iso(at),...extra},
  held:held?{words:held,wordsSource:'typed',clip:null}:null,private:{withdrawnAt,withdrawAfter,hiddenAt}};
}
const paving=vf('PAVINGAAAA',{kind:'worker',work:'Paving',from:'CDEFGHJKLM'});

test("Sipho's filled example", () => {
  const lines = buildReplyLines({card:sipho, firstName:'Sipho', answers:{route:'two taxis, about an hour, I know the route', available:'from Monday, any day', experience:''},
    experience:{text:'paving, this month, once', source:'(vouched by another worker, code matched)'}, documents:['Own boots'], documentAnswer:{'Own boots':'yes'}, clipCount:1, cardUrl:'https://yocard.example/c/ABCDEFGHJK'});
  assert.deepEqual(lines, [
    'Sipho · General labourer · Umlazi · to the job: two taxis, about an hour, I know the route',
    'Experience: paving, this month, once (vouched by another worker, code matched)',
    'Confirmed from Yoma: phone confirmed (not an ID check)',
    'Available: from Monday, any day (stated by Sipho)',
    'Own boots: yes (stated by Sipho)',
    "Card with 1 clip: https://yocard.example/c/ABCDEFGHJK · lines 1, 4, 5 from Sipho's own words · card signed by YoCard, not by Yoma"]);
  assert.equal(experienceShort(paving.record, {nowMs:N, country:'South Africa'}), 'paving, this month, once');
  assert.equal(sourceLabel(paving.record, 'Sipho'), '(vouched by another worker, code matched)');
  const chosen = chooseExperience({card:sipho, vouches:[paving], post:{work:{text:'2 general labourers, paving'}}, firstName:'Sipho', nowMs:N});
  assert.deepEqual(chosen, {text:'paving, this month, once', source:'(vouched by another worker, code matched)', sourceTag:'vouch:PAVINGAAAA', vouchId:'PAVINGAAAA'});
  // No clips: the line drops the zero.
  const none = buildReplyLines({card:sipho, firstName:'Sipho', answers:{}, experience:chosen, documents:[], clipCount:0, cardUrl:'https://yocard.example/c/ABCDEFGHJK'});
  assert.equal(none[5], "Card: https://yocard.example/c/ABCDEFGHJK · lines 1, 4, 5 from Sipho's own words · card signed by YoCard, not by Yoma");
  assert.equal(none[0], 'Sipho · General labourer · Umlazi · to the job: not stated');
  assert.equal(none[3], 'Available: not stated (stated by Sipho)');
  assert.equal(none[4], 'Documents asked for: none in the post');
  assert.ok(buildReplyLines({card:sipho, firstName:'Sipho', answers:{}, experience:chosen, documents:[], clipCount:2, cardUrl:'u'})[5].startsWith('Card with 2 clips: u · '));
});

test('source labels and short forms for every vouch kind', () => {
  const L = r => sourceLabel(r, 'Sipho');
  assert.equal(L(vf('A').record), '(said by a customer, code matched)');
  assert.equal(L(vf('A', {onWorkerPhone:true}).record), '(said by a customer, code texted from their phone)');
  assert.equal(L(vf('A', {onWorkerPhone:true, phoneConfirmedBy:'demo'}).record), '(said by a customer, demo, nothing texted)');
  assert.equal(L(vf('A', {method:'request'}).record), '(said by a customer, by request)');
  assert.equal(L(vf('A', {kind:'worker', method:'request'}).record), '(vouched by another worker, by request)');
  assert.equal(L({kind:'organisation', voucher:{orgName:'Alison Learning'}}), '(referred by Alison Learning)');
  assert.deepEqual(smsShort(paving.record, {nowMs:N, country:'South Africa'}), {vouchShort:'Paving, this month', sourceShort:'vouched by a worker, code matched'});
  assert.equal(smsShort(vf('A', {onWorkerPhone:true}).record, {nowMs:N, country:'South Africa'}).sourceShort, 'said by a customer, code texted');
  assert.equal(smsShort(vf('A', {method:'request'}).record, {nowMs:N, country:'South Africa'}).sourceShort, 'said by a customer, by request');
  const words = vf('B', {words:'neat and on time'}).record;
  assert.equal(experienceShort(words, {nowMs:N, country:'South Africa'}), 'braids, this month, once "neat and on time"');
  assert.equal(experienceShort({...words, fields:{...words.fields, when:'2026-10'}}, {nowMs:N, country:'South Africa'}).split(',')[1].trim(), 'last month');
  assert.equal(experienceShort({...words, fields:{...words.fields, when:'2026-03', words:null}}, {nowMs:N, country:'South Africa'}), 'braids, March 2026, once');
  assert.equal(experienceShort({...words, fields:{...words.fields, when:'earlier', words:null}}, {nowMs:N, country:'South Africa'}), 'braids, earlier, once');
});

test('template mode keeps the worker number, labelled', async () => {
  const a = ruleAnswers('I did braids for 10 years, I can start Monday.');
  assert.equal(a.experience.text, 'braids for 10 years'); assert.equal(a.available.text, 'I can start Monday');
  assert.equal(a.experience.sourceQuote, 'I did braids for 10 years'); assert.equal(a.route.text, '');
  assert.deepEqual(answersText(a), {route:'', available:'I can start Monday', experience:'braids for 10 years'});
  const r = ruleAnswers('Two taxis, about an hour. From Monday. Paving.');
  assert.equal(r.route.text, 'Two taxis, about an hour'); assert.equal(r.available.text, 'From Monday'); assert.equal(r.experience.text, 'Paving');
  const bare = {...thandi, disclosed:{completions:[], skills:[]}, user:{...thandi.user, opportunityCountCompleted:0}};
  const x = await extractAnswers({transcript:'I did braids for 10 years, I can start Monday.', provider:null, organisationNames:[]});
  assert.equal(x.mode, 'sample'); assert.deepEqual(x.rejected, []); assert.equal(x.experience.text, 'braids for 10 years');
  const e = chooseExperience({card:bare, vouches:[], post:{work:{text:'braider'}}, firstName:'Thandi', nowMs:N, answers:answersText(x)});
  const lines = buildReplyLines({card:bare, firstName:'Thandi', answers:answersText(x), experience:e, documents:[], clipCount:0, cardUrl:'u'});
  assert.equal(lines[1], 'Experience: braids for 10 years (stated by Thandi, not checked)');
  assert.equal(e.sourceTag, 'transcript');
  // A short clause still gets an eight-character quote from the surrounding text.
  assert.ok((await extractAnswers({transcript:'Two taxis, about an hour. From Monday. Paving.'})).experience.text === 'Paving');
});

const fakeEcho = {name:'azure-openai', model:'x', async complete(req){ return req.schemaName === 'yovouch_reply_extract'
  ? {route:{text:'', sourceQuote:''}, available:{text:'I can start Monday', sourceQuote:'I can start Monday'},
     experience:{text:'I am a certified braider, I worked for Alison', sourceQuote:'I am a certified braider, I worked for Alison'}} : null; }};
test('an embellished transcript loses the credential and the organisation', async () => {
  const r = await extractAnswers({transcript:'I am a certified braider, I worked for Alison, I can start Monday.', provider:fakeEcho, organisationNames:['Alison Learning','Alison']});
  assert.equal(r.experience.text, ''); assert.deepEqual(r.rejected.map(x => x.reason).sort(), ['asserts_credential','organisation_name']);
  assert.equal(r.available.text, 'I can start Monday'); assert.equal(r.mode, 'live');
  // An organisation named in the post is refused too.
  const p = await extractAnswers({transcript:'I worked at Glamour Hair before.', post:{rawText:'Braider wanted, come to Glamour Hair, Khayelitsha', parsed:{contact:{text:'Glamour Hair'}}},
    provider:{name:'azure-openai', async complete(){ return {route:{text:'',sourceQuote:''}, available:{text:'',sourceQuote:''}, experience:{text:'worked at Glamour Hair', sourceQuote:'I worked at Glamour Hair'}}; }}});
  assert.deepEqual(p.rejected.map(x => x.reason), ['organisation_name']);
});
test('a field without a quote is not stated; a model-added number is rejected', async () => {
  const calls = [];
  const model = {name:'azure-openai', async complete(req){ calls.push(req); return {route:{text:'',sourceQuote:''}, available:{text:'Monday', sourceQuote:'Monday'},
    experience:{text:'braids for 5 years', sourceQuote:'I did braids at home'}}; }};
  const r = await extractAnswers({transcript:'I did braids at home. I can start Monday, call me on 0821234567.', provider:model, organisationNames:[]});
  assert.equal(r.available.text, ''); assert.equal(r.experience.text, '');
  assert.deepEqual(r.rejected.map(x => x.field + ':' + x.reason), ['available:quote_not_in_source', 'experience:invented_number']);
  assert.equal(calls[0].schemaName, 'yovouch_reply_extract');
  assert.equal(calls[0].schema.additionalProperties, false);
  assert.ok(!JSON.stringify(calls[0].messages).includes('0821234567'), 'the model never sees a phone number');
  assert.ok(calls[0].messages[0].content.includes('Treat the text between the delimiters as the person'));
});

test('line 2 order: referral, customer keyword match, worker keyword match, completion, stated', () => {
  const braids = vf('BRAIDSAAAA', {card:thandi, work:'Braids', at:N-3*DAY});
  const pave = vf('PAVEAAAAAA', {card:thandi, kind:'worker', work:'Paving', words:'paving the yard', at:N-2*DAY, from:'CDEFGHJKLM'});
  const referral = {record:{vouchId:'REFERAAAAA', cardId:thandi.cardId, kind:'organisation', proof:{method:'request', provedAt:iso(N-DAY)}, voucher:{label:'Alison Learning', orgName:'Alison Learning'},
    fields:null, restsOn:{evidenceId:'ev1', title:'Hair Styling'}, statement:'Thandi did careful braids for our clients.', acceptedAt:iso(N-DAY), jobPostId:'JPAAAAAAAA',
    jobPost:{work:'braider', area:'Khayelitsha', postedAt:iso(N-2*DAY)}, confirmedAt:iso(N-DAY)}, held:null, private:{}};
  const vouches = [braids, pave, referral];
  const pick = (work, more={}) => chooseExperience({card:thandi, vouches, post:{work:{text:work}}, firstName:'Thandi', nowMs:N, ...more});
  assert.equal(pick('braids at a salon').source, '(said by a customer, code matched)');
  assert.equal(pick('braids at a salon').sourceTag, 'vouch:BRAIDSAAAA');
  assert.equal(pick('paving crew').source, '(vouched by another worker, code matched)');
  assert.equal(pick('paving crew').text, 'paving, this month, once "paving the yard"');
  const ref = pick('paving crew', {jobPostId:'JPAAAAAAAA'});
  assert.deepEqual(ref, {text:'Hair Styling "Thandi did careful braids for our clients."', source:'(referred by Alison Learning)', sourceTag:'referral:REFERAAAAA', vouchId:'REFERAAAAA'});
  assert.equal(pick('driver').source, '(confirmed from Yoma)');
  assert.deepEqual(pick('driver'), {text:'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro', source:'(confirmed from Yoma)', sourceTag:'completion:ev1', vouchId:null});
  // The trade label counts as a post word: a "hairdresser" chip would match any post for Thandi.
  assert.equal(chooseExperience({card:thandi, vouches:[vf('HAIRAAAAAA', {card:thandi, work:'Hairdresser'})], post:{work:{text:'driver'}}, firstName:'Thandi', nowMs:N}).sourceTag, 'vouch:HAIRAAAAAA');
  // A flagged worker line is skipped; a hidden line is skipped.
  assert.equal(pick('paving crew', {flags:new Map([['PAVEAAAAAA', ['reciprocal']]])}).source, '(confirmed from Yoma)');
  const hidden = vf('HIDDENAAAA', {card:thandi, work:'Braids', hiddenAt:iso(N-HOUR)});
  assert.equal(chooseExperience({card:thandi, vouches:[hidden], post:{work:{text:'braids'}}, firstName:'Thandi', nowMs:N}).source, '(confirmed from Yoma)');
  const bare = {...thandi, disclosed:{completions:[], skills:[]}};
  assert.deepEqual(chooseExperience({card:bare, vouches:[], post:{work:{text:'braids'}}, firstName:'X', nowMs:N}), {text:'not stated', source:'(stated by X, not checked)', sourceTag:'transcript', vouchId:null});
  // Newest match first.
  const newer = vf('NEWERAAAAA', {card:thandi, work:'Braids', at:N-HOUR});
  assert.equal(chooseExperience({card:thandi, vouches:[braids, newer], post:{work:{text:'braids'}}, firstName:'Thandi', nowMs:N}).vouchId, 'NEWERAAAAA');
});

test('Review Focus 4 and 5: line 2 and the one-SMS reply skip withdrawn lines and held words', () => {
  const quiet = vf('QUIETAAAAA', {card:thandi, work:'Braids', withdrawAfter:iso(N-1000)});
  assert.equal(chooseExperience({card:thandi, vouches:[quiet], post:{work:{text:'braids'}}, firstName:'Thandi', nowMs:N}).source, '(confirmed from Yoma)');
  assert.ok(!smsReply({card:thandi, vouches:[quiet], publicUrl:'https://y.co', nowMs:N}).includes('Braids'));
  const heldBraids = vf('HELDAAAAAA', {card:thandi, work:'Braids', held:'She did my braids three times'});
  const chosen = chooseExperience({card:thandi, vouches:[heldBraids], post:{work:{text:'braids'}}, firstName:'Thandi', nowMs:N});
  assert.equal(chosen.vouchId, 'HELDAAAAAA'); assert.ok(!chosen.text.includes('three times'));
  // A held word is never a keyword either.
  assert.equal(chooseExperience({card:thandi, vouches:[vf('HELDBAAAAA', {card:thandi, work:'Cut', held:'perfect cornrows'})], post:{work:{text:'cornrows'}}, firstName:'Thandi', nowMs:N}).source, '(confirmed from Yoma)');
  assert.ok(!smsReply({card:thandi, vouches:[heldBraids], publicUrl:'https://yocard.example', nowMs:N}).includes('three times'));
  // The vouch unit fits only on a short card whose phone line is the short one.
  assert.ok(smsReply({card:{...thandi, user:{...thandi.user, firstName:'Al', city:'', opportunityCountCompleted:0, phoneNumberConfirmed:false}, trade:'Cook', selfDeclared:{area:''}}, vouches:[heldBraids], publicUrl:'https://y.co', nowMs:N}).includes('Braids, this month'));
});

test('zero rule, two items, third dropped, line 3 count from the record', () => {
  const lines = (card, docs=[], answer={}) => buildReplyLines({card, firstName:card.user.firstName, answers:{}, experience:{text:'x', source:'(confirmed from Yoma)'}, documents:docs, documentAnswer:answer, clipCount:0, cardUrl:'u'});
  assert.equal(lines(sipho, ['ID', 'Own boots', 'Police clearance'], {ID:'yes', 'Police clearance':'yes'})[4], 'ID: yes · Own boots: not stated (stated by Sipho)');
  assert.equal(lines(sipho, ['ID'], {ID:'no'})[4], 'ID: not stated (stated by Sipho)');
  assert.equal(lines({...sipho, user:{...sipho.user, opportunityCountCompleted:2}})[2], 'Confirmed from Yoma: 2 completions · phone confirmed (not an ID check)');
  assert.equal(lines(thandi)[2], 'Confirmed from Yoma: 1 completion · phone confirmed (not an ID check)');
  assert.equal(lines({...thandi, user:{...thandi.user, opportunityCountCompleted:null}})[2], 'Confirmed from Yoma: 1 completion · phone confirmed (not an ID check)');
  assert.equal(lines({...thandi, user:{...thandi.user, phoneNumberConfirmed:false}})[2], 'Phone not confirmed by Yoma');
  for (const l of [...lines(sipho), ...lines(thandi)]) assert.ok(!/\b0 /.test(l), l);
});

test('length rules', () => {
  const long = 'I take a taxi to the rank and then another taxi and then I walk for a long time past the big market and the old station';
  const words = Array.from({length:30}, (_, i) => 'word' + i).join(' ');
  const raw = buildReplyLines({card:sipho, firstName:'Sipho', answers:{route:long, available:'from Monday '.repeat(12).trim()}, experience:{text:'paving, this month, once "' + words + '"', source:'(said by a customer, code matched)'},
    documents:['Own boots', 'Police clearance'], documentAnswer:{}, clipCount:3, cardUrl:'https://yocard.example/c/ABCDEFGHJK'});
  const fit = fitReply(raw);
  assert.equal(fit.length, 6);
  for (const l of fit.slice(0, 5)) assert.ok(cp(l) <= 120, l);
  assert.equal(fit[5], raw[5], 'line 6 is never shortened');
  assert.ok(fit[1].endsWith('…" (said by a customer, code matched)'), fit[1]);
  assert.ok(fit[0].startsWith('Sipho · General labourer · Umlazi · to the job: I take a taxi'), fit[0]);
  assert.ok(fit[3].endsWith('(stated by Sipho)'), fit[3]);
  assert.ok(cp(fit.join('\n')) <= 700);
  // A long but legal reply over 700 shortens line 2's quoted words first.
  const big = ['A'.repeat(118), 'Experience: x "' + Array.from({length:20}, () => 'wordy').join(' ') + '" (src)', 'B'.repeat(118), 'C'.repeat(118), 'D'.repeat(118), 'E'.repeat(140)];
  const over = fitReply(big);
  assert.ok(cp(over.join('\n')) <= 700); assert.notEqual(over[1], big[1]); assert.ok(over[1].endsWith('…" (src)'), over[1]);
  assert.deepEqual(fitReply(['a', 'b']), ['a', 'b', '', '', '', '']);
});

test('edit admits only words from the new message', () => {
  const lines = ['Sipho · General labourer · Umlazi · to the job: not stated', 'Experience: Paving (stated by Sipho, not checked)', 'Confirmed from Yoma: phone confirmed (not an ID check)',
    'Available: from Monday (stated by Sipho)', 'Own boots: not stated (stated by Sipho)', 'Card: u · lines 1, 4, 5 from Sipho\'s own words · card signed by YoCard, not by Yoma'];
  const reply = {lang:'en', lines, linesInSourceLang:lines.slice(), edits:[]};
  const ctx = {firstName:'Sipho', organisationNames:['Alison Learning'], documents:['Own boots'], nowMs:N};
  assert.equal(editLine(reply, 4, '4 from Tuesday', ctx).reply.lines[3], 'Available: from Tuesday (stated by Sipho)');
  assert.equal(editLine(reply, 4, '4 certified from Tuesday', ctx).ok, false);
  assert.equal(editLine(reply, 4, '4 certified from Tuesday', ctx).reason, 'asserts_credential');
  assert.equal(editLine(reply, 2, '2 anything', ctx).reason, 'not_editable');
  assert.equal(editLine(reply, 6, 'anything', ctx).reason, 'not_editable');
  assert.equal(editLine(reply, 4, '4 from Tuesday', ctx).reply.edits.length, 1);
  assert.deepEqual(editLine(reply, 4, '4 from Tuesday', ctx).reply.edits[0], {line:4, from:lines[3], to:'Available: from Tuesday (stated by Sipho)', at:iso(N)});
  assert.equal(reply.lines[3], lines[3], 'the reply passed in is not changed');
  assert.equal(editLine(reply, 1, '1 one taxi, twenty minutes', ctx).reply.lines[0], 'Sipho · General labourer · Umlazi · to the job: one taxi, twenty minutes');
  assert.equal(editLine(reply, 1, 'I trained at Alison Learning', ctx).reason, 'organisation_name');
  assert.equal(editLine(reply, 5, '5 yes', ctx).reply.lines[4], 'Own boots: yes (stated by Sipho)');
  assert.equal(editLine(reply, 4, '4 ' + 'x'.repeat(120), ctx).reason, 'length');
  // A reply in another language keeps lines null and edits the own-language lines.
  const zu = editLine({...reply, lang:'zu', lines:null}, 4, 'kusukela ngoLwesibili', ctx).reply;
  assert.equal(zu.lines, null); assert.equal(zu.linesInSourceLang[3], 'Available: kusukela ngoLwesibili (stated by Sipho)');
});

test('one-SMS reply drop order', () => {
  const s = smsReply({card:sipho, vouches:[paving], publicUrl:'https://yocard.example', nowMs:N});
  assert.equal(s, 'Sipho, general labourer, Umlazi. Phone confirmed by Yoma (not an ID check). Card yocard.example/c/ABCDEFGHJK code 7F3K2A. Lines not checked by Yoma');
  assert.ok(Buffer.byteLength(s) <= 160);
  // When everything fits it is the section 17 full form (with the phone line the card has).
  const tiny = {...sipho, trade:'Cook', selfDeclared:{area:'Ga'}, user:{...sipho.user, firstName:'Al'}};
  const meal = vf('MEALAAAAAA', {card:tiny, work:'Meals'});
  const unconfirmed = {...tiny, user:{...tiny.user, phoneNumberConfirmed:false}};
  assert.equal(smsReply({card:unconfirmed, vouches:[meal], publicUrl:'https://y.co', nowMs:N}),
    t('smsReplyFull', 'en', {first:'Al', trade:'cook', area:'Ga', vouchShort:'Meals, this month', sourceShort:'said by a customer, code matched', link:'y.co/c/ABCDEFGHJK', cardCode:'7F3K2A'})
      .replace('Phone confirmed by Yoma (not an ID check)', 'Phone not confirmed by Yoma'));
  // With a confirmed phone the vouch unit goes first: it never fits beside the phone line and the tail.
  assert.ok(!smsReply({card:tiny, vouches:[meal], publicUrl:'https://y.co', nowMs:N}).includes('Meals'));
  // Completions sit after the area sentence and go second; the area goes third; the phone sentence last.
  const two = {...tiny, user:{...tiny.user, opportunityCountCompleted:2}};
  assert.equal(smsReply({card:two, vouches:[], publicUrl:'https://y.co', nowMs:N}), 'Al, cook, Ga. 2 completions on Yoma. Phone confirmed by Yoma (not an ID check). Card y.co/c/ABCDEFGHJK code 7F3K2A. Lines not checked by Yoma');
  const one = {...tiny, user:{...tiny.user, opportunityCountCompleted:1}};
  assert.ok(smsReply({card:one, vouches:[], publicUrl:'https://y.co', nowMs:N}).includes('Ga. 1 completion on Yoma. Phone'));
  const longName = {...two, user:{...two.user, firstName:'Nomathemba'}, trade:'Boda boda or taxi driver', selfDeclared:{area:'Khayelitsha, Cape Town'}};
  const far = smsReply({card:longName, vouches:[], publicUrl:'https://yocard.example', nowMs:N});
  assert.ok(Buffer.byteLength(far) <= 160, far); assert.ok(!far.includes('completions'), far);
  assert.ok(far.includes('Phone confirmed by Yoma (not an ID check)') && far.endsWith('Lines not checked by Yoma'), far);
  // A referral is never the SMS vouch.
  const ref = {record:{...meal.record, vouchId:'REFAAAAAAA', kind:'organisation', acceptedAt:iso(N), voucher:{orgName:'Org'}}, held:null, private:{}};
  assert.ok(!smsReply({card:tiny, vouches:[ref], publicUrl:'https://y.co', nowMs:N}).includes('referred'));
});

test('reply store keeps records under replies/', () => {
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'yv-replies-'));
  const store = createReplyStore(dir, {now:() => N});
  const id = store.create({cardId:'ABCDEFGHJK', lines:['a']});
  assert.match(id, /^[A-Z2-9]{10}$/);
  assert.equal(store.get(id).replyId, id); assert.ok(fs.existsSync(path.join(dir, 'replies', id + '.json')));
  store.update(id, r => { r.forwardedAt = 'x'; });
  assert.equal(store.get(id).forwardedAt, 'x'); assert.equal(store.get('nope'), null);
});

async function sipho0() {
  const b = await bootVouch();
  const card = await publishPersona(b.base, 'sipho', {area:'Umlazi'});
  const parsed = await post(b.base, '/api/reply/parse', {text:PINETOWN});
  return {...b, ...card, jobPostId:parsed.jobPostId};
}

test('reply record, confirm, forward tap and page', async () => {
  const {base, vouch, clock, cardId, cardToken, jobPostId, code} = await sipho0();
  const d = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId, text:'Two taxis, about an hour. From Monday. Paving.', lang:'en', documentAnswer:{'Own boots':'yes'}});
  assert.deepEqual(d.lines, ['Sipho · General labourer · Umlazi · to the job: Two taxis, about an hour', 'Experience: Paving (stated by Sipho, not checked)',
    'Confirmed from Yoma: phone confirmed (not an ID check)', 'Available: From Monday (stated by Sipho)', 'Own boots: yes (stated by Sipho)',
    `Card: https://yocard.example/c/${cardId} · lines 1, 4, 5 from Sipho's own words · card signed by YoCard, not by Yoma`]);
  assert.deepEqual(d.messages, ['Here is your reply. Read every line.', ...d.lines,
    'Reply 1 to get the English reply to forward, 2 to change a line (like "4 from Tuesday"), 3 to add a 15-second clip about yourself.', 'Sample mode: template extraction, no model call']);
  assert.deepEqual(d.rejected, []);
  const r = vouch.replyStore.get(d.replyId);
  assert.equal(r.post.rawText, PINETOWN); assert.equal(r.sources.length, 6); assert.equal(r.sources[4], 'tap');
  assert.deepEqual(r.sources, ['card+transcript', 'transcript', 'record', 'transcript', 'tap', 'record']);
  assert.deepEqual(r.warnings.sort(), ['document_requested','fee_warning']); assert.equal(r.forwardedAt, null);
  assert.equal(r.lang, 'en'); assert.deepEqual(r.lines, d.lines); assert.deepEqual(r.linesInSourceLang, d.lines);
  assert.deepEqual(r.translation, {by:'none', from:'en', backTranslation:null, confirmedBySpeaker:false, confirmedAt:null});
  assert.equal(r.confirmedLang, null); assert.equal(r.sms, null); assert.deepEqual(r.clipIds, []); assert.deepEqual(r.edits, []);
  assert.equal(r.transcript, 'Two taxis, about an hour. From Monday. Paving.'); assert.equal(r.generation.mode, 'sample');
  assert.equal(r.createdAt, iso(clock.t)); assert.equal(r.jobPostId, jobPostId); assert.equal(r.cardId, cardId);
  // A wrong card token is the not-found answer.
  const bad = await fetch(base + '/api/reply/draft', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({cardId, cardToken:'0'.repeat(16), jobPostId, text:'x'})});
  assert.equal(bad.status, 404); assert.equal((await bad.json()).error.message, 'No card with this code');
  // Edit line 4, then confirm the edited lines.
  const e = await post(base, `/api/reply/${d.replyId}/edit`, {cardId, cardToken, line:4, text:'4 from Tuesday'});
  assert.equal(e.ok, true); assert.equal(e.lines[3], 'Available: from Tuesday (stated by Sipho)');
  assert.equal((await post(base, `/api/reply/${d.replyId}/edit`, {cardId, cardToken, line:2, text:'2 anything'})).reason, 'not_editable');
  assert.equal(vouch.replyStore.get(d.replyId).edits.length, 1);
  const stale = await fetch(base + `/api/reply/${d.replyId}/confirm`, {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({cardId, cardToken, lines:d.lines, lang:'en'})});
  assert.equal(stale.status, 409);
  const c = await post(base, `/api/reply/${d.replyId}/confirm`, {cardId, cardToken, lines:e.lines, lang:'en'});
  assert.ok(c.forward.startsWith('Forward this to the number in the post. YoVouch never messages employers.'));
  assert.equal(c.forward, t('forwardThis') + '\n' + e.lines.join('\n'));
  const stored = vouch.replyStore.get(d.replyId);
  assert.ok(stored.sms.startsWith('Sipho, general labourer'));
  assert.equal(stored.sms, `Sipho, general labourer, Umlazi. Phone confirmed by Yoma (not an ID check). Card yocard.example/c/${cardId} code ${code}. Lines not checked by Yoma`);
  assert.equal(stored.confirmedLang, 'en'); assert.equal(stored.confirmedAt, iso(clock.t));
  await post(base, `/api/reply/${d.replyId}/forwarded`, {cardId, cardToken});
  assert.equal(vouch.replyStore.get(d.replyId).forwardedAt, new Date(clock.t).toISOString());
  const first = clock.t; clock.t += 60000;
  assert.equal((await post(base, `/api/reply/${d.replyId}/forwarded`, {cardId, cardToken})).forwardedAt, iso(first), 'set once');
  const res = await fetch(base + '/r/' + d.replyId); assertPrivateHeaders(res);
  const html = await res.text(); assertHonestPage(html);
  assert.ok(html.includes('Available: from Tuesday (stated by Sipho)')); assert.ok(!html.includes('Not translated'));
  assert.equal((await fetch(base + '/r/ABCDEFGHJK')).status, 404);
  const types = vouch.events.read().map(x => x.type);
  assert.ok(types.includes('reply_drafted') && types.includes('reply_confirmed'));
});

test('a reply in another language is not translated yet', async () => {
  const {base, vouch, cardId, cardToken, jobPostId} = await sipho0();
  const d = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId, text:'Two taxis. From Monday.', lang:'zu'});
  assert.equal(vouch.replyStore.get(d.replyId).lines, null);
  assert.deepEqual(vouch.replyStore.get(d.replyId).linesInSourceLang, d.lines);
  const c = await post(base, `/api/reply/${d.replyId}/confirm`, {cardId, cardToken, lines:d.lines, lang:'zu'});
  assert.deepEqual(c, {forward:null, lines:d.lines, notTranslated:true});
  assert.equal(vouch.replyStore.get(d.replyId).confirmedLang, 'zu');
  assert.ok((await (await fetch(base + '/r/' + d.replyId)).text()).includes('Not translated'));
});

test('clips: released, unflagged, live vouch clips ride along by default, newest first, up to 3', async () => {
  const {base, vouch, cardId, cardToken, jobPostId, clock} = await sipho0();
  const add = (i, over={}) => vouch.vouchStore.create({record:{...vf('X', {card:{cardId}, work:'Paving', at:clock.t-(i+1)*HOUR, ...over}).record,
    clip:{url:'/v/ID/clip', contentType:'audio/webm', seconds:9, bytes:18400}}, channel:'web'}).vouchId;
  const ids = [0, 1, 2, 3].map(i => add(i));
  const gone = add(4); vouch.vouchStore.withdrawAs(gone, 'now');
  const d = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId, text:'From Monday.', lang:'en'});
  const r = vouch.replyStore.get(d.replyId);
  assert.deepEqual(r.clipIds, ids.slice(0, 3));
  assert.ok(d.lines[5].startsWith('Card with 3 clips: '));
  assert.equal(r.sources[1], 'transcript', 'a Paving line shares no word with a post for general labourers');
  const pave = await post(base, '/api/reply/parse', {text:'Paving crew needed in Umlazi, call 0821234567'});
  const pd = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId:pave.jobPostId, text:'From Monday.', lang:'en'});
  assert.equal(vouch.replyStore.get(pd.replyId).sources[1], 'vouch:' + ids[0]);
  assert.equal(pd.lines[1], 'Experience: paving, this month, once (said by a customer, code matched)');
  const picked = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId, text:'From Monday.', lang:'en', clipIds:[ids[3], gone, 'NOPEAAAAAA']});
  assert.deepEqual(vouch.replyStore.get(picked.replyId).clipIds, [ids[3]]);
  // The reply page links only clips that are still live.
  await post(base, `/api/reply/${d.replyId}/confirm`, {cardId, cardToken, lines:d.lines, lang:'en'});
  vouch.vouchStore.withdrawAs(ids[0], 'now');
  const html = await (await fetch(base + '/r/' + d.replyId)).text();
  assert.equal(html.split('/clip"').length - 1, 2);
});

test('the reply page shows no line before the worker confirms, and an edit closes it again', async () => {
  const {base, cardId, cardToken, jobPostId} = await sipho0();
  const d = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId, text:'Two taxis, about an hour. From Monday. Paving.', lang:'en'});
  const closed = async () => { const res = await fetch(base + '/r/' + d.replyId); assertPrivateHeaders(res);
    const html = await res.text(); assert.equal(res.status, 404); assert.ok(html.includes('not confirmed yet'));
    for (const l of ['Two taxis', 'From Monday', 'from Tuesday', 'Paving']) assert.ok(!html.includes(l), l); };
  await closed();
  const e = await post(base, `/api/reply/${d.replyId}/edit`, {cardId, cardToken, line:4, text:'4 from Tuesday'});
  await closed();
  await post(base, `/api/reply/${d.replyId}/confirm`, {cardId, cardToken, lines:e.lines, lang:'en'});
  const open = await fetch(base + '/r/' + d.replyId);
  assert.equal(open.status, 200); assert.ok((await open.text()).includes('Available: from Tuesday (stated by Sipho)'));
  await post(base, `/api/reply/${d.replyId}/edit`, {cardId, cardToken, line:4, text:'4 from Wednesday'});
  const reopened = await fetch(base + '/r/' + d.replyId);
  assert.equal(reopened.status, 404); assert.ok(!(await reopened.text()).includes('Wednesday'));
});

test('Review Focus 4: reply line 2 turns neutral once its vouch is withdrawn, quietly withdrawn or hidden', async () => {
  const {base, vouch, cardId, cardToken, clock} = await sipho0();
  const pave = await post(base, '/api/reply/parse', {text:'Paving crew needed in Umlazi, call 0821234567'});
  const neutral = 'Experience: not stated (stated by Sipho, not checked)';
  for (const how of ['now', 'quiet', 'hide']) {
    const id = vouch.vouchStore.create({record:vf('X', {card:{cardId}, work:'Paving', words:'laid our driveway', at:clock.t-HOUR}).record, channel:'web'}).vouchId;
    const d = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId:pave.jobPostId, text:'From Monday.', lang:'en'});
    assert.equal(vouch.replyStore.get(d.replyId).sources[1], 'vouch:' + id);
    assert.ok(d.lines[1].includes('laid our driveway'), d.lines[1]);
    await post(base, `/api/reply/${d.replyId}/confirm`, {cardId, cardToken, lines:d.lines, lang:'en'});
    const before = await (await fetch(base + '/r/' + d.replyId)).text();
    assert.ok(before.includes('laid our driveway') && before.includes('said by a customer'), how);
    if (how === 'hide') vouch.vouchStore.hide(id, cardId);
    else vouch.vouchStore.withdrawAs(id, how);
    if (how === 'quiet') clock.t += 73 * HOUR;
    const html = await (await fetch(base + '/r/' + d.replyId)).text();
    assert.ok(!html.includes('laid our driveway') && !html.includes('said by a customer'), how);
    assert.ok(html.includes(neutral), how);
    assert.ok(html.includes('Available: From Monday (stated by Sipho)'), how);
  }
});

test('the reply menu names an organisation only when the card has one', async () => {
  const {base} = await bootVouch();
  const th = await publishPersona(base, 'thandi');
  const p = await post(base, '/api/reply/parse', {text:'Salon in Khayelitsha needs a braider, call 0821234567'});
  const d = await post(base, '/api/reply/draft', {cardId:th.cardId, cardToken:th.cardToken, jobPostId:p.jobPostId, text:'I did braids for 10 years, I can start Monday.', lang:'en'});
  assert.ok(d.messages.at(-2).endsWith('4 to ask Alison Learning to refer you.'), d.messages.at(-2));
  assert.equal(d.lines[1], 'Experience: Hair Styling: Blow-Dry, Cut, and Colour Like a Pro (confirmed from Yoma)');
  const s = await publishPersona(base, 'sipho', {area:'Umlazi'});
  const many = await post(base, '/api/reply/parse', {text:"Security guard needed in Umlazi, valid driver's licence, police clearance and own boots, call 0821234567"});
  const m = await post(base, '/api/reply/draft', {cardId:s.cardId, cardToken:s.cardToken, jobPostId:many.jobPostId, text:'From Monday.', lang:'en', documentAnswer:{'Police clearance':'yes'}});
  assert.ok(m.messages.at(-2).endsWith('3 to add a 15-second clip about yourself.'));
  assert.ok(m.messages.includes("The post asks for more than two things. Only Driver's licence and Police clearance will be in your reply."));
  assert.equal(m.lines[4], "Driver's licence: not stated · Police clearance: yes (stated by Sipho)");
});

test('voice service down', async () => {
  const down = {name:'azure-openai', model:'x', async complete(){ throw new Error('provider down'); }};
  const {base} = await bootVouch({provider:down});
  const s = await publishPersona(base, 'sipho', {area:'Umlazi'});
  const p = await post(base, '/api/reply/parse', {text:PINETOWN});
  const d = await post(base, '/api/reply/draft', {cardId:s.cardId, cardToken:s.cardToken, jobPostId:p.jobPostId, text:'Two taxis, about an hour. From Monday. Paving.', lang:'en'});
  assert.ok(d.messages.includes('The voice service is not available right now. Answer by typing: 1 How would you get there? 2 What is the closest work you have done? 3 When can you start?'));
  assert.equal(d.lines[3], 'Available: From Monday (stated by Sipho)');
});

test('the in-flight guard covers the draft model call', async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const slow = {name:'azure-openai', model:'x', async complete(req){
    if (req.schemaName !== 'yovouch_reply_extract') throw new Error('rules only');
    await gate; return {route:{text:'',sourceQuote:''}, available:{text:'From Monday',sourceQuote:'From Monday.'}, experience:{text:'',sourceQuote:''}}; }};
  const {base} = await bootVouch({provider:slow, maxInFlight:1});
  const s = await publishPersona(base, 'sipho', {area:'Umlazi'});
  const p = await post(base, '/api/reply/parse', {text:PINETOWN});
  const body = JSON.stringify({cardId:s.cardId, cardToken:s.cardToken, jobPostId:p.jobPostId, text:'From Monday.', lang:'en'});
  const send = () => fetch(base + '/api/reply/draft', {method:'POST', headers:{'content-type':'application/json'}, body});
  const first = send();
  await new Promise(r => setTimeout(r, 50));
  const busy = await send();
  assert.equal(busy.status, 503); assert.equal((await busy.json()).error.code, 'busy');
  release();
  const done = await (await first).json();
  assert.equal(done.lines[3], 'Available: From Monday (stated by Sipho)');
  assert.ok(!done.messages.includes('Sample mode: template extraction, no model call'));
  const unknown = await fetch(base + '/api/reply/draft', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({cardId:s.cardId, cardToken:s.cardToken, jobPostId:'ABCDEFGHJK', text:'x'})});
  assert.equal(unknown.status, 404);
});

test('sweep deletes the replies of a card withdrawn over 24 hours', async () => {
  const {base, vouch, clock, cardId, cardToken, jobPostId, ownerSecret} = await sipho0();
  const d = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId, text:'From Monday.', lang:'en'});
  const clips = path.join(vouch.store.dir, 'replies', 'clips');
  fs.mkdirSync(clips, {recursive:true}); fs.writeFileSync(path.join(clips, d.replyId + '.webm'), 'x');
  const keep = vouch.replyStore.create({cardId:'ZZZZZZZZZZ', lines:[]});
  await post(base, `/api/card/${cardId}/withdraw`, {ownerSecret});
  assert.equal((await fetch(base + '/r/' + d.replyId)).status, 410, 'a withdrawn card holds at read time');
  clock.t += 23 * HOUR; runSweep(vouch); assert.ok(vouch.replyStore.get(d.replyId));
  clock.t += 2 * HOUR; runSweep(vouch);
  assert.equal(vouch.replyStore.get(d.replyId), null); assert.ok(!fs.existsSync(path.join(clips, d.replyId + '.webm')));
  assert.ok(vouch.replyStore.get(keep));
});
