const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');

// Plan Task 20: the README, AGENTS.md and the testing log describe the credential CV (spec 8, 11).
test('README and testing log carry the new rows',()=>{
  const md=read('README.md');
  for(const s of ['MODEL_PROVIDER','OPENAI_STRUCTURED_OUTPUT','YOCV_SERVICE_SECRET','/api/cv/draft','Prepared example. Not a live call.','integration/yoma/','server/cv/'])assert.ok(md.includes(s),s);
  assert.ok(!md.includes('data/sample-credential.json')&&!md.includes('Five-step journey')&&!md.includes('five-step journey')&&!md.includes('Amina')&&!md.includes('server/generation.js'));
  assert.ok(!md.includes('asserts a credential'),'the Grounding checks row describes the new checks');
  assert.ok(md.includes('unit-tested Azure adapter')||md.includes('Azure run'),'spec 8: what is shown without an Azure key');
  assert.ok(read('AGENTS.md').includes('server/cv/validate.js'));
  assert.ok(read('AGENTS.md').includes("the person's own number on their own CV"),'rule 7, Deviations 9');
  assert.ok(read('docs/testing-log.md').includes('2026-11-19'));
  assert.ok(!/verified by Yoma/i.test(md));
});
