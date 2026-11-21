# YoCV Anthropic provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth model adapter, `anthropic`, so `MODEL_PROVIDER=anthropic` with `ANTHROPIC_API_KEY` runs the CV review and the YoCard draft on Claude through the same checks.

**Architecture:** One new module `server/providers/anthropic.js` builds a Messages API body from the OpenAI-style chat the callers already produce, sends it through the shared transport in `openai-compatible.js`, and parses the first text block as JSON. `server/config.js` learns the selector and three variables. Docs and the live smoke test name the new provider.

**Tech Stack:** Node 20 built-ins (`fetch`, `node:test`), no packages.

**Spec:** `docs/superpowers/specs/2026-11-20-yocv-anthropic-provider-design.md`

## Global Constraints

- Node 20 built-ins only; no npm packages; no build step (AGENTS.md rule 1).
- The key never reaches the browser, the logs or an error message; `ProviderError` messages stay the static strings in `errors.js`.
- Request headers: `x-api-key: <key>`, `anthropic-version: 2026-10-21`, `anthropic-beta: server-side-fallback-2026-07-01`, `content-type: application/json`, `user-agent: YoCV-prototype`.
- The body never carries `temperature`, `top_p` or `top_k`.
- `max_tokens` is always `4096`; `output_config` is `{effort:'low', format:{type:'json_schema', schema}}`; `fallbacks` is `'default'`.
- Defaults: model `claude-opus-5-5`, base URL `https://api.anthropic.com`; URL `<base>/v1/messages`.
- Selector order with `MODEL_PROVIDER` empty: Azure (three values), else Anthropic (`ANTHROPIC_API_KEY`), else OpenAI-compatible (`OPENAI_API_KEY`), else local.
- Commit messages: `feat(yocv): …` for the adapter, `feat(yocv): …` for config and docs; no `.env`, `reports/`, `research_notes/` or `data/cards/` in any commit.

## Review Focus

1. A chat whose `system` messages are not first, or has two of them: the top-level `system` string must hold them all in order; a `system` role must never reach `messages` (the API rejects it). Test in Task 1.
2. A 200 reply whose first content block is `thinking`, not `text` (thinking is on by default): the adapter must find the first `text` block, not index `content[0]`. Test in Task 1.
3. `stop_reason: 'refusal'` with text that happens to parse as JSON: the refusal must win and map to the content-filter message, not be returned as output. Test in Task 1.
4. An `OPENAI_API_KEY` of `ollama` left in `.env` beside a real `ANTHROPIC_API_KEY` with the selector empty: Anthropic must win. Test in Task 2.
5. The key appearing in any thrown error's message when the body echoes it: covered by the shared transport, re-asserted for the new adapter in Task 1.

---

### Task 1: The adapter

**Files:**
- Create: `server/providers/anthropic.js`
- Modify: `server/providers/openai-compatible.js` (the `RETRY_STATUSES` set only)
- Modify: `server/providers/index.js`
- Modify: `tests/providers.test.cjs` (the unknown-provider message)
- Create: `tests/anthropic.test.cjs`

**Interfaces:**
- Consumes: `callChatCompletions({url,headers,body,fetch,sleep,timeoutMs,signal})` and `RETRY_DELAY_MS` from `openai-compatible.js`; `ProviderError`, `messages` from `errors.js`; `CV_SCHEMA_NAME`, `buildCvSchema`, `buildCvMessages` from `schema.js`; `matchesSchema` from `schema-check.js`; the test fakes `fakeFetch`, `fakeSleep`, `hangUntilAbort`, `KEY` from `tests/helpers/providers.cjs`.
- Produces: `createAnthropicProvider(anthropicConfig, deps={}) -> provider` where `anthropicConfig = {apiKey, model?, baseUrl?}` and `deps = {fetch?, sleep?, timeoutMs?}`; `toAnthropicBody({model, schema, messages}) -> body`; `messageToJson(json) -> object`. The provider has `name:'anthropic'`, `model`, `complete(input, opts)` and `cvBullets(input, opts)` with the signatures of `createChatProvider`'s provider. `createProvider(config, core, deps)` dispatches `config.provider === 'anthropic'` to `createAnthropicProvider(config.anthropic, deps)`.

- [ ] **Step 1: Write the failing tests** in `tests/anthropic.test.cjs`, each loading the module inside `try{}` as `tests/providers.test.cjs` does. Shared fixtures: `const anthropicConfig={apiKey:KEY,model:'claude-opus-5-5',baseUrl:'https://api.anthropic.com'}`, the same `input` object as `tests/providers.test.cjs` (`schemaName:'yocv_test'`, a strict `{ok:boolean}` schema, messages `[{role:'system',content:'S'},{role:'user',content:'U'}]`), and a helper `reply(output, extra={})` returning `{id:'msg_1',type:'message',role:'assistant',model:'claude-opus-5-5',stop_reason:'end_turn',content:[{type:'text',text:typeof output==='string'?output:JSON.stringify(output)}],...extra}`.

```js
test('Anthropic adapter builds the Messages URL, headers and body',async()=>{
 const {fetch,calls}=fakeFetch([{status:200,body:reply({ok:true})}]);
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
 assert.equal(provider.name,'anthropic');assert.equal(provider.model,'claude-opus-5-5');
 assert.deepEqual(await provider.complete(input),{ok:true});
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');
 assert.equal(calls[0].init.method,'POST');
 const h=calls[0].init.headers;
 assert.equal(h['x-api-key'],KEY);assert.equal(h['anthropic-version'],'2026-10-21');
 assert.equal(h['anthropic-beta'],'server-side-fallback-2026-07-01');
 assert.equal(h['content-type'],'application/json');assert.equal(h['user-agent'],'YoCV-prototype');
 assert.equal('authorization' in h,false);
 const body=JSON.parse(calls[0].init.body);
 assert.equal(body.model,'claude-opus-5-5');assert.equal(body.max_tokens,4096);
 assert.equal(body.system,'S');
 assert.deepEqual(body.messages,[{role:'user',content:'U'}]);
 assert.deepEqual(body.output_config,{effort:'low',format:{type:'json_schema',schema:input.schema}});
 assert.equal(body.fallbacks,'default');
 for(const k of ['temperature','top_p','top_k','response_format','thinking'])assert.equal(k in body,false,k);
});
test('toAnthropicBody joins every system message in order and keeps the rest',()=>{
 const body=anthropic.toAnthropicBody({model:'m',schema:input.schema,messages:[{role:'user',content:'A'},{role:'system',content:'S1'},{role:'assistant',content:'B'},{role:'system',content:'S2'}]});
 assert.equal(body.system,'S1\n\nS2');
 assert.deepEqual(body.messages,[{role:'user',content:'A'},{role:'assistant',content:'B'}]);
 assert.equal(body.messages.some(m=>m.role==='system'),false);
});
test('toAnthropicBody omits system when the chat has none',()=>{
 const body=anthropic.toAnthropicBody({model:'m',schema:input.schema,messages:[{role:'user',content:'A'}]});
 assert.equal('system' in body,false);
});
test('messageToJson reads the first text block even after a thinking block',()=>{
 const json=reply({ok:true});json.content.unshift({type:'thinking',thinking:'',signature:'x'});
 assert.deepEqual(anthropic.messageToJson(json),{ok:true});
});
test('stop_reason refusal maps to provider_bad_output with the content-filter message, not retryable',async()=>{
 const {fetch}=fakeFetch([{status:200,body:reply({ok:true},{stop_reason:'refusal',stop_details:{type:'refusal',category:'general_harms'}})}]);
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.message,errors.messages.provider_content_filter);assert.equal(err.retryable,false);return true;});
});
test('stop_reason max_tokens, a non-text block and non-JSON text map to provider_bad_output retryable',async()=>{
 for(const body of [reply({ok:true},{stop_reason:'max_tokens'}),reply('not json'),{...reply({ok:true}),content:[{type:'tool_use',id:'t',name:'n',input:{}}]},{...reply({ok:true}),content:[]}]){
  const {fetch}=fakeFetch([{status:200,body}]);
  const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
  await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_bad_output');assert.equal(err.retryable,true);return true;});
 }
});
test('401 maps to provider_auth; 529 then 200 succeeds after one sleep; 529 twice is provider_error',async()=>{
 const auth=anthropic.createAnthropicProvider(anthropicConfig,{fetch:fakeFetch([{status:401,body:{type:'error',error:{type:'authentication_error',message:'bad '+KEY}}}]).fetch,sleep:fakeSleep().sleep});
 await assert.rejects(auth.complete(input),err=>{assert.equal(err.code,'provider_auth');assert.equal(err.retryable,false);assert.equal(err.message.includes(KEY),false);return true;});
 const over={status:529,body:{type:'error',error:{type:'overloaded_error',message:'Overloaded'}}};
 const once=fakeFetch([over,{status:200,body:reply({ok:true})}]),sleeper=fakeSleep();
 assert.deepEqual(await anthropic.createAnthropicProvider(anthropicConfig,{fetch:once.fetch,sleep:sleeper.sleep}).complete(input),{ok:true});
 assert.equal(once.calls.length,2);assert.deepEqual(sleeper.calls,[1500]);
 const twice=fakeFetch([over]);
 await assert.rejects(anthropic.createAnthropicProvider(anthropicConfig,{fetch:twice.fetch,sleep:fakeSleep().sleep}).complete(input),err=>{assert.equal(err.code,'provider_error');assert.equal(err.retryable,true);assert.equal(err.status,529);return true;});
 assert.equal(twice.calls.length,2);
});
test('timeout maps to provider_timeout',async()=>{
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch:hangUntilAbort,sleep:fakeSleep().sleep,timeoutMs:20});
 await assert.rejects(provider.complete(input),err=>{assert.equal(err.code,'provider_timeout');assert.equal(err.retryable,true);return true;});
});
test('cvBullets sends the CV prompt and schema and checks the reply',async()=>{
 const good={bullets:[{text:'Braided hair at home.',usedNumbers:[],sourceFields:['what'],sourceQuote:'I braid hair at home'}],skills:[{name:'Hairstyling',sourceQuote:'I braid hair at home'}]};
 const {fetch,calls}=fakeFetch([{status:200,body:reply(good)}]);
 const provider=anthropic.createAnthropicProvider(anthropicConfig,{fetch,sleep:fakeSleep().sleep});
 const out=await provider.cvBullets({role:'Hairdresser',entry:{title:'Braiding at home',what:'I braid hair at home'},menuNames:['Hairstyling']});
 assert.deepEqual(out,good);
 const body=JSON.parse(calls[0].init.body);
 assert.ok(body.system.includes('You rewrite one entry'));
 assert.deepEqual(body.output_config.format.schema,schema.buildCvSchema(['Hairstyling']));
 const bad=fakeFetch([{status:200,body:reply({bullets:[{text:'x'}]})}]);
 await assert.rejects(anthropic.createAnthropicProvider(anthropicConfig,{fetch:bad.fetch,sleep:fakeSleep().sleep}).cvBullets({role:'Hairdresser',entry:{what:'I braid'},menuNames:[]}),err=>err.code==='provider_bad_output');
});
test('missing key is provider_not_configured; defaults fill model and base URL',async()=>{
 assert.throws(()=>anthropic.createAnthropicProvider({apiKey:''}),err=>err.code==='provider_not_configured');
 const {fetch,calls}=fakeFetch([{status:200,body:reply({ok:true})}]);
 const provider=anthropic.createAnthropicProvider({apiKey:KEY},{fetch,sleep:fakeSleep().sleep});
 assert.equal(provider.model,'claude-opus-5-5');
 await provider.complete(input);
 assert.equal(calls[0].url,'https://api.anthropic.com/v1/messages');
 const trailing=fakeFetch([{status:200,body:reply({ok:true})}]);
 await anthropic.createAnthropicProvider({apiKey:KEY,baseUrl:'https://proxy.example/'},{fetch:trailing.fetch,sleep:fakeSleep().sleep}).complete(input);
 assert.equal(trailing.calls[0].url,'https://proxy.example/v1/messages');
});
test('createProvider dispatches anthropic',()=>{
 const provider=index.createProvider({provider:'anthropic',anthropic:{apiKey:KEY}},{},{fetch:fakeFetch([]).fetch});
 assert.equal(provider.name,'anthropic');
});
```

- [ ] **Step 2: Run them to see them fail.** `node --test tests/anthropic.test.cjs` → every test fails (module missing).

- [ ] **Step 3: Implement `server/providers/anthropic.js`.** Header comment: the Messages API adapter (spec `2026-11-20-yocv-anthropic-provider-design.md`), reusing the shared transport. `const API_VERSION='2026-10-21', FALLBACK_BETA='server-side-fallback-2026-07-01', MAX_TOKENS=4096, DEFAULT_MODEL='claude-opus-5-5', DEFAULT_BASE_URL='https://api.anthropic.com'`.
  - `toAnthropicBody({model,schema,messages})`: system messages joined with `'\n\n'` into `system` (omitted when none); the rest as `messages` with `role` and `content` only; `max_tokens:MAX_TOKENS`; `output_config:{effort:'low',format:{type:'json_schema',schema}}`; `fallbacks:'default'`.
  - `messageToJson(json)`: `stop_reason==='refusal'` → `ProviderError('provider_bad_output', messages.provider_content_filter, {retryable:false,status:200})`; `stop_reason==='max_tokens'` → bad output retryable; the first block with `type==='text'` in `content`, else bad output; `JSON.parse` of its `text`, else bad output.
  - `createAnthropicProvider(cfg,{fetch=globalThis.fetch,sleep,timeoutMs=20000}={})`: throws `provider_not_configured` without `cfg?.apiKey`; `complete()` validates its arguments exactly as `createChatProvider` does (same `TypeError` text), builds the body, calls `callChatCompletions`, parses with `messageToJson`, and when `check` is true verifies `matchesSchema(output,schema).ok`, else bad output retryable; `cvBullets()` is a copy of the chat provider's, calling `provider.complete` with `check:false` and checking the CV schema itself.
  - In `openai-compatible.js`, `RETRY_STATUSES` gains `529`. In `index.js`, dispatch `'anthropic'` and extend the unknown-provider message to `expected azure-openai, anthropic, openai-compatible or local.`; export `createAnthropicProvider`.

- [ ] **Step 4: Run the tests.** `node --test tests/anthropic.test.cjs tests/providers.test.cjs` → all pass. Update the unknown-provider assertion in `tests/providers.test.cjs` if it checks the message text.

- [ ] **Step 5: Commit.** `git add server/providers/anthropic.js server/providers/openai-compatible.js server/providers/index.js tests/anthropic.test.cjs tests/providers.test.cjs` and `git commit -m "feat(yocv): Anthropic Messages API adapter behind the provider interface"`.

### Task 2: Configuration, the live test and the documentation

**Files:**
- Modify: `server/config.js`
- Modify: `tests/config.test.cjs`
- Modify: `tests/live.test.cjs` (lines 1 and 23)
- Modify: `.env.example`, `README.md`, `presentation/demo-script.md`, `integration/yoma/README.md`

**Interfaces:**
- Consumes: `createAnthropicProvider` via `createProvider` (Task 1).
- Produces: `loadConfig()` returns `{provider:'anthropic', model, anthropic:{apiKey,model,baseUrl}, azure:null, openai:null, ...}` for the new kind, and `anthropic:null` on the other three; `SELECTORS` becomes `['azure','anthropic','openai','local']`.

- [ ] **Step 1: Write the failing tests** in `tests/config.test.cjs`, beside the existing selector tests (use their `AZURE`, `LOCAL` and `empty` fixtures; add `const CLAUDE={ANTHROPIC_API_KEY:'sk-ant-test'}`):

```js
test('loadConfig picks anthropic from its key, after Azure and before OpenAI-compatible',()=>{
  const cfg=loadConfig({env:{...CLAUDE,...LOCAL},cwd:empty});
  assert.equal(cfg.provider,'anthropic');assert.equal(cfg.model,'claude-opus-5-5');
  assert.deepEqual(cfg.anthropic,{apiKey:'sk-ant-test',model:'claude-opus-5-5',baseUrl:'https://api.anthropic.com'});
  assert.equal(cfg.openai,null);assert.equal(cfg.azure,null);
  assert.equal(loadConfig({env:{...AZURE,...CLAUDE},cwd:empty}).provider,'azure-openai');
  assert.equal(loadConfig({env:{...LOCAL},cwd:empty}).anthropic,null);
});
test('ANTHROPIC_MODEL and ANTHROPIC_BASE_URL are honoured and the base URL loses its trailing slash',()=>{
  const cfg=loadConfig({env:{...CLAUDE,ANTHROPIC_MODEL:'claude-haiku-5-5',ANTHROPIC_BASE_URL:'https://proxy.example/'},cwd:empty});
  assert.equal(cfg.model,'claude-haiku-5-5');assert.equal(cfg.anthropic.baseUrl,'https://proxy.example');
});
test('MODEL_PROVIDER=anthropic wins and needs the key',()=>{
  assert.equal(loadConfig({env:{...AZURE,...CLAUDE,MODEL_PROVIDER:'anthropic'},cwd:empty}).provider,'anthropic');
  assert.throws(()=>loadConfig({env:{...AZURE,MODEL_PROVIDER:'anthropic'},cwd:empty}),err=>err.code==='config_invalid'&&err.message==='MODEL_PROVIDER=anthropic needs ANTHROPIC_API_KEY.');
});
```
  Change the existing expectation `'MODEL_PROVIDER must be azure, openai or local.'` to `'MODEL_PROVIDER must be azure, anthropic, openai or local.'`. Extend the `.env.example` line check (line 146 today) with `'ANTHROPIC_API_KEY='`, `'ANTHROPIC_MODEL=claude-opus-5-5'` and `'# ANTHROPIC_MODEL=claude-haiku-5-5'`.

- [ ] **Step 2: Run them to see them fail.** `node --test tests/config.test.cjs` → the new tests fail.

- [ ] **Step 3: Implement in `server/config.js`.** `DEFAULTS` gains `anthropicModel:'claude-opus-5-5'` and `anthropicBaseUrl:'https://api.anthropic.com'`; read `ANTHROPIC_API_KEY`; `SELECTORS=['azure','anthropic','openai','local']` and the message `'MODEL_PROVIDER must be azure, anthropic, openai or local.'`; `kind = selector || (azureReady?'azure' : anthropicKey?'anthropic' : openaiKey?'openai' : 'local')`; `if(kind==='anthropic'&&!anthropicKey) throw invalid('MODEL_PROVIDER=anthropic needs ANTHROPIC_API_KEY.')`; a branch returning `{provider:'anthropic',model,anthropic:{apiKey,model:get('ANTHROPIC_MODEL')||DEFAULTS.anthropicModel,baseUrl:stripSlashes(get('ANTHROPIC_BASE_URL')||DEFAULTS.anthropicBaseUrl)},azure:null,openai:null,...base}`; every other branch adds `anthropic:null`. Update the comment on the order.

- [ ] **Step 4: `tests/live.test.cjs`.** Line 1: `(AZURE_OPENAI_*, ANTHROPIC_API_KEY or OPENAI_API_KEY)`; line 23: `'no AZURE_OPENAI_*, ANTHROPIC_API_KEY or OPENAI_API_KEY configured'`.

- [ ] **Step 5: Documentation.**
  - `.env.example`, after the Azure block: a block headed `# Anthropic (Claude). Used when Azure is not configured, before the OpenAI-compatible endpoint.` with `ANTHROPIC_API_KEY=`, `ANTHROPIC_MODEL=claude-opus-5-5`, `# ANTHROPIC_MODEL=claude-haiku-5-5   # the cheap option for a demo`, `# ANTHROPIC_BASE_URL=https://api.anthropic.com`. Update the first two comment lines so the selector list reads `azure, anthropic, openai or local` and the order sentence names Anthropic between Azure and OpenAI-compatible.
  - `README.md`: the "Model adapters" cell (line 24) adds `Anthropic Messages API`; the live-AI paragraph (line 51) names the four selectors and the four-step order; the side-by-side table (lines 55 to 61) gains a middle column `Claude (Anthropic)` with `MODEL_PROVIDER=anthropic`, endpoint `ANTHROPIC_BASE_URL=https://api.anthropic.com` (default, may be left out), `ANTHROPIC_API_KEY=<key>`, `ANTHROPIC_MODEL=claude-opus-5-5` (`claude-haiku-5-5` for a cheap demo), output `structured output is built in (json_schema), effort low`; the environment table (lines 81 to 84) gains `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_BASE_URL` rows and the `MODEL_PROVIDER` row names the fourth value; the live-test paragraph (line 108) and the "CV line suggestions" row (line 141) name Anthropic; the "Provider actually tested live" row (line 142) adds `Anthropic: unit-tested with an injected fetch; not run live until a key is set.`; the `server/providers/` line (line 224) adds `anthropic.js`.
  - `presentation/demo-script.md`, Preparation step 5 and the 4:30 beat: the first choice is the Claude configuration (`MODEL_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=<key>`, `ANTHROPIC_MODEL=claude-haiku-5-5`), with the banner `Live AI · claude-haiku-5-5`; Ollama stays as the alternative with its existing caveat. The "Say" line becomes: "The model sits behind one interface. Azure, Claude, any OpenAI-compatible server or a model on this laptop. The checks do not change."
  - `integration/yoma/README.md`, in the language-model project section after the `OpenAICompatibleClient` paragraph: one sentence saying the prototype also carries an Anthropic Messages API adapter behind the same interface, showing that a second wire format fits without a change to the service, and that the pack keeps the OpenAI-compatible client because it also covers Azure and local servers.

- [ ] **Step 6: Run the suite.** `npm test` → `fail 0`; quote the four count lines.

- [ ] **Step 7: Commit.** `git add server/config.js tests/config.test.cjs tests/live.test.cjs .env.example README.md presentation/demo-script.md integration/yoma/README.md` and `git commit -m "feat(yocv): MODEL_PROVIDER=anthropic, env and docs for the Claude adapter"`.
