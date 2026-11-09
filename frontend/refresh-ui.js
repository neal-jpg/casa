/* Refresh controls stay outside page renders. Stop waits for a safe server boundary. */
(function(root){
 'use strict';let run=null;
 const el=id=>document.getElementById(id);
 function show(value){
  if(!run)return;
  const phase=value.phase||'starting';run.lastPhase=phase;const done=value.completed||0,total=value.total;
  const text=run.stopping?'Stopping analysis · waiting for the current request to finish…':value.message||'Reading the master Sheet…';
  el('refresh-progress').hidden=false;el('refresh-stage').textContent=text;
  el('refresh-count').textContent=Number.isFinite(total)?`${done} of ${total} documents finished`:run.cloud?'Your saved records are retained while Casa works.':'Reading the latest saved workbook.';
  const bar=el('refresh-meter');bar.hidden=false;if(total>0){bar.max=total;bar.value=done}else bar.removeAttribute('value');
  el('refresh-stop').hidden=!run.cloud;el('refresh-stop').disabled=run.stopping;el('refresh-stop').textContent=run.stopping?'Stopping…':'Stop analysis';
 }
 async function stop(){
  if(!run||run.stopping)return;run.stopping=true;show({});
  try{await run.request('/api/analysis/stop',{id:run.id})}catch(error){el('refresh-stage').textContent='Further files are stopped, but the current document may still finish. '+error.message;}
 }
 function begin(request,cloud=true){
  const shell=el('web-app')||document.body;
  if(!el('refresh-progress')){
   const section=document.createElement('section');section.id='refresh-progress';section.className='refresh-progress';section.setAttribute('aria-label','Refresh progress');
   section.innerHTML='<div class="refresh-progress-copy"><strong>Updating Casa</strong><p id="refresh-stage" role="status" aria-live="polite"></p><small id="refresh-count"></small><progress id="refresh-meter" aria-label="Documents processed"></progress><details id="refresh-details" hidden><summary>Document results</summary><ul id="refresh-results"></ul></details></div><div><button class="button small" id="refresh-stop" type="button">Stop analysis</button><button class="button small" id="refresh-review" type="button" hidden>Inbox review</button><button class="small-link" id="refresh-dismiss" type="button" hidden>Dismiss</button></div>';
   const topbar=document.querySelector('.topbar');if(topbar)topbar.after(section);else shell.append(section);
   el('refresh-stop').onclick=stop;
   el('refresh-review').onclick=()=>root.CasaAssistant?.open('inbox');
   el('refresh-dismiss').onclick=()=>el('refresh-progress').hidden=true;
  }
  run={id:root.crypto.randomUUID(),request,cloud,stopping:false,timer:null,files:new Map()};
  el('refresh-results').textContent='';el('refresh-details').hidden=true;el('refresh-review').hidden=true;el('refresh-dismiss').hidden=true;
  el('refresh-button')?.classList.add('is-refreshing');show({message:cloud?'Reading the master Sheet…':'Reloading the workbook…'});
  if(cloud)run.timer=setInterval(async()=>{const current=run;try{const data=await request('/api/analysis/progress',{id:current.id});if(run===current)show(data)}catch{/* The first poll may precede a cold start. */}},2500);
  return run.id;
 }
 function record(analysis){if(run&&analysis?.file)run.files.set(analysis.file.id,analysis.file);}
 function finish(error=false,analysis=null){
  if(!run)return;clearInterval(run.timer);const stopped=run.stopping||run.lastPhase==='stopped',completed=run.files;run=null;el('refresh-button')?.classList.remove('is-refreshing');
  el('refresh-stop').hidden=true;const summary=analysis?.summary||{},review=summary.review||0,pending=summary.organization_pending||0;
  el('refresh-stage').textContent=error?'Refresh could not finish. Saved records are retained.':stopped?'Analysis stopped. Saved records are retained.':review?`Sheet refreshed · ${review} document${review===1?' needs':'s need'} review.`:pending?'Sheet refreshed · file organization needs attention.':analysis?.message||'Refresh complete.';
  el('refresh-count').textContent=pending?`${pending} original file${pending===1?'':'s'} could not be filed. Open document results for the reason.`:review?'Extracted drafts are saved. Open Inbox review to confirm missing details.':'';el('refresh-meter').hidden=true;
  const files=new Map(completed);for(const file of summary.files||[])files.set(file.id,file);if(analysis?.file)files.set(analysis.file.id,analysis.file);
  for(const file of files.values()){const li=document.createElement('li');li.textContent=`${file.name} — ${file.message||file.status}${file.archive?.status==='pending'?' · '+file.archive.message:file.archive?.path?' · Filed in '+file.archive.path:''}`;el('refresh-results').append(li);}
  el('refresh-details').hidden=!files.size;el('refresh-review').hidden=!(review||pending);el('refresh-dismiss').hidden=false;
  if(!(error||review||pending||analysis?.remaining>0))setTimeout(()=>{if(!run)el('refresh-progress').hidden=true},10000);
 }
 root.CasaRefresh=Object.freeze({begin,show,record,stop,finish,stopping:()=>!!run?.stopping});
})(window);
