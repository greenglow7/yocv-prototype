'use strict';
// QR code encoder written in-repo for YoCard (spec section 3.8): ISO/IEC 18004 byte mode,
// versions 1 to 10, levels L/M/Q/H, Reed-Solomon over GF(256), eight masks scored by penalty,
// BCH-protected format and version information. No external code.

// Error-correction level: index into the tables below and the two-bit format indicator.
const LEVELS={L:{index:0,bits:0b01},M:{index:1,bits:0b00},Q:{index:2,bits:0b11},H:{index:3,bits:0b10}};
const MAX_VERSION=10;

// EC codewords per block, indexed [level][version] (version 0 unused).
const EC_PER_BLOCK=[
 [0,7,10,15,20,26,18,20,24,30,18],   // L
 [0,10,16,26,18,24,16,18,22,22,26],  // M
 [0,13,22,18,26,18,24,18,22,20,24],  // Q
 [0,17,28,22,16,22,28,26,26,24,28]]; // H
// Number of EC blocks, indexed [level][version].
const EC_BLOCKS=[
 [0,1,1,1,1,1,2,2,2,2,4],  // L
 [0,1,1,1,2,2,4,4,4,5,5],  // M
 [0,1,1,2,2,4,4,6,6,8,8],  // Q
 [0,1,1,2,4,4,4,5,6,8,8]]; // H
// Alignment pattern centre coordinates per version.
const ALIGNMENT=[[],[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

// ---- GF(256) with the QR primitive polynomial x^8+x^4+x^3+x^2+1 (0x11d) ----
const GF={exp:new Uint8Array(512),log:new Uint8Array(256)};
(function buildGf(){
 let x=1;
 for(let i=0;i<255;i++){
  GF.exp[i]=x; GF.log[x]=i;
  x<<=1; if(x&0x100)x^=0x11d;
 }
 for(let i=255;i<512;i++)GF.exp[i]=GF.exp[i-255];
})();
function gfMul(a,b){
 if(a===0||b===0)return 0;
 return GF.exp[GF.log[a]+GF.log[b]];
}

// Generator polynomial of degree n: product of (x - alpha^i) for i in 0..n-1, highest power first.
const generatorCache=new Map();
function rsGenerator(n){
 if(generatorCache.has(n))return generatorCache.get(n);
 let poly=[1];
 for(let i=0;i<n;i++){
  const next=new Array(poly.length+1).fill(0);
  for(let j=0;j<poly.length;j++){
   next[j]^=poly[j];
   next[j+1]^=gfMul(poly[j],GF.exp[i]);
  }
  poly=next;
 }
 generatorCache.set(n,poly);
 return poly;
}

// Reed-Solomon remainder of data * x^n modulo the generator: n EC codewords.
function rsEncode(data,n){
 const gen=rsGenerator(n);
 const rem=new Array(n).fill(0);
 for(const byte of data){
  const factor=byte^rem[0];
  rem.shift(); rem.push(0);
  if(factor!==0)for(let i=0;i<n;i++)rem[i]^=gfMul(gen[i+1],factor);
 }
 return rem;
}

// ---- Capacity ----
function totalCodewords(version){
 let modules=(16*version+128)*version+64;
 if(version>=2){
  const n=Math.floor(version/7)+2;
  modules-=(25*n-10)*n-55;
  if(version>=7)modules-=36;
 }
 return Math.floor(modules/8);
}
function dataCodewords(version,levelIndex){
 return totalCodewords(version)-EC_PER_BLOCK[levelIndex][version]*EC_BLOCKS[levelIndex][version];
}
function countBits(version){return version<=9?8:16;}
function byteCapacity(version,levelIndex){
 return Math.floor((dataCodewords(version,levelIndex)*8-4-countBits(version))/8);
}

// ---- BCH codes ----
// 15-bit format information: 5 data bits (level, mask) + 10 BCH bits (generator 0x537), XOR 0x5412.
function bchFormat(levelBits,mask){
 const data=(levelBits<<3)|mask;
 let rem=data;
 for(let i=0;i<10;i++)rem=(rem<<1)^((rem>>>9)*0x537);
 return ((data<<10)|rem)^0x5412;
}
// 18-bit version information: 6 version bits + 12 BCH bits (generator 0x1F25).
function versionBits(version){
 let rem=version;
 for(let i=0;i<12;i++)rem=(rem<<1)^((rem>>>11)*0x1F25);
 return (version<<12)|rem;
}

// ---- Bit buffer and data segment ----
function appendBits(bits,value,length){
 for(let i=length-1;i>=0;i--)bits.push((value>>>i)&1);
}
function buildDataCodewords(bytes,version,levelIndex){
 const bits=[];
 appendBits(bits,0b0100,4);
 appendBits(bits,bytes.length,countBits(version));
 for(const b of bytes)appendBits(bits,b,8);
 const capacity=dataCodewords(version,levelIndex)*8;
 appendBits(bits,0,Math.min(4,capacity-bits.length));
 while(bits.length%8!==0)bits.push(0);
 const out=[];
 for(let i=0;i<bits.length;i+=8){
  let byte=0;
  for(let j=0;j<8;j++)byte=(byte<<1)|bits[i+j];
  out.push(byte);
 }
 for(let pad=0xEC;out.length<capacity/8;pad^=0xEC^0x11)out.push(pad);
 return out;
}

// Split into blocks, compute EC per block, interleave data then EC.
function interleave(data,version,levelIndex){
 const numBlocks=EC_BLOCKS[levelIndex][version];
 const ecLen=EC_PER_BLOCK[levelIndex][version];
 const total=totalCodewords(version);
 const shortBlocks=numBlocks-(total%numBlocks);
 const shortLen=Math.floor(total/numBlocks)-ecLen;
 const blocks=[];
 let offset=0;
 for(let b=0;b<numBlocks;b++){
  const len=shortLen+(b<shortBlocks?0:1);
  const chunk=data.slice(offset,offset+len);
  offset+=len;
  blocks.push({data:chunk,ec:rsEncode(chunk,ecLen)});
 }
 const out=[];
 const longest=shortLen+1;
 for(let i=0;i<longest;i++)for(const block of blocks)if(i<block.data.length)out.push(block.data[i]);
 for(let i=0;i<ecLen;i++)for(const block of blocks)out.push(block.ec[i]);
 return out;
}

// ---- Matrix ----
function createMatrix(size){
 const modules=[],isFunction=[];
 for(let r=0;r<size;r++){
  modules.push(new Array(size).fill(false));
  isFunction.push(new Array(size).fill(false));
 }
 return {size,modules,isFunction};
}
function setFunction(m,row,col,dark){
 m.modules[row][col]=dark;
 m.isFunction[row][col]=true;
}
function drawFinder(m,row,col){
 for(let dr=-4;dr<=4;dr++)for(let dc=-4;dc<=4;dc++){
  const r=row+dr,c=col+dc;
  if(r<0||c<0||r>=m.size||c>=m.size)continue;
  const dist=Math.max(Math.abs(dr),Math.abs(dc));
  setFunction(m,r,c,dist!==2&&dist!==4);
 }
}
function drawAlignment(m,row,col){
 for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
  setFunction(m,row+dr,col+dc,Math.max(Math.abs(dr),Math.abs(dc))!==1);
 }
}
// Writes the 15 format bits into both copies; also used to reserve the areas before masking.
function drawFormat(m,bits){
 const bit=i=>((bits>>>i)&1)===1;
 for(let i=0;i<=5;i++)setFunction(m,i,8,bit(i));
 setFunction(m,7,8,bit(6));
 setFunction(m,8,8,bit(7));
 setFunction(m,8,7,bit(8));
 for(let i=9;i<15;i++)setFunction(m,8,14-i,bit(i));
 const size=m.size;
 for(let i=0;i<8;i++)setFunction(m,8,size-1-i,bit(i));
 for(let i=8;i<15;i++)setFunction(m,size-15+i,8,bit(i));
 setFunction(m,size-8,8,true); // dark module at (4*version+9, 8)
}
function drawVersion(m,version){
 if(version<7)return;
 const bits=versionBits(version);
 for(let i=0;i<18;i++){
  const dark=((bits>>>i)&1)===1;
  const a=m.size-11+(i%3), b=Math.floor(i/3);
  setFunction(m,a,b,dark);
  setFunction(m,b,a,dark);
 }
}
function placeFunctionPatterns(m,version){
 const size=m.size;
 for(let i=0;i<size;i++){
  setFunction(m,6,i,i%2===0);
  setFunction(m,i,6,i%2===0);
 }
 drawFinder(m,3,3);
 drawFinder(m,3,size-4);
 drawFinder(m,size-4,3);
 const align=ALIGNMENT[version];
 for(let i=0;i<align.length;i++)for(let j=0;j<align.length;j++){
  const onFinder=(i===0&&j===0)||(i===0&&j===align.length-1)||(i===align.length-1&&j===0);
  if(!onFinder)drawAlignment(m,align[i],align[j]);
 }
 drawFormat(m,0);
 drawVersion(m,version);
}

// Zigzag placement of codeword bits over the non-function modules, two columns at a time from the right.
function placeData(m,codewords){
 const size=m.size;
 const totalBits=codewords.length*8;
 let i=0;
 for(let right=size-1;right>=1;right-=2){
  if(right===6)right=5;
  for(let vert=0;vert<size;vert++){
   for(let j=0;j<2;j++){
    const col=right-j;
    const upward=((right+1)&2)===0;
    const row=upward?size-1-vert:vert;
    if(!m.isFunction[row][col]&&i<totalBits){
     m.modules[row][col]=((codewords[i>>>3]>>>(7-(i&7)))&1)===1;
     i++;
    }
   }
  }
 }
}

const MASKS=[
 (r,c)=>(r+c)%2===0,
 (r,c)=>r%2===0,
 (r,c)=>c%3===0,
 (r,c)=>(r+c)%3===0,
 (r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,
 (r,c)=>(r*c)%2+(r*c)%3===0,
 (r,c)=>((r*c)%2+(r*c)%3)%2===0,
 (r,c)=>((r+c)%2+(r*c)%3)%2===0];

// XORs the mask over every non-function module; applying it twice restores the matrix.
function applyMask(m,mask){
 const fn=MASKS[mask];
 for(let r=0;r<m.size;r++)for(let c=0;c<m.size;c++){
  if(!m.isFunction[r][c]&&fn(r,c))m.modules[r][c]=!m.modules[r][c];
 }
}

// Penalty rules N1=3 (runs of 5+), N2=3 (2x2 blocks), N3=40 (finder-like 1:1:3:1:1 with 4 light modules), N4=10 (dark balance).
const N1=3,N2=3,N3=40,N4=10;
function lineRunsPenalty(line){
 let penalty=0;
 let run=1;
 for(let i=1;i<=line.length;i++){
  if(i<line.length&&line[i]===line[i-1]){run++;continue;}
  if(run>=5)penalty+=N1+(run-5);
  run=1;
 }
 // finder-like patterns: 10111010000 or 00001011101
 const bits=line.map(x=>x?'1':'0').join('');
 for(let i=0;i+11<=bits.length;i++){
  const w=bits.slice(i,i+11);
  if(w==='10111010000'||w==='00001011101')penalty+=N3;
 }
 return penalty;
}
function penalty(m){
 const {size,modules}=m;
 let score=0;
 for(let r=0;r<size;r++)score+=lineRunsPenalty(modules[r]);
 for(let c=0;c<size;c++){
  const col=new Array(size);
  for(let r=0;r<size;r++)col[r]=modules[r][c];
  score+=lineRunsPenalty(col);
 }
 for(let r=0;r<size-1;r++)for(let c=0;c<size-1;c++){
  const v=modules[r][c];
  if(v===modules[r][c+1]&&v===modules[r+1][c]&&v===modules[r+1][c+1])score+=N2;
 }
 let dark=0;
 for(const row of modules)for(const cell of row)if(cell)dark++;
 const percent=dark*100/(size*size);
 const prev=Math.floor(percent/5)*5, next=prev+5;
 score+=Math.min(Math.abs(prev-50),Math.abs(next-50))/5*N4;
 return score;
}

// ---- Public API ----
function encodeQr(text,{level='M'}={}){
 if(typeof text!=='string')throw new TypeError('text must be a string');
 const lvl=LEVELS[String(level).toUpperCase()];
 if(!lvl)throw new RangeError(`unknown error-correction level: ${level}`);
 const bytes=Array.from(Buffer.from(text,'utf8'));
 let version=0;
 for(let v=1;v<=MAX_VERSION;v++){
  if(bytes.length<=byteCapacity(v,lvl.index)){version=v;break;}
 }
 if(!version)throw new RangeError(`text of ${bytes.length} bytes does not fit QR version ${MAX_VERSION} at level ${level}`);

 const codewords=interleave(buildDataCodewords(bytes,version,lvl.index),version,lvl.index);
 const size=17+4*version;
 const m=createMatrix(size);
 placeFunctionPatterns(m,version);
 placeData(m,codewords);

 let best=-1,bestScore=Infinity;
 for(let mask=0;mask<8;mask++){
  applyMask(m,mask);
  drawFormat(m,bchFormat(lvl.bits,mask));
  const score=penalty(m);
  if(score<bestScore){bestScore=score;best=mask;}
  applyMask(m,mask);
 }
 applyMask(m,best);
 drawFormat(m,bchFormat(lvl.bits,best));
 return {version,size,mask:best,level:String(level).toUpperCase(),modules:m.modules};
}

function qrSvg(text,{cellSize=4,margin=4,level='M',dark='#1a1024',light='#ffffff'}={}){
 const {size,modules}=encodeQr(text,{level});
 const total=(size+2*margin)*cellSize;
 const parts=[];
 for(let r=0;r<size;r++)for(let c=0;c<size;c++){
  if(modules[r][c])parts.push(`M${(c+margin)*cellSize} ${(r+margin)*cellSize}h${cellSize}v${cellSize}h-${cellSize}z`);
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}" shape-rendering="crispEdges" role="img" aria-label="QR code">`+
  `<rect width="${total}" height="${total}" fill="${light}"/>`+
  `<path d="${parts.join('')}" fill="${dark}"/>`+
  `</svg>`;
}

module.exports={encodeQr,qrSvg,byteCapacity,MAX_VERSION};
