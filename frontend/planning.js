/* Interactive planning. Preview assumptions never become historical facts. */
(function (global) {
  'use strict';
  const modes = [['outlook','Investment outlook'],['cash','Cash flow'],['calculator','Calculator']];
  const scenarios = [['conservative','Conservative'],['normal','Normal'],['aggressive','Aggressive']];
  const colors = {conservative:'var(--plan-conservative)',normal:'var(--plan-normal)',aggressive:'var(--plan-aggressive)'};
  const finite = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
  const e = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = v => finite(v) ? Number(v) : null;
  const settingsKeys = ['closing_cash_clp','forecast_income_neal_usd','forecast_income_partner_clp','forecast_expenses_clp','forecast_investment_clp','fx_clp_per_usd'];
  const memory = {mode:'outlook',currency:null,amountsByCurrency:{},outlook:{years:20,inspect:20,depositMode:'growth',monthly:null,rates:{conservative:3,normal:6,aggressive:9},scope:'all',goalId:''},calculator:{starting:10000,monthly:100,years:20,rate:6,inspect:20},cash:{years:12,inspect:12,startMonth:'',values:null,sourceValues:null,sourceSignature:null,dirty:false,sourceChanged:false,saveMessage:''},loadedSettings:false};
  const money = (ctx,value,currency=ctx.ui.currency) => finite(value) ? ctx.nativeMoney(Number(value),currency) : 'Not supplied';
  const dateMonth = value => /^\d{4}-\d{2}/.test(String(value || '')) ? String(value).slice(0,7) : `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
  const addMonths = (month,count) => {const d=new Date(`${month}-15T12:00:00`);d.setMonth(d.getMonth()+count);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
  const monthName = value => new Date(`${value}-15T12:00:00`).toLocaleDateString('en-US',{month:'short',year:'numeric'});
  const compact = value => Math.abs(value)>=1e9?`${(value/1e9).toFixed(1)}b`:Math.abs(value)>=1e6?`${(value/1e6).toFixed(1)}m`:Math.abs(value)>=1000?`${(value/1000).toFixed(0)}k`:`${Math.round(value)}`;
  const percent = value => `${Number(value).toFixed(1)}%`;
  const cashValues = settings => Object.fromEntries(settingsKeys.map(key=>[key,num(settings?.[key])]));
  const cashSignature = values => JSON.stringify(settingsKeys.map(key=>num(values?.[key])));
  function markCashDraft() {
    const c=memory.cash;c.dirty=cashSignature(c.values)!==c.sourceSignature;c.saveMessage='';
    if(!c.dirty)c.sourceChanged=false;
  }
  function cashStatus(ctx) {
    const c=memory.cash;
    if(ctx.state.editing_external)return 'Save and close Excel to resume app changes.';
    if(c.dirty&&c.sourceChanged)return 'Workbook assumptions changed. Your unsaved preview is preserved; save it to replace those workbook values, or use saved assumptions.';
    if(c.dirty)return 'Unsaved cash assumptions. The graph is a preview until saved.';
    return c.saveMessage||'Cash assumptions match the workbook. Timeline controls remain a preview.';
  }

  function aggregate(ctx,group='all') {
    if (!global.CasaGrowth) return null;
    return global.CasaGrowth.aggregate(ctx.state,{person:ctx.ui.person,currency:ctx.ui.currency,...(group==='all'?{}:{group})});
  }
  function initialise(ctx) {
    const currency=ctx.ui.currency;
    if(memory.currency!==currency){
      if(memory.currency)memory.amountsByCurrency[memory.currency]={monthly:memory.outlook.monthly,starting:memory.calculator.starting,calculatorMonthly:memory.calculator.monthly};
      const saved=memory.amountsByCurrency[currency];
      memory.outlook.monthly=saved?.monthly??null;
      memory.calculator.starting=saved?.starting??(currency==='USD'?10000:10000000);
      memory.calculator.monthly=saved?.calculatorMonthly??(currency==='USD'?100:100000);
      memory.currency=currency;
    }
    const c=memory.cash,sourceValues=cashValues(ctx.state.settings),sourceSignature=cashSignature(sourceValues);
    const changed=c.sourceSignature!==null&&c.sourceSignature!==sourceSignature;
    if(!memory.loadedSettings||!c.dirty||cashSignature(c.values)===sourceSignature){
      c.values={...sourceValues};c.dirty=false;c.sourceChanged=false;
      if(changed)c.saveMessage='Cash assumptions refreshed from the workbook.';
    }else if(changed)c.sourceChanged=true;
    c.sourceValues=sourceValues;c.sourceSignature=sourceSignature;
    if(!memory.loadedSettings)c.startMonth=dateMonth(ctx.state.settings.valuation_date);
    memory.loadedSettings=true;
  }
  function input(label,key,value,options={}) {
    const {min=0,max=1e14,step=.01,unit='',cash=false}=options;
    return `<label class="plan-field"><span>${e(label)}${unit?` <small>${e(unit)}</small>`:''}</span><input type="number" ${cash?'data-cash-field':'data-plan-field'}="${e(key)}" value="${finite(value)?e(value):''}" min="${min}" max="${max}" step="${step}" inputmode="decimal"></label>`;
  }
  function horizon(label,years,max=40,kind='years') {
    return `<div class="plan-horizon"><div><label for="plan-horizon">${e(label)}</label><strong id="plan-horizon-value">${years} ${kind}</strong></div><input id="plan-horizon" data-plan-field="years" type="range" min="1" max="${max}" step="1" value="${years}" aria-label="${e(label)}"><div class="plan-range-labels"><span>1 ${kind==='years'?'year':'month'}</span><span>${max} ${kind}</span></div></div>`;
  }
  function tabs() {return `<div class="plan-tabs" role="tablist" aria-label="Forecast tools">${modes.map(([id,label])=>`<button type="button" role="tab" id="plan-tab-${id}" aria-controls="plan-panel" aria-selected="${memory.mode===id}" data-plan-tab="${id}" class="${memory.mode===id?'active':''}">${label}</button>`).join('')}</div>`;}
  function title(ctx) {
    const filters=memory.mode==='outlook'?`<div class="person-tabs" role="group" aria-label="Filter by person">${['all','neal','partner'].map(p=>`<button type="button" class="person-tab ${ctx.ui.person===p?'active':''}" data-person="${p}" aria-pressed="${ctx.ui.person===p}">${e(ctx.personName(p))}</button>`).join('')}</div>`:'';
    return `<div class="page-head"><div><div class="eyebrow">LOOK AHEAD</div><h1>Make room for the future.</h1><p>Explore investment paths, plan household cash, or try a separate compound-growth calculation.</p></div></div>${filters}`;
  }
  function scopeOptions() {return [['all','All investments'],['retirement','Retirement'],['children','Children & college'],['brokerage','Brokerage'],['other','Other accounts']];}
  function goalReferences(ctx,a) {
    return (ctx.state.goals||[]).filter(g=>(ctx.ui.person==='all'||g.person===ctx.ui.person||g.person==='family')&&finite(g.target)&&Number(g.target)>0).map(g=>({...g,value:global.CasaGrowth.convert(Number(g.target),g.currency,ctx.ui.currency,a?.fx)})).filter(g=>finite(g.value));
  }
  function outlookControls(ctx) {
    const c=memory.outlook,a=aggregate(ctx,c.scope),goals=goalReferences(ctx,a);
    return `<aside class="plan-controls"><div class="plan-control-heading"><h2>Build your scenario</h2><span>Preview only</span></div><label class="plan-field"><span>Investment group</span><select data-plan-field="scope">${scopeOptions().map(([v,label])=>`<option value="${v}" ${c.scope===v?'selected':''}>${label}</option>`).join('')}</select></label><div class="plan-starting"><span>Known starting investments</span><strong>${money(ctx,a?.knownTotal)}</strong><small>${a?.asOf?'Snapshot '+e(a.asOf):'Source snapshots'}${a?.missingCount?` · ${a.missingCount} account balance${a.missingCount===1?'':'s'} missing`:''}</small></div>${goals.length?`<label class="plan-field"><span>Goal reference line</span><select data-plan-field="goalId"><option value="">No goal overlay</option>${goals.map(g=>`<option value="${e(g.id)}" ${c.goalId===g.id?'selected':''}>${e(g.name)} · ${money(ctx,g.value)}</option>`).join('')}</select></label>`:''}${horizon('Time horizon',c.years)}<div class="plan-presets" role="group" aria-label="Quick time horizons">${[5,10,20,30].map(y=>`<button type="button" data-plan-years="${y}" class="${c.years===y?'active':''}">${y}y</button>`).join('')}</div><label class="plan-field"><span>Additional deposits</span><select data-plan-field="depositMode"><option value="growth" ${c.depositMode==='growth'?'selected':''}>Growth only · no new deposits</option><option value="monthly" ${c.depositMode==='monthly'?'selected':''}>Add a monthly amount</option></select></label>${c.depositMode==='monthly'?input('Monthly deposit','monthly',c.monthly,{unit:ctx.ui.currency}):'<p class="plan-input-note">This illustration assumes no new deposits. It does not mean your actual contributions are zero.</p>'}<div class="plan-rates"><h3>Annual return assumptions</h3>${scenarios.map(([id,label])=>`<div class="plan-rate"><i style="background:${colors[id]}"></i>${input(label,'rate-'+id,c.rates[id],{min:-99,max:100,step:.1,unit:'%'})}</div>`).join('')}</div><p class="plan-input-note">Illustrative rates after fees, before taxes and inflation. These are editable assumptions, not historical returns or predicted outcomes.</p></aside>`;
  }
  function scenarioChart(ctx,result,selectedYear,startMonth,goals=[]) {
    const series=result.series;
    const width=900,height=340,left=76,right=24,top=28,bottom=43,innerW=width-left-right,innerH=height-top-bottom;
    const values=scenarios.flatMap(([id])=>series[id].map(p=>p.balance));
    const baseline=series.normal.map(p=>p.contributions);
    const max=Math.max(1,...values,...baseline,...goals.map(g=>g.value))*1.08;
    const x=month=>left+month/result.months*innerW,y=value=>top+innerH-(value/max)*innerH;
    const line=points=>points.map((p,i)=>`${i?'L':'M'}${x(p.month).toFixed(2)},${y(p.balance).toFixed(2)}`).join(' ');
    const lower=series.conservative,upper=series.aggressive;
    let svg=`<svg class="plan-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Investment forecast with conservative, normal, and aggressive annual-return scenarios over ${result.years} years">`;
    for(let i=0;i<=4;i++){const value=max*i/4,yy=y(value);svg+=`<line class="plan-chart-grid" x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}"/><text class="plan-chart-label" x="${left-12}" y="${yy+4}" text-anchor="end">${e(compact(value))}</text>`;}
    const band=upper.map((p,i)=>`${i?'L':'M'}${x(p.month)},${y(p.balance)}`).join(' ')+' '+[...lower].reverse().map(p=>`L${x(p.month)},${y(p.balance)}`).join(' ')+' Z';
    svg+=`<path d="${band}" class="plan-scenario-band"/>`;
    goals.forEach(g=>{svg+=`<line class="plan-goal-line" x1="${left}" x2="${width-right}" y1="${y(g.value)}" y2="${y(g.value)}"/><text class="plan-chart-label" x="${left+8}" y="${y(g.value)-7}">${e(g.name)} target</text>`;});
    svg+=`<path d="${baseline.map((value,i)=>`${i?'L':'M'}${x(i)},${y(value)}`).join(' ')}" class="plan-contribution-line"/>`;
    scenarios.forEach(([id])=>{svg+=`<path d="${line(series[id])}" fill="none" stroke="${colors[id]}" stroke-width="${id==='normal'?3:2.3}"/>`;});
    const selected=Math.max(0,Math.min(result.months,Math.round(selectedYear*12))),xx=x(selected);
    svg+=`<line class="plan-selected-line" x1="${xx}" x2="${xx}" y1="${top}" y2="${top+innerH}"/>`;
    scenarios.forEach(([id])=>{const p=series[id][selected];svg+=`<circle cx="${xx}" cy="${y(p.balance)}" r="4" fill="${colors[id]}" stroke="var(--surface)" stroke-width="2"/>`;});
    const interval=result.years<=10?1:result.years<=25?5:10;
    const ticks=[...new Set([0,...Array.from({length:Math.floor(result.years/interval)},(_,i)=>(i+1)*interval),result.years])];
    ticks.forEach(year=>{svg+=`<text class="plan-chart-label" x="${x(year*12)}" y="${height-12}" text-anchor="middle">${monthName(addMonths(startMonth,year*12))}</text>`;});
    for(let year=0;year<=result.years;year++){const center=x(year*12),w=innerW/result.years;const title=scenarios.map(([id,label])=>`${label}: ${money(ctx,series[id][year*12].balance)}`).join(' · ');svg+=`<rect x="${Math.max(left,center-w/2)}" y="${top}" width="${Math.min(w,width-right-Math.max(left,center-w/2))}" height="${innerH}" fill="transparent" role="button" tabindex="0" data-plan-inspect="${year}" aria-label="Inspect year ${year}. ${e(title)}"><title>${e(monthName(addMonths(startMonth,year*12))+' · '+title)}</title></rect>`;}
    return svg+'</svg>';
  }
  function scenarioResult(ctx) {
    const c=memory.outlook,a=aggregate(ctx,c.scope);
    if (!a || !a.accounts.length || (!a.accounts.some(account=>finite(account.displayBalance)))) return `<div class="plan-empty"><h3>Add a starting balance to see the path ahead</h3><p>No known investment balances are available for this person and group.</p><button class="button" data-view="investments">Review investment accounts</button></div>`;
    const monthly=c.depositMode==='growth'?0:c.monthly;
    let result;
    try {result=global.CasaGrowth.project({startingBalance:a.knownTotal,monthlyContribution:monthly,years:c.years,rates:c.rates});}
    catch(error){return `<div class="plan-empty"><h3>Complete your scenario</h3><p>${e(error.message || 'Enter a monthly deposit and valid return assumptions.')}</p></div>`;}
    const index=Math.round(Math.min(c.inspect,c.years)*12),point=result.series.normal[index];
    const startMonth=dateMonth(a.asOf);
    const incomplete=a.missingCount?`<div class="plan-coverage"><strong>Partial portfolio</strong> ${a.missingCount} account balance${a.missingCount===1?' is':'s are'} missing and excluded from this illustration.</div>`:'';
    const goalRecords=goalReferences(ctx,a),overlay=goalRecords.find(g=>g.id===c.goalId);
    return `<div class="plan-result-heading"><div><div class="plan-kicker">INVESTMENT OUTLOOK</div><h2>Three possible paths</h2><p>${e(ctx.personName(ctx.ui.person))} · ${e(ctx.ui.currency)} · ${e(scopeOptions().find(([id])=>id===c.scope)?.[1]||'All investments')}</p></div><div class="plan-ending"><span>Viewing</span><strong>${monthName(addMonths(startMonth,index))}</strong></div></div>${incomplete}<div class="plan-chart-legend">${scenarios.map(([id,label])=>`<span><i style="background:${colors[id]}"></i>${label} <strong>${percent(c.rates[id])}</strong></span>`).join('')}<span><i class="plan-dashed-key"></i>Starting amount + deposits</span></div><div class="plan-chart">${scenarioChart(ctx,result,c.inspect,startMonth,overlay?[overlay]:[])}</div><div class="plan-inspect"><label for="plan-inspect">Explore the timeline <strong>Year ${Math.min(c.inspect,c.years)} of ${c.years}</strong></label><input id="plan-inspect" data-plan-field="inspect" type="range" min="0" max="${c.years}" value="${Math.min(c.inspect,c.years)}" step="1" aria-label="Inspect forecast year"></div><div class="plan-scenario-results">${scenarios.map(([id,label])=>{const p=result.series[id][index];return `<div class="${id==='normal'?'normal':''}"><span><i style="background:${colors[id]}"></i>${label}</span><strong>${money(ctx,p.balance)}</strong><small>${p.gain>=0?'Growth':'Change'} ${money(ctx,p.gain)}</small></div>`;}).join('')}</div><div class="plan-total-breakdown"><span>Starting amount <strong>${money(ctx,result.startingBalance)}</strong></span><span>New deposits by this point <strong>${money(ctx,point.addedContributions)}</strong></span><span>Normal scenario growth <strong>${money(ctx,point.gain)}</strong></span></div><details class="plan-method"><summary>What this illustration includes</summary><p>Annual assumptions are converted to effective monthly rates. Deposits are made at month end. Each scenario applies the same constant return to every selected balance, including any cash accounts; allocation-specific returns are not modeled and actual investments fluctuate. The shaded range compares assumptions and is not a probability interval.</p><p>Starting balances come from saved investment snapshots, with fixed reporting FX for cross-currency values${a.fx?.date?' dated '+e(a.fx.date):''}. Goals and proposed allocations are not added to account balances. Actual monthly contributions may be unknown; the deposit control is a scenario assumption.</p>${goalRecords.length?'<p>Saved goals have individual targets. A combined portfolio crossing a target does not establish that the goal is funded; review its actual account allocation in Life goals.</p>':'<p>Goal target amounts and dates have not yet been supplied. Add them in Life goals to plan against a concrete milestone.</p>'}<button type="button" class="small-link" data-view="goals">Review life goals →</button></details>`;
  }
  function outlook(ctx) {return `<section class="plan-workspace"><div class="plan-workspace-grid">${outlookControls(ctx)}<div class="plan-results" id="plan-results">${scenarioResult(ctx)}</div></div></section>`;}

  function cashSchedule(values,months) {
    if(settingsKeys.some(key=>!finite(values[key]))) throw new RangeError('Enter all six cash-flow assumptions. Use an explicit zero when an amount is genuinely zero.');
    if(settingsKeys.some(key=>Number(values[key])<0)||Number(values.fx_clp_per_usd)<=0)throw new RangeError('Amounts must be zero or positive, and the exchange rate must be positive.');
    if(!Number.isInteger(months)||months<1||months>120)throw new RangeError('Choose a cash-flow horizon between 1 and 120 months.');
    const income=Number(values.forecast_income_neal_usd)*Number(values.fx_clp_per_usd)+Number(values.forecast_income_partner_clp),expenses=Number(values.forecast_expenses_clp),investing=Number(values.forecast_investment_clp),change=income-expenses-investing;
    const points=Array.from({length:months+1},(_,month)=>({month,balance:Number(values.closing_cash_clp)+change*month,income:month*income,expenses:month*expenses,investing:month*investing}));
    return {points,income,expenses,investing,change,firstNegativeMonth:points.find(p=>p.balance<0)?.month??null};
  }
  function cashControls(ctx) {
    const c=memory.cash,v=c.values;
    const labels=[['closing_cash_clp','Starting household cash','CLP'],['forecast_income_neal_usd',`${ctx.personName('neal')} expected monthly income`,'USD'],['forecast_income_partner_clp',`${ctx.personName('partner')} expected monthly income`,'CLP'],['forecast_expenses_clp','Monthly expenses','CLP'],['forecast_investment_clp','Monthly investment deposits','CLP'],['fx_clp_per_usd','Planning exchange rate','CLP per USD']];
    return `<aside class="plan-controls"><div class="plan-control-heading"><h2>Household assumptions</h2><span>Editable plan</span></div><form id="plan-cash-form"><label class="plan-field"><span>Start month</span><input type="month" data-plan-field="startMonth" value="${e(c.startMonth)}"></label>${labels.map(([key,label,unit])=>input(label,key,v[key],{unit,cash:true,min:key==='fx_clp_per_usd'?.01:0})).join('')}<div class="plan-inline-actions"><button type="button" class="small-link" data-plan-cash-zero>Use no planned investing</button><button type="button" class="small-link" data-plan-latest-fx>Use latest saved FX</button><button type="button" class="small-link" data-plan-cash-reset style="display:${c.dirty?'inline-flex':'none'}">Use saved assumptions</button></div>${horizon('Cash-flow horizon',c.years,60,'months')}<button class="button primary plan-save" type="submit" ${ctx.state.editing_external?'disabled':''}>Save cash assumptions to Excel</button><p class="plan-save-status" id="plan-cash-status" role="status">${e(cashStatus(ctx))}</p></form></aside>`;
  }
  function cashChart(ctx,schedule) {
    const c=memory.cash,fx=Number(c.values.fx_clp_per_usd),convert=value=>ctx.ui.currency==='USD'?value/fx:value;
    const points=schedule.points.map(p=>({...p,display:convert(p.balance)}));
    const width=900,height=340,left=76,right=24,top=28,bottom=43,w=width-left-right,h=height-top-bottom;
    let low=Math.min(0,...points.map(p=>p.display)),high=Math.max(1,...points.map(p=>p.display));const pad=(high-low)*.1;high+=pad;if(low<0)low-=pad;
    const x=m=>left+m/c.years*w,y=value=>top+h-(value-low)/(high-low)*h;
    let svg=`<svg class="plan-chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Projected household cash over ${c.years} months">`;
    for(let i=0;i<=4;i++){const value=low+(high-low)*i/4,yy=y(value);svg+=`<line class="plan-chart-grid" x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}"/><text class="plan-chart-label" x="${left-12}" y="${yy+4}" text-anchor="end">${e(compact(value))}</text>`;}
    svg+=`<line class="plan-zero-line" x1="${left}" x2="${width-right}" y1="${y(0)}" y2="${y(0)}"/>`;
    svg+=`<path d="${points.map((p,i)=>`${i?'L':'M'}${x(p.month)},${y(p.display)}`).join(' ')}" fill="none" stroke="${schedule.points.at(-1).balance<0?'var(--red)':'var(--teal)'}" stroke-width="3"/>`;
    const selected=points[Math.min(c.inspect,c.years)];
    svg+=`<line class="plan-selected-line" x1="${x(selected.month)}" x2="${x(selected.month)}" y1="${top}" y2="${top+h}"/><circle cx="${x(selected.month)}" cy="${y(selected.display)}" r="5" fill="var(--teal)" stroke="var(--surface)" stroke-width="2"/>`;
    [...new Set([0,Math.round(c.years/4),Math.round(c.years/2),Math.round(c.years*3/4),c.years])].forEach(m=>{svg+=`<text class="plan-chart-label" x="${x(m)}" y="${height-12}" text-anchor="middle">${e(monthName(addMonths(c.startMonth,m)))}</text>`;});
    return svg+'</svg>';
  }
  function cashResult(ctx) {
    const c=memory.cash;
    let s;
    try {if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.startMonth))throw new RangeError('Choose a valid start month.');s=cashSchedule(c.values,c.years);}catch(error){const missing=settingsKeys.filter(key=>!finite(c.values[key]));return `<div class="plan-result-heading"><div><div class="plan-kicker">CASH FLOW</div><h2>Your cash timeline</h2><p>Expected income, everyday costs, and planned investing</p></div></div><div class="plan-empty plan-empty-chart"><div class="plan-empty-axes"></div><h3>${missing.length?`${missing.length} planning ${missing.length===1?'input is':'inputs are'} missing`:'Review the planning inputs'}</h3><p>${e(error.message)}</p><small>Starting cash is not inferred from undated bank screenshots. Historical income is not automatically assumed to recur.</small></div>`;}
    const point=s.points[Math.min(c.inspect,c.years)],fx=Number(c.values.fx_clp_per_usd),display=v=>ctx.ui.currency==='USD'?v/fx:v;
    return `<div class="plan-result-heading"><div><div class="plan-kicker">HOUSEHOLD CASH FLOW</div><h2>See how your cash changes</h2><p>Full household · ${e(ctx.ui.currency)} · forecast begins ${monthName(c.startMonth)}</p></div><div class="plan-ending"><span>Cash at ${monthName(addMonths(c.startMonth,point.month))}</span><strong class="${point.balance<0?'negative':''}">${money(ctx,display(point.balance))}</strong></div></div><div class="plan-chart">${cashChart(ctx,s)}</div><div class="plan-inspect"><label for="plan-inspect">Explore the timeline <strong>Month ${point.month} of ${c.years}</strong></label><input id="plan-inspect" data-plan-field="inspect" type="range" min="0" max="${c.years}" step="1" value="${point.month}" aria-label="Inspect cash-flow month"></div><div class="plan-cash-totals"><div><span>Expected income / month</span><strong>${money(ctx,display(s.income))}</strong></div><div><span>Expenses / month</span><strong>${money(ctx,display(s.expenses))}</strong></div><div><span>Investing / month</span><strong>${money(ctx,display(s.investing))}</strong></div><div><span>Cash change / month</span><strong class="${s.change<0?'negative':''}">${s.change>=0?'+':''}${money(ctx,display(s.change))}</strong></div></div>${s.firstNegativeMonth!==null?`<div class="plan-coverage warning"><strong>This plan runs short of cash</strong> The balance first falls below zero in ${monthName(addMonths(c.startMonth,s.firstNegativeMonth))}. Review spending, payment timing, and planned deposits.</div>`:''}<details class="plan-method"><summary>Cash flow is separate from investment growth</summary><p>This view tracks spendable household cash. Investment deposits reduce cash here and may grow separately in Investment outlook. Equal monthly amounts and month-end timing are assumed; taxes, debt payments, irregular costs, and investment returns are included only if entered within your assumptions. Reporting FX stays fixed at the planning rate.</p><p>The person filter applies to Investment outlook. Cash flow uses both household incomes so it remains a complete household plan.</p></details>`;
  }
  function cash(ctx) {return `<section class="plan-workspace"><div class="plan-workspace-grid">${cashControls(ctx)}<div class="plan-results" id="plan-results">${cashResult(ctx)}</div></div></section>`;}

  function calculatorControls(ctx) {
    const c=memory.calculator;
    return `<aside class="plan-controls"><div class="plan-control-heading"><h2>Compound-growth calculator</h2><span>Independent example</span></div><p class="plan-input-note">These inputs are separate from your portfolio and your saved cash plan.</p>${input('Starting amount','starting',c.starting,{unit:ctx.ui.currency})}${input('Monthly deposit','monthly',c.monthly,{unit:ctx.ui.currency})}${input('Annual return after fees','rate',c.rate,{min:-99,max:100,step:.1,unit:'%'})}${horizon('Calculator horizon',c.years)}<p class="plan-input-note">The initial USD/CLP amounts are editable examples, not balances read from your accounts.</p></aside>`;
  }
  function calculatorResult(ctx) {
    const c=memory.calculator;
    let result;
    try {result=global.CasaGrowth.project({startingBalance:c.starting,monthlyContribution:c.monthly,years:c.years,rates:{conservative:c.rate,normal:c.rate,aggressive:c.rate}});}catch(error){return `<div class="plan-empty"><h3>Complete the calculator inputs</h3><p>${e(error.message)}</p></div>`;}
    const point=result.series.normal[Math.round(Math.min(c.inspect,c.years)*12)];
    return `<div class="plan-result-heading"><div><div class="plan-kicker">COMPOUND-GROWTH CALCULATOR</div><h2>Try a different starting point</h2><p>A standalone calculation · ${e(ctx.ui.currency)} · ${percent(c.rate)} annual return</p></div><div class="plan-ending"><span>Value at year ${Math.min(c.inspect,c.years)}</span><strong>${money(ctx,point.balance)}</strong></div></div><div class="plan-chart plan-single-chart">${scenarioChart(ctx,result,c.inspect,dateMonth(new Date().toISOString()))}</div><div class="plan-inspect"><label for="plan-inspect">Explore the calculation <strong>Year ${Math.min(c.inspect,c.years)} of ${c.years}</strong></label><input id="plan-inspect" data-plan-field="inspect" type="range" min="0" max="${c.years}" value="${Math.min(c.inspect,c.years)}" step="1" aria-label="Inspect calculator year"></div><div class="plan-total-breakdown"><span>Starting amount <strong>${money(ctx,c.starting)}</strong></span><span>Additional deposits <strong>${money(ctx,point.addedContributions)}</strong></span><span>Illustrated growth <strong>${money(ctx,point.gain)}</strong></span></div><p class="plan-footnote">Effective monthly compounding with deposits at month end. A constant nominal return is assumed. This example excludes taxes, inflation, and volatility, and does not update your accounts.</p>`;
  }
  function calculator(ctx) {return `<section class="plan-workspace"><div class="plan-workspace-grid">${calculatorControls(ctx)}<div class="plan-results" id="plan-results">${calculatorResult(ctx)}</div></div></section>`;}

  function body(ctx) {return `${title(ctx)}${tabs()}<div role="tabpanel" id="plan-panel" aria-labelledby="plan-tab-${memory.mode}">${memory.mode==='cash'?cash(ctx):memory.mode==='calculator'?calculator(ctx):outlook(ctx)}</div>`;}
  function render(ctx) {initialise(ctx);return `<div id="casa-planning" class="planning-shell">${body(ctx)}</div>`;}
  function mount(ctx) {
    const root=document.getElementById('casa-planning');if(!root||root.dataset.bound)return;root.dataset.bound='true';
    const redraw=()=>{root.innerHTML=body(ctx);};
    const resultOnly=()=>{const target=root.querySelector('#plan-results');if(target)target.innerHTML=memory.mode==='cash'?cashResult(ctx):memory.mode==='calculator'?calculatorResult(ctx):scenarioResult(ctx);const label=root.querySelector('#plan-horizon-value');if(label)label.textContent=`${memory[memory.mode==='outlook'?'outlook':memory.mode==='cash'?'cash':'calculator'].years} ${memory.mode==='cash'?'months':'years'}`;};
    const inspect=value=>{
      const c=memory[memory.mode==='outlook'?'outlook':memory.mode==='cash'?'cash':'calculator'];c.inspect=Math.max(0,Math.min(c.years,Number(value)));
      const target=root.querySelector('#plan-results');if(!target)return;
      const draft=document.createElement('div');draft.innerHTML=memory.mode==='cash'?cashResult(ctx):memory.mode==='calculator'?calculatorResult(ctx):scenarioResult(ctx);
      ['.plan-chart','.plan-ending','.plan-scenario-results','.plan-total-breakdown','.plan-cash-totals','.plan-inspect label strong'].forEach(selector=>{const live=target.querySelector(selector),next=draft.querySelector(selector);if(live&&next)live.innerHTML=next.innerHTML;});
      const slider=target.querySelector('#plan-inspect');if(slider)slider.value=String(c.inspect);
    };
    root.addEventListener('click',event=>{
      const button=event.target.closest('[data-plan-tab],[data-plan-years],[data-plan-inspect],[data-plan-cash-zero],[data-plan-latest-fx],[data-plan-cash-reset]');if(!button)return;
      if(button.dataset.planTab){memory.mode=button.dataset.planTab;redraw();return;}
      if(button.dataset.planYears){memory.outlook.years=Number(button.dataset.planYears);memory.outlook.inspect=memory.outlook.years;redraw();return;}
      if(button.hasAttribute('data-plan-inspect')){inspect(button.dataset.planInspect);return;}
      if(button.hasAttribute('data-plan-cash-zero')){memory.cash.values.forecast_investment_clp=0;markCashDraft();redraw();return;}
      if(button.hasAttribute('data-plan-latest-fx')){const fx=global.CasaGrowth.latestRate(ctx.state);if(finite(fx?.rate)){memory.cash.values.fx_clp_per_usd=fx.rate;markCashDraft();}redraw();return;}
      if(button.hasAttribute('data-plan-cash-reset')){memory.cash.values={...memory.cash.sourceValues};memory.cash.dirty=false;memory.cash.sourceChanged=false;memory.cash.saveMessage='Using the latest saved workbook assumptions.';redraw();}
    });
    root.addEventListener('keydown',event=>{
      const tab=event.target.closest('[data-plan-tab]');
      if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
        event.preventDefault();const current=modes.findIndex(([id])=>id===memory.mode),next=event.key==='Home'?0:event.key==='End'?modes.length-1:(current+(event.key==='ArrowRight'?1:-1)+modes.length)%modes.length;
        memory.mode=modes[next][0];redraw();root.querySelector(`#plan-tab-${memory.mode}`)?.focus();return;
      }
      const hit=event.target.closest('[data-plan-inspect]');if(hit&&['Enter',' '].includes(event.key)){event.preventDefault();inspect(hit.dataset.planInspect);}
    });
    root.addEventListener('input',event=>{
      const input=event.target;
      if(input.dataset.cashField){memory.cash.values[input.dataset.cashField]=num(input.value);markCashDraft();const status=root.querySelector('#plan-cash-status');if(status)status.textContent=cashStatus(ctx);const reset=root.querySelector('[data-plan-cash-reset]');if(reset)reset.style.display=memory.cash.dirty?'inline-flex':'none';resultOnly();return;}
      const key=input.dataset.planField;if(!key)return;
      const c=memory[memory.mode==='cash'?'cash':memory.mode==='calculator'?'calculator':'outlook'];
      if(key==='scope'||key==='depositMode'||key==='goalId'){c[key]=input.value;redraw();return;}
      if(key==='startMonth'){c.startMonth=input.value;resultOnly();return;}
      if(key.startsWith('rate-')){c.rates[key.slice(5)]=num(input.value);resultOnly();return;}
      if(key==='years'){const old=c.years;c.years=Number(input.value);c.inspect=c.inspect===old?c.years:Math.min(c.inspect,c.years);resultOnly();return;}
      if(key==='inspect'){inspect(input.value);return;}
      c[key]=num(input.value);resultOnly();
    });
    root.addEventListener('submit',async event=>{
      if(event.target.id!=='plan-cash-form')return;event.preventDefault();
      const status=root.querySelector('#plan-cash-status'),button=event.target.querySelector('[type="submit"]');
      try {
        cashSchedule(memory.cash.values,memory.cash.years);if(!ctx.saveSettings)throw new Error('Saving is unavailable in this preview.');
        const submitted={...memory.cash.values},submittedSignature=cashSignature(submitted);
        button.disabled=true;status.textContent='Saving assumptions…';
        const saved=await ctx.saveSettings(submitted),savedState=saved?.state||saved;
        const sourceValues=cashValues(savedState?.settings||submitted),sourceSignature=cashSignature(sourceValues);
        const newerDraft=cashSignature(memory.cash.values)!==submittedSignature;
        memory.cash.sourceValues=sourceValues;memory.cash.sourceSignature=sourceSignature;memory.cash.sourceChanged=false;
        if(!newerDraft||cashSignature(memory.cash.values)===sourceSignature){memory.cash.values={...sourceValues};memory.cash.dirty=false;memory.cash.saveMessage='Cash assumptions saved to the workbook.';}
        else{memory.cash.dirty=true;memory.cash.saveMessage='';}
        const active=document.getElementById('casa-planning')||root,currentStatus=active.querySelector('#plan-cash-status');
        if(currentStatus)currentStatus.textContent=cashStatus({...ctx,state:savedState?.settings?savedState:ctx.state});
        const reset=active.querySelector('[data-plan-cash-reset]');if(reset)reset.style.display=memory.cash.dirty?'inline-flex':'none';
        const currentButton=active.querySelector('#plan-cash-form [type="submit"]');if(currentButton)currentButton.disabled=false;
      }
      catch(error){status.textContent=error.message;button.disabled=false;}
    });
  }
  global.CasaPlanning=Object.freeze({render,mount,cashSchedule});
})(window);
