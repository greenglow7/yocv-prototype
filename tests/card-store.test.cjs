const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
let storeMod={}; try {storeMod=require('../server/card/store.js')}catch{}

const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function tempDir(){return fs.mkdtempSync(path.join(os.tmpdir(),'yocard-store-'));}
const record={code:'ABC123',trade:'hair',selfDeclared:{headline:'Braids'},confirms:[]};

test('createCardStore.create returns a 10-character id from the card alphabet and a 32-hex owner secret',()=>{
 assert.equal(typeof storeMod.createCardStore,'function');
 const store=storeMod.createCardStore(tempDir());
 const {cardId,ownerSecret}=store.create(record);
 assert.equal(cardId.length,10);
 assert.ok([...cardId].every(ch=>ALPHABET.includes(ch)),cardId);
 assert.match(ownerSecret,/^[0-9a-f]{32}$/);
 assert.match(cardId,/^[A-Z2-9]{10}$/);
});

test('create writes <dir>/<cardId>.json holding the hashed secret, never the secret, and stamps the record cardId',()=>{
 const dir=tempDir();
 const now=()=>1762905600000;
 const store=storeMod.createCardStore(dir,{now});
 const {cardId,ownerSecret}=store.create({...record});
 const file=path.join(dir,cardId+'.json');
 assert.ok(fs.existsSync(file));
 const raw=fs.readFileSync(file,'utf8');
 assert.ok(!raw.includes(ownerSecret));
 const entry=JSON.parse(raw);
 assert.equal(entry.cardId,cardId);
 assert.equal(entry.ownerSecretHash,crypto.createHash('sha256').update(ownerSecret).digest('hex'));
 assert.equal(entry.createdAt,new Date(1762905600000).toISOString());
 assert.equal(entry.withdrawnAt,null);
 assert.equal(entry.lastCheck,null);
 assert.equal(entry.record.cardId,cardId);
 assert.equal(entry.record.trade,'hair');
 assert.equal(entry.ownerSecret,undefined);
});

test('create derives the id and secret from the injected random source',()=>{
 const store=storeMod.createCardStore(tempDir(),{random:(n)=>Buffer.alloc(n,0)});
 const {cardId,ownerSecret}=store.create(record);
 assert.equal(cardId,'AAAAAAAAAA');
 assert.equal(ownerSecret,'0'.repeat(32));
});

test('create retries when the random id collides with an existing card',()=>{
 let idDraws=0,secretDraws=0;
 const random=(n)=>{
  if(n===16)return Buffer.alloc(n,++secretDraws);
  idDraws++;
  return Buffer.alloc(n,idDraws<=2?0:7);
 };
 const store=storeMod.createCardStore(tempDir(),{random});
 const a=store.create(record);
 const b=store.create(record);
 assert.equal(a.cardId,'AAAAAAAAAA');
 assert.equal(b.cardId,'HHHHHHHHHH');
 assert.equal(idDraws,3);
 assert.deepEqual(store.list().sort(),[a.cardId,b.cardId].sort());
});

test('get returns the stored entry and null for unknown ids',()=>{
 const store=storeMod.createCardStore(tempDir());
 const {cardId}=store.create(record);
 const entry=store.get(cardId);
 assert.equal(entry.cardId,cardId);
 assert.equal(entry.record.code,'ABC123');
 assert.equal(store.get('ZZZZZZZZZZ'),null);
});

test('get rejects ids outside ^[A-Z2-9]{10}$ without touching the filesystem',()=>{
 const dir=tempDir();
 fs.writeFileSync(path.join(dir,'.keys.json'),'{"secret":true}');
 const store=storeMod.createCardStore(dir);
 for(const bad of ['../x','../.keys','.keys','ABCDEFGHJ','ABCDEFGHJKL','abcdefghjk','ABCDEFGHJ1','ABCDEFGHJ0','ABCDEFGHIJ','ABCDEFGHJK.json','',undefined,null,42,'ABCDEFGHJK/../x']){
  assert.doesNotThrow(()=>store.get(bad));
  assert.equal(store.get(bad),null,String(bad));
 }
});

test('withdraw with the wrong secret returns false and leaves the file unchanged',()=>{
 const dir=tempDir();
 const store=storeMod.createCardStore(dir);
 const {cardId,ownerSecret}=store.create(record);
 const before=fs.readFileSync(path.join(dir,cardId+'.json'),'utf8');
 assert.equal(store.withdraw(cardId,'0'.repeat(32)),false);
 assert.equal(store.withdraw(cardId,ownerSecret.slice(0,31)),false);
 assert.equal(store.withdraw(cardId,''),false);
 assert.equal(store.withdraw(cardId,undefined),false);
 assert.equal(store.withdraw('ZZZZZZZZZZ',ownerSecret),false);
 assert.equal(store.withdraw('../x',ownerSecret),false);
 assert.equal(fs.readFileSync(path.join(dir,cardId+'.json'),'utf8'),before);
 assert.equal(store.get(cardId).withdrawnAt,null);
});

test('withdraw with the right secret returns true and sets withdrawnAt on disk',()=>{
 const dir=tempDir();
 const store=storeMod.createCardStore(dir,{now:()=>1762992000000});
 const {cardId,ownerSecret}=store.create(record);
 assert.equal(store.withdraw(cardId,ownerSecret),true);
 const entry=JSON.parse(fs.readFileSync(path.join(dir,cardId+'.json'),'utf8'));
 assert.equal(entry.withdrawnAt,new Date(1762992000000).toISOString());
 assert.equal(store.get(cardId).withdrawnAt,entry.withdrawnAt);
 assert.equal(store.withdraw(cardId,ownerSecret),true);
 assert.equal(store.get(cardId).withdrawnAt,entry.withdrawnAt);
});

test('touchCheck stores the last check result on the entry',()=>{
 const store=storeMod.createCardStore(tempDir(),{now:()=>1762992000000});
 const {cardId}=store.create(record);
 const result={checkedAt:'2026-11-13T00:00:00.000Z',signals:[{key:'account_exists',ok:true}]};
 assert.equal(store.touchCheck(cardId,result),true);
 assert.deepEqual(store.get(cardId).lastCheck,result);
 assert.equal(store.touchCheck('ZZZZZZZZZZ',result),false);
 assert.equal(store.touchCheck('../x',result),false);
});

test('list returns only card ids, ignoring .keys.json and other files',()=>{
 const dir=tempDir();
 fs.writeFileSync(path.join(dir,'.keys.json'),'{}');
 fs.writeFileSync(path.join(dir,'notes.txt'),'x');
 fs.writeFileSync(path.join(dir,'lowercase.json'),'{}');
 const store=storeMod.createCardStore(dir);
 assert.deepEqual(store.list(),[]);
 const a=store.create(record).cardId;
 const b=store.create(record).cardId;
 assert.deepEqual(store.list().sort(),[a,b].sort());
});

test('createCardStore creates the directory when it does not exist',()=>{
 const dir=path.join(tempDir(),'nested','cards');
 const store=storeMod.createCardStore(dir);
 const {cardId}=store.create(record);
 assert.ok(fs.existsSync(path.join(dir,cardId+'.json')));
});
