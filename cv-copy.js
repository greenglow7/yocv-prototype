(function(root){
  'use strict';
  // The YoCV copy catalogue (spec 12, plan Deviations 1). Section 12 strings are verbatim; the rest are
  // the builder's. A plain object a translation task can find: add a language beside en. Slots are {name}.
  const COPY={en:{
    stepRecord:'Your Yoma record',stepWork:'Your work',stepReview:'Review',stepCv:'Your CV',
    labelYoma:'Confirmed from Yoma',
    labelCustomer:'Vouched by a customer, confirmed by them, not by Yoma',
    labelWorker:'Vouched by another worker, confirmed by them, not by Yoma',
    labelReferral:'Referred by {organisation}, confirmed by them, not by Yoma',
    labelOwn:'From your own account',labelSelf:'Self-stated',
    templateWording:'template wording',statedBy:'stated by {first}, not checked',
    preparedExample:'Prepared example. Not a live call.',
    draftNotice:'Draft. Nothing is saved until the person confirms it.',
    accept:'Accept',edit:'Edit',leaveOut:'Leave out',
    learningHeading:'Learning recorded on Yoma',
    cvSampleFooter:'Sample account: fictional, for demonstration',
    notOperated:'Not operated by Yoma or UNICEF.',
    qWhat:'What did you do?',qForWhom:'For whom, or where?',qOften:'How often, and for how long?',
    qNumber:'A number you can stand behind',qBetter:'What was better because of you?',qConfirm:'Who could confirm this?',
    forWhomChips:['customers','a family business','a household','a community group','an employer'],
    frequencyChips:['daily','a few times a week','weekly','now and then'],
    unitChips:['customers a day','customers a week','items','people','trips','rand a week','shillings a week'],
    hedgeChips:['exactly','about','at least'],
    confirmChips:['no one','a person I can name','a Yoma completion','a vouch on my YoCard'],
    walletUnavailable:'Wallet not available',
    modeLive:'Live AI · {model}',modeSample:'Sample mode',modeOffline:'Sample mode (offline)',
    recordNotice:'Not operated by Yoma or UNICEF. Accepting a sentence confirms its wording, not its truth.',
    learningCredential:'{title}. Credential issued by {issuer}, {month}.',
    learningCompletion:'{title}. Learning opportunity completed with {organisation}, {month}.',
    issuerNotStated:'issuer not stated',
    reason_invented_number:'It added a number you did not give.',
    reason_hedge_dropped:'It left out the word you put before your number.',
    reason_invented_name:'It added a name or a place you did not give.',
    reason_contact_detail:'It holds a phone number or an email. Contact details go in the contact line.',
    reason_overstated:'It makes the work sound bigger than you said.',
    reason_weak_opening:'It does not start with something you did.',
    reason_quote_not_found:'It quotes words that are not in your answers.',
    reason_length:'It is too short or too long for one CV line.',
    reason_not_one_sentence:'It is more than one sentence.',
    reason_exclamation:'It has an exclamation mark.',
    reason_duplicate:'It repeats another line.',
    reason_over_limit:'It goes past the number of lines one entry can have.',
    reason_skill_not_in_menu:'It names a skill that is not on the list for this role.',
    cvExperience:'Experience',cvSkills:'Skills',cvEducation:'Education',cvReferences:'References available on request'
  }};
  if(typeof module!=='undefined'&&module.exports)module.exports=COPY;else root.YoCVCopy=COPY;
})(typeof globalThis!=='undefined'?globalThis:this);
