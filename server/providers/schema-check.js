'use strict';
// A small JSON Schema check for the json_object mode (spec 8). It covers only
// the keywords the repo's schemas use: type (a string or a list, with null and
// integer), properties, required, additionalProperties:false, items and enum.
// Returns {ok:true} or {ok:false, path} naming the first failing place.
function typeOf(value){
  if(value===null)return 'null';
  if(Array.isArray(value))return 'array';
  return typeof value;
}

function typeOk(value,type){
  const t=typeOf(value);
  if(type==='integer')return Number.isInteger(value);
  if(type==='number')return t==='number'&&Number.isFinite(value);
  return t===type;
}

function check(value,schema,path){
  if(!schema||typeof schema!=='object')return null;
  if(schema.type!==undefined){
    const types=Array.isArray(schema.type)?schema.type:[schema.type];
    if(!types.some(type=>typeOk(value,type)))return path;
  }
  if(Array.isArray(schema.enum)&&!schema.enum.some(option=>option===value))return path;
  if(typeOf(value)==='object'){
    const props=schema.properties||{};
    for(const key of schema.required||[])if(!Object.hasOwn(value,key))return path+'.'+key;
    for(const key of Object.keys(value)){
      if(Object.hasOwn(props,key)){const failed=check(value[key],props[key],path+'.'+key);if(failed)return failed;}
      else if(schema.additionalProperties===false)return path+'.'+key;
    }
  }
  if(typeOf(value)==='array'&&schema.items){
    for(let i=0;i<value.length;i++){const failed=check(value[i],schema.items,path+'['+i+']');if(failed)return failed;}
  }
  return null;
}

function matchesSchema(value,schema){
  const path=check(value,schema,'$');
  return path===null?{ok:true}:{ok:false,path};
}

module.exports={matchesSchema};
