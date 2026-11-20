const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {crc32,storeZip}=require('../server/zip.js');
const {cvToDocx}=require('../server/cv/docx.js');
const {buildCv}=require('../core.js');
const {sampleState}=require('./helpers/cv-state.cjs');
const {bootVouch,raw,skillYoma}=require('./helpers/vouch-boot.cjs');
const copy=require('../cv-copy.js').en;
const DOCX_TYPE='application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// Walks the local file headers and returns each entry's stored bytes, inflating nothing.
function readZip(buf){
  const out=[];
  for(let off=0;off+30<=buf.length&&buf.readUInt32LE(off)===0x04034b50;){
    const size=buf.readUInt32LE(off+18),n=buf.readUInt16LE(off+26),e=buf.readUInt16LE(off+28),start=off+30+n+e;
    out.push({name:buf.toString('utf8',off+30,off+30+n),data:buf.subarray(start,start+size)});
    off=start+size;
  }
  return out;
}

test('crc32 matches the known value',()=>assert.equal(crc32(Buffer.from('123456789')),0xCBF43926));
test('storeZip writes entries a reader can walk',()=>{
  const files=[{name:'a.txt',data:Buffer.from('hello')},{name:'dir/b.xml',data:Buffer.from('<b>ünï</b>')}];
  const buf=storeZip(files);
  let off=0;
  for(const f of files){
    assert.equal(buf.readUInt32LE(off),0x04034b50);
    assert.equal(buf.readUInt16LE(off+8),0,'method 0, stored');
    assert.equal(buf.readUInt32LE(off+14),crc32(f.data));
    assert.equal(buf.readUInt32LE(off+18),f.data.length); assert.equal(buf.readUInt32LE(off+22),f.data.length);
    off+=30+buf.readUInt16LE(off+26)+buf.readUInt16LE(off+28)+f.data.length;
  }
  assert.deepEqual(readZip(buf).map(e=>[e.name,e.data.toString()]),files.map(f=>[f.name,f.data.toString()]));
  const end=buf.length-22;
  assert.equal(buf.readUInt32LE(end),0x06054b50);
  assert.equal(buf.readUInt16LE(end+8),2); assert.equal(buf.readUInt16LE(end+10),2);
  assert.equal(buf.readUInt32LE(end+16),off,'the central directory follows the last entry');
  assert.equal(buf.readUInt32LE(off),0x02014b50);
});
test('cvToDocx holds the five parts and the CV in order',async(t)=>{
  const buf=cvToDocx(buildCv(sampleState(),copy),copy);
  const entries=readZip(buf);
  assert.deepEqual(entries.map(e=>e.name).sort(),['[Content_Types].xml','_rels/.rels','word/_rels/document.xml.rels','word/document.xml','word/styles.xml']);
  const doc=entries.find(e=>e.name==='word/document.xml').data.toString();
  assert.ok(doc.indexOf('Experience')<doc.indexOf('Learning recorded on Yoma')&&doc.includes('w:val="Heading2"'));
  const order=['Thandi Mokoena','Experience','Skills','Learning recorded on Yoma','References available on request','Sample account: fictional, for demonstration'].map(s=>doc.indexOf(s));
  assert.ok(order.every(i=>i>=0)); assert.deepEqual([...order].sort((a,b)=>a-b),order);
  assert.ok(doc.lastIndexOf('<w:p>')<doc.indexOf('Sample account: fictional, for demonstration'),'the sample line is the last paragraph');
  assert.ok(doc.includes('Customer Service (Confirmed from Yoma)')&&!/<w:tbl|qualification|verified by Yoma/i.test(doc));
  assert.ok(entries.find(e=>e.name==='word/_rels/document.xml.rels').data.toString().includes('Target="styles.xml"'));
  const styles=entries.find(e=>e.name==='word/styles.xml').data.toString();
  assert.ok(styles.includes('w:ascii="Arial"')&&styles.includes('<w:sz w:val="22"/>')&&styles.includes('w:styleId="Heading1"')&&styles.includes('w:styleId="Heading2"'));
  await t.test('unzip accepts the file',()=>{
    const hasUnzip=spawnSync('unzip',['-v']).status===0;
    if(!hasUnzip){t.diagnostic('unzip not installed; the reader above checked the file');return;}
    const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'yocv-docx-')),'cv.docx');fs.writeFileSync(file,buf);
    assert.equal(spawnSync('unzip',['-t',file]).status,0);
  });
});
test('cvToDocx escapes values and drops characters XML cannot hold, and prints no sample line for a token record',()=>{
  const cv={...buildCv(sampleState(),copy),name:'Thandi <b>&</b> "M"\u0001',sample:false};
  const doc=readZip(cvToDocx(cv,copy)).find(e=>e.name==='word/document.xml').data.toString();
  assert.ok(doc.includes('Thandi &lt;b&gt;&amp;&lt;/b&gt; &quot;M&quot;</w:t>')&&!doc.includes('\u0001'));
  assert.ok(!doc.includes('Sample account'));
});
test('POST /api/cv/docx answers a Word file, keeps the sample line for a sample account, and refuses a bad body',async()=>{
  const {base}=await bootVouch({yoma:skillYoma()});
  const res=await raw(base,'/api/cv/docx',{cv:{...buildCv(sampleState(),copy),sample:false}});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('content-type'),DOCX_TYPE);
  assert.equal(res.headers.get('content-disposition'),'attachment; filename="cv.docx"');
  assert.equal(res.headers.get('cache-control'),'no-store');
  const doc=readZip(Buffer.from(await res.arrayBuffer())).find(e=>e.name==='word/document.xml').data.toString();
  assert.ok(doc.includes('Thandi Mokoena')&&doc.includes('Sample account: fictional, for demonstration'));
  for(const cv of [null,'x',{name:5},{experience:[{bullets:'x'}]}]){
    const bad=await raw(base,'/api/cv/docx',{cv});
    assert.equal(bad.status,400); assert.deepEqual((await bad.json()).error.fields,['cv']);
  }
  assert.equal((await fetch(base+'/api/cv/docx')).status,405);
});
test('Step 4 offers the Word file from the catalogue, only while the server answers',()=>{
  const s=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  assert.equal(copy.downloadDocx,'Download Word file');
  assert.ok(s.includes('${E(copy.downloadDocx)}')&&s.includes("'/api/cv/docx'")&&!s.includes('Download Word file'));
  assert.ok(/state\.offline\?'':`<button[^`]*download-docx/.test(s),'no Word button offline');
});
