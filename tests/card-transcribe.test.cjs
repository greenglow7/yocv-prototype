'use strict';
// Plan Task 11: the microphone, the transcription adapter, clip storage and the self clip.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {createTranscriber,multipart,CONFIDENCE_FLOOR}=require('../server/card/transcribe.js');
const {loadConfig}=require('../server/config.js');
const {qrTag,counterAt}=require('../server/card/vouchcode.js');
const {t}=require('../server/card/copy.js');
const {assertHonestPage,assertPrivateHeaders}=require('./helpers/honesty.cjs');
const {bootVouch,publishPersona,post,form,page,get}=require('./helpers/vouch-boot.cjs');

const azureCfg={kind:'azure',endpoint:'https://r.openai.azure.com',apiKey:'k',deployment:'whisper',apiVersion:'2024-10-21'};
const openaiCfg={kind:'openai',baseUrl:'https://api.openai.com/v1',apiKey:'sk',model:'whisper-1'};
const HEAR_BADLY='I could not hear this well. Send the voice note again in a quiet place, or type your answers.';
const PINETOWN='Need 2 general labourers, Pinetown site, R250/day, training provided, must have own boots, call 0821234567';
const SAID='She did my braids three times this year.';

function fakeFetch(json,{status=200}={}){
 const calls=[];
 const f=async(url,opts={})=>{
  calls.push({url:String(url),headers:opts.headers||{},body:Buffer.from(opts.body||'').toString('latin1')});
  return {ok:status>=200&&status<300,status,async json(){return json;},async text(){return JSON.stringify(json);}};
 };
 f.calls=calls;
 return f;
}
// A transcriber that answers what it is told and records each call.
function fakeTranscriber(result){
 const calls=[];
 return {name:'fake',template:false,calls,async transcribe(input){calls.push(input);if(result instanceof Error)throw result;return {lang:input.lang,unclear:[],confidence:null,...result};}};
}
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'yovouch-cfg-'));
const audio=(type,bytes,headers={})=>({method:'POST',headers:{'content-type':type,...headers},body:Buffer.alloc(bytes,7)});

test('verbose_json gives confidence and unclear spans', async () => {
 const fetch = fakeFetch({text:'She did my braids', segments:[{text:'She did', avg_logprob:-0.1}, {text:'my braids', avg_logprob:-0.9}]});
 const r = await createTranscriber(azureCfg, {fetch}).transcribe({audio:Buffer.from('x'), contentType:'audio/webm', lang:'xh'});
 assert.equal(r.confidence.toFixed(3), Math.exp(-0.5).toFixed(3)); assert.deepEqual(r.unclear, ['my braids']);
 assert.equal(r.text, 'She did my braids'); assert.equal(r.lang, 'xh');
 assert.match(fetch.calls[0].url, /\/openai\/deployments\/whisper\/audio\/transcriptions\?api-version=/);
 assert.equal(fetch.calls[0].url, 'https://r.openai.azure.com/openai/deployments/whisper/audio/transcriptions?api-version=2024-10-21');
 assert.equal(fetch.calls[0].headers['api-key'], 'k'); assert.equal(fetch.calls[0].headers.authorization, undefined);
 assert.match(fetch.calls[0].headers['content-type'], /^multipart\/form-data; boundary=/);
 assert.ok(fetch.calls[0].body.includes('name="response_format"\r\n\r\nverbose_json'));
 assert.ok(fetch.calls[0].body.includes('name="language"\r\n\r\nxh'));
 assert.ok(fetch.calls[0].body.includes('name="file"; filename="clip.webm"\r\nContent-Type: audio/webm'));
 assert.ok(!fetch.calls[0].body.includes('name="model"'), 'Azure names the deployment in the URL');
 assert.equal(CONFIDENCE_FLOOR, 0.6);
});

test('config reads the transcription deployment without a chat deployment', () => {
 const c = loadConfig({cwd:tmp(), env:{AZURE_OPENAI_ENDPOINT:'https://r.openai.azure.com', AZURE_OPENAI_API_KEY:'k', AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT:'whisper'}});
 assert.equal(c.provider, 'local'); assert.equal(c.transcribe.deployment, 'whisper');
 assert.deepEqual(c.transcribe, {kind:'azure', endpoint:'https://r.openai.azure.com', apiKey:'k', deployment:'whisper', apiVersion:'2024-10-21'});
 const o = loadConfig({cwd:tmp(), env:{OPENAI_API_KEY:'sk', TRANSCRIBE_MODEL:'whisper-1'}});
 assert.deepEqual(o.transcribe, {kind:'openai', baseUrl:'https://api.openai.com/v1', apiKey:'sk', model:'whisper-1'});
 assert.equal(loadConfig({cwd:tmp(), env:{OPENAI_API_KEY:'sk'}}).transcribe, null, 'no TRANSCRIBE_MODEL, no transcription');
 assert.equal(loadConfig({cwd:tmp(), env:{}}).transcribe, null);
});

test('no segments: confidence null, never invented', async () => {
 const fetch = fakeFetch({text:'Hello'});
 const r = await createTranscriber(azureCfg, {fetch}).transcribe({audio:Buffer.from('x'), contentType:'audio/mp4', lang:'en'});
 assert.deepEqual(r, {text:'Hello', lang:'en', confidence:null, unclear:[]});
 assert.ok(fetch.calls[0].body.includes('filename="clip.m4a"\r\nContent-Type: audio/mp4'));
 const empty = await createTranscriber(azureCfg, {fetch:fakeFetch({text:'Hi', segments:[]})}).transcribe({audio:Buffer.from('x'), contentType:'audio/webm', lang:'en'});
 assert.equal(empty.confidence, null);
 await assert.rejects(createTranscriber(azureCfg, {fetch:fakeFetch({error:'x'}, {status:500})}).transcribe({audio:Buffer.from('x'), contentType:'audio/webm', lang:'en'}));
});

test('template transcriber returns the typed text and the flow still works', async () => {
 const tr = createTranscriber(null); assert.equal(tr.template, true); assert.equal(tr.name, 'template');
 assert.deepEqual(await tr.transcribe({typedText:'She did my braids', lang:'en'}), {text:'She did my braids', lang:'en', confidence:null, unclear:[]});
 assert.deepEqual(await tr.transcribe({lang:'zu'}), {text:'', lang:'zu', confidence:null, unclear:[]});
 // Over HTTP the template transcriber stores the clip and asks for typed words.
 const b = await fresh();
 const s = await openScan(b);
 const r = await fetch(b.base + `/api/vouch/${s}/words`, audio('audio/webm', 3000, {'x-clip-seconds':'5'}));
 assertPrivateHeaders(r);
 assert.deepEqual(await r.json(), {transcript:null, typed:true, messages:['Sample mode: template extraction, no model call']});
 assert.equal(b.vouch.sessions.get(s).clip.bytes, 3000);
});

test('multipart writes fields then the file', () => {
 const {body, boundary} = multipart({a:'1', b:'two'}, {name:'file', filename:'clip.webm', contentType:'audio/webm', data:Buffer.from([0, 255])});
 assert.match(boundary, /^[0-9a-zA-Z-]{20,}$/);
 const text = body.toString('latin1');
 assert.ok(text.startsWith('--' + boundary + '\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n'));
 assert.ok(text.endsWith('\r\n\x00\xff\r\n--' + boundary + '--\r\n'));
});

test('low confidence asks again', async () => {
 const b = await fresh({transcriber:fakeTranscriber({text:'mumble', confidence:0.5})});
 const s = await openScan(b);
 const r = await (await fetch(b.base + `/api/vouch/${s}/words`, audio('audio/webm', 3000, {'x-clip-seconds':'5'}))).json();
 assert.deepEqual(r, {message:HEAR_BADLY});
 // A failure logs transcription_failed with the language and falls back to typing.
 const down = await fresh({transcriber:fakeTranscriber(new Error('provider down'))});
 const s2 = await openScan(down);
 assert.deepEqual(await (await fetch(down.base + `/api/vouch/${s2}/words`, audio('audio/webm', 3000, {'x-clip-seconds':'5'}))).json(), {transcript:null, typed:true});
 const ev = down.vouch.events.read().find(e => e.type === 'transcription_failed');
 assert.equal(ev.lang, 'en'); assert.equal(ev.channel, 'web');
});

// ---- The scan flow with a clip ----
async function fresh(opts={}){
 const boot = await bootVouch({env:{sim:true}, ...opts});
 const p = await publishPersona(boot.base, 'thandi', {trade:'hair'});
 return {...boot, p, id:p.cardId, token:p.cardToken};
}
async function openScan(b){
 const secret = b.store.get(b.id).vouch.secret, step = counterAt(b.clock.t), k = qrTag(secret, step);
 const html = await page(b.base, '/s/' + b.id + '?t=' + step + '&k=' + k);
 const f = (/name="f" value="([0-9a-f]{16})"/.exec(html) || [])[1];
 const chips = await form(b.base, '/s/' + b.id, {t:step, k, adult:'yes', f});
 const token = (/action="\/api\/vouch\/([0-9a-f]{24})\/chips"/.exec(chips) || [])[1];
 assert.ok(token, 'no vouch session opened');
 b.chipsHtml = chips;
 return token;
}
const CHIPS = {work:'Braids', when:'this month', howOften:'a few times', hireAgain:'yes'};
// Records a 9-second audio/mp4 clip, taps Use these words, attaches the clip and publishes. Returns the vouch id.
async function vouchWithClip(b, {from='0821110191'}={}){
 const s = await openScan(b);
 const up = await fetch(b.base + `/api/vouch/${s}/words`, audio('audio/mp4', 18400, {'x-clip-seconds':'9'}));
 assertPrivateHeaders(up);
 assert.deepEqual(await up.json(), {transcript:SAID, unclear:[], confidence:0.9});
 assert.deepEqual(await post(b.base, `/api/vouch/${s}/words`, {text:SAID, lang:'en', fromClip:true}), {text:SAID});
 await form(b.base, `/api/vouch/${s}/chips`, {...CHIPS, words:SAID, fromClip:'1'});
 await form(b.base, `/s/t/${s}`, {step:'disclose', showMe:'customer', attachClip:'yes'});
 const bind = await form(b.base, `/api/vouch/${s}/bind`, {});
 const code = bind.match(/Text YES ([A-Z2-9]{6}) to 12345/)[1];
 await post(b.base, '/api/sim/sms', {from, text:'YES ' + code});
 const done = await form(b.base, `/api/vouch/${s}/confirm`, {consent:'yes'});
 return done.match(/Vouch ([A-Z2-9]{10})\./)[1];
}

test('clip upload, held, then served with its type', async () => {
 const tr = fakeTranscriber({text:SAID, confidence:0.9});
 const b = await fresh({transcriber:tr});
 const vid = await vouchWithClip(b);
 assert.equal(tr.calls[0].contentType, 'audio/mp4'); assert.equal(tr.calls[0].lang, 'en'); assert.equal(tr.calls[0].audio.length, 18400);
 assert.equal((await fetch(b.base + `/v/${vid}/clip`)).status, 404, 'held until the worker taps Show');
 const file = b.vouch.vouchStore.get(vid);
 assert.deepEqual(file.record.generation, {mode:'live', transcription:'model'});
 assert.equal(file.record.clip, null); assert.equal(file.held.wordsSource, 'clip'); assert.equal(file.held.words, SAID);
 assert.deepEqual(file.held.clip, {url:`/v/${vid}/clip`, contentType:'audio/mp4', seconds:9, bytes:18400,
  sha256:crypto.createHash('sha256').update(Buffer.alloc(18400, 7)).digest('hex')});
 assert.equal(file.private.rawTranscript, SAID);
 assert.ok(fs.existsSync(path.join(b.dir, 'vouches', 'clips', vid + '.m4a')));
 const v = await get(b.base, `/v/${vid}.json`);
 assert.deepEqual(v.held, ['words', 'clip']); assert.equal(v.record.clip, null);
 assert.ok(!(await page(b.base, '/c/' + b.id)).includes('/clip'), 'no clip link while held');
 await form(b.base, `/my/${b.id}/${b.token}/show-words`, {vouchId:vid});
 const res = await fetch(b.base + `/v/${vid}/clip`);
 assert.equal(res.status, 200); assert.equal(res.headers.get('content-type'), 'audio/mp4');
 const body = Buffer.from(await res.arrayBuffer());
 assert.equal(body.length, 18400); assert.ok(body.equals(Buffer.alloc(18400, 7)));
 const card = await page(b.base, '/c/' + b.id);
 assert.ok(card.includes('Play 9-second clip (18 KB)')); assert.ok(card.includes(`href="/v/${vid}/clip"`));
 // Upload limits: 400 KB and 16 seconds.
 b.clock.t += 90000;
 const s = await openScan(b);
 const big = await fetch(b.base + `/api/vouch/${s}/words`, audio('audio/webm', 409601, {'x-clip-seconds':'9'}));
 assert.equal(big.status, 400); assert.equal((await big.json()).error.code, 'invalid_input');
 const long = await fetch(b.base + `/api/vouch/${s}/words`, audio('audio/webm', 3000, {'x-clip-seconds':'17'}));
 assert.equal(long.status, 400); assert.equal((await long.json()).error.code, 'invalid_input');
 const ogg = await fetch(b.base + `/api/vouch/${s}/words`, audio('audio/ogg', 3000, {'x-clip-seconds':'9'}));
 assert.equal(ogg.status, 400);
 // A clip the voucher did not attach is never stored.
 assert.equal(fs.readdirSync(path.join(b.dir, 'vouches', 'clips')).length, 1);
});

test('the chips page offers the microphone only with JavaScript', async () => {
 const b = await fresh();
 const s = await openScan(b);
 const html = b.chipsHtml;
 assertHonestPage(html); assert.ok(Buffer.byteLength(html) <= 4096, 'chips page ' + Buffer.byteLength(html));
 assert.ok(html.includes(`<div id="mic" hidden data-t="${s}">`)); assert.ok(html.includes('Say it in 15 seconds (optional)'));
 assert.ok(html.includes('<script src="/mic.js" defer></script>')); assert.ok(html.includes('name="words"'));
 const js = await fetch(b.base + '/mic.js');
 assert.equal(js.status, 200); assert.match(js.headers.get('content-type'), /^text\/javascript/);
 const src = await js.text();
 for (const s of ['MediaRecorder', 'audioBitsPerSecond:16000', '15000', 'x-clip-seconds', 'fromClip', 'Record again', 'Use these words', '[I could not hear this]', 'Listen', 'Stop'])
  assert.ok(src.includes(s), 'mic.js: ' + s);
 assert.ok(!src.includes('ogg'));
 new (require('node:vm').Script)(src);   // parses
});

test('Review Focus 4: the clip of a withdrawn card is 410 at once', async () => {
 const b = await fresh({transcriber:fakeTranscriber({text:SAID, confidence:0.9})});
 const vid = await vouchWithClip(b);
 await form(b.base, `/my/${b.id}/${b.token}/show-words`, {vouchId:vid});
 assert.equal((await fetch(b.base + `/v/${vid}/clip`)).status, 200);
 await post(b.base, '/api/card/' + b.id + '/withdraw', {ownerSecret:b.p.ownerSecret});
 assert.equal((await fetch(b.base + `/v/${vid}/clip`)).status, 410);
 assert.ok(fs.existsSync(path.join(b.dir, 'vouches', 'clips', vid + '.m4a')), 'no sweep ran: the 410 holds at read time');
 // A voucher's own withdrawal deletes the clip at once.
 const c = await fresh({transcriber:fakeTranscriber({text:SAID, confidence:0.9})});
 const v2 = await vouchWithClip(c);
 await form(c.base, `/my/${c.id}/${c.token}/show-words`, {vouchId:v2});
 c.vouch.vouchStore.withdrawAs(v2, 'now');
 assert.equal((await fetch(c.base + `/v/${v2}/clip`)).status, 410);
 assert.ok(!fs.existsSync(path.join(c.dir, 'vouches', 'clips', v2 + '.m4a')));
});

// ---- Reply by Voice audio ----
async function sipho0(opts){
 const b = await bootVouch(opts);
 const card = await publishPersona(b.base, 'sipho', {area:'Umlazi'});
 const parsed = await post(b.base, '/api/reply/parse', {text:PINETOWN});
 return {...b, ...card, jobPostId:parsed.jobPostId};
}

test('self clip rides on the reply', async () => {
 const {base, vouch, dir, cardId, cardToken, jobPostId, ownerSecret} = await sipho0();
 const d = await post(base, '/api/reply/draft', {cardId, cardToken, jobPostId, text:'Two taxis, about an hour. From Monday. Paving.', lang:'en'});
 assert.ok(d.lines[5].startsWith('Card: '));
 const send = (token, bytes=12000, seconds='7') => fetch(base + `/api/reply/${d.replyId}/self-clip`, audio('audio/webm', bytes, {'x-card-id':cardId, 'x-card-token':token, 'x-clip-seconds':seconds}));
 assert.equal((await send('0'.repeat(16))).status, 404);
 assert.equal((await send(cardToken, 12000, '17')).status, 400);
 const r = await send(cardToken);
 assertPrivateHeaders(r);
 const j = await r.json();
 assert.deepEqual(j.clipIds, ['self:' + d.replyId]);
 assert.equal(j.lines[5], `Card with 1 clip: https://yocard.example/c/${cardId} · lines 1, 4, 5 from Sipho's own words · card signed by YoCard, not by Yoma`);
 const rec = vouch.replyStore.get(d.replyId);
 assert.ok(rec.clipIds.includes('self:' + d.replyId)); assert.equal(rec.lines[5], j.lines[5]); assert.equal(rec.linesInSourceLang[5], j.lines[5]);
 assert.equal(rec.selfClip.contentType, 'audio/webm'); assert.equal(rec.selfClip.bytes, 12000); assert.equal(rec.selfClip.seconds, 7);
 assert.ok(fs.existsSync(path.join(dir, 'replies', 'clips', d.replyId + '.webm')));
 // A second recording replaces the first; the count stays at one.
 await send(cardToken, 11000);
 assert.deepEqual(vouch.replyStore.get(d.replyId).clipIds, ['self:' + d.replyId]);
 assert.equal((await fetch(base + `/r/${d.replyId}/clip`)).status, 404, 'nothing is published before the worker confirms');
 await post(base, `/api/reply/${d.replyId}/confirm`, {cardId, cardToken, lines:j.lines, lang:'en'});
 const html = await page(base, '/r/' + d.replyId);
 assertHonestPage(html);
 assert.ok(html.includes('Said by Sipho')); assert.ok(html.includes(`href="/r/${d.replyId}/clip"`));
 const clip = await fetch(base + `/r/${d.replyId}/clip`);
 assert.equal(clip.status, 200); assert.equal(clip.headers.get('content-type'), 'audio/webm');
 assert.equal(Buffer.from(await clip.arrayBuffer()).length, 11000);
 await post(base, '/api/card/' + cardId + '/withdraw', {ownerSecret});
 assert.equal((await fetch(base + `/r/${d.replyId}/clip`)).status, 410);
});

test('a voice note drafts the reply, and its raw audio goes at confirm', async () => {
 const tr = fakeTranscriber({text:'Two taxis, about an hour. From Monday. Paving.', confidence:0.8});
 const {base, vouch, dir, cardId, cardToken, jobPostId} = await sipho0({transcriber:tr});
 const headers = {'x-card-id':cardId, 'x-card-token':cardToken, 'x-job-post-id':jobPostId, 'x-lang':'en', 'x-clip-seconds':'20'};
 const r = await fetch(base + '/api/reply/draft', audio('audio/webm', 30000, headers));
 assertPrivateHeaders(r);
 const d = await r.json();
 assert.equal(d.messages[0], t('cutAt20')); assert.equal(d.messages[0], 'Your voice note was cut at 20 seconds.');
 assert.equal(d.lines[3], 'Available: From Monday (stated by Sipho)'); assert.equal(d.transcript, 'Two taxis, about an hour. From Monday. Paving.');
 assert.equal(tr.calls[0].lang, 'en');
 assert.equal(vouch.replyStore.get(d.replyId).transcript, 'Two taxis, about an hour. From Monday. Paving.');
 const raw = () => fs.readdirSync(path.join(dir, 'replies', 'clips')).filter(n => n.startsWith(d.replyId + '.raw.'));
 assert.equal(raw().length, 1);
 const short = await (await fetch(base + '/api/reply/draft', audio('audio/webm', 30000, {...headers, 'x-clip-seconds':'12'}))).json();
 assert.notEqual(short.messages[0], t('cutAt20'));
 assert.equal((await fetch(base + '/api/reply/draft', audio('audio/webm', 30000, {...headers, 'x-clip-seconds':'21'}))).status, 400);
 assert.equal((await fetch(base + '/api/reply/draft', audio('audio/webm', 30000, {...headers, 'x-card-token':'0'.repeat(16)}))).status, 404);
 await post(base, `/api/reply/${d.replyId}/confirm`, {cardId, cardToken, lines:d.lines, lang:'en'});
 assert.equal(raw().length, 0, 'raw reply audio is deleted at confirm');
 // Template mode: no transcription, type the answers.
 const tb = await sipho0();
 const tj = await (await fetch(tb.base + '/api/reply/draft', audio('audio/webm', 3000, {...headers, 'x-card-id':tb.cardId, 'x-card-token':tb.cardToken, 'x-job-post-id':tb.jobPostId}))).json();
 assert.deepEqual(tj, {replyId:null, transcript:null, typed:true, messages:['Sample mode: template extraction, no model call']});
 // Low confidence asks again.
 const lb = await sipho0({transcriber:fakeTranscriber({text:'mumble', confidence:0.3})});
 const lj = await (await fetch(lb.base + '/api/reply/draft', audio('audio/webm', 3000, {...headers, 'x-card-id':lb.cardId, 'x-card-token':lb.cardToken, 'x-job-post-id':lb.jobPostId}))).json();
 assert.deepEqual(lj, {message:HEAR_BADLY});
});

test('pcm sends no language field', async () => {
 const fetch = fakeFetch({text:'I fit start Monday', segments:[{text:'I fit start Monday', avg_logprob:-0.2}]});
 const r = await createTranscriber(openaiCfg, {fetch}).transcribe({audio:Buffer.from('x'), contentType:'audio/webm', lang:'pcm'});
 assert.equal(r.lang, 'pcm'); assert.deepEqual(r.unclear, []);
 assert.equal(fetch.calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
 assert.equal(fetch.calls[0].headers.authorization, 'Bearer sk');
 assert.ok(!fetch.calls[0].body.includes('name="language"'));
 assert.ok(fetch.calls[0].body.includes('name="model"\r\n\r\nwhisper-1'));
 assert.ok(fetch.calls[0].body.includes('name="response_format"\r\n\r\nverbose_json'));
 for (const lang of ['en', 'zu', 'xh', 'sw']) {
  const f = fakeFetch({text:'x'});
  await createTranscriber(openaiCfg, {fetch:f}).transcribe({audio:Buffer.from('x'), contentType:'audio/webm', lang});
  assert.ok(f.calls[0].body.includes('name="language"\r\n\r\n' + lang), lang);
 }
});
