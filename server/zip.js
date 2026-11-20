'use strict';
/* A store-only zip writer (spec 10): method 0, local headers, the central directory and the end record. Nothing is
   compressed. Every entry carries one fixed time (1980-01-01 00:00), so the same files give the same bytes. No zip64:
   a size or count past its field throws a RangeError from the buffer write. */
const TABLE=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;TABLE[n]=c>>>0;}
function crc32(buf){
  let c=0xFFFFFFFF;
  for(const b of buf)c=TABLE[(c^b)&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
const UTF8_NAMES=0x0800,DOS_TIME=0,DOS_DATE=(1<<5)|1;

function storeZip(files){
  const parts=[],central=[];
  let offset=0;
  for(const {name,data} of files){
    const n=Buffer.from(String(name),'utf8'),d=Buffer.isBuffer(data)?data:Buffer.from(data),crc=crc32(d);
    const l=Buffer.alloc(30),c=Buffer.alloc(46);
    l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(UTF8_NAMES,6);l.writeUInt16LE(0,8);l.writeUInt16LE(DOS_TIME,10);l.writeUInt16LE(DOS_DATE,12);
    l.writeUInt32LE(crc,14);l.writeUInt32LE(d.length,18);l.writeUInt32LE(d.length,22);l.writeUInt16LE(n.length,26);l.writeUInt16LE(0,28);
    c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(UTF8_NAMES,8);c.writeUInt16LE(0,10);c.writeUInt16LE(DOS_TIME,12);c.writeUInt16LE(DOS_DATE,14);
    c.writeUInt32LE(crc,16);c.writeUInt32LE(d.length,20);c.writeUInt32LE(d.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    parts.push(l,n,d);central.push(c,n);
    offset+=30+n.length+d.length;
  }
  const dir=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...parts,dir,end]);
}

module.exports={crc32,storeZip};
