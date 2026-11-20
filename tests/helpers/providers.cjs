'use strict';
// Provider test fakes: configs, a canned completion, and fetch and sleep fakes.
const KEY='sk-super-secret-key-ABC123';
const azureConfig={endpoint:'https://my-resource.openai.azure.com',apiKey:KEY,deployment:'gpt-4.1-mini',apiVersion:'2024-10-21'};
const openaiConfig={baseUrl:'https://api.openai.com/v1',apiKey:KEY,model:'gpt-4.1-mini'};

function completion(output,extra={}){return {choices:[{finish_reason:'stop',message:{role:'assistant',content:typeof output==='string'?output:JSON.stringify(output)},...extra}]};}
function jsonResponse(status,body){return new Response(typeof body==='string'?body:JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}
// steps: an array (one per call, the last repeats), or a function whose return
// value is the 200 body for every call.
function fakeFetch(steps){
 const calls=[];
 const fetch=async(url,init)=>{
  calls.push({url:String(url),init});
  if(typeof steps==='function')return jsonResponse(200,steps(url,init));
  const step=steps[Math.min(calls.length-1,steps.length-1)];
  if(typeof step==='function')return step(url,init);
  if(step instanceof Error)throw step;
  return jsonResponse(step.status,step.body);
 };
 return {fetch,calls};
}
function fakeSleep(){const calls=[];const sleep=async(ms)=>{calls.push(ms);};return {sleep,calls};}
const hangUntilAbort=(url,init)=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});});

module.exports={KEY,azureConfig,openaiConfig,completion,jsonResponse,fakeFetch,fakeSleep,hangUntilAbort};
