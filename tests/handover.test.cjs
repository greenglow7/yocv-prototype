const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const {files,PROMPTS}=require('../scripts/export-handover.js');
const {checkBullet}=require('../server/cv/validate.js');
const {CV_SYSTEM_PROMPT}=require('../server/providers/schema.js');

// The handover package (GenU final deliverable): prompts, rubrics and test cases as files, kept in step with the code.
test('the exported prompts and the cost estimate match the code',()=>{
  const stale=Object.entries(files()).filter(([file,text])=>!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text).map(([file])=>path.relative(root,file));
  assert.deepEqual(stale,[],'run node scripts/export-handover.js');
  assert.ok(read('handover/prompts/yocv-cv-bullets.md').includes(CV_SYSTEM_PROMPT));
  assert.ok(PROMPTS.length>=6);
});

test('every CV line test case gives the outcome it names',()=>{
  const c=JSON.parse(read('handover/test-cases/cv-lines.json'));
  const seen=new Set();
  for(const k of c.cases){
    const r=checkBullet(k,{fields:c.entry,role:c.role});
    assert.equal(r.ok?'ok':r.reason,k.expect,k.text);
    seen.add(k.expect);
  }
  for(const reason of ['ok','invented_number','hedge_dropped','invented_name','contact_detail','overstated','weak_opening','length','not_one_sentence','exclamation','quote_not_found'])assert.ok(seen.has(reason),'a case for '+reason);
});

test('the rubric names every refusal reason the person can be shown',()=>{
  const md=read('handover/rubrics/cv-line-checks.md');
  const codes=[...read('cv-copy.js').matchAll(/reason_(\w+):/g)].map(m=>m[1]);
  assert.ok(codes.length>=13);
  for(const code of codes)assert.ok(md.includes('`'+code+'`'),code);
  for(const label of ['Confirmed from Yoma','confirmed by them, not by Yoma','From your own account','Self-stated'])assert.ok(md.includes(label),label);
});

test('the handover README covers what the brief asks for, without secrets or real people',()=>{
  const md=read('handover/README.md');
  for(const s of ['npm start','What is live, what is rule-based, what is mocked','Known limitations','How it would come into GenU','.env','integration/yoma/'])assert.ok(md.includes(s),s);
  assert.ok(!/verified by Yoma/i.test(md));
  for(const f of fs.readdirSync(path.join(root,'handover'),{recursive:true}).filter(f=>/\.(md|json)$/.test(f))){
    const t=read(path.join('handover',f));
    assert.ok(!/sk-ant-|api[_-]?key\s*[:=]\s*\w{12,}/i.test(t),f+' holds no key');
    assert.ok(!/\+27\d{9}/.test(t),f+' holds no full phone number');
  }
});
