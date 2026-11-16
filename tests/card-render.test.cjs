const {test}=require('node:test');
const assert=require('node:assert/strict');
const {qrSvg}=require('../server/qr.js');
let render={}; try {render=require('../server/card/render.js')}catch{}
const {publicPage,notFoundPage,withdrawnPage,cardSvg,maskPhone,waLink}=render;

const PUBLIC_URL='https://yocard.example';
const FIXED=[
 "Read from Thandi's Yoma account on",
 'Phone confirmed by Yoma (not an ID check)',
 'Stated by Thandi, not checked',
 'Never pay before the work is done',
 'Who can see this: anyone with the link',
 'Student prototype. Not operated by Yoma or UNICEF. Record signed by YoCard, not by Yoma.'
];

function record(overrides={}){
 return {
  cardId:'ABCDEFGHJK',
  code:'K7PQ2M',
  publishedAt:'2026-11-12T10:05:00.000Z',
  trade:'Hairdresser',
  selfDeclared:{headline:'Braids and cornrows in Khayelitsha',services:[{name:'Braids',priceFrom:150,priceTo:400,currency:'ZAR'},{name:'Cornrows',priceFrom:150,priceTo:null,currency:'ZAR'}],area:'Khayelitsha',hours:'Mon-Sat',languages:['isiXhosa','English'],notes:''},
  confirms:[{text:'Completed Hair Styling with Alison Learning on September 2025; Alison Learning checked the completion automatically.',evidenceIds:['c1']}],
  disclosed:{
   completions:[
    {evidenceId:'c1',opportunityId:'019e6f89-b66b-798e-a380-cbf33d634de5',title:'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro',organizationName:'Alison Learning',organizationLogoURL:null,dateCompleted:'2025-09-18T16:20:00+00:00',opportunityType:'Learning',skills:[{id:'sk1',name:'Cosmetics',infoURL:null}],evidenceTypes:[],live:{verificationMethod:'Automatic',verificationTypes:[],participantCountCompleted:12,yomaInfoURL:'https://app.yoma.world/opportunities/019e6f89-b66b-798e-a380-cbf33d634de5',published:true}},
    {evidenceId:'c3',opportunityId:'019a1062-2518-756d-bc33-1b68b8f67d96',title:'Financial Literacy for Gig Workers',organizationName:'UNICEF Kenya',organizationLogoURL:null,dateCompleted:'2026-01-21T18:47:00+00:00',opportunityType:'Learning',skills:[],evidenceTypes:['FileUpload'],live:null}
   ],
   skills:[{evidenceId:'s1',id:'sk1',name:'Cosmetics',infoURL:'https://lightcast.io/open-skills/skills/KS122FL69C9376N0WS3D',organizations:[{id:'o1',name:'Alison Learning',logoURL:null}]}]
  },
  user:{id:'u-thandi',displayName:'Thandi Mokoena',firstName:'Thandi',photoURL:null,country:'South Africa',city:'Khayelitsha, Cape Town',dateYoIDOnboarded:'2025-02-12T09:41:00+00:00',dateCreated:'2025-02-10T14:03:00+00:00',phoneNumberConfirmed:true,phoneLast3:'147',opportunityCountCompleted:3},
  whatsapp:{enabled:false},
  accountSource:'sample',
  snapshotReadAt:'2026-11-12T10:00:00.000Z',
  generation:{mode:'sample',provider:'local',model:null,generatedAt:'2026-11-12T10:01:00.000Z',durationMs:3,rejected:[]},
  ...overrides
 };
}

test('maskPhone keeps the last three digits only',()=>{
 assert.equal(typeof maskPhone,'function');
 assert.equal(maskPhone('+27735550147'),'••• ••• 147');
 assert.equal(maskPhone('+254712550183'),'••• ••• 183');
 assert.equal(maskPhone(''),'');
 assert.equal(maskPhone(null),'');
});

test('waLink is null when WhatsApp is off and a wa.me link with the greeting when on',()=>{
 assert.equal(typeof waLink,'function');
 assert.equal(waLink(record()),null);
 const link=waLink(record({whatsapp:{enabled:true,number:'+27735550147'}}));
 assert.ok(link.startsWith('https://wa.me/27735550147?text='),link);
 assert.equal(decodeURIComponent(link.split('?text=')[1]),'Hi Thandi, I saw your YoCard K7PQ2M');
 assert.equal(waLink(record({whatsapp:{enabled:true,number:'not a number'}})),null);
});

test('publicPage contains every fixed string, the masked phone, the check form and OpenGraph tags',()=>{
 assert.equal(typeof publicPage,'function');
 const html=publicPage({record:record(),status:'ok',publicUrl:PUBLIC_URL});
 for(const text of FIXED)assert.ok(html.includes(text),'missing: '+text);
 assert.ok(html.includes('••• ••• 147'));
 assert.ok(!html.includes('+27735550147'));
 assert.ok(!html.includes('27735550147'));
 assert.ok(!html.includes('wa.me'));
 assert.ok(html.includes('<form method="post" action="/c/ABCDEFGHJK/check"'));
 assert.ok(html.includes('<meta property="og:title" content="Thandi Mokoena · Hairdresser · YoCard">'));
 assert.ok(html.includes('<meta property="og:image" content="https://yocard.example/c/ABCDEFGHJK.svg">'));
 assert.ok(html.includes('og:description'));
 assert.ok(html.includes('Completed Hair Styling with Alison Learning'));
 assert.ok(html.includes('/c/ABCDEFGHJK.json'));
 assert.ok(html.includes('Hair Styling: Blow-Dry, Cut, and Colour Like a Pro'));
 assert.ok(html.includes('https://app.yoma.world/opportunities/019e6f89-b66b-798e-a380-cbf33d634de5'));
 assert.ok(html.includes('Cosmetics'));
 assert.ok(html.includes('awarded by Alison Learning'));
 assert.ok(html.includes('R150'),'prices rendered');
 assert.ok(html.includes('Yo-ID since February 2025'));
 assert.ok(html.includes('On Yoma since 2025'));
 assert.ok(html.includes('3 verified completions'));
 assert.ok(html.includes('12 November 2026'));
 assert.ok(html.includes('--accent:#41204b'));
 assert.ok(!html.includes('text-transform'));
 assert.ok(html.includes('border-radius:9999px'));
 assert.ok(html.includes('--bg:#f3f6fa'));
 assert.ok(html.includes('fonts.googleapis.com/css2?family=Nunito'));
 assert.ok(html.includes('.stated{border-left:6px solid var(--grey)'));
 assert.ok(!html.includes('.stated{background'));
 assert.ok(Buffer.byteLength(html)<40*1024,'page under 40 KB');
});

test('publicPage shows the WhatsApp button only when enabled, with the full number only inside the wa.me link',()=>{
 const html=publicPage({record:record({whatsapp:{enabled:true,number:'+27735550147'}}),status:'ok',publicUrl:PUBLIC_URL});
 assert.ok(html.includes('https://wa.me/27735550147?text='));
 assert.ok(html.includes('Message on WhatsApp'));
 assert.ok(!html.includes('+27735550147'));
 assert.ok(html.includes('••• ••• 147'));
 const links=html.match(/27735550147/g)||[];
 assert.equal(links.length,1,'the full number appears once, inside the wa.me link');
});

test('publicPage renders "No services listed yet" for an empty self-declared block and still shows the confirmed tier (Review Focus 1)',()=>{
 const html=publicPage({record:record({selfDeclared:{headline:'',services:[],area:'',hours:'',languages:[],notes:''}}),status:'ok',publicUrl:PUBLIC_URL});
 assert.ok(html.includes('No services listed yet'));
 assert.ok(html.includes('Confirmed from Yoma'));
 assert.ok(html.includes('Hair Styling: Blow-Dry, Cut, and Colour Like a Pro'));
 assert.ok(html.includes('Stated by Thandi, not checked'));
});

test('publicPage says when opportunity details could not be checked with Yoma (Review Focus 2)',()=>{
 const html=publicPage({record:record(),status:'ok',publicUrl:PUBLIC_URL});
 assert.ok(html.includes('Opportunity details could not be checked with Yoma'));
 assert.ok(html.includes('Financial Literacy for Gig Workers'));
});

test('publicPage escapes worker text and never injects raw HTML',()=>{
 const rec=record({selfDeclared:{headline:'<script>alert(1)</script>',services:[{name:'"Braids" & more',priceFrom:150,priceTo:null,currency:'ZAR'}],area:'',hours:'',languages:[],notes:''}});
 rec.user={...rec.user,displayName:'Thandi <b>Mokoena</b>'};
 const html=publicPage({record:rec,status:'ok',publicUrl:PUBLIC_URL});
 assert.ok(!html.includes('<script>alert(1)</script>'));
 assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
 assert.ok(!html.includes('<b>Mokoena</b>'));
 assert.ok(html.includes('&quot;Braids&quot; &amp; more'));
});

test('publicPage renders an inline check result, and the unavailable state as grey text',()=>{
 const ok=publicPage({record:record(),status:'ok',publicUrl:PUBLIC_URL,check:{checkedAt:'2026-11-12T11:00:00.000Z',simulated:true,signals:[{key:'account_exists',label:'Yoma account exists',ok:true,detail:''},{key:'completion:c1',label:'Hair Styling',ok:false,detail:'Not found on the account any more'}]}});
 assert.ok(ok.includes('Yoma account exists'));
 assert.ok(ok.includes('Not found on the account any more'));
 assert.ok(/simulated/i.test(ok));
 const down=publicPage({record:record(),status:'ok',publicUrl:PUBLIC_URL,check:{checkedAt:'2026-11-12T11:00:00.000Z',unavailable:true}});
 assert.ok(down.includes('Could not check with Yoma right now'));
});

test('withdrawn and not-found pages carry their fixed strings and no WhatsApp button',()=>{
 assert.equal(typeof withdrawnPage,'function');
 assert.equal(typeof notFoundPage,'function');
 const gone=withdrawnPage(record({whatsapp:{enabled:true,number:'+27735550147'}}),{withdrawnAt:'2026-11-13T08:00:00.000Z'});
 assert.ok(gone.includes('This card was withdrawn by its owner on 13 November 2026'));
 assert.ok(!gone.includes('wa.me'));
 assert.ok(!gone.includes('27735550147'));
 const viaStatus=publicPage({record:record({whatsapp:{enabled:true,number:'+27735550147'}}),status:'withdrawn',withdrawn:{withdrawnAt:'2026-11-13T08:00:00.000Z'},publicUrl:PUBLIC_URL});
 assert.ok(viaStatus.includes('This card was withdrawn by its owner on'));
 assert.ok(!viaStatus.includes('wa.me'));
 const missing=notFoundPage();
 assert.ok(missing.includes('No card with this code'));
 assert.ok(missing.includes('Student prototype. Not operated by Yoma or UNICEF. Record signed by YoCard, not by Yoma.'));
});

test('cardSvg is a 1080x1350 image with the name, trade, QR path, code and the not-proof line',()=>{
 assert.equal(typeof cardSvg,'function');
 const svg=cardSvg({record:record(),publicUrl:PUBLIC_URL,qrSvgFn:qrSvg});
 assert.ok(svg.startsWith('<svg'));
 assert.ok(svg.includes('viewBox="0 0 1080 1350"'));
 assert.ok(svg.includes('Thandi Mokoena'));
 assert.ok(svg.includes('Hairdresser'));
 assert.ok(svg.includes('<path'));
 assert.ok(svg.includes('K7PQ2M'));
 assert.ok(svg.includes('This image is not proof, open the link'));
 assert.ok(svg.includes('yocard.example/c/ABCDEFGHJK'));
 assert.ok(svg.includes('Phone confirmed by Yoma (not an ID check)'));
 assert.ok(svg.includes('Braids'));
 assert.ok(!svg.includes('27735550147'));
 assert.ok(svg.includes('fill="#41204b"'));
 assert.ok(svg.includes('Confirmed from Yoma'));
 assert.ok(!svg.includes('CONFIRMED FROM YOMA'));
 assert.ok(svg.includes('rx="16"'));
});

test('cardSvg escapes text, uses the injected QR function and shows the empty state',()=>{
 const calls=[];
 const fakeQr=(text,opts)=>{calls.push({text,opts});return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><path d="M0 0h1v1h-1z"/></svg>';};
 const rec=record({selfDeclared:{headline:'',services:[],area:'',hours:'',languages:[],notes:''}});
 rec.user={...rec.user,displayName:'Thandi <Mokoena> & co'};
 const svg=cardSvg({record:rec,publicUrl:PUBLIC_URL,qrSvgFn:fakeQr});
 assert.equal(calls.length,1);
 assert.equal(calls[0].text,'https://yocard.example/c/ABCDEFGHJK');
 assert.ok(svg.includes('Thandi &lt;Mokoena&gt; &amp; co'));
 assert.ok(!svg.includes('<Mokoena>'));
 assert.ok(svg.includes('No services listed yet'));
 const gone=cardSvg({record:rec,publicUrl:PUBLIC_URL,qrSvgFn:fakeQr,withdrawn:true});
 assert.ok(gone.includes('withdrawn'));
 assert.ok(!gone.includes('Braids'));
});

test('cardSvg shows the fixed strings whole: the stated-by line clips the name, not the sentence, and the footer is centred',()=>{
 const fakeQr=()=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><path d="M0 0h1v1h-1z"/></svg>';
 const svg=cardSvg({record:record(),publicUrl:PUBLIC_URL,qrSvgFn:fakeQr});
 assert.ok(svg.includes('>Stated by Thandi, not checked<'),'the stated-by line is verbatim, matching the HTML');
 assert.ok(!svg.includes('STATED BY'));
 const footer=/<text x="540" y="\d+" [^>]*font-size="18"[^>]*text-anchor="middle">Student prototype\. Not operated by Yoma or UNICEF\. Record signed by YoCard, not by Yoma\.<\/text>/;
 assert.match(svg,footer);
 const rec=record();
 rec.user={...rec.user,firstName:'Nomvula-Precious Mahlangu-Khumalo',displayName:'Nomvula-Precious Mahlangu-Khumalo'};
 const long=cardSvg({record:rec,publicUrl:PUBLIC_URL,qrSvgFn:fakeQr});
 const line=/>Stated by ([^<]*), not checked</.exec(long);
 assert.ok(line,'the long first name keeps the ", not checked" part on the image');
 assert.ok(line[1].length<=18,line[1]);
 assert.ok(line[1].startsWith('Nomvula-Precious'));
});

test('public page nudges an empty-state card to Yoma opportunities for the trade',()=>{
 const {publicPage}=require('../server/card/render.js');
 const record={cardId:'ABCDEFGHJK',code:'ABC234',publishedAt:'2026-11-12T10:00:00Z',trade:'Cleaner',selfDeclared:{headline:'',services:[],area:'Durban',hours:'',languages:[],notes:''},confirms:[],disclosed:{completions:[],skills:[]},user:{displayName:'Sipho Dlamini',firstName:'Sipho',photoURL:null,country:'ZA',city:'Durban',dateYoIDOnboarded:'2026-01-01T00:00:00Z',dateCreated:'2026-01-01T00:00:00Z',phoneNumberConfirmed:true,phoneLast3:'131',opportunityCountCompleted:0},whatsapp:{enabled:false},accountSource:'sample',personaId:'sipho',snapshotReadAt:'2026-11-12T10:00:00Z',generation:null};
 const html=publicPage({record,publicUrl:'http://127.0.0.1:4173'});
 assert.match(html,/No completed opportunities shared on this card\./);
 assert.match(html,/https:\/\/yoma\.world\/opportunities\?query=Cleaner/);
 assert.match(html,/Find verified opportunities for cleaner on Yoma/);
 assert.match(html,/No services listed yet/);
});

test('sample-persona cards are labelled as fictional on the public page and in the SVG; token-backed cards are not',()=>{
 const sentence='Fictional sample account: this card was built from a sample persona, not a real Yoma user. The completions reference real Yoma opportunities.';
 assert.equal(render.STRINGS.sampleAccount,sentence);
 assert.equal(render.STRINGS.sampleSvg,'Sample card · fictional persona');
 const sampleHtml=publicPage({record:record({accountSource:'sample'}),status:'ok',publicUrl:PUBLIC_URL});
 assert.ok(sampleHtml.includes(sentence),'sample page carries the sample sentence');
 assert.ok(sampleHtml.indexOf(sentence)>sampleHtml.indexOf("Read from Thandi's Yoma account on"),'sample sentence follows the header line');
 assert.ok(sampleHtml.indexOf(sentence)<sampleHtml.indexOf('Confirmed from Yoma'),'sample sentence precedes the confirmed section');
 const tokenHtml=publicPage({record:record({accountSource:'token'}),status:'ok',publicUrl:PUBLIC_URL});
 assert.ok(!tokenHtml.includes(sentence),'token page has no sample sentence');
 assert.ok(!tokenHtml.includes('sample persona'));
 const sampleSvg=cardSvg({record:record({accountSource:'sample'}),publicUrl:PUBLIC_URL,qrSvgFn:qrSvg});
 assert.ok(sampleSvg.includes('Sample card · fictional persona'));
 assert.ok(!sampleSvg.includes('A work card read from a Yoma account'));
 const tokenSvg=cardSvg({record:record({accountSource:'token'}),publicUrl:PUBLIC_URL,qrSvgFn:qrSvg});
 assert.ok(tokenSvg.includes('A work card read from a Yoma account'));
 assert.ok(!tokenSvg.includes('fictional persona'));
 const withdrawnSvg=cardSvg({record:record({accountSource:'sample'}),publicUrl:PUBLIC_URL,qrSvgFn:qrSvg,withdrawn:true});
 assert.ok(withdrawnSvg.includes('This card was withdrawn by its owner.'));
 assert.ok(!sampleHtml.includes('verified by Yoma'));
});
