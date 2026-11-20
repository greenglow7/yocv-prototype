const {test}=require('node:test');
const assert=require('node:assert/strict');
const {YomaUnavailable}=require('../server/yoma.js');
const {TRADES}=require('../server/card/routes.js');
const {buildSkillMenu,roleList}=require('../server/cv/menu.js');

// A fake Yoma for this file only: skillByName answers every name with a stable fake entry, plus `extra` names.
function fakeYoma({extra=[]}={}){
  const known=new Set([...Object.values(require('../data/role-skills.json')).flatMap(r=>r.skillNames),...extra]);
  return {async skillByName(name){return {item:known.has(name)?{id:'fake-'+name.toLowerCase().replace(/\W+/g,'-'),name,infoURL:'https://example.org/skill/'+encodeURIComponent(name)}:null,source:'live'};},
    async searchLearningOpportunities(){return {items:[],totalCount:0,source:'live'};},async reachable(){return true;}};
}
test('role-skills.json has the three YoCV roles and the twelve YoCard trades',()=>{
  const rs=require('../data/role-skills.json');
  assert.deepEqual(Object.keys(rs),['Retail assistant','Customer support assistant','Community outreach assistant','Hairdresser','Nail technician','Boda boda or taxi driver','Tailor','Mechanic','Electrician','Plumber','Cleaner','Cook or food seller','Market seller','Mobile money agent','General labourer']);
  const trades=TRADES.filter(t=>t.id!=='other');
  for(const t of trades)assert.equal(rs[t.label]?.tradeId,t.id,t.label);
  for(const [name,r] of Object.entries(rs))assert.ok(r.description&&r.skillNames.length>=6&&r.opportunityQueries.length>=1,name);
  assert.deepEqual(rs.Hairdresser.skillNames,['Hairstyling','Hair Care','Customer Service','Cleanliness','Time Management','Cash Handling','Reliability']);
});
test('buildSkillMenu drops inflation names as well as credential names',async()=>{
  const {menu}=await buildSkillMenu('Hairdresser',{yoma:fakeYoma({extra:['Professional Hair Care']}),roleSkills:{Hairdresser:{skillNames:['Hairstyling','Professional Hair Care']}}});
  assert.deepEqual(menu.map(m=>m.name),['Hairstyling']);
});
test('roleList returns name, description and tradeId in file order',()=>{
  const rs=require('../data/role-skills.json');
  const list=roleList(rs);
  assert.equal(list.length,15);
  assert.deepEqual(list.map(r=>r.name),Object.keys(rs));
  assert.deepEqual(list[0],{name:'Retail assistant',description:'Help customers, organise stock and support a shop.',tradeId:null});
  assert.deepEqual(list[3],{name:'Hairdresser',description:rs.Hairdresser.description,tradeId:'hair'});
});

// Moved unchanged from tests/generation.test.cjs (its fakeYoma renamed tableYoma).
const roleSkills={'Retail assistant':{skillNames:['Customer Service','Cash Handling','Customer Service Certification','Teamwork'],opportunityQueries:['retail']}};
const table={
 'Customer Service':{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/skills/customer-service'},
 'Cash Handling':{id:'cash-1',name:'Cash Handling',infoURL:'https://lightcast.io/skills/cash-handling'},
 'Customer Service Certification':{id:'cert-1',name:'Customer Service Certification',infoURL:'https://lightcast.io/skills/csc'}
};
function tableYoma({source='live',table:t=table,fail=false}={}){
 const calls=[];
 return {calls,async skillByName(name){calls.push(name);if(fail)throw new YomaUnavailable();return {item:t[name]?{...t[name]}:null,source};}};
}

test('buildSkillMenu keeps exact Yoma matches, drops credential-style names and unmatched names',async()=>{
 assert.equal(typeof buildSkillMenu,'function');
 const yoma=tableYoma();
 const {menu,source}=await buildSkillMenu('Retail assistant',{yoma,roleSkills});
 assert.deepEqual(menu,[table['Customer Service'],table['Cash Handling']]);
 assert.equal(source,'live');
 assert.deepEqual(yoma.calls.sort(),['Cash Handling','Customer Service','Customer Service Certification','Teamwork']);
 assert.ok(menu.every(entry=>!/certif|licens|diploma|degree/i.test(entry.name)));
});
test('buildSkillMenu reports cache when any lookup came from cache',async()=>{
 const {menu,source}=await buildSkillMenu('Retail assistant',{yoma:tableYoma({source:'cache'}),roleSkills});
 assert.equal(menu.length,2);
 assert.equal(source,'cache');
});
test('buildSkillMenu returns an empty menu with source none when Yoma is unavailable',async()=>{
 const {menu,source}=await buildSkillMenu('Retail assistant',{yoma:tableYoma({fail:true}),roleSkills});
 assert.deepEqual(menu,[]);
 assert.equal(source,'none');
});
test('buildSkillMenu lets a Yoma bad request (programming error) propagate',async()=>{
 const yoma={async skillByName(){const err=new Error('bad');err.code='yoma_bad_request';throw err;}};
 await assert.rejects(buildSkillMenu('Retail assistant',{yoma,roleSkills}),{code:'yoma_bad_request'});
});
