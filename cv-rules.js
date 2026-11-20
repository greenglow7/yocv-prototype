(function(root){
  'use strict';
  // The lists the CV checks run against (spec 7, plan Deviations 1 and 4). Each list exists once, here.
  // VERBS: plain action verbs, each 'past|form|form…' with the past form first. Task 5 completes the list.
  const VERBS=[
    'served|serve|serves|serving','sold|sell|sells|selling','cared for|care for|cares for|caring for',
    'repaired|repair|repairs|repairing','delivered|deliver|delivers|delivering','kept|keep|keeps|keeping',
    'counted|count|counts|counting','cleaned|clean|cleans|cleaning','taught|teach|teaches|teaching',
    'organised|organise|organises|organising','braided|braid|braids|braiding','drove|drive|drives|driving',
    'built|build|builds|building','worked|work|works|working'
  ];
  const api={VERBS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YoCVRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
