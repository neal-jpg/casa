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
   section.innerHTML='<div class="refresh-progress-copy"><strong>Updating Casa</strong><p id="refresh-stage" role="status" aria-live="polite"></p><small id="refresh-count"></small><progress id="refresh-meter" aria-label="Documents processed"></progress></div><button class="button small" id="refresh-stop" type="button">Stop analysis</button>';
   const topbar=document.querySelector('.topbar');if(topbar)topbar.after(section);else shell.append(section);
   el('refresh-stop').onclick=stop;
  }
  run={id:root.crypto.randomUUID(),request,cloud,stopping:false,timer:null};
  el('refresh-button')?.classList.add('is-refreshing');show({message:cloud?'Reading the master Sheet…':'Reloading the workbook…'});
  if(cloud)run.timer=setInterval(async()=>{const current=run;try{const data=await request('/api/analysis/progress',{id:current.id});if(run===current)show(data)}catch{/* The first poll may precede a cold start. */}},2500);
  return run.id;
 }
 function finish(error=false){
  if(!run)return;clearInterval(run.timer);const stopped=run.stopping||run.lastPhase==='stopped';run=null;el('refresh-button')?.classList.remove('is-refreshing');
  el('refresh-stop').hidden=true;el('refresh-stage').textContent=error?'Refresh could not finish. Saved records are retained.':stopped?'Analysis stopped. Saved records are retained.':'Refresh complete.';
  el('refresh-count').textContent='';el('refresh-meter').hidden=true;
  setTimeout(()=>{if(!run)el('refresh-progress').hidden=true},6000);
 }
 root.CasaRefresh=Object.freeze({begin,show,stop,finish,stopping:()=>!!run?.stopping});
})(window);
