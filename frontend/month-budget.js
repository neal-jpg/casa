/* Month-specific planning goals; all comparisons are calculated locally. */
(function(root){
 'use strict';let scope='all';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const known=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
 const included=r=>![false,0,'FALSE','false','no'].includes(r.included);
 const prior=month=>{const [y,m]=month.split('-').map(Number);return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`};
 function plans(state){try{const value=JSON.parse(state.settings.monthly_budgets_v1||'{"version":1,"months":{}}');return value.version===1&&value.months?value.months:{}}catch{return {}}}
 function compute(state,month,person,convert,today=new Date()){
  const plan=plans(state)[month]?.[person]||{currency:'CLP',goals:{}};
  const currency=plan.currency,goals=plan.goals;
  const rows=state.transactions.filter(r=>included(r)&&['expense','refund'].includes(r.kind)&&(person==='all'||r.person===person));
  const currentMonth=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;
  const baseline=[...new Set(rows.map(r=>String(r.date).slice(0,7)))].filter(m=>m<month&&m<currentMonth).sort();
  const forMonth=m=>rows.filter(r=>String(r.date).slice(0,7)===m);
  const total=records=>{const values=records.map(r=>{const value=convert(r,currency);return known(value)?Number(value)*(r.kind==='refund'?-1:1):null});return values.includes(null)?null:values.reduce((a,b)=>a+b,0)};
  const current=forMonth(month),previous=forMonth(prior(month));
  const categories=state.categories.filter(c=>Object.hasOwn(goals,c.id)).map(c=>{
   const selected=current.filter(r=>r.category_id===c.id),values=baseline.map(m=>total(forMonth(m).filter(r=>r.category_id===c.id)));
   const spent=current.length?total(selected):null,goal=Number(goals[c.id]);
   return {...c,goal,spent,previous:previous.length?total(previous.filter(r=>r.category_id===c.id)):null,
    average:values.length&&!values.includes(null)?values.reduce((a,b)=>a+b,0)/values.length:null,
    converted:selected.some(r=>r.charged_currency!==currency),missing:selected.filter(r=>!known(convert(r,currency))).length,refund:spent!==null&&spent<0,
    ratio:spent===null?null:goal===0?(spent>0?1:0):Math.max(0,spent/goal)};
  });
  const planned=categories.reduce((a,c)=>a+c.goal,0),spent=categories.some(c=>c.spent===null)?null:categories.reduce((a,c)=>a+c.spent,0);
  const unbudgeted=current.filter(r=>!Object.hasOwn(goals,r.category_id));
  return {month,person,currency,goals,categories,converted:categories.some(c=>c.converted),planned,spent,remaining:spent===null?null:planned-spent,baseline,
   unbudgeted:total(unbudgeted),unbudgetedCount:unbudgeted.length,currentCount:current.length,
   elapsed:month===currentMonth?today.getDate()/new Date(today.getFullYear(),today.getMonth()+1,0).getDate():month<currentMonth?1:0};
 }
 function render(ctx){
  const value=compute(ctx.state,ctx.month,scope,ctx.amount),currency=value.currency;
  const fmt=x=>known(x)?ctx.format(x,currency):'Not available';
  const difference=(now,base,label)=>{
   if(!known(now)||!known(base))return `<span>${label} unavailable</span>`;
   const delta=now-base;if(Math.abs(delta)<.005)return `<span>Same as ${label}</span>`;
   const text=base>0?`${Math.abs(delta/base*100).toFixed(0)}%`:fmt(Math.abs(delta));
   return `<span class="budget-comparison ${delta>0?'rise':'fall'}">${delta>0?'↑':'↓'} ${esc(text)} vs ${label}</span>`;
  };
  const row=c=>`<article class="budget-row"><div class="budget-row-heading"><button type="button" class="budget-category" data-budget-category="${esc(c.id)}">${ctx.categoryLabel(c)}</button><span class="budget-remaining ${c.spent!==null&&c.spent>c.goal?'over':''}">${c.spent===null?(c.missing?'Conversion needed':'No records yet'):c.spent>c.goal?`${esc(fmt(c.spent-c.goal))} over`:`${esc(fmt(c.goal-c.spent))} left`}</span></div><div class="budget-track ${c.spent!==null&&c.spent>c.goal?'over':''}"><progress max="100" value="${Math.min(100,Math.max(0,(c.ratio||0)*100))}" aria-label="${esc(c.name)} budget used"></progress>${value.elapsed>0&&value.elapsed<1?`<span class="budget-pace" style="left:${value.elapsed*100}%" title="Share of calendar month elapsed" aria-hidden="true"></span>`:''}</div><div class="budget-row-meta"><span>${c.spent===null?'Recorded spending unavailable':`${c.converted?'≈ ':''}${esc(fmt(c.spent))} ${c.refund?'net refunds':'spent'}`} <span class="muted">/ ${esc(fmt(c.goal))} goal</span></span><div>${difference(c.spent,c.previous,'last month')}${difference(c.spent,c.average,'monthly average')}</div></div></article>`;
  const rows=[...value.categories].sort((a,b)=>(b.ratio??-1)-(a.ratio??-1)||b.goal-a.goal);
  return `<section class="card card-pad subsection monthly-budget" id="monthly-budget"><div class="card-header"><div><div class="eyebrow">MAKE ROOM FOR WHAT MATTERS</div><h2 class="section-title">Monthly budget</h2><p>${esc(ctx.monthLabel(ctx.month))} · goals set by you · ${currency}</p></div><button type="button" class="button ${rows.length?'':'primary'}" data-budget-edit>${rows.length?'Edit goals':'Set monthly goals'}</button></div><div class="budget-scope" role="group" aria-label="Budget owner">${[['all','Household'],['neal',ctx.personName('neal')],['partner',ctx.personName('partner')]].map(([id,name])=>`<button type="button" class="person-tab ${scope===id?'active':''}" data-budget-scope="${id}" aria-pressed="${scope===id}">${esc(name)}</button>`).join('')}</div>${rows.length?`<div class="budget-summary"><div><small>Monthly goals</small><strong>${esc(fmt(value.planned))}</strong><span>${rows.length} ${rows.length===1?'category':'categories'} planned</span></div><div><small>Recorded spending</small><strong>${value.converted?'≈ ':''}${esc(fmt(value.spent))}</strong><span>In budgeted categories</span></div><div class="${value.remaining!==null&&value.remaining<0?'over':''}"><small>${value.remaining!==null&&value.remaining<0?'Over budget':'Left in the plan'}</small><strong>${esc(fmt(value.remaining===null?null:Math.abs(value.remaining)))}</strong><span>${Math.round(value.elapsed*100)}% of calendar month elapsed</span></div></div><div class="budget-rows">${rows.slice(0,6).map(row).join('')}</div>${rows.length>6?`<details class="budget-more"><summary>Show ${rows.length-6} more categories</summary>${rows.slice(6).map(row).join('')}</details>`:''}${value.unbudgetedCount?`<div class="budget-unplanned"><span>${esc(fmt(value.unbudgeted))} recorded outside budgeted categories</span><button type="button" class="small-link" data-budget-edit>Add goals</button></div>`:''}<details class="budget-notes"><summary>How these figures are calculated · ${value.baseline.length} baseline months</summary><p class="table-note">Refunds reduce spending. Comparisons use ${value.baseline.length} prior finished months with recorded expenses. Missing months are not assumed to be zero; unrecorded purchases can change this picture. Currency conversions use saved or dated reporting estimates. ${value.elapsed>0&&value.elapsed<1?'The thin marker shows calendar time, not a prediction of spending.':''}</p></details>`:`<div class="budget-empty"><div class="budget-empty-symbol" aria-hidden="true">◎</div><div><h3>A clear plan for this month</h3><p>Set category goals to see what you’ve spent, what’s left, and how this month compares. Blank categories stay outside the plan.</p></div></div>`}</section>`;
 }
 function edit(ctx){
  const data=compute(ctx.state,ctx.month,scope,ctx.amount),previous=plans(ctx.state)[prior(ctx.month)]?.[scope];
  const cats=ctx.state.categories.filter(c=>(!ctx.isTrue(c.archived)||Object.hasOwn(data.goals,c.id))&&(c.name.toLowerCase()!=='income'||Object.hasOwn(data.goals,c.id))).sort((a,b)=>Number(Object.hasOwn(data.goals,b.id))-Number(Object.hasOwn(data.goals,a.id))||a.name.localeCompare(b.name));
  ctx.openModal(`Budget goals · ${ctx.monthLabel(ctx.month)}`,`<p class="modal-description">${esc(scope==='all'?'Household':ctx.personName(scope))} · These goals apply only to this month. Leave a field blank to keep that category outside your plan. Enter 0 for a zero-spend goal.</p><div class="budget-editor-toolbar"><label for="budget-currency">Budget currency<select id="budget-currency" name="budget-currency"><option ${data.currency==='CLP'?'selected':''}>CLP</option><option ${data.currency==='USD'?'selected':''}>USD</option></select></label>${previous?'<button class="button small" type="button" id="budget-copy">Copy last month’s goals</button>':''}</div><p id="budget-edit-note" class="table-note" role="status"></p><div class="budget-editor-list">${cats.map(c=>`<label class="budget-editor-row" for="goal-${esc(c.id)}">${ctx.categoryLabel(c)}<input id="goal-${esc(c.id)}" name="goal-${esc(c.id)}" data-budget-input="${esc(c.id)}" type="number" min="0" max="1000000000000" step="${data.currency==='CLP'?1:.01}" inputmode="decimal" placeholder="No goal" value="${esc(data.goals[c.id]??'')}" aria-label="${esc(c.name)} goal"></label>`).join('')}</div>`,`<button class="button primary" type="submit">Save monthly goals</button>`,async form=>{
   const currency=form.get('budget-currency'),goals={};
   cats.forEach(c=>{const raw=form.get('goal-'+c.id);if(raw!==''&&raw!==null)goals[c.id]=Number(raw)});
   await ctx.save({month:ctx.month,person:scope,currency,goals});
  });
  const select=document.getElementById('budget-currency'),inputs=[...document.querySelectorAll('[data-budget-input]')];
  select.onchange=()=>{inputs.forEach(input=>{input.value='';input.step=select.value==='CLP'?'1':'.01'});document.getElementById('budget-edit-note').textContent=`Currency changed to ${select.value}. Re-enter goals in this currency.`};
  document.getElementById('budget-copy')?.addEventListener('click',()=>{select.value=previous.currency;inputs.forEach(input=>{input.value=previous.goals[input.dataset.budgetInput]??'';input.step=select.value==='CLP'?'1':'.01'});document.getElementById('budget-edit-note').textContent='Last month’s goals copied. Review and save to apply them to this month.'});
 }
 function mount(ctx){
  document.querySelectorAll('[data-budget-scope]').forEach(button=>button.onclick=()=>{scope=button.dataset.budgetScope;const host=document.getElementById('monthly-budget');host.outerHTML=render(ctx);mount(ctx)});
  document.querySelectorAll('[data-budget-edit]').forEach(button=>{button.disabled=ctx.readOnly;button.onclick=()=>edit(ctx)});
  document.querySelectorAll('[data-budget-category]').forEach(button=>button.onclick=()=>ctx.drill(button.dataset.budgetCategory,scope));
 }
 root.CasaBudget=Object.freeze({render,mount,compute});
})(window);
