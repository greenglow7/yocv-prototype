const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
let env={}; try {env=require('../server/env.js')}catch{}
let config={}; try {config=require('../server/config.js')}catch{}

function tmpDir(envText){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yocv-config-'));
 if(envText!==undefined)fs.writeFileSync(path.join(dir,'.env'),envText);
 return dir;
}

test('parseEnv ignores blank lines and comments and trims values',()=>{
 assert.equal(typeof env.parseEnv,'function');
 const parsed=env.parseEnv('# leading comment\n\n  PORT = 4173  \nHOST=127.0.0.1\n   # indented comment\n');
 assert.deepEqual(parsed,{PORT:'4173',HOST:'127.0.0.1'});
});
test('parseEnv strips surrounding quotes and inline comments',()=>{
 const parsed=env.parseEnv('A="quoted value"\nB=\'single quoted\'\nC=plain # trailing comment\nD="kept # inside quotes"\nE=\n');
 assert.deepEqual(parsed,{A:'quoted value',B:'single quoted',C:'plain',D:'kept # inside quotes',E:''});
});
test('parseEnv handles CRLF line endings and export prefixes',()=>{
 const parsed=env.parseEnv('A=1\r\nB=2\r\nexport C=3\r\n');
 assert.deepEqual(parsed,{A:'1',B:'2',C:'3'});
});
test('parseEnv keeps equals signs inside values and skips malformed lines',()=>{
 const parsed=env.parseEnv('URL=https://x.example/a?b=c\nnot a pair\n=novalue\n');
 assert.deepEqual(parsed,{URL:'https://x.example/a?b=c'});
});
test('loadEnvFile returns an empty object when the file is missing',()=>{
 assert.equal(typeof env.loadEnvFile,'function');
 assert.deepEqual(env.loadEnvFile(path.join(tmpDir(),'.env')),{});
});
test('loadEnvFile parses an existing file',()=>{
 const dir=tmpDir('A=1\nB="two"\n');
 assert.deepEqual(env.loadEnvFile(path.join(dir,'.env')),{A:'1',B:'two'});
});

test('loadConfig defaults to local provider with documented defaults',()=>{
 assert.equal(typeof config.loadConfig,'function');
 const cfg=config.loadConfig({env:{},cwd:tmpDir()});
 assert.equal(cfg.provider,'local');
 assert.equal(cfg.model,null);
 assert.equal(cfg.azure,null);
 assert.equal(cfg.openai,null);
 assert.equal(cfg.yomaBase,'https://api.yoma.world/api/v3');
 assert.equal(cfg.port,4173);
 assert.equal(cfg.host,'127.0.0.1');
});
test('loadConfig picks azure when endpoint, key and deployment are present',()=>{
 const cfg=config.loadConfig({env:{AZURE_OPENAI_ENDPOINT:'https://res.openai.azure.com/',AZURE_OPENAI_API_KEY:'k',AZURE_OPENAI_DEPLOYMENT:'gpt-4.1-mini',OPENAI_API_KEY:'other'},cwd:tmpDir()});
 assert.equal(cfg.provider,'azure-openai');
 assert.equal(cfg.model,'gpt-4.1-mini');
 assert.deepEqual(cfg.azure,{endpoint:'https://res.openai.azure.com',apiKey:'k',deployment:'gpt-4.1-mini',apiVersion:'2024-10-21'});
 assert.equal(cfg.openai,null);
});
test('loadConfig honours AZURE_OPENAI_API_VERSION',()=>{
 const cfg=config.loadConfig({env:{AZURE_OPENAI_ENDPOINT:'https://res.openai.azure.com',AZURE_OPENAI_API_KEY:'k',AZURE_OPENAI_DEPLOYMENT:'dep',AZURE_OPENAI_API_VERSION:'v1'},cwd:tmpDir()});
 assert.equal(cfg.azure.apiVersion,'v1');
});
test('loadConfig falls back to local when azure is only partially configured',()=>{
 const cfg=config.loadConfig({env:{AZURE_OPENAI_ENDPOINT:'https://res.openai.azure.com',AZURE_OPENAI_DEPLOYMENT:'dep'},cwd:tmpDir()});
 assert.equal(cfg.provider,'local');
 assert.equal(cfg.azure,null);
});
test('loadConfig picks openai-compatible when only OPENAI_API_KEY is set',()=>{
 const cfg=config.loadConfig({env:{OPENAI_API_KEY:'sk'},cwd:tmpDir()});
 assert.equal(cfg.provider,'openai-compatible');
 assert.equal(cfg.model,'gpt-4.1-mini');
 assert.deepEqual(cfg.openai,{baseUrl:'https://api.openai.com/v1',apiKey:'sk',model:'gpt-4.1-mini'});
 assert.equal(cfg.azure,null);
});
test('loadConfig strips trailing slashes from the openai base url and uses OPENAI_MODEL',()=>{
 const cfg=config.loadConfig({env:{OPENAI_API_KEY:'sk',OPENAI_BASE_URL:'http://localhost:11434/v1///',OPENAI_MODEL:'llama3'},cwd:tmpDir()});
 assert.equal(cfg.openai.baseUrl,'http://localhost:11434/v1');
 assert.equal(cfg.openai.model,'llama3');
 assert.equal(cfg.model,'llama3');
});
test('loadConfig reads .env from cwd',()=>{
 const dir=tmpDir('OPENAI_API_KEY=file-key\nPORT=5000\nHOST=0.0.0.0\nYOMA_API_BASE=https://stage.yoma.world/api/v3/\n');
 const cfg=config.loadConfig({env:{},cwd:dir});
 assert.equal(cfg.provider,'openai-compatible');
 assert.equal(cfg.openai.apiKey,'file-key');
 assert.equal(cfg.port,5000);
 assert.equal(cfg.host,'0.0.0.0');
 assert.equal(cfg.yomaBase,'https://stage.yoma.world/api/v3');
});
test('loadConfig lets process env win over .env values',()=>{
 const dir=tmpDir('OPENAI_API_KEY=file-key\nPORT=5000\n');
 const cfg=config.loadConfig({env:{OPENAI_API_KEY:'env-key',PORT:'6000'},cwd:dir});
 assert.equal(cfg.openai.apiKey,'env-key');
 assert.equal(cfg.port,6000);
});
test('loadConfig treats blank values as unset',()=>{
 const dir=tmpDir('AZURE_OPENAI_ENDPOINT=https://res.openai.azure.com\nAZURE_OPENAI_API_KEY=\nAZURE_OPENAI_DEPLOYMENT=gpt-4.1-mini\nOPENAI_API_KEY=   \n');
 const cfg=config.loadConfig({env:{},cwd:dir});
 assert.equal(cfg.provider,'local');
});
test('loadConfig falls back to the default port when PORT is not a number',()=>{
 const cfg=config.loadConfig({env:{PORT:'abc'},cwd:tmpDir()});
 assert.equal(cfg.port,4173);
});
