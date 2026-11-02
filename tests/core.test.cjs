const {test}=require('node:test');
const assert=require('node:assert/strict');
let core={}; try {core=require('../core.js')}catch{}
const input={role:'Retail assistant',experience:'I helped customers find products and packed orders at my aunt’s shop.',context:'Family shop',dates:'',credential:false,document:null};
test('generates source-linked suggestions without invented quantities or dates',()=>{
 assert.equal(typeof core.generateClaims,'function');
 const claims=core.generateClaims(input);
 assert.ok(claims.length>=2);
 assert.ok(claims.every(c=>c.sourceText===input.experience&&c.category==='self'&&c.decision==='pending'));
 assert.ok(claims.every(c=>!/[0-9]/.test(c.text)));
});
test('empty experience and absent credentials cannot invent a CV',()=>{
 assert.equal(typeof core.generateClaims,'function');
 assert.throws(()=>core.generateClaims({...input,experience:'  '}),/responsibility/i);
});
test('exports require every claim reviewed and at least one approved',()=>{
 assert.equal(typeof core.canExport,'function');
 assert.equal(core.canExport([]),false);
 assert.equal(core.canExport([{decision:'pending'}]),false);
 assert.equal(core.canExport([{decision:'rejected'}]),false);
 assert.equal(core.canExport([{decision:'accepted'},{decision:'rejected'}]),true);
 assert.equal(core.canExport([{decision:'accepted'},{decision:'pending'}]),false);
});
test('editing a synthetic verified claim retains source and downgrades wording',()=>{
 assert.equal(typeof core.reviewClaim,'function');
 const original={id:'c1',text:'Completed a digital skills course.',sourceText:'Completed a digital skills course.',sourceId:'credential-demo',category:'verified',decision:'pending'};
 const changed=core.reviewClaim(original,'accepted','Led a digital skills workshop.');
 assert.equal(changed.category,'self');assert.equal(changed.originalCategory,'verified');
 assert.equal(changed.sourceId,'credential-demo');assert.equal(changed.sourceText,original.sourceText);
 assert.equal(original.decision,'pending');
});
test('rejecting excludes content from CV but keeps audit evidence',()=>{
 assert.equal(typeof core.buildTextCV,'function');
 const claims=[{id:'1',text:'Helped customers.',sourceText:'I helped customers.',category:'self',decision:'accepted',kind:'experience'},{id:'2',text:'Invented management claim.',sourceText:'None',category:'self',decision:'rejected',kind:'experience'}];
 const text=core.buildTextCV({name:'Demo Person',email:'demo@example.com',city:'Cape Town'},'Retail assistant',claims);
 assert.match(text,/Helped customers/);assert.doesNotMatch(text,/Invented management/);
 const evidence=core.buildEvidence({},'Retail assistant',claims);
 assert.equal(evidence.claims.length,2);assert.equal(evidence.claims[1].decision,'rejected');
});
test('CV export refuses unresolved claims',()=>{
 assert.equal(typeof core.buildTextCV,'function');
 assert.throws(()=>core.buildTextCV({},'Retail assistant',[{decision:'pending'}]),/review/i);
});
test('HTML export escapes executable-looking user content',()=>{
 assert.equal(typeof core.escapeHTML,'function');
 assert.equal(core.escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('a supplied document remains pending and is never read as verified',()=>{
 assert.equal(typeof core.generateClaims,'function');
 const claims=core.generateClaims({...input,document:{name:'letter.pdf',statement:'I volunteered at a community garden.'}});
 const pending=claims.filter(c=>c.sourceId==='document-demo');
 assert.ok(pending.length);assert.ok(pending.every(c=>c.category==='document'));
});
test('text CV retains supplied dates even without an experience label',()=>{
 const text=core.buildTextCV({},'Retail assistant',[{text:'Packed orders.',kind:'experience',context:'',dates:'June 2024',decision:'accepted'}]);
 assert.match(text,/June 2024/);
});
test('edited learning clears the source date from CV while retaining it in evidence',()=>{
 const edited=core.reviewClaim({id:'c',kind:'learning',text:'Completed digital skills.',originalText:'Completed digital skills.',category:'verified',originalCategory:'verified',dates:'September 2026',decision:'pending'},'accepted','Completed a first-aid course in 2024.');
 assert.equal(edited.dates,'');
 assert.equal(edited.sourceDates,'September 2026');
 assert.doesNotMatch(core.buildTextCV({},'Assistant',[edited]),/September 2026/);
});
