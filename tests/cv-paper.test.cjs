'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {buildCv,renderCvHtml,buildCvText,buildCvRecord,renderRecordHtml}=require('../core.js');
const core=require('../core.js');
const {readCvRecord}=require('../server/cv/record.js');
const {createAccountSource}=require('../server/card/account.js');
const {loadConfig}=require('../server/config.js');
const {NOW,fakeYoma}=require('./helpers/vouch-boot.cjs');
const {sampleState}=require('./helpers/cv-state.cjs');
const copy=require('../cv-copy.js').en;
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const state=sampleState();

test('the helper record is what readCvRecord gives for Thandi',async()=>{
  const config={...loadConfig({env:{},cwd:fs.mkdtempSync(path.join(os.tmpdir(),'yocv-paper-'))}),yomaAccessToken:''};
  const record=await readCvRecord({accountSource:createAccountSource({config,yoma:fakeYoma(),now:()=>NOW}),selector:{persona:'thandi'}});
  assert.deepEqual(sampleState().record,record);
  assert.notEqual(sampleState(),sampleState(),'a fresh object on each call');
});
test('the CV paper has the sections in order, as real headings, and no table',()=>{
  const html=renderCvHtml(buildCv(state,copy),copy);
  const order=['<h1','Experience','Skills','Learning recorded on Yoma','References available on request','Sample account: fictional, for demonstration'].map(s=>html.indexOf(s));
  assert.deepEqual([...order].sort((a,b)=>a-b),order); assert.ok(order.every(i=>i>=0));
  assert.ok(!/<table|<td/.test(html)&&!html.includes('Education'));
  assert.ok(html.includes('<li>Customer Service (Confirmed from Yoma)</li>'));
  assert.ok(html.includes('<li>Hairstyling (Vouched by a customer, confirmed by them, not by Yoma)</li>'));
  assert.ok(html.includes('Customer Care Skills and Telephone Etiquette. Credential issued by Alison Learning, October 2025.'));
  assert.ok(!/qualification|verified by Yoma/i.test(html));
  assert.ok(!html.includes('not checked'),'the CV never prints the record\'s number notes');
  const two={...state,entries:[{...state.entries[0],title:'Market stall',months:{start:'2024-01',end:'2025-06'}},state.entries[0]],review:{entries:[{...state.review.entries[0],index:0},{...state.review.entries[0],index:1}]},decisions:{...state.decisions,'1:0':{decision:'accepted'}}};
  const twoHtml=renderCvHtml(buildCv(two,copy),copy);
  assert.ok(twoHtml.indexOf('Market stall')>0&&twoHtml.indexOf('Braiding at home')<twoHtml.indexOf('Market stall'),'newest first: the open entry renders before the one that ended 2025-06');
  const cert={...state,record:{...state.record,credentials:state.record.credentials.map(c=>c.id==='w2'?{...c,title:'Certified Customer Care'}:c)}};
  const certHtml=renderCvHtml(buildCv(cert,copy),copy);
  assert.ok(certHtml.includes('Certified Customer Care. Credential issued by Alison Learning, October 2025.'),'spec 6 rule 5: the credential title prints verbatim');
  assert.equal(certHtml.split('Certified Customer Care').length,2,'and only in the learning line');
  assert.ok(html.includes('Khayelitsha')&&html.includes('March 2025 to now'));
  const onPage=renderCvHtml(buildCv(state,copy),copy,{headingLevel:2});
  assert.ok(!onPage.includes('<h1')&&onPage.includes('<h2')&&onPage.includes('<h3>Experience</h3>'));
});
test('only accepted or edited material reaches the CV, and a credential replaces its linked completion',()=>{
  const cv=buildCv(state,copy);
  assert.deepEqual(cv.learning,['Hair Styling: Blow-Dry, Cut, and Colour Like a Pro. Credential issued by Alison Learning, September 2025.','Customer Care Skills and Telephone Etiquette. Credential issued by Alison Learning, October 2025.']);
  assert.equal(cv.experience[0].months,'March 2025 to now');
  assert.deepEqual(cv.contact,{phone:'+27735550147',email:'',town:'Khayelitsha, Cape Town'});
  const edited=buildCv({...state,decisions:{...state.decisions,'0:0':{decision:'edited',text:'Braided hair at home, about 40 customers a week.'},profile:{decision:'edited',text:'Hairdresser who braids at home.'},'skill:Cosmetics':{decision:'left_out'}}},copy);
  assert.deepEqual(edited.experience[0].bullets,['Braided hair at home, about 40 customers a week.']);
  assert.equal(edited.profile,'Hairdresser who braids at home.');
  assert.deepEqual(edited.skills.map(s=>s.name),['Customer Service','Hairstyling']);
  const pending=buildCv({...state,decisions:{}},copy);
  assert.deepEqual([pending.profile,pending.experience,pending.skills],[null,[],[]]);
  const plain=buildCv({...state,include:{completions:['c1','c3'],credentials:['w2'],selfAttested:[]},record:{...state.record,credentials:state.record.credentials.map(c=>c.id==='w2'?{...c,issuer:null}:c)}},copy);
  assert.deepEqual(plain.learning,['Hair Styling: Blow-Dry, Cut, and Colour Like a Pro. Learning opportunity completed with Alison Learning, September 2025.','Customer Care Skills and Telephone Etiquette. Credential issued by issuer not stated, October 2025.','Financial Literacy for Gig Workers. Learning opportunity completed with UNICEF Kenya, January 2026.']);
  const ended=buildCv({...state,entries:[{...state.entries[0],months:{start:'2024-01',end:'2025-06'}}]},copy);
  assert.equal(ended.experience[0].months,'January 2024 to June 2025');
  assert.equal(buildCv({...state,record:null,offline:true},copy).sample,true,'the offline path is sample mode');
});
test('a token account prints no footer at all; optional fields print only when filled',()=>{
  const token={...state,record:{...state.record,source:'token',fictional:false},optional:{...state.optional,dateOfBirth:'2002-03-15'}};
  const cv=buildCv(token,copy),html=renderCvHtml(cv,copy),text=buildCvText(cv,copy);
  assert.equal(cv.sample,false);
  assert.ok(!html.includes('cv-sample-note')&&!html.includes(copy.cvSampleFooter)&&!text.includes(copy.cvSampleFooter));
  assert.ok(html.includes('2002-03-15')&&text.includes('2002-03-15'));
  assert.ok(!html.includes(copy.cvIdNumber)&&!html.includes(copy.cvStateOfOrigin)&&!html.includes('<img'));
  assert.ok(!renderCvHtml(buildCv(state,copy),copy).includes(copy.cvDateOfBirth));
  const photo=renderCvHtml(buildCv({...state,optional:{...state.optional,photo:'data:image/png;base64,AAAA'}},copy),copy);
  assert.ok(photo.includes('<img class="cv-photo" src="data:image/png;base64,AAAA"'));
  assert.ok(!renderCvHtml(buildCv({...state,optional:{...state.optional,photo:'javascript:alert(1)'}},copy),copy).includes('<img'),'only an image data URL prints');
});
test('core.js loads alone, as card.html loads it, and gives YoCard escapeHTML and shortQuote',()=>{
  const vm=require('node:vm'),ctx={},touched=[];
  for(const k of ['YoCVRules','YoCVCopy'])Object.defineProperty(ctx,k,{get(){touched.push(k);return undefined;}});
  vm.createContext(ctx);
  vm.runInContext(read('core.js'),ctx,{filename:'core.js'});
  assert.equal(typeof ctx.YoCV.escapeHTML,'function'); assert.equal(typeof ctx.YoCV.shortQuote,'function');
  assert.deepEqual(touched,[],'core.js never reads the rules or the copy from window when it loads');
});
test('user text is escaped',()=>{
  const bad='<img src=x onerror=alert(1)>';
  const s={...state,contact:{...state.contact,name:bad},entries:[{...state.entries[0],title:bad,place:bad}],decisions:{...state.decisions,'0:0':{decision:'edited',text:bad}}};
  const html=renderCvHtml(buildCv(s,copy),copy);
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;')&&!html.includes('<img'));
  const record=renderRecordHtml(buildCvRecord({...s,entries:[{...s.entries[0],what:bad}]},copy),copy);
  assert.ok(record.includes('&lt;img')&&!record.includes('<img'));
});
test('the text CV keeps the same section order and the sample line last',()=>{
  const lines=buildCvText(buildCv(state,copy),copy).split('\n');
  assert.deepEqual(lines,['Thandi Mokoena','+27735550147 · Khayelitsha, Cape Town','',
    'Hairdresser with cosmetics and customer service recorded on Yoma and 9 months of braiding at home.','',
    'Experience','Braiding at home','Khayelitsha · March 2025 to now',
    '- Braid hair at home for women in my street, mostly box braids and cornrows for customers a few times a week since March 2025, about 40 customers a week.','',
    'Skills','- Cosmetics (Confirmed from Yoma)','- Customer Service (Confirmed from Yoma)','- Hairstyling (Vouched by a customer, confirmed by them, not by Yoma)','',
    'Learning recorded on Yoma','- Hair Styling: Blow-Dry, Cut, and Colour Like a Pro. Credential issued by Alison Learning, September 2025.','- Customer Care Skills and Telephone Etiquette. Credential issued by Alison Learning, October 2025.','',
    'References available on request','','Sample account: fictional, for demonstration']);
  const educated=buildCvText(buildCv({...state,contact:{...state.contact,education:'Grade 12, 2019'}},copy),copy);
  assert.ok(educated.includes('Learning recorded on Yoma')&&educated.indexOf('\nEducation\nGrade 12, 2019\n')>educated.indexOf('Learning recorded on Yoma'));
});
test('the evidence record names the mode, every quote, every refusal, every skill source and the linked completion',()=>{
  const r=buildCvRecord(state,copy);
  assert.equal(r.title,'YoCV evidence record'); assert.equal(r.modeLabel,'Sample mode');
  assert.equal(buildCvRecord({...state,generation:{mode:'live',provider:'azure-openai',model:'gpt-4.1-mini',durationMs:1}},copy).modeLabel,'Live AI · gpt-4.1-mini');
  assert.ok(r.notice.startsWith('Not operated by Yoma or UNICEF.'));
  assert.deepEqual(r.entries[0].numberNotes,['about 40 customers a week (stated by Thandi, not checked)']);
  const typed=buildCvRecord({...state,entries:[{...state.entries[0],what:'I sold forty bags of oranges at the taxi rank.',outcome:'Sales went up by 20 a day.'}]},copy);
  assert.deepEqual(typed.entries[0].numberNotes,['about 40 customers a week (stated by Thandi, not checked)','forty (stated by Thandi, not checked)','20 (stated by Thandi, not checked)']);
  assert.deepEqual(r.entries[0].rejected,[{kind:'bullet',text:'Braided hair for over 50 customers a week since March 2025.',reason:'invented_number'}]);
  const linked=buildCvRecord({...state,entries:[{...state.entries[0],confirm:{kind:'completion',completionId:'c1'}}]},copy);
  assert.deepEqual(linked.entries[0].linkedCompletion,{evidenceId:'c1',title:'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro',organizationName:'Alison Learning'});
  assert.ok(renderRecordHtml(linked,copy).includes('Hair Styling: Blow-Dry, Cut, and Colour Like a Pro'));
  assert.equal(r.skills.find(s=>s.name==='Hairstyling').sources.length,3);
  assert.deepEqual(r.learning.find(l=>l.line.startsWith('Customer Care Skills')).skills,['Customer Service']);
  assert.ok(!('phone' in r)&&!JSON.stringify(r).includes('+27735550147'));
  const html=renderRecordHtml(r,copy);
  for(const s of ['Sample mode','invented_number','stated by Thandi, not checked','braid hair at home'])assert.ok(html.includes(s),s);
  const TOTALS=/\b\d+ (vouch|vouches|sources|customers vouched)\b/i;
  assert.ok(!TOTALS.test(html)&&!TOTALS.test(renderCvHtml(buildCv(state,copy),copy)),'no public counts, sources as separate lines');
});
test('the record keeps each decision, the profile, the mode for every generation and no contact detail',()=>{
  const r=buildCvRecord(state,copy);
  assert.equal(r.entries[0].linkedCompletion,null);
  assert.deepEqual(r.entries[0].proposals,[{text:state.review.entries[0].proposals[0].text,origin:'template',templateWording:false,decision:'accepted',finalText:state.review.entries[0].proposals[0].text,sourceQuote:state.entries[0].what,sourceFields:['what','forWhom','frequency','months','number']}]);
  assert.deepEqual(r.profile,{text:state.profile.text,decision:'accepted'});
  assert.deepEqual(r.account,{source:'sample',fictional:true});
  assert.ok(!Number.isNaN(Date.parse(r.createdAt)));
  const edited=buildCvRecord({...state,decisions:{'0:0':{decision:'edited',text:'Braided hair at home, about 40 customers a week.'},profile:{decision:'edited',text:'Hairdresser who braids at home.'}}},copy);
  assert.deepEqual([edited.entries[0].proposals[0].decision,edited.entries[0].proposals[0].finalText],['edited','Braided hair at home, about 40 customers a week.']);
  assert.deepEqual(edited.profile,{text:'Hairdresser who braids at home.',decision:'edited'});
  assert.deepEqual([buildCvRecord({...state,decisions:{}},copy).entries[0].proposals[0].decision,buildCvRecord({...state,decisions:{}},copy).profile.decision],['pending','pending']);
  assert.equal(buildCvRecord({...state,generation:{mode:'sample-offline',provider:'local',model:null,durationMs:0}},copy).modeLabel,'Sample mode (offline)');
  assert.equal(buildCvRecord({...state,generation:{mode:'live',provider:'openai',model:null,durationMs:1}},copy).modeLabel,'Live AI · openai');
  const offline=buildCvRecord({...state,record:null,offline:true,generation:{mode:'sample-offline',provider:'local',model:null,durationMs:0}},copy);
  assert.deepEqual(offline.entries[0].numberNotes,['about 40 customers a week (stated by Thandi, not checked)'],'the first word of the contact name when there is no record');
  const s={...state,contact:{...state.contact,email:'thandi@example.org'},optional:{photo:'',dateOfBirth:'2002-03-15',idNumber:'9001015009087',stateOfOrigin:'Lagos'}};
  const json=JSON.stringify(buildCvRecord(s,copy)),html=renderRecordHtml(buildCvRecord(s,copy),copy);
  for(const x of ['+27735550147','thandi@example.org','Cape Town','2002-03-15','9001015009087','Lagos'])assert.ok(!json.includes(x)&&!html.includes(x),x);
  assert.ok(html.indexOf('Sample mode')<html.indexOf('<h1'),'the mode label comes first');
  assert.ok(html.includes(copy.reason_invented_number)&&html.includes('Vouched by a customer, confirmed by them, not by Yoma'));
});
test('HTML export escapes executable-looking user content',()=>{
 assert.equal(typeof core.escapeHTML,'function');
 assert.equal(core.escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
test('shortQuote truncates long quotes for display and leaves short ones alone',()=>{
 assert.equal(typeof core.shortQuote,'function');
 const long='a'.repeat(300);
 const short=core.shortQuote(long);
 assert.equal(short.length,241);
 assert.equal(short,'a'.repeat(240)+'…');
 assert.equal(core.shortQuote('short quote'),'short quote');
 assert.equal(core.shortQuote('abcdef',3),'abc…');
 assert.equal(core.shortQuote(undefined),'');
});
