/* YoVouch simulated WhatsApp thread (spec 9.5, 13; plan Task 16). A plain static page that only works against
   POST /api/sim/wa (YOVOUCH_SIM=1). Typed messages go to the same handler a WhatsApp gateway would drive; a voice
   note goes to the audio /api/reply/draft (or the self-clip route at menu 3) with the card headers from
   ?card=<id>&token=<token>. Every message shows its size; Forward copies the six lines and records the tap. */
(()=>{
'use strict';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const SIM='Simulated WhatsApp. No message was sent.';
const q=new URLSearchParams(location.search),card=q.get('card')||'',token=q.get('token')||'';
const log=document.querySelector('#log'),form=document.querySelector('#send'),from=document.querySelector('#from'),box=document.querySelector('#text'),rec=document.querySelector('#rec');
let chat={jobPostId:null,replyId:null,step:null,lang:'en'},recorder=null,timer=null;
const kb=text=>(new Blob([text]).size/1024).toFixed(2)+' KB';
function add(dir,text,{html=null,cls=''}={}){
 const li=document.createElement('li');li.className=dir+(cls?' '+cls:'');
 li.innerHTML=(html??E(text))+(dir==='note'?'':`<span class="kb">${E(kb(text))}</span>`);
 log.appendChild(li);li.scrollIntoView({block:'end'});
 return li;
}
function note(text,cls=''){add('note',text,{cls});}
// Each reply is a YoVouch bubble; the simulator label ends the list and is shown once, small.
function show(j){
 const replies=Array.isArray(j?.replies)?j.replies:[];
 for(const r of replies)if(r!==SIM)add('in',r);
 if(Array.isArray(j?.rejected)&&j.rejected.length)add('in',j.rejected.map(x=>`Not kept: ${x.field} (${x.reason})`).join('\n'));
 if(replies.includes(SIM))note(SIM);
 for(const k of ['jobPostId','replyId','step','lang'])if(j&&j[k]!==undefined)chat[k]=j[k];
 if(j?.forward)forwardButton(j.forward);
 rec.hidden=!(window.MediaRecorder&&navigator.mediaDevices&&card&&token&&(chat.step==='self_clip'?chat.replyId:chat.jobPostId&&['docs','answers'].includes(chat.step)));
}
async function json(url,body,headers={'content-type':'application/json'}){
 const res=await fetch(url,{method:'POST',headers,body});
 if(url==='/api/sim/wa'&&res.status===404){note('Start the server with YOVOUCH_SIM=1.','bad');return null;}
 const j=await res.json().catch(()=>null);
 if(!res.ok){note(j?.error?.message||'Something went wrong.','bad');return null;}
 return j;
}
function forwardButton(six){
 const li=add('note','',{html:'<button type="button">Forward</button>'}),btn=li.querySelector('button'),replyId=chat.replyId;
 btn.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(six);note('Copied the six lines. Paste them into the chat with the employer.');}catch{note('Copy the six lines above by hand.');}
  if(card&&token&&replyId)await json(`/api/reply/${replyId}/forwarded`,JSON.stringify({cardId:card,cardToken:token}));
 });
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const text=box.value.trim();if(!text||!from.value.trim())return;
 add('out',text);box.value='';
 show(await json('/api/sim/wa',JSON.stringify({from:from.value.trim(),text})));
});
// The recorder: 20 seconds for the answer, 15 for the self clip, in the browser's own container.
function stop(){clearTimeout(timer);if(recorder&&recorder.state!=='inactive')recorder.stop();}
rec.addEventListener('click',async()=>{
 if(recorder&&recorder.state==='recording')return stop();
 const self=chat.step==='self_clip',max=self?15:20;
 let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}catch{return note('No microphone. Type instead.','bad');}
 const chunks=[];try{recorder=new MediaRecorder(stream,{audioBitsPerSecond:16000});}catch{recorder=new MediaRecorder(stream);}
 const t0=Date.now();
 recorder.ondataavailable=ev=>{if(ev.data&&ev.data.size)chunks.push(ev.data);};
 recorder.onstop=async()=>{
  stream.getTracks().forEach(x=>x.stop());rec.textContent='Record';
  const blob=new Blob(chunks,{type:recorder.mimeType||'audio/webm'}),seconds=Math.max(1,Math.min(max,Math.ceil((Date.now()-t0)/1000)));
  add('out',`Voice note, ${seconds} s`,{html:E(`Voice note, ${seconds} s`)});
  const headers={'content-type':(blob.type||'audio/webm').split(';')[0],'x-card-id':card,'x-card-token':token,'x-clip-seconds':String(seconds)};
  if(self){
   const j=await json(`/api/reply/${chat.replyId}/self-clip`,blob,headers);
   if(j?.lines)add('in',j.lines.join('\n'));
   return;
  }
  const j=await json('/api/reply/draft',blob,{...headers,'x-job-post-id':chat.jobPostId,'x-lang':chat.lang});
  if(!j)return;
  if(j.replyId){chat.replyId=j.replyId;chat.step='menu';}
  show({replies:j.messages||(j.message?[j.message]:[]),rejected:j.rejected});
 };
 recorder.start();rec.textContent='Stop';timer=setTimeout(stop,max*1000);
});
})();
