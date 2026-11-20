'use strict';
/* The CV as a Word file (spec 10, plan Task 22). The same Cv and the same order as renderCvHtml in core.js: the name,
   the contact line, the optional lines, the profile, Experience, Skills, Learning recorded on Yoma, Education when
   given, the references line, and the sample line last when cv.sample. One column, no table, no text box. The name is
   in Title, each section in Heading1, each entry title in Heading2. Arial 11 point, line height 1.3, margins 18 mm and
   no page size, so A4 and Letter both work. No photo: a picture needs a media part, and the body limit leaves no room.
   Each paragraph also carries its style's properties directly, because some readers (the macOS text system behind
   TextEdit and Quick Look) ignore styles.xml and would show Times 12. */
const {storeZip}=require('../zip.js');

const fill=(t,v={})=>String(t??'').replace(/\{(\w+)\}/g,(m,k)=>v[k]==null?'':String(v[k]));
// XML 1.0 holds tab, newline, return and the code points from U+0020 up, less the surrogates, U+FFFE and U+FFFF.
const NOT_XML=/[^\t\n\r\x20-퟿-�\u{10000}-\u{10FFFF}]/gu;
const esc=v=>String(v??'').replace(NOT_XML,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const XML='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const MARGIN=1020; // 18 mm in twentieths of a point
const TAB={tab:true};

const size=half=>'<w:sz w:val="'+half+'"/><w:szCs w:val="'+half+'"/>';
const FONT='<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>';
const LINE=(before,after)=>'<w:spacing w:before="'+before+'" w:after="'+after+'" w:line="312" w:lineRule="auto"/>';
// Each paragraph kind by style id: its Word name, its paragraph properties and its run properties.
const FORMATS={
  Normal:{name:'Normal',p:LINE(0,40),r:size(22)},
  Title:{name:'Title',p:LINE(0,60),r:'<w:b/>'+size(40)},
  Heading1:{name:'heading 1',p:'<w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="1" w:color="DCE0E5"/></w:pBdr>'+LINE(280,80)+'<w:outlineLvl w:val="0"/>',r:'<w:b/>'+size(26)},
  Heading2:{name:'heading 2',p:'<w:keepNext/>'+LINE(120,20)+'<w:outlineLvl w:val="1"/>',r:'<w:b/>'+size(22)},
  CvBullet:{name:'CV bullet',p:'<w:tabs><w:tab w:val="left" w:pos="360"/></w:tabs>'+LINE(0,40)+'<w:ind w:left="360" w:hanging="360"/>',r:size(22)},
  CvNote:{name:'CV note',p:LINE(240,40),r:size(18)}
};
const run=(f,x)=>'<w:r><w:rPr>'+FONT+f.r+'</w:rPr>'+(x===TAB?'<w:tab/>':'<w:t xml:space="preserve">'+esc(x)+'</w:t>')+'</w:r>';
const para=(t,id='Normal',parts=[t])=>{const f=FORMATS[id];return '<w:p><w:pPr><w:pStyle w:val="'+id+'"/>'+f.p+'</w:pPr>'+parts.map(x=>run(f,x)).join('')+'</w:p>';};
const bullet=t=>para(t,'CvBullet',['•',TAB,t]);

const CONTENT_TYPES=XML+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  +'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
  +'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  +'<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
const rels=(type,target)=>XML+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="'+REL+type+'" Target="'+target+'"/></Relationships>';
const STYLES=XML+'<w:styles '+W+'><w:docDefaults><w:rPrDefault><w:rPr>'+FONT+size(22)+'</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr>'+FORMATS.Normal.p+'</w:pPr></w:pPrDefault></w:docDefaults>'
  +Object.entries(FORMATS).map(([id,f])=>'<w:style w:type="paragraph"'+(id==='Normal'?' w:default="1"':'')+' w:styleId="'+id+'"><w:name w:val="'+f.name+'"/>'
    +(id==='Normal'?'':'<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>')+'<w:qFormat/><w:pPr>'+f.p+'</w:pPr><w:rPr>'+FONT+f.r+'</w:rPr></w:style>').join('')
  +'</w:styles>';

function cvToDocx(cv,copy){
  const p=[para(cv.name,'Title')],contact=[cv.contact?.phone,cv.contact?.email,cv.contact?.town].filter(Boolean).join(' · ');
  if(contact)p.push(para(contact));
  for(const [label,k] of [['cvDateOfBirth','dateOfBirth'],['cvIdNumber','idNumber'],['cvStateOfOrigin','stateOfOrigin']])
    if(cv.optional?.[k])p.push(para(fill(copy.cvOptionalLine,{label:copy[label],value:cv.optional[k]})));
  if(cv.profile)p.push(para(cv.profile));
  if(cv.experience.length){
    p.push(para(copy.cvExperience,'Heading1'));
    for(const e of cv.experience){
      const meta=[e.place,e.months].filter(Boolean).join(' · ');
      p.push(para(e.title,'Heading2'),...(meta?[para(meta)]:[]),...e.bullets.map(bullet));
    }
  }
  if(cv.skills.length)p.push(para(copy.cvSkills,'Heading1'),...cv.skills.map(k=>bullet(fill(copy.cvSkillLine,k))));
  if(cv.learning.length)p.push(para(copy.learningHeading,'Heading1'),...cv.learning.map(bullet));
  if(cv.education)p.push(para(copy.cvEducation,'Heading1'),para(cv.education));
  p.push(para(copy.cvReferences));
  if(cv.sample)p.push(para(copy.cvSampleFooter,'CvNote'));
  const sect='<w:sectPr><w:pgMar w:top="'+MARGIN+'" w:right="'+MARGIN+'" w:bottom="'+MARGIN+'" w:left="'+MARGIN+'" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>';
  const document=XML+'<w:document '+W+'><w:body>'+p.join('')+sect+'</w:body></w:document>';
  return storeZip([
    {name:'[Content_Types].xml',data:Buffer.from(CONTENT_TYPES)},
    {name:'_rels/.rels',data:Buffer.from(rels('officeDocument','word/document.xml'))},
    {name:'word/_rels/document.xml.rels',data:Buffer.from(rels('styles','styles.xml'))},
    {name:'word/document.xml',data:Buffer.from(document)},
    {name:'word/styles.xml',data:Buffer.from(STYLES)}
  ]);
}

module.exports={cvToDocx};
