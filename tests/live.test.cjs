/* Live smoke tests. The model tests are skipped unless model credentials (AZURE_OPENAI_* or OPENAI_API_KEY)
   are configured in the environment or .env. The two Yoma tests call YOMA_API_BASE (api.yoma.world by
   default) on every run; skip them with YOCV_LIVE_YOMA=0.
   Run: npm test  (or node --test tests/live.test.cjs). */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadConfig}=require('../server/config.js');
const {createProvider}=require('../server/providers/index.js');
const {createYomaClient}=require('../server/yoma.js');
const {buildSkillMenu}=require('../server/cv/menu.js');
const {draftEntries}=require('../server/cv/draft.js');
const {createAccountSource}=require('../server/card/account.js');
const {runDraft,validateSelfDeclared,evidenceList}=require('../server/card/draft.js');
const {createTranscriber}=require('../server/card/transcribe.js');
const fs=require('node:fs');
const core=require('../core.js');
const roleSkills=require('../data/role-skills.json');
const chipSkills=require('../data/chip-skills.json');

const config=loadConfig({cwd:path.join(__dirname,'..')});
const hasModel=config.provider!=='local';
const skipModel=hasModel?false:'no AZURE_OPENAI_* or OPENAI_API_KEY configured';
const hasTranscribe=Boolean(config.transcribe);
const liveYoma=process.env.YOCV_LIVE_YOMA==='0'?'YOCV_LIVE_YOMA=0':false;
const {entry}=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','cv-thandi.json'),'utf8'));

test('live model: a CV bullet for Thandi\'s braiding keeps her number and hedge',{skip:skipModel},async(t)=>{
 const provider=createProvider(config,core),yoma=createYomaClient({baseUrl:config.yomaBase});
 const {menu}=await buildSkillMenu('Hairdresser',{yoma,roleSkills});
 assert.ok(menu.length>0,'the Hairdresser menu resolves on the live taxonomy');
 const {entries,generation}=await draftEntries({role:'Hairdresser',entries:[entry],provider,menu});
 t.diagnostic('provider '+generation.provider+', model '+generation.model);
 assert.equal(generation.mode,'live');
 const p=entries[0].proposals[0];
 assert.ok(p,'a proposal survives (model or template)');
 assert.match(p.text,/about (40|forty)\b/);
});

test('live model: Thandi’s YoCard draft cites only her evidence and keeps the self-declared fields valid',{skip:skipModel},async(t)=>{
 const provider=createProvider(config,core);
 const yoma=createYomaClient({baseUrl:config.yomaBase});
 const accountSource=createAccountSource({config:{...config,yomaAccessToken:''},yoma});
 const snapshot=await accountSource.read({persona:'thandi'});
 const description='I do braids and cornrows in Khayelitsha, R150-R400, Mon-Sat. I speak isiXhosa and English.';
 // The route maps trade id 'hair' to its label before calling runDraft.
 const {selfDeclared,confirms,generation}=await runDraft({snapshot,trade:'Hairdresser',description,provider});
 assert.equal(generation.mode,'live');
 assert.equal(generation.provider,provider.name);
 const ids=new Set(evidenceList(snapshot).map(e=>e.evidenceId));
 assert.ok(confirms.length>=1,'at least one confirms line');
 for(const line of confirms)for(const id of line.evidenceIds)assert.ok(ids.has(id),'cited evidence must be in the snapshot: '+id);
 const check=validateSelfDeclared(selfDeclared,{description});
 assert.deepEqual(check.rejected,[],'the returned self-declared fields pass the validator unchanged');
 assert.deepEqual(check.value,selfDeclared);
 console.log('live provider exercised (YoCard):',provider.name,provider.model,'| confirms',confirms.length,'| rejected',generation.rejected.length);
 // A subtest, so a run without a key still reports 2 skipped (plan Task 11).
 await t.test('live transcription: a short clip returns text',{skip:hasTranscribe?false:'no transcription deployment configured'},async()=>{
  const tr=createTranscriber(config.transcribe);
  const r=await tr.transcribe({audio:fs.readFileSync(path.join(__dirname,'fixtures','hello.webm')),contentType:'audio/webm',lang:'en'});
  assert.equal(tr.template,false); assert.ok(r.text.trim().length>0,'some text came back'); assert.equal(r.lang,'en');
  assert.ok(r.confidence===null||(r.confidence>0&&r.confidence<=1)); assert.ok(Array.isArray(r.unclear));
  console.log('live transcription exercised:',tr.name,'| chars',r.text.length,'| confidence',r.confidence);
 });
});

test('live Yoma: skill lookup resolves Customer Service to its known id',{skip:liveYoma},async(t)=>{
 const yoma=createYomaClient({baseUrl:config.yomaBase});
 const {item}=await yoma.skillByName('Customer Service');
 assert.ok(item);
 assert.equal(item.id,'448bb36e-6e5a-4c5a-9150-78703666c37a');
 assert.match(item.infoURL,/lightcast\.io\/open-skills/);
 await t.test('every role menu name and chip skill name resolves exactly in the taxonomy',async()=>{
  for(const r of Object.values(roleSkills))for(const name of r.skillNames)assert.ok((await yoma.skillByName(name)).item,name);
  for(const name of new Set(Object.values(chipSkills).flatMap(Object.values).flat()))assert.ok((await yoma.skillByName(name)).item,name);
 });
});

test('live Yoma: learning opportunities for Retail assistant return a clean state',{skip:liveYoma},async()=>{
 const yoma=createYomaClient({baseUrl:config.yomaBase});
 let found=null;
 for(const phrase of roleSkills['Retail assistant'].opportunityQueries){
  const result=await yoma.searchLearningOpportunities(phrase);
  if(result.items.length){found={phrase,...result};break;}
 }
 assert.ok(found,'at least one query phrase returns learning opportunities');
 assert.ok(found.items.every(i=>typeof i.yomaInfoURL==='string'&&i.yomaInfoURL.startsWith('https://yoma.world/opportunities/')));
 assert.ok(found.items.some(i=>i.isCompletable===true),'some results are completable');
});
