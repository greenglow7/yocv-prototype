const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const core=require('../core.js');
const {checkBullet,checkProfile,checkBullets,INFLATION,ROLE_UPGRADE,VERBS,RULES}=require('../server/cv/validate.js');

const fields={title:'Braiding at home',what:'I braid hair at home for women in my street, mostly box braids and cornrows.',forWhom:'customers',frequency:'a few times a week',months:{start:'2025-03',end:''},number:{value:40,unit:'customers a week',hedge:'about'},outcome:'Most of them come back every month.'};
const ctx={fields,role:'Hairdresser',kind:'bullet'};
const b=(text,sourceQuote='braid hair at home')=>checkBullet({text,sourceQuote},ctx);
test('a grounded bullet passes and lists its checks',()=>{
  assert.deepEqual(b('Braided hair at home for about 40 customers a week since March 2025.'),{ok:true,checks:['numbers','names','overstatement','opening','length','quote']});
  assert.equal(b('Braided hair at home for about forty customers a week since March 2025.').ok,true);
});
test('each section 7 reason',()=>{
  const r=t=>b(t).reason;
  assert.equal(r('Braided hair for over 50 customers a week since March 2025.'),'invented_number');
  assert.equal(r('Braided hair for dozens of customers a week since March 2025.'),'invented_number');
  assert.equal(r('Braided hair at home for 40 customers a week since March 2025.'),'hedge_dropped');
  assert.equal(r('Braided hair at Sunrise Salon for about 40 customers a week.'),'invented_name');
  assert.equal(r('Braided hair at home for about 40 customers a week since January 2025.'),'invented_number');
  assert.equal(r('Braided hair on Sundays for about 40 customers a week since March 2025.'),'invented_name');
  assert.equal(r('Braided hair as an expert stylist for about 40 customers a week.'),'overstated');
  assert.equal(r('Braided hair professionally for about 40 customers a week at home.'),'overstated');
  assert.equal(r('Managed a braiding business for about 40 customers a week at home.'),'overstated');
  assert.equal(r('Braided hair at home for about 40 customers a week with a diploma.'),'overstated');
  assert.equal(r('Responsible for braiding hair for about 40 customers a week at home.'),'weak_opening');
  assert.equal(r('Helped with braiding hair for about 40 customers a week at home.'),'weak_opening');
  assert.equal(r('Duties included braiding hair for about 40 customers a week.'),'weak_opening');
  assert.equal(r('Hair braiding for about 40 customers a week at home since March 2025.'),'weak_opening');
  assert.equal(b('Braided hair at home for about 40 customers a week since March 2025.','I run a salon').reason,'quote_not_found');
  assert.equal(r('Braided hair at home.'),'length');
  assert.equal(r('Braided hair at home for about 40 customers a week. Most come back.'),'not_one_sentence');
  assert.equal(r('Braided hair at home for about 40 customers a week since March 2025!'),'exclamation');
  assert.equal(r('Braided hair at home for about 40 customers a week, call 071 000 0000.'),'contact_detail');
  assert.equal(r('Braided hair at home for about 40 customers a week, call [contact1].'),'contact_detail');
});
test('a role-upgrade word passes when the person used a form of it',()=>{
  const own={...ctx,fields:{...fields,what:'I manage my own braiding table at home for women in my street.'}};
  assert.equal(checkBullet({text:'Managed a braiding table at home for about 40 customers a week.',sourceQuote:'braiding table at home'},own).ok,true);
});
test('Review Focus 5 (offline half): the core check refuses an edit the same way',()=>{
  assert.equal(core.checkCvText('Braided hair at home for about 45 customers a week since 2025.',ctx,RULES).reason,'invented_number');
});
test('length counts code points: 180 characters with emoji pass, 181 fail',()=>{
  const pad=n=>'Braided hair for about 40 customers a week '+'😀'.repeat(n-44)+'.';
  assert.equal(core.checkCvText(pad(180),ctx,RULES).ok,true);
  assert.equal(core.checkCvText(pad(181),ctx,RULES).reason,'length');
});
test('the profile line skips the opening check and may name Yoma and the computed months',()=>{
  const p='Hairdresser with customer service and cosmetics recorded on Yoma and 9 months of braiding at home.';
  assert.equal(checkProfile(p,{...ctx,kind:'profile',extraNumbers:[9],extraNames:['Customer','Service']}).ok,true);
  assert.equal(checkProfile(p,{...ctx,kind:'profile'}).reason,'invented_number');
});
test('the lists live once, in cv-rules.js',()=>{
  const rules=require('../cv-rules.js');
  assert.equal(INFLATION,rules.INFLATION); assert.equal(ROLE_UPGRADE,rules.ROLE_UPGRADE); assert.equal(VERBS,rules.VERBS);
  assert.ok(!fs.existsSync(path.join(__dirname,'..','data','verbs.json')));
});
test('duplicates and the lists',()=>{
  const t='Braided hair at home for about 40 customers a week since March 2025.';
  assert.deepEqual(checkBullets([{text:t,sourceQuote:'braid hair at home'},{text:t,sourceQuote:'braid hair at home'}],ctx).rejected.map(x=>x.reason),['duplicate']);
  assert.deepEqual(INFLATION,['certified','qualified','licensed','verified','expert','proficient','professional','advanced']);
  assert.deepEqual(ROLE_UPGRADE,['managed','led','ran','owned','supervised','trained']);
  assert.deepEqual(RULES.inflationStems,['certif','qualif','licens','licenc','verif','expert','proficien','professional','advanced']);
  assert.ok(VERBS.length>=115&&VERBS.length<=125);
  const forms=VERBS.flatMap(v=>v.split('|'));
  for(const w of ['served','sold','cared for','repaired','delivered','kept','counted','cleaned','taught','organised','braided','drove','built','worked'])assert.ok(forms.includes(w),w);
  for(const w of [...INFLATION,...ROLE_UPGRADE])assert.ok(!forms.includes(w),w);
});
test('Review Focus 2: no verb form is a common name or shop name, so maskNames with VERBS still hides them',()=>{
  const {fields}=core.maskNames({title:'Packing shelves',what:'I pack shelves at Pick n Pay for Drew Cook and Mr Price.',forWhom:'customers',outcome:"They said Welcome Waters, Harry Styles, Lift, Coach, Budget and Lay's came back."},{role:'Shelf packer',verbs:VERBS});
  const left=w=>new RegExp('\\b'+w+'\\b').test(fields.what+'\n'+fields.outcome);
  for(const w of ['Pick','Pay','Drew','Cook','Price','Welcome','Waters','Styles','Lift','Coach','Budget','Lay'])assert.ok(!left(w),w);
});
