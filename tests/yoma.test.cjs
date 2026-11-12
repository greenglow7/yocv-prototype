const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createYomaClient,YomaUnavailable}=require('../server/yoma.js');

const BASE='https://yoma.example/api/v3';
const skills=[
 {id:'s-cert',name:'Customer Service Certification',infoURL:'https://skills.example/cert'},
 {id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://skills.example/customer-service'},
 {id:'s-mgmt',name:'Customer Service Management',infoURL:'https://skills.example/mgmt'}
];
const types=[{id:'type-task',name:'Task'},{id:'type-learning',name:'Learning'},{id:'type-event',name:'Event'}];
const opportunity={id:'opp-1',title:'Retail basics',organizationName:'Atingi',organizationLogoURL:'https://logo.example/a.png',summary:'Learn retail.',yomaInfoURL:'https://yoma.example/opp-1',commitmentIntervalDescription:'2 hours',difficulty:'Beginner',skills:[{id:'s1',name:'Retail Sales',infoURL:'https://skills.example/retail-sales',extra:'drop me'}],zltoReward:10,isCompletable:true,unmappedField:'ignored'};

function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
function fakeFetch(handler){
 const calls=[];
 const fetch=async(url,init={})=>{calls.push({url:String(url),init});return handler(String(url),init,calls.length);};
 fetch.calls=calls;
 return fetch;
}
function router(url){
 if(url.includes('/lookup/skill'))return json({totalCount:skills.length,items:skills});
 if(url.endsWith('/opportunity/type'))return json(types);
 if(url.endsWith('/opportunity/search'))return json({totalCount:22,items:[opportunity,{...opportunity,id:'opp-2',isCompletable:false}]});
 return json({},404);
}
function client(fetch,extra={}){return createYomaClient({baseUrl:BASE,fetch,...extra});}

test('YomaUnavailable is an Error with code yoma_unavailable',()=>{
 const err=new YomaUnavailable('down');
 assert.ok(err instanceof Error);
 assert.equal(err.code,'yoma_unavailable');
 assert.equal(err.name,'YomaUnavailable');
});

test('skillByName picks the exact case-insensitive match, ignoring alphabetical noise',async()=>{
 const fetch=fakeFetch(router);
 const result=await client(fetch).skillByName('customer service');
 assert.deepEqual(result,{item:{id:'448bb36e-6e5a-4c5a-9150-78703666c37a',name:'Customer Service',infoURL:'https://skills.example/customer-service'},source:'live'});
});

test('skillByName returns null item when nothing matches exactly',async()=>{
 const fetch=fakeFetch(router);
 const result=await client(fetch).skillByName('Customer Serv');
 assert.deepEqual(result,{item:null,source:'live'});
 assert.equal(fetch.calls.length,1);
});

test('skillByName skips names outside 3..50 characters without a request',async()=>{
 const fetch=fakeFetch(router);
 const c=client(fetch);
 assert.deepEqual(await c.skillByName('ab'),{item:null,source:'live'});
 assert.deepEqual(await c.skillByName('x'.repeat(51)),{item:null,source:'live'});
 assert.deepEqual(await c.skillByName('  '),{item:null,source:'live'});
 assert.equal(fetch.calls.length,0);
});

test('skillByName sends the documented URL and headers',async()=>{
 const fetch=fakeFetch(router);
 await client(fetch).skillByName('Customer Service');
 const [call]=fetch.calls;
 assert.equal(call.url,BASE+'/lookup/skill?nameContains=Customer%20Service&pageNumber=1&pageSize=20');
 assert.equal((call.init.method||'GET').toUpperCase(),'GET');
 assert.equal(call.init.headers['user-agent'],'YoCV-prototype');
 assert.equal(call.init.headers['accept'],'application/json');
 assert.ok(call.init.signal instanceof AbortSignal);
});

test('opportunityTypes and learningTypeId resolve the Learning type',async()=>{
 const fetch=fakeFetch(router);
 const c=client(fetch);
 const result=await c.opportunityTypes();
 assert.deepEqual(result,{items:types,source:'live'});
 assert.equal(await c.learningTypeId(),'type-learning');
 assert.equal(fetch.calls.length,1);
 assert.equal(fetch.calls[0].url,BASE+'/opportunity/type');
});

test('searchLearningOpportunities posts the documented body and maps items',async()=>{
 const fetch=fakeFetch(router);
 const result=await client(fetch).searchLearningOpportunities('retail');
 const search=fetch.calls.find(call=>call.url.endsWith('/opportunity/search'));
 assert.ok(search);
 assert.equal(search.init.method,'POST');
 assert.equal(search.init.headers['content-type'],'application/json');
 assert.equal(search.init.headers['user-agent'],'YoCV-prototype');
 assert.equal(search.init.headers['accept'],'application/json');
 assert.deepEqual(JSON.parse(search.init.body),{pageNumber:1,pageSize:12,valueContains:'retail',types:['type-learning']});
 assert.equal(result.source,'live');
 assert.equal(result.totalCount,22);
 assert.equal(result.items.length,2);
 assert.deepEqual(result.items[0],{id:'opp-1',title:'Retail basics',organizationName:'Atingi',organizationLogoURL:'https://logo.example/a.png',summary:'Learn retail.',yomaInfoURL:'https://yoma.example/opp-1',commitmentIntervalDescription:'2 hours',difficulty:'Beginner',skills:[{id:'s1',name:'Retail Sales',infoURL:'https://skills.example/retail-sales'}],zltoReward:10,isCompletable:true});
});

test('searchLearningOpportunities preserves the completable flag instead of filtering',async()=>{
 const fetch=fakeFetch(router);
 const result=await client(fetch).searchLearningOpportunities('retail');
 assert.deepEqual(result.items.map(i=>i.isCompletable),[true,false]);
});

test('searchLearningOpportunities skips phrases outside 3..50 characters without a request',async()=>{
 const fetch=fakeFetch(router);
 const c=client(fetch);
 assert.deepEqual(await c.searchLearningOpportunities('ab'),{items:[],totalCount:0,source:'live'});
 assert.deepEqual(await c.searchLearningOpportunities('y'.repeat(51)),{items:[],totalCount:0,source:'live'});
 assert.equal(fetch.calls.length,0);
});

test('a cache hit within the TTL makes no second request',async()=>{
 const fetch=fakeFetch(router);
 const c=client(fetch);
 const first=await c.skillByName('Customer Service');
 const second=await c.skillByName('Customer Service');
 assert.equal(fetch.calls.length,1);
 assert.equal(first.source,'live');
 assert.equal(second.source,'cache');
 assert.deepEqual(second.item,first.item);
});

test('a stale entry is served with source cache when the refresh fails',async()=>{
 let t=0;
 const fetch=fakeFetch((url,init,n)=>{if(n>1)throw new TypeError('fetch failed');return router(url);});
 const c=client(fetch,{now:()=>t,ttlMs:1000});
 const first=await c.skillByName('Customer Service');
 t=5000;
 const second=await c.skillByName('Customer Service');
 assert.equal(fetch.calls.length,2);
 assert.deepEqual(second,{item:first.item,source:'cache'});
});

test('a stale entry is served after a 503 or a timeout-style abort',async()=>{
 let t=0,mode='ok';
 const fetch=fakeFetch((url)=>{
  if(mode==='503')return new Response('Service Unavailable',{status:503});
  if(mode==='abort'){const err=new Error('The operation was aborted due to timeout');err.name='TimeoutError';throw err;}
  return router(url);
 });
 const c=client(fetch,{now:()=>t,ttlMs:1000});
 await c.opportunityTypes();
 t=2000;mode='503';
 assert.deepEqual(await c.opportunityTypes(),{items:types,source:'cache'});
 t=4000;mode='abort';
 assert.deepEqual(await c.opportunityTypes(),{items:types,source:'cache'});
 assert.equal(fetch.calls.length,3);
});

test('YomaUnavailable is thrown when the request fails and nothing is cached',async()=>{
 const fetch=fakeFetch(()=>{throw new TypeError('fetch failed');});
 await assert.rejects(client(fetch).skillByName('Customer Service'),err=>err instanceof YomaUnavailable&&err.code==='yoma_unavailable');
 const fetch500=fakeFetch(()=>new Response('boom',{status:500}));
 await assert.rejects(client(fetch500).opportunityTypes(),err=>err instanceof YomaUnavailable);
 await assert.rejects(client(fetch500).searchLearningOpportunities('retail'),err=>err instanceof YomaUnavailable);
});

test('a 200 response with a non-JSON body counts as unavailable, not a crash',async()=>{
 const fetch=fakeFetch(()=>new Response('<!doctype html><html><body>Maintenance</body></html>',{status:200,headers:{'content-type':'text/html'}}));
 await assert.rejects(client(fetch).skillByName('Customer Service'),err=>err instanceof YomaUnavailable);
 await assert.rejects(client(fetch).opportunityTypes(),err=>err instanceof YomaUnavailable);
});

test('a 400 surfaces as yoma_bad_request, is not cached and does not serve stale data',async()=>{
 let bad=false;
 const fetch=fakeFetch((url)=>bad?json({title:'Bad Request'},400):router(url));
 const c=client(fetch,{ttlMs:0});
 await c.skillByName('Customer Service');
 bad=true;
 await assert.rejects(c.skillByName('Customer Service'),err=>!(err instanceof YomaUnavailable)&&err.code==='yoma_bad_request');
 await assert.rejects(c.skillByName('Customer Service'),err=>err.code==='yoma_bad_request');
 assert.equal(fetch.calls.length,3);
});

test('reachable reports live reachability and caches it for reachTtlMs',async()=>{
 let t=0,down=false;
 const fetch=fakeFetch((url)=>{if(down)throw new TypeError('fetch failed');return router(url);});
 const c=client(fetch,{now:()=>t,reachTtlMs:1000});
 assert.equal(await c.reachable(),true);
 assert.equal(await c.reachable(),true);
 assert.equal(fetch.calls.length,1);
 t=2000;down=true;
 assert.equal(await c.reachable(),false);
 assert.equal(fetch.calls.length,2);
 assert.equal(await c.reachable(),false);
 assert.equal(fetch.calls.length,2);
 t=4000;down=false;
 assert.equal(await c.reachable(),true);
 assert.equal(fetch.calls.length,3);
});

test('reachable returns false when Yoma is down even if types were cached earlier',async()=>{
 let t=0,down=false;
 const fetch=fakeFetch((url)=>{if(down)throw new TypeError('fetch failed');return router(url);});
 const c=client(fetch,{now:()=>t,reachTtlMs:1000,ttlMs:3600000});
 await c.opportunityTypes();
 down=true;
 assert.equal(await c.reachable(),false);
 assert.deepEqual(await c.opportunityTypes(),{items:types,source:'cache'});
});

test('reachable swallows unavailability instead of throwing',async()=>{
 const fetch=fakeFetch(()=>{throw new TypeError('fetch failed');});
 assert.equal(await client(fetch).reachable(),false);
});

test('role-skills.json has the three roles with skill names and opportunity queries',()=>{
 const roleSkills=require('../data/role-skills.json');
 assert.deepEqual(Object.keys(roleSkills),['Retail assistant','Customer support assistant','Community outreach assistant']);
 for(const entry of Object.values(roleSkills)){
  assert.ok(Array.isArray(entry.skillNames)&&entry.skillNames.length>0);
  assert.ok(entry.skillNames.every(name=>name.length>=3&&name.length<=50));
  assert.ok(Array.isArray(entry.opportunityQueries)&&entry.opportunityQueries.length>0);
  assert.ok(entry.opportunityQueries.every(q=>q.length>=3&&q.length<=50));
 }
 assert.deepEqual(roleSkills['Retail assistant'].opportunityQueries,['customer service','retail']);
 assert.ok(roleSkills['Retail assistant'].skillNames.includes('Customer Service'));
});

// --- opportunityInfo (YoCard, anonymous GET /opportunity/{id}/info) ---
const INFO_ID='019a1062-2518-756d-bc33-1b68b8f67d96';
const infoBody={
 id:INFO_ID,title:'Financial Literacy for Gig Workers',description:'long text',type:'Learning',organizationId:'org-1',organizationName:'UNICEF Kenya',organizationLogoURL:'https://logo.example/unicef-kenya.png',
 summary:'s',url:'https://online.atingi.org/x',verificationEnabled:true,verificationMethod:'Manual',participantCountCompleted:37,participantCountPending:0,status:'Active',published:true,
 yomaInfoURL:'https://yoma.world/opportunities/'+INFO_ID,isCompletable:true,
 skills:[{id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS',extra:'drop'}],
 verificationTypes:[{id:'vt-1',type:'FileUpload',displayName:'File Upload',description:'A file of your completion certificate'}],
 customFields:[]
};
function infoRouter(url){
 if(url.endsWith('/opportunity/'+INFO_ID+'/info'))return json(infoBody);
 if(/\/opportunity\/[0-9a-f-]{36}\/info$/.test(url))return json([{type:'EntityNotFoundException',message:'does not exist'}],404);
 return router(url);
}

test('opportunityInfo fetches the documented URL anonymously and maps the public fields',async()=>{
 const fetch=fakeFetch(infoRouter);
 const c=client(fetch);
 assert.equal(typeof c.opportunityInfo,'function');
 const result=await c.opportunityInfo(INFO_ID);
 assert.equal(fetch.calls.length,1);
 const [call]=fetch.calls;
 assert.equal(call.url,BASE+'/opportunity/'+INFO_ID+'/info');
 assert.equal((call.init.method||'GET').toUpperCase(),'GET');
 assert.equal(call.init.headers['user-agent'],'YoCV-prototype');
 assert.equal(call.init.headers['accept'],'application/json');
 assert.equal(call.init.headers['authorization'],undefined);
 assert.equal(result.source,'live');
 assert.deepEqual(result.item,{
  id:INFO_ID,title:'Financial Literacy for Gig Workers',organizationName:'UNICEF Kenya',organizationLogoURL:'https://logo.example/unicef-kenya.png',type:'Learning',
  verificationEnabled:true,verificationMethod:'Manual',verificationTypes:[{type:'FileUpload',displayName:'File Upload',description:'A file of your completion certificate'}],
  participantCountCompleted:37,yomaInfoURL:'https://yoma.world/opportunities/'+INFO_ID,published:true,isCompletable:true,
  skills:[{id:'757753d2-9981-4240-b2e1-183884d66bb1',name:'Financial Management',infoURL:'https://lightcast.io/open-skills/skills/KS123Y170JP7JBSFVBSS'}]
 });
 assert.ok(!('description' in result.item));
});

test('opportunityInfo returns item null on a 404 and caches that answer',async()=>{
 const fetch=fakeFetch(infoRouter);
 const c=client(fetch);
 const missing='019e6f89-b66b-798e-a380-cbf33d634de6';
 assert.deepEqual(await c.opportunityInfo(missing),{item:null,source:'live'});
 const again=await c.opportunityInfo(missing);
 assert.equal(again.item,null);
 assert.equal(again.source,'cache');
 assert.equal(fetch.calls.length,1);
});

test('opportunityInfo rejects malformed ids without a request',async()=>{
 const fetch=fakeFetch(infoRouter);
 const c=client(fetch);
 assert.deepEqual(await c.opportunityInfo('../admin'),{item:null,source:'live'});
 assert.deepEqual(await c.opportunityInfo('019A1062-2518-756D-BC33-1B68B8F67D96'),{item:null,source:'live'});
 assert.deepEqual(await c.opportunityInfo(''),{item:null,source:'live'});
 assert.deepEqual(await c.opportunityInfo(undefined),{item:null,source:'live'});
 assert.deepEqual(await c.opportunityInfo('019a1062-2518-756d-bc33-1b68b8f67d96x'),{item:null,source:'live'});
 assert.equal(fetch.calls.length,0);
});

test('opportunityInfo follows the stale-or-throw rule for other failures',async()=>{
 let t=0,down=false;
 const fetch=fakeFetch((url)=>{if(down)return new Response('boom',{status:500});return infoRouter(url);});
 const c=client(fetch,{now:()=>t,ttlMs:1000});
 const first=await c.opportunityInfo(INFO_ID);
 t=5000;down=true;
 const second=await c.opportunityInfo(INFO_ID);
 assert.deepEqual(second,{item:first.item,source:'cache'});
 const cold=client(fakeFetch(()=>new Response('boom',{status:500})));
 await assert.rejects(cold.opportunityInfo(INFO_ID),err=>err instanceof YomaUnavailable);
});
