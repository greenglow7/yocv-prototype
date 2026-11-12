const {test}=require('node:test');
const assert=require('node:assert/strict');
let qr={}; try {qr=require('../server/qr.js')}catch{}

// ISO/IEC 18004 Annex C table: 15-bit format information for level M, masks 0..7.
const FORMAT_M=[0b101010000010010,0b101000100100101,0b101111001111100,0b101101101001011,0b100010111111001,0b100000011001110,0b100111110010111,0b100101010100000];
// ISO/IEC 18004 Annex D table: 18-bit version information for versions 7..10.
const VERSION_INFO={7:0x07C94,8:0x085BC,9:0x09A99,10:0x0A4D3};

const FINDER=[
 [1,1,1,1,1,1,1],
 [1,0,0,0,0,0,1],
 [1,0,1,1,1,0,1],
 [1,0,1,1,1,0,1],
 [1,0,1,1,1,0,1],
 [1,0,0,0,0,0,1],
 [1,1,1,1,1,1,1]];

function finderAt(modules,row,col){
 for(let r=0;r<7;r++)for(let c=0;c<7;c++){
  if(modules[row+r][col+c]!==Boolean(FINDER[r][c]))return false;
 }
 return true;
}

// Reads the 15 format bits from the copy around the top-left finder (bit 14 at row 8 col 0, bit 0 at row 0 col 8).
function readFormat(modules){
 const rowCols=[0,1,2,3,4,5,7,8];
 let bits=0;
 for(const c of rowCols)bits=(bits<<1)|(modules[8][c]?1:0);
 for(const r of [7,5,4,3,2,1,0])bits=(bits<<1)|(modules[r][8]?1:0);
 return bits;
}

// Reads the 18 version bits from the block at rows 0..5, cols size-11..size-9 (bit i at row floor(i/3), col size-11+i%3).
function readVersion(modules,size){
 let bits=0;
 for(let i=17;i>=0;i--)bits=(bits<<1)|(modules[Math.floor(i/3)][size-11+(i%3)]?1:0);
 return bits;
}

test('encodeQr exposes version, size, mask and a square boolean matrix',()=>{
 assert.equal(typeof qr.encodeQr,'function');
 const out=qr.encodeQr('HELLO WORLD');
 assert.equal(out.version,1);
 assert.equal(out.size,21);
 assert.ok(Number.isInteger(out.mask)&&out.mask>=0&&out.mask<=7);
 assert.equal(out.modules.length,21);
 for(const row of out.modules){
  assert.equal(row.length,21);
  for(const cell of row)assert.equal(typeof cell,'boolean');
 }
});

test('finder patterns sit at the three corners',()=>{
 const {modules,size}=qr.encodeQr('HELLO WORLD');
 assert.ok(finderAt(modules,0,0));
 assert.ok(finderAt(modules,0,size-7));
 assert.ok(finderAt(modules,size-7,0));
 // separators are light
 for(let i=0;i<8;i++){
  assert.equal(modules[7][i],false);
  assert.equal(modules[i][7],false);
  assert.equal(modules[7][size-1-i],false);
  assert.equal(modules[i][size-8],false);
  assert.equal(modules[size-8][i],false);
  assert.equal(modules[size-1-i][7],false);
 }
});

test('timing patterns alternate between the finders and the dark module is set',()=>{
 for(const text of ['HELLO WORLD','x'.repeat(110)]){
  const {modules,size,version}=qr.encodeQr(text);
  for(let i=8;i<size-8;i++){
   assert.equal(modules[6][i],i%2===0,`row 6 col ${i}`);
   assert.equal(modules[i][6],i%2===0,`col 6 row ${i}`);
  }
  assert.equal(modules[4*version+9][8],true);
 }
});

test('smallest fitting version is chosen at level M',()=>{
 assert.equal(qr.encodeQr('A'.repeat(14)).version,1);
 assert.equal(qr.encodeQr('A'.repeat(15)).version,2);
 assert.equal(qr.encodeQr('A'.repeat(26)).version,2);
 assert.equal(qr.encodeQr('A'.repeat(27)).version,3);
 assert.equal(qr.encodeQr('x'.repeat(213)).version,10);
 assert.throws(()=>qr.encodeQr('x'.repeat(214)),RangeError);
});

test('other levels change capacity: L fits 17 bytes at version 1, H only 7',()=>{
 assert.equal(qr.encodeQr('A'.repeat(17),{level:'L'}).version,1);
 assert.equal(qr.encodeQr('A'.repeat(18),{level:'L'}).version,2);
 assert.equal(qr.encodeQr('A'.repeat(7),{level:'H'}).version,1);
 assert.equal(qr.encodeQr('A'.repeat(8),{level:'H'}).version,2);
 assert.equal(qr.encodeQr('A'.repeat(11),{level:'Q'}).version,1);
 assert.equal(qr.encodeQr('A'.repeat(12),{level:'Q'}).version,2);
});

test('a 73-character public URL encodes at version 4 or above with size 17+4*version (Review Focus 5)',()=>{
 const base='https://yocard-prototype.example.org/informal-work-cards'.padEnd(60,'x');
 const url=`${base}/c/ABCDEFGHJK`;
 assert.equal(url.length,73);
 const out=qr.encodeQr(url);
 assert.ok(out.version>=4,`version ${out.version}`);
 assert.equal(out.size,17+4*out.version);
 assert.equal(out.modules.length,out.size);
});

test('encoding is deterministic',()=>{
 const a=qr.encodeQr('https://example.org/c/ABCDEFGHIJ');
 const b=qr.encodeQr('https://example.org/c/ABCDEFGHIJ');
 assert.deepEqual(a.modules,b.modules);
 assert.equal(a.mask,b.mask);
 assert.equal(a.version,b.version);
});

test('format information matches the BCH table for level M and the reported mask, in both copies',()=>{
 for(const text of ['HELLO WORLD','https://example.org/c/ABCDEFGHIJ','x'.repeat(110)]){
  const {modules,size,mask}=qr.encodeQr(text);
  const expected=FORMAT_M[mask];
  assert.equal(readFormat(modules),expected,`first copy for ${JSON.stringify(text.slice(0,12))}`);
  // second copy: bits 0..7 at row 8, cols size-1..size-8; bits 8..14 at col 8, rows size-7..size-1
  for(let i=0;i<8;i++)assert.equal(modules[8][size-1-i],Boolean((expected>>i)&1),`bit ${i}`);
  for(let i=8;i<15;i++)assert.equal(modules[size-15+i][8],Boolean((expected>>i)&1),`bit ${i}`);
 }
});

test('version information blocks appear for versions 7 to 10 and match the table',()=>{
 const seven=qr.encodeQr('x'.repeat(110));
 assert.equal(seven.version,7);
 assert.equal(readVersion(seven.modules,seven.size),VERSION_INFO[7]);
 const ten=qr.encodeQr('x'.repeat(200));
 assert.equal(ten.version,10);
 assert.equal(readVersion(ten.modules,ten.size),VERSION_INFO[10]);
 // mirrored copy
 for(let i=0;i<18;i++){
  const a=ten.size-11+(i%3), b=Math.floor(i/3);
  assert.equal(ten.modules[a][b],ten.modules[b][a]);
 }
});

test('UTF-8 input counts bytes, not characters',()=>{
 // 'é' is two bytes: 7 of them = 14 bytes (version 1), 8 = 16 bytes (version 2)
 assert.equal(qr.encodeQr('é'.repeat(7)).version,1);
 assert.equal(qr.encodeQr('é'.repeat(8)).version,2);
});

test('qrSvg returns an svg with a viewBox, a light rect and one dark path',()=>{
 assert.equal(typeof qr.qrSvg,'function');
 const svg=qr.qrSvg('https://example.org/c/ABCDEFGHIJ');
 assert.ok(svg.startsWith('<svg'));
 assert.match(svg,/viewBox="0 0 (\d+) \1"/);
 assert.match(svg,/<rect[^>]*fill="#ffffff"/);
 assert.equal((svg.match(/<path/g)||[]).length,1);
 assert.match(svg,/<path[^>]*fill="#1a1024"/);
 assert.ok(svg.trim().endsWith('</svg>'));
 const custom=qr.qrSvg('HELLO WORLD',{cellSize:10,margin:2,dark:'#000000',light:'#eeeeee'});
 // (21 + 2*2) * 10
 assert.match(custom,/viewBox="0 0 250 250"/);
 assert.match(custom,/fill="#000000"/);
 assert.match(custom,/fill="#eeeeee"/);
});
