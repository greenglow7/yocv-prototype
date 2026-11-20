'use strict';
// A finished CvState for Thandi (plan Shared shapes): her sample record as readCvRecord gives it, the cv-thandi
// fixture entry, its template proposal accepted, three skills and the profile line accepted. A fresh object per call.
const FIXTURE=require('../fixtures/cv-thandi.json');
const ORG='Alison Learning';
const completion=(n,title,organizationName,dateCompleted,month,opportunityId,skill)=>({evidenceId:'c'+n,title,organizationName,dateCompleted,month,opportunityId,skills:[skill]});
const credential=(n,c)=>({id:'w'+n,walletId:'sample-cred-thandi-'+n,title:c.title,issuer:c.organizationName,dateIssued:c.dateCompleted,month:c.month,skills:c.skills.map(s=>s.name),completionId:c.evidenceId});
const yoma=ref=>({level:'S1',label:'Confirmed from Yoma',kind:'completion',ref});
const customer=ref=>({level:'S2',kind:'customer',ref,label:'Vouched by a customer, confirmed by them, not by Yoma'});

function sampleState(){
  const completions=[
    completion(1,'Hair Styling: Blow-Dry, Cut, and Colour Like a Pro',ORG,'2025-09-18T16:20:00+00:00','September 2025','019e6f89-b66b-798e-a380-cbf33d634de5',
      {id:'6e85a30a-008b-4340-a3de-eeb8e7f7ce88',name:'Cosmetics',infoURL:'https://lightcast.io/open-skills/skills/KS122FL69C9376N0WS3D'}),
    completion(2,'Customer Care Skills and Telephone Etiquette',ORG,'2025-10-06T11:05:00+00:00','October 2025','019e6f11-51ae-7a56-bbdd-9ee548b58cda',
      {id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://lightcast.io/open-skills/skills/KS121Z26S4VJLQ1WXN21'}),
    completion(3,'Financial Literacy for Gig Workers','UNICEF Kenya','2026-01-21T18:47:00+00:00','January 2026','019a1062-2518-756d-bc33-1b68b8f67d96',
      {id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS'})
  ];
  const entry=JSON.parse(JSON.stringify(FIXTURE.entry));
  return {
    step:3,maxStep:3,sessionId:'a'.repeat(24),selector:{persona:'thandi'},
    record:{
      source:'sample',fictional:true,
      user:{id:'4c1d6f2e-8b3a-4e57-9d21-7f0a5c3b9e61',firstName:'Thandi',displayName:'Thandi Mokoena',city:'Khayelitsha, Cape Town',phoneNumber:'+27735550147'},
      completions,credentials:completions.map((c,i)=>credential(i+1,c)),selfAttested:[],credentialsLeftOut:[],wallet:'sample'
    },
    role:'Hairdresser',
    include:{completions:['c1','c2'],credentials:['w1','w2'],selfAttested:[]},
    entries:[entry],
    contact:{name:'Thandi Mokoena',phone:'+27735550147',email:'',town:'Khayelitsha, Cape Town',education:''},
    optional:{photo:'',dateOfBirth:'',idNumber:'',stateOfOrigin:''},
    review:{entries:[{index:0,proposals:[{
      text:'Braid hair at home for women in my street, mostly box braids and cornrows for customers a few times a week since March 2025, about 40 customers a week.',
      origin:'template',templateWording:false,sourceQuote:entry.what,sourceFields:['what','forWhom','frequency','months','number'],
      usedNumbers:['2025','40'],highlight:[125,133],checks:['numbers','names','overstatement','opening','length','quote']
    }],rejected:[{kind:'bullet',text:'Braided hair for over 50 customers a week since March 2025.',reason:'invented_number'}],skills:[],needsDetail:false}]},
    decisions:{'0:0':{decision:'accepted'},'skill:Customer Service':{decision:'accepted'},'skill:Cosmetics':{decision:'accepted'},'skill:Hairstyling':{decision:'accepted'},profile:{decision:'accepted'}},
    handAdded:[],
    skills:[
      {name:'Cosmetics',yomaSkill:{...completions[0].skills[0]},level:'S1',label:'Confirmed from Yoma',sources:[yoma('c1')]},
      {name:'Customer Service',yomaSkill:{...completions[1].skills[0]},level:'S1',label:'Confirmed from Yoma',sources:[yoma('c2')]},
      {name:'Hairstyling',yomaSkill:null,level:'S2',label:'Vouched by a customer, confirmed by them, not by Yoma',sources:['V1','V2','V3'].map(customer)}
    ],
    profile:{text:'Hairdresser with cosmetics and customer service recorded on Yoma and 9 months of braiding at home.',months:9},
    generation:{mode:'sample',provider:'local',model:null,durationMs:1},
    offline:false
  };
}

module.exports={sampleState};
