const {test}=require('node:test');
const assert=require('node:assert/strict');
const {numbersIn,allowedNumbers,properNouns,maskNames,restoreNames}=require('../core.js');
const {VERBS}=require('../cv-rules.js');

const v=t=>numbersIn(t).map(n=>n.value);
test('numbersIn reads digits and English number words',()=>{
  assert.deepEqual(v('about 40 customers'),[40]);
  assert.deepEqual(v('forty-two, forty two and twelve'),[42,42,12]);
  assert.deepEqual(v('two hundred and fifty people, a thousand items, a dozen eggs'),[250,1000,12]);
  assert.deepEqual(v('R1,200 a week and 40%'),[1200,40]);
  assert.deepEqual(v('dozens of customers, hundreds of people'),[null,null]);
  assert.deepEqual(v('one of my aunts'),[1]);
  assert.deepEqual(v('call 071 000 0000 or +27 71-000-0000, mail orders2@example.org, about 40'),[40]);
  assert.deepEqual(v('at [name7], call [contact1]'),[]);
  assert.deepEqual(v('at [name1], call [contact2], about 40'),[40]);
  // 'N thousand' is N times a thousand, not N (final review finding 2).
  assert.deepEqual(v('two thousand customers, twenty five thousand rand, a hundred thousand people'),[2000,25000,100000]);
  assert.deepEqual(v('two thousand two hundred and fifty, one thousand and one'),[2250,1001]);
});
test('Review Focus 1: a number written another way is the same number; a month is not',()=>{
  const fields={title:'Market stall',what:'I sold forty bags of oranges on Saturdays',forWhom:'customers',outcome:'',number:{value:1200,unit:'rand a week',hedge:'about'},months:{start:'2025-03',end:'2026-04'}};
  const allowed=allowedNumbers(fields);
  for(const n of [40,1200,2025,2026])assert.ok(allowed.has(n),String(n));
  for(const n of [3,4])assert.ok(!allowed.has(n),String(n));
  assert.ok(allowedNumbers(fields,[14]).has(14));
  const withPhone=allowedNumbers({...fields,what:'I sold oranges, orders on 071 000 0000'});
  for(const n of [71,0,710000000])assert.ok(!withPhone.has(n),String(n));
});
test('properNouns skips sentence starts, I, months and weekdays',()=>{
  assert.deepEqual(properNouns("On Saturdays I helped at Mama Joy's salon in March. Then WhatsApp orders came.").map(w=>w.word),['Mama','Joy','WhatsApp']);
});
test('Review Focus 2: maskNames hides names and places, keeps the role, verbs, months and weekdays, and catches the person\'s own name in any case',()=>{
  const {fields,map}=maskNames({title:'Braiding at home',what:"I braid hair at Mama Joy's salon in Site C on Saturdays since March",forWhom:'customers',outcome:'Mama Joy asked thandi MOKOENA to come back'},{role:'Hairdresser',verbs:VERBS,known:['Thandi','Mokoena']});
  assert.equal(fields.what,"I braid hair at [name1] [name2]'s salon in [name3] [name4] on Saturdays since March");
  assert.equal(fields.outcome,'[name1] [name2] asked [name5] [name6] to come back');
  assert.equal(fields.title,'Braiding at home');
  assert.equal(restoreNames(fields.outcome,map),'Mama Joy asked thandi MOKOENA to come back');
  assert.equal(restoreNames('Braided hair at [name9].',map),'Braided hair at [name9].');
  const r=maskNames({title:'x',what:'I work as a Hairdresser at Mama Joy\'s salon',forWhom:'',outcome:''},{role:'Hairdresser',verbs:VERBS});
  assert.ok(r.fields.what.includes('as a Hairdresser at [name1]'));
});
test('Review Focus 2: a town as the first word is masked when known; a phone or email becomes a contact placeholder that is never restored',()=>{
  const known=['Thandi','Thandi','Mokoena','Khayelitsha','Cape','Town'];
  const {fields,map}=maskNames({title:'Braiding at home',what:'Khayelitsha is where I braid hair, orders on 071 000 0000 or orders2@example.org',forWhom:'customers',outcome:''},{role:'Hairdresser',verbs:VERBS,known});
  assert.equal(fields.what,'[name1] is where I braid hair, orders on [contact1] or [contact2]');
  assert.ok(!/Khayelitsha|071|example\.org/.test(JSON.stringify(fields)));
  assert.equal(restoreNames('[name1] braids, call [contact1].',map),'Khayelitsha braids, call [contact1].');
});
test('Review Focus 2: a phone written with dots, brackets, a country code without + or no leading 0 is masked whole',()=>{
  const m=t=>maskNames({title:'x',what:t,forWhom:'',outcome:''},{role:'Hairdresser',verbs:VERBS}).fields.what;
  assert.equal(m('Call me on 071.000.0000 please'),'Call me on [contact1] please');
  assert.equal(m('Call (071) 000 0000 please'),'Call [contact1] please');
  assert.equal(m('Call 27 71 000 0000 please'),'Call [contact1] please');
  assert.equal(m('Call 803 123 4567 please'),'Call [contact1] please');
  assert.equal(m('Call 071/000/0000 or 0710000000'),'Call [contact1] or [contact2]');
  assert.equal(m('From 2025 to 2026, about 40 a day and 1 000 000 words'),'From 2025 to 2026, about 40 a day and 1 000 000 words');
  assert.deepEqual(v('Call 071.000.0000 or (071) 000 0000, about 40'),[40]);
});
test('Review Focus 2: a surname after Mr., Mrs., Dr. or e.g. is not sentence-initial and is masked',()=>{
  const m=t=>maskNames({title:'x',what:t,forWhom:'',outcome:''},{role:'Shelf packer',verbs:VERBS}).fields.what;
  assert.equal(m('I worked for Mr. Dlamini at the Spar.'),'I worked for [name1]. [name2] at the [name3].');
  assert.equal(m('I packed for Dr. Naidoo on Saturdays, e.g. Fridays too.'),'I packed for [name1]. [name2] on Saturdays, e.g. Fridays too.');
  assert.equal(m('I packed shelves. Then I cleaned.'),'I packed shelves. Then I cleaned.');
  assert.deepEqual(properNouns('I worked for Mrs. Dlamini. Then I left.').map(w=>w.word),['Mrs','Dlamini']);
});
