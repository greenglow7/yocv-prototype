/* Live smoke tests. Skipped unless real credentials are present in the environment or .env.
   Run: npm test  (or node --test tests/live.test.cjs) with AZURE_OPENAI_* or OPENAI_API_KEY set. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadConfig}=require('../server/config.js');
const {createProvider}=require('../server/providers/index.js');
const {createYomaClient}=require('../server/yoma.js');
const {runGeneration}=require('../server/generation.js');
const core=require('../core.js');
const roleSkills=require('../data/role-skills.json');

const config=loadConfig({cwd:path.join(__dirname,'..')});
const hasModel=config.provider!=='local';
const skipModel=hasModel?false:'no AZURE_OPENAI_* or OPENAI_API_KEY configured';
const liveYoma=process.env.YOCV_LIVE_YOMA==='0'?'YOCV_LIVE_YOMA=0':false;
const AMINA='I helped customers find products at my aunt’s shop.\nI packed orders and kept the shelves organised.';
const normalise=s=>String(s).toLowerCase().replace(/[’‘]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();

test('live model: Amina’s text yields grounded claims with a Yoma skill',{skip:skipModel},async()=>{
 const provider=createProvider(config,core);
 const yoma=createYomaClient({baseUrl:config.yomaBase});
 const {claims,generation}=await runGeneration({input:{role:'Retail assistant',experience:AMINA,context:'Helping at a family shop',dates:'School holidays, 2025–2026'},provider,yoma,roleSkills,core});
 assert.equal(generation.mode,'live');
 assert.equal(generation.provider,provider.name);
 const experience=claims.filter(c=>c.kind==='experience');
 assert.ok(experience.length>=1,'at least one experience claim');
 for(const c of experience)assert.ok(normalise(AMINA).includes(normalise(c.sourceQuote)),'quote must be in the source: '+c.sourceQuote);
 assert.ok(claims.every(c=>c.generated==='model'));
 const skills=claims.filter(c=>c.kind==='skill');
 assert.ok(skills.length>=1,'at least one Yoma skill attached');
 assert.ok(skills.every(c=>c.yomaSkill&&c.yomaSkill.id&&c.yomaSkill.infoURL));
 console.log('live provider exercised:',provider.name,provider.model,'| claims',claims.length,'| rejected',generation.rejected.length);
});

test('live Yoma: skill lookup resolves Customer Service to its known id',{skip:liveYoma},async()=>{
 const yoma=createYomaClient({baseUrl:config.yomaBase});
 const {item}=await yoma.skillByName('Customer Service');
 assert.ok(item);
 assert.equal(item.id,'448bb36e-6e5a-4c5a-9150-78703666c37a');
 assert.match(item.infoURL,/lightcast\.io\/open-skills/);
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
