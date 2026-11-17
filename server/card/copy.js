'use strict';
/* YoVouch copy catalogue (spec §17). Every value is the spec string verbatim with each <...> written as a
   {slot}: {first} is always the worker the vouch is about, {name} the voucher's chosen name or label.
   t() reads data/yovouch-copy.json[lang][key] when a native speaker has supplied it, else English. Keys
   marked "plan addition" are strings section 17 does not spell out; they are listed in PLAN_ADDITIONS. */
const fs=require('node:fs');
const path=require('node:path');

const LANGS=['en','zu','xh','sw','pcm'];
const LANG_NAMES={en:'English',zu:'isiZulu',xh:'isiXhosa',sw:'Kiswahili',pcm:'Pidgin'};
const MENU_Q='Q2 when: 1 this month 2 last month 3 earlier. Q3 how often: 1 once 2 a few times 3 regularly 4 rather not say.';
const MENU_HEAD="Vouch for {first}, {trade}. A matched code shows you had {first}'s code in about the last four minutes. It does not show the work was done. Adults only. Reply 4 numbers, e.g. 1 1 2 1. Q1 did: 1 {chip1} 2 {chip2} 3 {chip3} 4 other. "+MENU_Q;
const REFERRAL_LABEL='Referred by {org} for {job} on {date} · rests on {title} · confirmed by them, not by Yoma';

const COPY={
  // Worker's page
  showThis:'Show this to your customer.',
  codeLine:'Code {spoken} · valid until {time}',
  newCode:'New code',
  askLine:'Ask: "Can you vouch for the work I did today?"',
  invite:'No vouches yet? A customer can vouch at the end of a job by scanning this code.',
  noData:'Customer has no data',
  noDataLine:'Hand them this phone (they text one word from their own phone), or they text VOUCH {smsId} {code} to {shortcode} (1 SMS, they pay), or they flash {callback} and it calls back free.',
  locked:'Locked after wrong codes. Opens again at {time}. Scanning still works.',
  vouchArrived:'A vouch is on your card.',
  yourVouches:'Your vouches',
  hide:'Hide',
  showAgain:'Show again',
  showWords:'Show words and clip',
  wordsWaiting:'{n} lines have words waiting for you.',
  biscate:'Workers with one customer vouch got far more requests (Biscate, World Bank 2021).',
  vouchForWorker:'Vouch for another worker',
  requestVouch:'Request a vouch from a past customer',
  requestReferral:'Request a referral',
  pastePost:'Paste the post here',
  languageMenu:'Language: 1 English 2 isiZulu 3 isiXhosa 4 Kiswahili 5 Pidgin',
  linkWhatsapp:'Link WhatsApp',
  linkCode:'Your link code: {code}. Reply with it in the WhatsApp chat within 10 minutes.',
  doNotPrint:'Do not print this code. It changes every 90 seconds.',
  smsCode:'Your code: {spoken}, valid about 4 min by SMS or call, 3 min on a scan page. Card {smsId}. Your customer texts VOUCH {smsId} {code} to {shortcode} (1 SMS) or flashes {callback} for a free call. Reply L to change language.',
  smsNoCard:'No card is linked to this number. Make your card at {url} on any phone, then text CODE again.',
  smsNoPhone:'This card has no confirmed phone on Yoma, so it cannot get codes by SMS. Open your card page instead.',
  publishResult:'Your card: code {cardCode}, card number {smsId}, your code page {link}. Keep this link private.',
  // Scan and vouch pages
  vouchTitle:'Vouch for {first}, {trade}',
  vouchButton:'Vouch for {first}',
  typeInstead:'Type the code instead',
  cardRefLabel:'Card code (6 characters) or card number (5 digits)',
  digitsLabel:'The 6 digits',
  onWorkerPhone:"You are using {first}'s phone. You will text from your own phone.",
  adultQ:'Are you 18 or older? Yes / No',
  adultsOnly:'YoVouch is for adults. Thank you anyway.',
  codeOld:'This code is older than 3 minutes. Ask {first} to show the current one.',
  codeUsed:'This code was already used.',
  smsCodeWrong:'This code is wrong or has expired. Ask {first} to text CODE for a new one.',
  selfVouch:"This is the number on {first}'s own card.",
  cardWithdrawn:'This card was withdrawn by its owner.',
  whatDid:'What did {first} do?',
  when:'When: this month / last month / earlier',
  howOften:'How often: once / a few times / regularly / rather not say',
  hireAgainQ:'Would you hire {first} again? Yes / Rather not say',
  workAgainQ:'Would you work with {first} again? Yes / Rather not say',
  ownWords:'In your own words (optional, 120 characters)',
  sayIt:'Say it in 15 seconds (optional)',
  record:'Record',
  stop:'Stop',
  listen:'Listen',
  recordAgain:'Record again',
  weHeard:'We heard: "{transcript}"',
  useWords:'Use these words',
  unclear:'[I could not hear this]',
  hearBadly:'I could not hear this well. Send the voice note again in a quiet place, or type your answers.',
  cannotKeep:'I could not keep this part. Type it or leave it out.',
  showMeAs:"On {first}'s card show me as: a customer / {name} ···{digits}",
  attachClip:'Attach my 15-second clip. A clip makes the vouch stronger.',
  showCardQ:"Show a link to my card on {first}'s card: yes / no",
  workerLineNote:'Your line will show your first name and that you have a YoCard, not your number.',
  textYesScan:'Text YES {sessionCode} to {shortcode} from your phone. We never send the first message. Your number is never shown on the card without your choice.',
  textYesWorkerPhone:'Text YES {sessionCode} to {shortcode} from your own phone, not this one. After you publish, one SMS with your withdraw link goes to the phone that texted. Nothing else, ever.',
  waiting:'Waiting for your text. Nothing has been recorded yet.',
  sentIt:'I have sent it',
  gotIt:'Got it. Your number ends in ···{digits}.',
  capBinds:'This number has already been used for 3 vouches this hour. Try again later.',
  demoNoGateway:'Demo: no SMS gateway. In production you would text first; nothing is sent to this number.',
  demoWrong:"That code did not match. Start again from {first}'s code.",
  demoCap:'This number already received 3 codes this hour. Try again later.',
  readIt:"Read it. This is exactly what will be on {first}'s card:",
  heldNote:'Your choices show at once. Your words and clip show once {first} has seen them.',
  canWithdraw:'You can withdraw it any time.',
  publish:'Publish this line',
  change:'Change something',
  thanks:'Thanks. Your vouch for {first} is on their card.',
  withdrawAt:'Withdraw any time: {link}. Vouch {vouchId}.',
  withdrawSent:'Your withdraw link was sent to your phone.',
  withdrawSms:'Your vouch for {first} is on their card. Withdraw any time: {link}. Nobody will message you again.',
  withdrawQ:'Withdraw your vouch for {first}? It will be removed from the card.',
  withdrawNow:'Withdraw now',
  withdrawQuiet:'Withdraw quietly',
  withdrawnNow:'Your vouch was withdrawn.',
  withdrawnLater:'Your vouch will be removed within 3 days.',
  capDay:'This number has vouched three times today. Try again tomorrow.',
  capCards:'This number has vouched for three workers this month. Try again next month.',
  recent:'You already vouched for {first} this month. Add a visit instead?',
  reciprocalNote:'This will be marked "Vouched for each other" on both cards.',
  notEligible:'Your card needs one completed Yoma opportunity or one customer vouch at least a week old before it can vouch for others.',
  workerCap:'You have vouched for 5 workers in the last 90 days.',
  givenNote:'Your vouch for {first} is on their card. Remove it any time from this page.',
  scanTheirCode:'Scan their code, or type their card code or card number and the six digits.',
  vouchedForYou:'{name} vouched for you. It is on your card.',
  sampleMode:'Sample mode: template extraction, no model call',
  // SMS vouch flow
  smsVouchMenu:MENU_HEAD+' Q4 hire again: 1 yes 2 rather not say. Reply L to change language.',
  smsTwoWords:'Say in two words what {first} did.',
  smsQ1:'Q1 What did {first} do? Reply 1 {chip1} 2 {chip2} 3 {chip3} 4 other',
  smsNotUnderstood:'I did not understand. Reply with four numbers, for example 1 1 2 1.',
  smsShowName:'Show your first name with the last 3 digits of your number? Reply your first name, or NONE.',
  smsReadback:'On {first}\'s card: "{line}" Said by {name}, code matched by SMS. Reply YES to publish, NO to cancel.',
  smsPublished:'Published. To remove it, text REMOVE {vouchId} {secret} any time. Nobody will message you again.',
  smsCancelled:'Cancelled. Nothing was recorded. Nobody will message you again.',
  smsRemoved:'Removed. Nobody will message you again.',
  smsStopQ:'Remove all {n} of your vouches? Reply YES.',
  smsNothing:'Nothing to remove for this number.',
  simSms:'Simulated SMS. No message was sent.',
  simCall:'Simulated call-back',
  // Call-back (IVR)
  ivrStart:'This is YoVouch. Key the 5-digit card number.',
  ivrCode:'Now the 6-digit code.',
  ivrIntro:"You are vouching for {first}, {trade}. A matched code shows you had {first}'s code in about the last four minutes. It does not show the work was done. Press 1 to continue, 2 to stop.",
  ivrAdult:'Are you 18 or older? Press 1 for yes, 2 for no.',
  ivrChips:'What did {first} do? Press 1 for {chip1}, 2 for {chip2}, 3 for {chip3}, 4 for other.',
  ivrWhen:'When? 1 this month, 2 last month, 3 earlier.',
  ivrHowOften:'How often? 1 once, 2 a few times, 3 regularly, 4 rather not say.',
  ivrHireAgain:'Would you hire {first} again? 1 yes, 2 rather not say.',
  ivrClip:'After the tone, say in 15 seconds what {first} did. Press any key to skip.',
  ivrShowName:'Show your first name and last 3 digits on the card? 1 yes, 2 no.',
  ivrReadback:"On {first}'s card it will say: {line}. Press 1 to publish, 2 to stop.",
  ivrPublished:'Published. To remove it, call this number and press 9. Nobody will call or message you.',
  ivrRemoveQ:'Your most recent vouch is for {first}. Press 9 again to remove it.',
  ivrWrong:'That code has expired or is wrong. Ask the worker to get a new code and call again.',
  // Request flow
  requestForward:'Forward this to a past customer: "{first} asks you to vouch for work they did for you. It takes one minute: {link}"',
  requestLanding:'{first} asked you to vouch for work they did for you. This vouch is marked "by request, from a link sent later".',
  requestUsed:'This request was already used.',
  requestExpired:'This request has expired. Ask {first} for a new one.',
  requestCap:'You already have 10 open requests. Wait for a reply or for one to expire.',
  // Reply by Voice
  waHello:'Hi. YoVouch writes a short reply to a job post from your own words. Reply 1 English, 2 isiZulu, 3 isiXhosa, 4 Kiswahili, 5 Pidgin.',
  waWhichCard:'Which card is yours? Open your card page, tap "Link WhatsApp", and reply with the 6-character link code it shows.',
  waLinkWrong:'That link code did not match or has expired.',
  postRead:'Post read. Work: {work}. Area: {area}. Pay: {pay}. Asked for: {documents}. No fee asked. Send one voice note of up to 20 seconds, or type: how you would get there, when you can start, and the closest work you have done.',
  docAsk:'The post asks for an ID. Reply 1 I have it, 2 leave it out.',
  docTold:'The post asks for an ID. We will write exactly what you say.',
  tooManyDocs:'The post asks for more than two things. Only {item1} and {item2} will be in your reply.',
  feeRefusal:'This post asks for money ({quote}). Real employers never charge to apply, to train, for a uniform or for a medical. No reply was drafted. Never pay before the work is done.',
  feeWarning:'This post mentions {quote}. A real employer never makes you pay for training, a kit, a uniform or a medical. If they ask you to pay anything, stop: never pay before the work is done.',
  noContact:'This post gives no number and no place to go. YoVouch cannot write a reply with nowhere to send it.',
  idByMessage:'This post asks you to send an ID photo or bank details by message. Do not send them. Show your ID in person only.',
  noJob:'I could not find a job in this message. Paste the text of the post.',
  cannotRead:'I could not read this. Paste the text of the post.',
  cutAt20:'Your voice note was cut at 20 seconds.',
  hereIsReply:'Here is your reply. Read every line.',
  replyMenu:'Reply 1 to get the English reply to forward, 2 to change a line (like "4 from Tuesday"), 3 to add a 15-second clip about yourself, 4 to ask {org} to refer you.',
  forwardThis:'Forward this to the number in the post. YoVouch never messages employers. If they ask you to pay anything, stop: never pay before the work is done.',
  translatedLabel:'Translated from {language} by AI. {first} confirmed the {language} wording.',
  isThisWhat:'Is this what you said?',
  voiceDown:'The voice service is not available right now. Answer by typing: 1 How would you get there? 2 What is the closest work you have done? 3 When can you start?',
  sendMyWords:'Send me my words',
  yourWords:'Your words, as heard: {transcript}',
  saidBy:'Said by {first}',
  notStated:'not stated',
  docsNone:'Documents asked for: none in the post',
  toTheJob:'to the job: {words}',
  line3Count:'Confirmed from Yoma: {n} completions · phone confirmed (not an ID check)',
  line3NoCount:'Confirmed from Yoma: phone confirmed (not an ID check)',
  line5Two:'{item1}: {answer1} · {item2}: {answer2} (stated by {first})',
  line6:"Card with {n} clips: {link} · lines 1, 4, 5 from {first}'s own words · card signed by YoCard, not by Yoma",
  srcCustomerCode:'(said by a customer, code matched)',
  srcCustomerTexted:'(said by a customer, code texted from their phone)',
  srcCustomerRequest:'(said by a customer, by request)',
  srcWorkerCode:'(vouched by another worker, code matched)',
  srcReferral:'(referred by {org})',
  srcYoma:'(confirmed from Yoma)',
  srcStated:'(stated by {first}, not checked)',
  smsReplyFull:'{first}, {trade}, {area}. {vouchShort} ({sourceShort}). Phone confirmed by Yoma (not an ID check). Card {link} code {cardCode}. Lines not checked by Yoma',
  simWa:'Simulated WhatsApp. No message was sent.',
  // Organisation referral
  askOrg:'Ask {org} to refer me for this post',
  forwardOrg:'Forward this to {org}: "Please refer me for this post: {link}"',
  orgWrite:'Write one sentence about {first} in your own words (under 160 characters). It will appear on their card as written, labelled "'+REFERRAL_LABEL+'".',
  sayWhatYouSaw:'Say what you saw, not a credential.',
  sendToAccept:'Send to {first} to accept',
  orgWrote:'{org} wrote: "{sentence}". Reply YES to put this on your card for this post, NO to decline. It will say "'+REFERRAL_LABEL+'".',
  referralDone:'Done. It is on your card. Forward your reply again if you already sent it, so the employer sees the referral.',
  withdrawReferral:'Withdraw referral',
  demoOrgKey:'Demo organisation key. A real key needs Yoma.',
  // Language choice
  langMenu:'1 English 2 isiZulu 3 isiXhosa 4 Kiswahili 5 Pidgin',
  replyL:'Reply L to change language',
  // Plan additions (not spelled out in section 17)
  codeWrongWeb:'This code did not match. Check the six digits with {first}.', // plan addition
  codeLockedWeb:'Typing codes is paused for this card. Scan the code instead.', // plan addition
  sessionEnded:"This vouch session ended. Nothing was recorded. Start again from {first}'s code.", // plan addition
  sampleNumber:'Sample number', // plan addition
  recentNo:'Nothing was recorded. Your earlier vouch for {first} stays on their card.', // plan addition
  visitAdded:'Added a visit to your vouch for {first}. Nobody will message you again.', // plan addition
  demoWithdrawHere:'Demo: no SMS gateway, so the withdraw link is shown here. In production it goes only to the phone that texted.', // plan addition
  docAskItem:'The post asks for: {item}. Reply 1 I have it, 2 leave it out.', // plan addition
  docToldItem:'The post asks for: {item}. We will write exactly what you say.', // plan addition
  smsVouchMenuWorker:MENU_HEAD+' Q4 work together again: 1 yes 2 rather not say. Reply L to change language.', // plan addition (spec 7.4)
  smsQ2:'Q2 When? Reply 1 this month 2 last month 3 earlier', // plan addition
  smsQ3:'Q3 How often? Reply 1 once 2 a few times 3 regularly 4 rather not say', // plan addition
  smsQ4:'Q4 Would you hire {first} again? Reply 1 yes 2 rather not say', // plan addition
  smsQ4Worker:'Q4 Would you work with {first} again? Reply 1 yes 2 rather not say', // plan addition
  smsCompletionOne:'1 completion on Yoma.', // plan addition
  smsCompletions:'{n} completions on Yoma.', // plan addition
  referralWithdrawnMsg:'{org} withdrew its referral. It is no longer on your card.', // plan addition
  orgKeyWrong:'That organisation key does not match.', // plan addition
  pasteRequestLink:'Or paste the request link you were sent', // plan addition
  beat3Label:'Prepared example: a model output that added "5 years". Not a live call.', // plan addition
  srcCustomerDemo:'(said by a customer, demo, nothing texted)', // plan addition
  srcWorkerRequest:'(vouched by another worker, by request)', // plan addition
  demoCodeWrong:'That code did not match. Type the code shown on this page.', // plan addition (demo fallback, attempts 1 and 2)
  demoNumberBad:'Type the whole phone number.', // plan addition (demo fallback)
  demoOneNumber:"This vouch already has a number. Start again from {first}'s code to use another." // plan addition (demo fallback)
};
const PLAN_ADDITIONS=['codeWrongWeb','codeLockedWeb','sessionEnded','sampleNumber','recentNo','visitAdded','demoWithdrawHere','docAskItem','docToldItem',
  'smsVouchMenuWorker','smsQ2','smsQ3','smsQ4','smsQ4Worker','smsCompletionOne','smsCompletions','referralWithdrawnMsg','orgKeyWrong','pasteRequestLink',
  'beat3Label','srcCustomerDemo','srcWorkerRequest','demoCodeWrong','demoNumberBad','demoOneNumber'];

let TRANSLATIONS={};
try{TRANSLATIONS=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','data','yovouch-copy.json'),'utf8'))||{};}catch{TRANSLATIONS={};}

// One pass, so a filled value that itself holds "{x}" (a transcript, say) is never read as a slot.
function t(key,lang='en',vars={}){
  if(!Object.prototype.hasOwnProperty.call(COPY,key))throw new Error('unknown copy key: '+key);
  const local=lang!=='en'&&TRANSLATIONS[lang]&&typeof TRANSLATIONS[lang][key]==='string'?TRANSLATIONS[lang][key]:null;
  return (local||COPY[key]).replace(/\{(\w+)\}/g,(m,slot)=>{
    if(vars==null||vars[slot]==null)throw new Error('unfilled slot {'+slot+'} in '+key);
    return String(vars[slot]);
  });
}

// "When: this month / last month / earlier" -> {stem:'When:', options:['this month','last month','earlier']}.
function splitOptions(template){
  const s=String(template);
  const i=s.search(/[?:]/);
  if(i<0)return {stem:s.trim(),options:[]};
  const rest=s.slice(i+1).trim();
  return {stem:s.slice(0,i+1).trim(),options:rest?rest.split(' / ').map(o=>o.trim()):[]};
}

module.exports={COPY,LANGS,LANG_NAMES,PLAN_ADDITIONS,t,splitOptions};
