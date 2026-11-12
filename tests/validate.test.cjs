const {test}=require('node:test');
const assert=require('node:assert/strict');
let v={}; try {v=require('../server/validate.js')}catch{}

const experience='I helped customers find products at my aunt’s shop.\nI packed orders and   kept the shelves organised.';
const menu=[{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/skill/customer-service'},{id:'id-cash',name:'Cash Handling',infoURL:'https://lightcast.io/skill/cash-handling'}];

test('normalise lowercases, straightens curly quotes, collapses whitespace and trims',()=>{
 assert.equal(typeof v.normalise,'function');
 assert.equal(v.normalise('  My Aunt’s  “Shop”\n\tNow '),'my aunt\'s "shop" now');
});

test('quoteInSource matches ignoring case, curly quotes and whitespace',()=>{
 assert.equal(typeof v.quoteInSource,'function');
 assert.deepEqual(v.quoteInSource("My Aunt's shop",experience),{ok:true});
 assert.deepEqual(v.quoteInSource('packed orders and kept the shelves',experience),{ok:true});
 assert.deepEqual(v.quoteInSource('“shop”. I packed',experience).ok,false);
});

test('quoteInSource rejects quotes absent from the text and quotes shorter than 8 characters',()=>{
 assert.deepEqual(v.quoteInSource('managed a team of staff',experience),{ok:false,reason:'quote_not_in_source'});
 assert.deepEqual(v.quoteInSource('helped ',experience),{ok:false,reason:'quote_not_in_source'});
 assert.deepEqual(v.quoteInSource('',experience),{ok:false,reason:'quote_not_in_source'});
 assert.deepEqual(v.quoteInSource(undefined,experience),{ok:false,reason:'quote_not_in_source'});
});

test('noInventedNumbers accepts numbers present in dates, context or experience',()=>{
 assert.equal(typeof v.noInventedNumbers,'function');
 const sources={experience,context:'Family shop',dates:'School holidays, 2025–2026'};
 assert.deepEqual(v.noInventedNumbers('Helped customers during the 2025 school holidays.',sources),{ok:true});
 assert.deepEqual(v.noInventedNumbers('Helped customers at the shop.',sources),{ok:true});
 assert.deepEqual(v.noInventedNumbers('Served 3 customers',{experience:'I served 3 customers a day.',context:'',dates:''}),{ok:true});
 assert.deepEqual(v.noInventedNumbers('Opened shop 2 in town',{experience:'',context:'Shop 2',dates:''}),{ok:true});
});

test('noInventedNumbers rejects digit sequences the user did not write',()=>{
 const sources={experience,context:'Family shop',dates:''};
 assert.deepEqual(v.noInventedNumbers('Helped customers for 2 years.',sources),{ok:false,reason:'invented_number'});
 assert.deepEqual(v.noInventedNumbers('Served 2025 customers',{experience:'',context:'',dates:'2025'}),{ok:true});
 assert.deepEqual(v.noInventedNumbers('Served 20250 customers',{experience:'',context:'',dates:'2025'}),{ok:false,reason:'invented_number'});
 assert.deepEqual(v.noInventedNumbers('Served 3 customers',{}),{ok:false,reason:'invented_number'});
});

test('lengthOk accepts 1 to 180 characters',()=>{
 assert.equal(typeof v.lengthOk,'function');
 assert.deepEqual(v.lengthOk('a'),{ok:true});
 assert.deepEqual(v.lengthOk('x'.repeat(180)),{ok:true});
 assert.deepEqual(v.lengthOk('x'.repeat(181)),{ok:false,reason:'length'});
 assert.deepEqual(v.lengthOk(''),{ok:false,reason:'length'});
 assert.deepEqual(v.lengthOk('   '),{ok:false,reason:'length'});
 assert.deepEqual(v.lengthOk(undefined),{ok:false,reason:'length'});
});

test('noBannedClaims rejects credential assertions on word boundaries, case-insensitively',()=>{
 assert.equal(typeof v.noBannedClaims,'function');
 assert.deepEqual(v.noBannedClaims('Certified barista'),{ok:false,reason:'asserts_credential'});
 assert.deepEqual(v.noBannedClaims('Holds a DEGREE in retail'),{ok:false,reason:'asserts_credential'});
 assert.deepEqual(v.noBannedClaims('Verified stock levels daily'),{ok:false,reason:'asserts_credential'});
 assert.deepEqual(v.noBannedClaims('Licensed to sell'),{ok:false,reason:'asserts_credential'});
 assert.deepEqual(v.noBannedClaims('Qualified first aider'),{ok:false,reason:'asserts_credential'});
 assert.deepEqual(v.noBannedClaims('Won an award for service'),{ok:false,reason:'asserts_credential'});
 assert.deepEqual(v.noBannedClaims('Earned a diploma'),{ok:false,reason:'asserts_credential'});
 assert.deepEqual(v.noBannedClaims('Was awarded a prize for service'),{ok:true});
 assert.deepEqual(v.noBannedClaims('Helped customers find products.'),{ok:true});
 assert.deepEqual(v.noBannedClaims('Recertified nothing'),{ok:true});
});

test('resolveSkill matches menu entries by name, case-insensitively, and returns null otherwise',()=>{
 assert.equal(typeof v.resolveSkill,'function');
 assert.equal(v.resolveSkill('customer service',menu),menu[0]);
 assert.equal(v.resolveSkill(' Cash Handling ',menu),menu[1]);
 assert.equal(v.resolveSkill('Communication',menu),null);
 assert.equal(v.resolveSkill(undefined,menu),null);
 assert.equal(v.resolveSkill('Customer Service',[]),null);
});

test('dedupe keeps the first of two claims equal after normalisation',()=>{
 assert.equal(typeof v.dedupe,'function');
 const claims=[{text:'Helped customers find products.',sourceQuote:'a'},{text:'  helped  Customers find products. ',sourceQuote:'b'},{text:'Packed orders.',sourceQuote:'c'}];
 const result=v.dedupe(claims);
 assert.deepEqual(result.kept,[claims[0],claims[2]]);
 assert.deepEqual(result.rejected,[{...claims[1],reason:'duplicate'}]);
 assert.deepEqual(v.dedupe([]),{kept:[],rejected:[]});
});
