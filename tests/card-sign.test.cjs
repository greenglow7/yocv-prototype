const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
let sign={}; try {sign=require('../server/card/sign.js')}catch{}

function tempDir(){return fs.mkdtempSync(path.join(os.tmpdir(),'yocard-sign-'));}
const record={cardId:'ABCDEFGHJK',code:'ABC123',trade:'hair',selfDeclared:{headline:'Braids'},confirms:[{text:'Completed Hair Styling',evidenceIds:['c1']}]};

test('loadOrCreateKey creates .keys.json once and reuses it on the next load',()=>{
 assert.equal(typeof sign.loadOrCreateKey,'function');
 const dir=tempDir();
 const first=sign.loadOrCreateKey(dir);
 const file=path.join(dir,'.keys.json');
 assert.ok(fs.existsSync(file));
 const stored=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.deepEqual(Object.keys(stored).sort(),['kid','privatePem','publicPem']);
 assert.match(stored.privatePem,/-----BEGIN PRIVATE KEY-----/);
 assert.match(stored.publicPem,/-----BEGIN PUBLIC KEY-----/);
 assert.match(first.kid,/^[0-9a-f]{16}$/);
 assert.equal(first.kid,crypto.createHash('sha256').update(stored.publicPem).digest('hex').slice(0,16));
 assert.equal(first.privateKey.asymmetricKeyType,'ec');
 assert.equal(first.publicKey.asymmetricKeyType,'ec');
 const second=sign.loadOrCreateKey(dir);
 assert.equal(second.kid,first.kid);
 assert.equal(fs.readFileSync(file,'utf8'),JSON.stringify(stored,null,2));
 assert.equal(second.publicKey.export({format:'pem',type:'spki'}),stored.publicPem);
});

test('loadOrCreateKey creates the directory when it does not exist',()=>{
 const dir=path.join(tempDir(),'nested','cards');
 const key=sign.loadOrCreateKey(dir);
 assert.ok(fs.existsSync(path.join(dir,'.keys.json')));
 assert.match(key.kid,/^[0-9a-f]{16}$/);
});

test('signRecord returns a three-part compact JWS with an ES256 header carrying the kid',()=>{
 assert.equal(typeof sign.signRecord,'function');
 const key=sign.loadOrCreateKey(tempDir());
 const jwt=sign.signRecord(key,record,{now:()=>1762905600000});
 const parts=jwt.split('.');
 assert.equal(parts.length,3);
 assert.ok(parts.every(p=>/^[A-Za-z0-9_-]+$/.test(p)));
 const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'));
 assert.deepEqual(header,{alg:'ES256',typ:'JWT',kid:key.kid});
 const payload=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
 assert.equal(payload.iss,'yocard-prototype');
 assert.equal(payload.sub,'ABCDEFGHJK');
 assert.equal(payload.iat,1762905600);
 assert.deepEqual(payload.record,record);
 assert.equal(Buffer.from(parts[2],'base64url').length,64);
});

test('verifyJwt returns the payload with the record intact',()=>{
 assert.equal(typeof sign.verifyJwt,'function');
 const key=sign.loadOrCreateKey(tempDir());
 const jwt=sign.signRecord(key,record);
 const payload=sign.verifyJwt(key,jwt);
 assert.ok(payload);
 assert.equal(payload.iss,'yocard-prototype');
 assert.equal(payload.sub,record.cardId);
 assert.equal(typeof payload.iat,'number');
 assert.deepEqual(payload.record,record);
});

test('verifyJwt returns null when one payload character is tampered with',()=>{
 const key=sign.loadOrCreateKey(tempDir());
 const jwt=sign.signRecord(key,record);
 const [h,p,s]=jwt.split('.');
 const flipped=p[5]==='A'?'B':'A';
 const tampered=h+'.'+p.slice(0,5)+flipped+p.slice(6)+'.'+s;
 assert.notEqual(tampered,jwt);
 assert.equal(sign.verifyJwt(key,tampered),null);
});

test('verifyJwt returns null for malformed input, a foreign key, a wrong algorithm or a bad signature',()=>{
 const key=sign.loadOrCreateKey(tempDir());
 const other=sign.loadOrCreateKey(tempDir());
 const jwt=sign.signRecord(key,record);
 assert.equal(sign.verifyJwt(key,'not.a.jwt'),null);
 assert.equal(sign.verifyJwt(key,''),null);
 assert.equal(sign.verifyJwt(key,undefined),null);
 assert.equal(sign.verifyJwt(key,jwt+'x'),null);
 assert.equal(sign.verifyJwt(other,jwt),null);
 const [,p,s]=jwt.split('.');
 const noneHeader=Buffer.from(JSON.stringify({alg:'none',typ:'JWT',kid:key.kid})).toString('base64url');
 assert.equal(sign.verifyJwt(key,noneHeader+'.'+p+'.'+s),null);
 assert.equal(sign.verifyJwt(key,noneHeader+'.'+p+'.'),null);
});

test('jwks exposes the public key as an EC P-256 signing key with the kid',()=>{
 assert.equal(typeof sign.jwks,'function');
 const key=sign.loadOrCreateKey(tempDir());
 const set=sign.jwks(key);
 assert.ok(Array.isArray(set.keys));
 assert.equal(set.keys.length,1);
 const jwk=set.keys[0];
 assert.equal(jwk.kty,'EC');
 assert.equal(jwk.crv,'P-256');
 assert.equal(jwk.kid,key.kid);
 assert.equal(jwk.use,'sig');
 assert.equal(jwk.alg,'ES256');
 assert.match(jwk.x,/^[A-Za-z0-9_-]{43}$/);
 assert.match(jwk.y,/^[A-Za-z0-9_-]{43}$/);
 assert.equal(jwk.d,undefined);
 const imported=crypto.createPublicKey({key:{kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y},format:'jwk'});
 assert.ok(sign.verifyJwt({publicKey:imported,kid:key.kid},sign.signRecord(key,record)));
});
