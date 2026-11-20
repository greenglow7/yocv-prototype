(function(root){
  'use strict';
  // The lists the CV checks run against (spec 6 rule 5, spec 7, plan Deviations 1 and 4). Each list exists once, here.
  // VERBS: plain action verbs, each 'past|form|form…' with the past form first. None is a form of an INFLATION or ROLE_UPGRADE word.
  const VERBS=Object.freeze([
    'served|serve|serves|serving','sold|sell|sells|selling','cared for|care for|cares for|caring for',
    'repaired|repair|repairs|repairing','delivered|deliver|delivers|delivering','kept|keep|keeps|keeping',
    'counted|count|counts|counting','cleaned|clean|cleans|cleaning','taught|teach|teaches|teaching',
    'organised|organise|organises|organising','braided|braid|braids|braiding','drove|drive|drives|driving',
    'built|build|builds|building','worked|work|works|working','volunteered|volunteer|volunteers|volunteering',
    'cooked|cook|cooks|cooking','baked|bake|bakes|baking','washed|wash|washes|washing','ironed|iron|irons|ironing',
    'sewed|sew|sews|sewing','mended|mend|mends|mending','fixed|fix|fixes|fixing','painted|paint|paints|painting',
    'cut|cut|cuts|cutting','styled|style|styles|styling','plaited|plait|plaits|plaiting','packed|pack|packs|packing',
    'loaded|load|loads|loading','unloaded|unload|unloads|unloading','carried|carry|carries|carrying',
    'lifted|lift|lifts|lifting','stacked|stack|stacks|stacking','sorted|sort|sorts|sorting','stocked|stock|stocks|stocking',
    'arranged|arrange|arranges|arranging','prepared|prepare|prepares|preparing','planned|plan|plans|planning',
    'measured|measure|measures|measuring','weighed|weigh|weighs|weighing','checked|check|checks|checking',
    'recorded|record|records|recording','wrote|write|writes|writing','tracked|track|tracks|tracking',
    'listed|list|lists|listing','priced|price|prices|pricing','bought|buy|buys|buying','ordered|order|orders|ordering',
    'collected|collect|collects|collecting','paid|pay|pays|paying','saved|save|saves|saving',
    'budgeted|budget|budgets|budgeting','greeted|greet|greets|greeting','welcomed|welcome|welcomes|welcoming',
    'answered|answer|answers|answering','advised|advise|advises|advising','explained|explain|explains|explaining',
    'showed|show|shows|showing','guided|guide|guides|guiding','looked after|look after|looks after|looking after',
    'fed|feed|feeds|feeding','dressed|dress|dresses|dressing','tutored|tutor|tutors|tutoring',
    'coached|coach|coaches|coaching','mentored|mentor|mentors|mentoring','supported|support|supports|supporting',
    'assisted|assist|assists|assisting','visited|visit|visits|visiting','picked up|pick up|picks up|picking up',
    'dropped off|drop off|drops off|dropping off','rode|ride|rides|riding','transported|transport|transports|transporting',
    'moved|move|moves|moving','fetched|fetch|fetches|fetching','swept|sweep|sweeps|sweeping','mopped|mop|mops|mopping',
    'scrubbed|scrub|scrubs|scrubbing','tidied|tidy|tidies|tidying','planted|plant|plants|planting','grew|grow|grows|growing','harvested|harvest|harvests|harvesting',
    'watered|water|waters|watering','weeded|weed|weeds|weeding','dug|dig|digs|digging','laid|lay|lays|laying',
    'mixed|mix|mixes|mixing','poured|pour|pours|pouring','plastered|plaster|plasters|plastering','tiled|tile|tiles|tiling',
    'installed|install|installs|installing','fitted|fit|fits|fitting','assembled|assemble|assembles|assembling',
    'welded|weld|welds|welding','wired|wire|wires|wiring','serviced|service|services|servicing',
    'maintained|maintain|maintains|maintaining','replaced|replace|replaces|replacing','tested|test|tests|testing',
    'made|make|makes|making','designed|design|designs|designing','drew|draw|draws|drawing','printed|print|prints|printing',
    'typed|type|types|typing','filed|file|files|filing','called|call|calls|calling','sent|send|sends|sending',
    'received|receive|receives|receiving','handled|handle|handles|handling','opened|open|opens|opening',
    'closed|close|closes|closing','locked up|lock up|locks up|locking up','guarded|guard|guards|guarding',
    'watched|watch|watches|watching','cleared|clear|clears|clearing','set up|set up|sets up|setting up',
    'started|start|starts|starting','raised|raise|raises|raising','coordinated|coordinate|coordinates|coordinating',
    'translated|translate|translates|translating','improved|improve|improves|improving','learned|learn|learns|learning'
  ]);
  // INFLATION and ROLE_UPGRADE are the spec 6 rule 5 words, in spec order. Check 3 matches the stems and the forms.
  const INFLATION=Object.freeze(['certified','qualified','licensed','verified','expert','proficient','professional','advanced']);
  const ROLE_UPGRADE=Object.freeze(['managed','led','ran','owned','supervised','trained']);
  const INFLATION_STEMS=Object.freeze(['certif','qualif','licens','licenc','verif','expert','proficien','professional','advanced']);
  const ROLE_UPGRADE_FORMS=Object.freeze({
    managed:['managed','manage','manages','managing','manager'],led:['led','lead','leads','leading','leader'],
    ran:['ran','run','runs','running'],owned:['owned','owns','owning','owner'],
    supervised:['supervised','supervise','supervises','supervising','supervisor'],trained:['trained','train','trains','training','trainer']
  });
  const RULES=Object.freeze({verbs:VERBS,inflation:INFLATION,inflationStems:INFLATION_STEMS,roleUpgrade:ROLE_UPGRADE,roleUpgradeForms:ROLE_UPGRADE_FORMS});
  const api={VERBS,INFLATION,ROLE_UPGRADE,INFLATION_STEMS,ROLE_UPGRADE_FORMS,RULES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.YoCVRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
