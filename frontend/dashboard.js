/* Household overview and focused monthly review. All figures are calculated locally.
 * Context: state, ui, amount(row,currency), format(value,currency), personName(id),
 * monthLabel(month), navigate(view), selectMonth(month), drillCategory(id), rerender(),
 * workingMonth(month), monthSummary(month), settlementHeroHTML, budgetHTML,
 * averagesHTML, recentHTML. Call mount(ctx) after replacing the page content.
 * Overview deliberately ignores the granular person/month filter. Its period is
 * ui.dashboardPeriod ('all' or a year). Account snapshots remain latest-known.
 */
(function(root){
 'use strict';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const known=v=>v!==null&&v!==undefined&&v!==''&&typeof v!=='boolean'&&Number.isFinite(Number(v));
 const included=r=>![false,0,'FALSE','false','no'].includes(r.included);
 const spend=r=>['expense','refund'].includes(r.kind);
 const monthOf=v=>/^\d{4}-(0[1-9]|1[0-2])/.test(String(v||''))?String(v).slice(0,7):null;
 const dateOf=v=>/^\d{4}-\d{2}-\d{2}/.test(String(v||''))?String(v).slice(0,10):null;
 const sum=values=>!values.length||values.some(v=>!known(v))?null:values.reduce((a,b)=>a+Number(b),0);
 const mean=values=>{const total=sum(values);return values.length&&known(total)?total/values.length:null;};
 const unique=values=>[...new Set(values)].filter(Boolean).sort();
 const compact=v=>Math.abs(v)>=1e9?`${(v/1e9).toFixed(1)}b`:Math.abs(v)>=1e6?`${(v/1e6).toFixed(1)}m`:Math.abs(v)>=1e3?`${(v/1e3).toFixed(0)}k`:Math.round(v).toLocaleString('en-US');
 const label=(m,short=false)=>m?new Date(m.slice(0,7)+'-15T12:00:00').toLocaleDateString('en-US',{month:short?'short':'long',year:short?'2-digit':'numeric'}):'Date not supplied';
 const dateLabel=d=>d?new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Date not supplied';
 const format=(ctx,value,currency=ctx.ui.currency)=>known(value)?(ctx.format?ctx.format(Number(value),currency):`${currency} ${Number(value).toLocaleString(currency==='CLP'?'es-CL':'en-US',{maximumFractionDigits:currency==='CLP'?0:2})}`):'Not enough records';
 const person=(ctx,id)=>ctx.personName?ctx.personName(id):id==='neal'?'Neal':id==='partner'?'Paola':'Household';
 const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';
 const link=(view,text)=>`<button type="button" class="dashboard-link" data-dashboard-view="${esc(view)}">${esc(text)}${arrow}</button>`;
 const empty=(title,detail)=>`<div class="dashboard-empty"><span aria-hidden="true">—</span><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>`;
 const rangeMonths=(first,last)=>{if(!first||!last)return [];const result=[];let cursor=first;for(let i=0;cursor<=last&&i<240;i++){result.push(cursor);const d=new Date(cursor+'-15T12:00:00');d.setMonth(d.getMonth()+1);cursor=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}return result;};

 function compute(ctx,today=new Date()){
  const state=ctx.state||{},ui=ctx.ui||{},currency=ui.currency||'CLP';
  const todayDate=typeof today==='string'?today: `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const currentMonth=todayDate.slice(0,7);
  const allRows=(state.transactions||[]).filter(r=>included(r)&&['income','expense','refund'].includes(r.kind)&&dateOf(r.date));
  const futureCount=allRows.filter(r=>dateOf(r.date)>todayDate).length;
  const available=allRows.filter(r=>dateOf(r.date)<=todayDate);
  const years=unique(available.map(r=>monthOf(r.date)?.slice(0,4))).reverse();
  const requested=String(ui.dashboardPeriod||'all');
  const period=requested==='all'||years.includes(requested)?requested:'all';
  const rows=available.filter(r=>period==='all'||String(r.date).startsWith(period+'-'));
  const months=unique(rows.map(r=>monthOf(r.date)));
  const amount=r=>{const v=ctx.amount(r,currency);return known(v)?Number(v)*(r.kind==='refund'?-1:1):null;};
  const total=rs=>sum(rs.map(amount));
  const base=root.CasaAnalytics?.compute({...state,transactions:available},{month:months.at(-1)||currentMonth,person:'all',currency,today:todayDate},ctx.amount);
  const monthly=(base?.monthly||[]).filter(m=>(period==='all'||m.month.startsWith(period+'-'))&&m.month<=currentMonth);
  const finished=monthly.filter(m=>m.month<currentMonth);
  const incomeMonths=finished.filter(m=>known(m.income)),expenseMonths=finished.filter(m=>known(m.spending));
  const paired=finished.filter(m=>known(m.income)&&known(m.spending));
  const income=total(rows.filter(r=>r.kind==='income')),spending=total(rows.filter(spend));
  const categories=unique(rows.filter(spend).map(r=>r.category_id||'uncategorized')).map(id=>{
   const category=(state.categories||[]).find(c=>c.id===id)||{id,name:'Uncategorized'};
   return {...category,total:total(rows.filter(r=>spend(r)&&(r.category_id||'uncategorized')===id))};
  }).sort((a,b)=>(b.total??-Infinity)-(a.total??-Infinity));
  const series=rangeMonths(months[0],months.at(-1)).map(month=>{
   const found=monthly.find(m=>m.month===month);
   return {month,income:found?.income??null,spending:found?.spending??null};
  });
  // Current portfolio is not clipped to the selected income/spending year.
  const currentState={...state,investment_history:(state.investment_history||[]).filter(h=>!dateOf(h.date)||dateOf(h.date)<=todayDate),
   investments:(state.investments||[]).map(a=>dateOf(a.as_of||a.source_date)>todayDate?{...a,balance:null,as_of:null,source_date:null}:a)};
  const portfolio=root.CasaGrowth?.aggregate(currentState,{person:'all',currency})||{accounts:[],groups:[],total:null,knownTotal:0,knownCount:0,missingCount:0,asOf:null};
  const positiveAccounts=portfolio.accounts.filter(a=>known(a.displayBalance)&&a.displayBalance>0);
  const assumption=(key,min=0)=>{const supplied=positiveAccounts.filter(a=>known(a[key])&&Number(a[key])>=min&&Number(a[key])<=1),balance=supplied.reduce((total,a)=>total+a.displayBalance,0);return {value:balance?supplied.reduce((total,a)=>total+a.displayBalance*Number(a[key]),0)/balance:null,count:supplied.length};};
  const fee=assumption('annual_fee'),allocation=assumption('equity_fraction'),returns=assumption('annual_return',-.99);
  portfolio.assumptions={weightedAnnualFee:fee.value,weightedEquityFraction:allocation.value,weightedAssumedAnnualReturn:returns.value,
   knownFeeAccounts:fee.count,knownAllocationAccounts:allocation.count,knownReturnAccounts:returns.count};
  const historical=root.CasaPortfolio?.historySeries(currentState,portfolio.accounts,'all',currency)||{rows:[],accounts:[],excluded:portfolio.accounts.length,currency};
  const history=(historical.rows||[]).map(r=>({date:r.date,balance:known(r.balance)?root.CasaGrowth.convert(r.balance,historical.currency||currency,currency,root.CasaGrowth.latestRate(currentState,r.date)):null,count:r.count,expected:r.expected}));
  const comparable=history.filter(r=>known(r.balance));
  const balanceChange=comparable.length>1?comparable.at(-1).balance-comparable[0].balance:null;
  const summaries=(state.monthly_summaries||[]).filter(s=>s.month<=currentMonth).sort((a,b)=>a.month.localeCompare(b.month));
  const last=summaries.at(-1),confirmed=known(last?.cumulative_neal_clp);
  const settlementMonths=unique([...(state.transactions||[]).filter(r=>included(r)&&['income','expense','refund'].includes(r.kind)&&monthOf(r.date)<=currentMonth).map(r=>monthOf(r.date)),...(state.settlements||[]).filter(r=>monthOf(r.date)<=currentMonth).map(r=>monthOf(r.date))]);
  const provisional=settlementMonths.map(month=>{const summary=summaries.find(s=>s.month===month);return known(summary?.month_remaining_neal_clp)?Number(summary.month_remaining_neal_clp):ctx.workingMonth?.(month)?.estimate??null;});
  const knownResults=provisional.filter(known);
  const settlement={amountClp:confirmed?Number(last.cumulative_neal_clp):null,confirmed,calculableMonths:knownResults.length,totalMonths:settlementMonths.length,
   knownSubtotalClp:sum(knownResults),through:last?.month||settlementMonths.at(-1)||null};
  const missingConversions=rows.filter(r=>!known(ctx.amount(r,currency))).length;
  const incompleteIncome=monthly.filter(m=>(m.incomeCount||m.spendingCount)&&m.incomeMissingPeople?.length).length;
  const unassigned=rows.filter(r=>spend(r)&&r.sharing==='needs_review').length;
  const openReview=(state.review||[]).filter(r=>!['resolved','closed','dismissed'].includes(String(r.status||'open').toLowerCase())).length;
  const goals=(state.goals||[]).filter(g=>!g.archived).map(g=>({name:g.name,target:known(g.target)?Number(g.target):null,saved:known(g.saved)?Number(g.saved):null,
   monthlyContribution:known(g.monthly_contribution)?Number(g.monthly_contribution):null,currency:g.currency,targetDate:dateOf(g.target_date)}));
  const gaps=[];
  if(missingConversions)gaps.push(`${missingConversions} records need a reporting conversion.`);
  if(incompleteIncome)gaps.push(`${incompleteIncome} recorded months have incomplete household income.`);
  if(unassigned)gaps.push(`${unassigned} purchases still need shared or personal classification.`);
  if(base?.coverage.spendingCompletenessConfirmed===false)gaps.push('Spending coverage is not confirmed complete. A drop in recorded spending may reflect missing records rather than savings.');
  if(openReview)gaps.push(`${openReview} transaction or source questions remain open in Review.`);
  if(portfolio.missingCount)gaps.push(`${portfolio.missingCount} account balances or conversions are missing.`);
  if(positiveAccounts.length&&(fee.count<positiveAccounts.length||allocation.count<positiveAccounts.length||returns.count<positiveAccounts.length))gaps.push('Fee, allocation and return-assumption coverage is incomplete. Weighted figures describe only positive balances with supplied values, not every account.');
  if(!settlement.confirmed)gaps.push('The cumulative shared balance needs opening-balance, income or repayment confirmation.');
  if(futureCount)gaps.push(`${futureCount} future-dated records are excluded from the current overview.`);
  if(rows.some(r=>r.kind==='income'&&/invoice/i.test(String(r.date_basis||''))))gaps.push('Freelance income includes provisional invoice-month records, not verified cash receipts.');
  gaps.push('Cash snapshots can overlap, so they are not added to investments. Debts, market benchmarks, and complete future tuition or property costs are not established.');
  return {currency,period,years,rows,months,series,categories,income,spending,margin:known(income)&&known(spending)?income-spending:null,
   averageIncome:mean(incomeMonths.map(m=>m.income)),averageSpending:mean(expenseMonths.map(m=>m.spending)),averageMargin:mean(paired.map(m=>m.income-m.spending)),
   averageIncomeMonths:incomeMonths.length,averageSpendingMonths:expenseMonths.length,averageMarginMonths:paired.length,
   savingsRate:paired.length&&mean(paired.map(m=>m.income))>0?mean(paired.map(m=>m.income-m.spending))/mean(paired.map(m=>m.income)):null,
   portfolio,history,historical:{...historical,currency},balanceChange,balanceChangePercent:known(balanceChange)&&comparable[0].balance>0?balanceChange/comparable[0].balance:null,
   settlement,goals,gaps,missingConversions,incompleteIncome,unassigned,openReview,futureCount,currentMonth,todayDate,base};
 }
 function metric(title,value,note,extra=''){
  const amount=/^(CLP|USD)\s+(.+)$/.exec(String(value));
  return `<article class="dashboard-metric ${extra} ${amount?'':'is-empty'}"><span>${esc(title)}</span><strong>${amount?`<small>${esc(amount[1])}</small><b>${esc(amount[2])}</b>`:esc(value)}</strong><p>${esc(note)}</p></article>`;
 }
 function graphControls(ctx){return `<div class="dashboard-range" role="group" aria-label="Cash flow timeline">${[['6','6M'],['12','1Y'],['all','All']].map(([id,name])=>`<button type="button" data-dashboard-range="${id}" aria-pressed="${String(ctx.ui.dashboardRange||'12')===id}">${name}</button>`).join('')}</div>`;}
 function flowChart(ctx,data){
  const range=String(ctx.ui.dashboardRange||'12'),series=range==='all'?data.series:data.series.slice(-Number(range));
  const chart=root.CasaOverviewCharts?.trend({series,currency:data.currency,formatMoney:v=>format(ctx,v),formatCompact:compact,monthLabel:label,
   subtitle:`${series.length} calendar months · both people · ${data.currency}`})||empty('Cash flow appears here','Add income and spending records to build the timeline.');
  return `<section class="dashboard-panel dashboard-flow"><div class="dashboard-chapter"><div><span class="dashboard-kicker">THE BIG PICTURE</span><h2>Money in. Money out.</h2></div>${graphControls(ctx)}</div>${chart.replace('Income & spending over time','Recorded cash flow')}<div class="dashboard-flow-total"><span>Recorded income <strong>${esc(format(ctx,data.income))}</strong></span><span>Net spending <strong>${esc(format(ctx,data.spending))}</strong></span><span>Difference <strong>${esc(format(ctx,data.margin))}</strong></span></div><p class="dashboard-caption">Record totals for ${data.period==='all'?'all supplied history':data.period}. Income gaps mean a person’s income or conversion is missing. Transfers are excluded; refunds reduce spending.</p></section>`;
 }
 function categoryChart(ctx,data){
  const rest=data.categories.slice(7);
  let chart=root.CasaOverviewCharts?.categories({categories:data.categories,currency:data.currency,formatMoney:v=>format(ctx,v),categoryLabel:ctx.categoryLabel,
   subtitle:data.period==='all'?'All recorded spending':`${data.period} recorded spending`})||empty('No spending mix yet','Categorized expenses will build this picture.');
  // Keep all categories accessible without a crowded first screen.
  if(rest.length)chart+=`<details class="dashboard-more"><summary>${rest.length} more categories</summary>${rest.map(c=>`<button type="button" data-dashboard-category="${esc(c.id)}"><span>${esc(c.name)}</span><strong>${esc(format(ctx,c.total))}</strong></button>`).join('')}</details>`;
  return `<section class="dashboard-panel dashboard-mix">${chart.replace('Where your money went','Your spending mix')}</section>`;
 }
 function investmentGraph(ctx,data){
  const range=String(ctx.ui.dashboardInvestmentRange||'all');let rows=data.history;
  if(range!=='all'&&rows.length){const cutoff=new Date(monthOf(rows.at(-1).date)+'-15T12:00:00');cutoff.setMonth(cutoff.getMonth()-Number(range)+1);const first=`${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}`;rows=rows.filter(row=>monthOf(row.date)>=first);}
  const valid=rows.filter(r=>known(r.balance)),width=720,height=220,left=75,right=20,top=22,bottom=35;
  if(!valid.length)return empty('A little more history will show the journey','The latest account balances are recorded. Comparable investment history needs at least two dated observations per account.');
  const max=Math.max(...valid.map(r=>r.balance),1)*1.12,min=0,w=width-left-right,h=height-top-bottom;
  const xx=i=>left+(rows.length===1?w/2:w*i/(rows.length-1)),yy=v=>top+h-(v-min)/(max-min)*h;
  let svg=`<svg class="dashboard-investment-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Comparable recorded investment balances in ${esc(data.historical.currency||data.currency)}"><title>Recorded investment balance history</title><defs><linearGradient id="dashboard-investment-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--teal)" stop-opacity=".16"/><stop offset="1" stop-color="var(--teal)" stop-opacity="0"/></linearGradient></defs>`;
  for(let i=0;i<4;i++){const v=max*i/3,y=yy(v);svg+=`<line x1="${left}" x2="${width-right}" y1="${y}" y2="${y}" class="dashboard-grid"/><text x="${left-12}" y="${y+4}" text-anchor="end" class="dashboard-axis">${esc(compact(v))}</text>`;}
  let segment=[];const flush=()=>{if(segment.length>1){const line=segment.map(([x,y],i)=>`${i?'L':'M'} ${x} ${y}`).join(' ');svg+=`<path d="${line} L ${segment.at(-1)[0]} ${top+h} L ${segment[0][0]} ${top+h} Z" fill="url(#dashboard-investment-fill)"/><path d="${line}" class="dashboard-investment-line"/>`;}segment=[];};
  rows.forEach((r,i)=>{if(!known(r.balance)){flush();return;}segment.push([xx(i),yy(r.balance)]);});flush();
  rows.forEach((r,i)=>{if(known(r.balance))svg+=`<circle cx="${xx(i)}" cy="${yy(r.balance)}" r="4" class="dashboard-investment-point" tabindex="0" role="img" aria-label="${esc(dateLabel(r.date))}: ${esc(format(ctx,r.balance,data.historical.currency||data.currency))}"><title>${esc(dateLabel(r.date))} · ${esc(format(ctx,r.balance,data.historical.currency||data.currency))}</title></circle>`;if(i%Math.max(1,Math.ceil(rows.length/6))===0||i===rows.length-1)svg+=`<text x="${xx(i)}" y="${height-10}" text-anchor="middle" class="dashboard-axis">${esc(label(r.date,true))}</text>`;});
  return svg+'</svg>';
 }
 function investments(ctx,data){
  const p=data.portfolio,knownAccounts=p.knownCount||0;
  return `<section class="dashboard-panel dashboard-investments"><div class="dashboard-chapter"><div><span class="dashboard-kicker">BUILDING YOUR FUTURE</span><h2>Investments & savings</h2></div>${link('investments','Explore accounts')}</div><div class="dashboard-investment-headline"><div><strong>${esc(knownAccounts?format(ctx,p.missingCount?p.knownTotal:p.total):'Balance not supplied')}</strong><span>${p.missingCount?'Known balances subtotal':'Latest recorded account balances'} · ${p.accounts.length} accounts</span></div><div class="dashboard-range" role="group" aria-label="Investment history timeline">${[['12','1Y'],['all','All']].map(([id,name])=>`<button type="button" data-dashboard-investment-range="${id}" aria-pressed="${String(ctx.ui.dashboardInvestmentRange||'all')===id}">${name}</button>`).join('')}</div></div>${investmentGraph(ctx,data)}<div class="dashboard-allocation">${p.groups.map(g=>`<button type="button" data-dashboard-view="investments"><i class="${esc(g.id)}" aria-hidden="true"></i><span>${esc(g.label)}</span><strong>${esc(g.accounts?.length?format(ctx,g.missingCount?g.knownTotal:g.total):'—')}</strong></button>`).join('')}</div><p class="dashboard-caption">Latest snapshot ${esc(dateLabel(p.asOf))}. Chart: ${data.historical.accounts?.length||0} accounts with comparable history${data.historical.excluded?`; ${data.historical.excluded} other accounts appear in the latest total only`:''}. Balances include deposits and withdrawals; changes are not investment returns. Missing observations leave gaps.</p></section>`;
 }
 function settlement(ctx,data){
  const s=data.settlement,amount=s.amountClp;
  const direction=known(amount)?Math.abs(amount)<1?'You’re settled up':amount>0?`${person(ctx,'neal')} owes ${person(ctx,'partner')}`:`${person(ctx,'partner')} owes ${person(ctx,'neal')}`:'The shared balance needs a check';
  return `<section class="dashboard-panel dashboard-shared"><span class="dashboard-kicker">BETWEEN THE TWO OF YOU</span><h2>The balance so far</h2><p class="dashboard-shared-direction">${esc(direction)}</p><strong class="dashboard-shared-amount">${known(amount)?esc(format(ctx,Math.abs(amount),'CLP')):'Not confirmed'}</strong><p>${known(amount)?`Cumulative through ${esc(label(s.through))}, after recorded repayments.`:'An opening balance, complete income or earlier repayments still need confirmation.'}</p>${!s.confirmed&&known(s.knownSubtotalClp)?`<div class="dashboard-provisional"><span>Known monthly results · provisional subtotal</span><strong>≈ ${esc(format(ctx,Math.abs(s.knownSubtotalClp),'CLP'))}</strong><small>${Math.abs(s.knownSubtotalClp)<1?'Net monthly estimates are settled':esc(person(ctx,s.knownSubtotalClp>0?'neal':'partner'))+' → '+esc(person(ctx,s.knownSubtotalClp>0?'partner':'neal'))}. ${s.calculableMonths} of ${s.totalMonths} recorded months are calculable. This is not the cumulative amount due.</small></div>`:''}${link('monthend','Review your monthly balance')}<div class="dashboard-shared-foot"><span>One household. One final net balance.</span><small>Each month keeps its own income-based split.</small></div></section>`;
 }
 function goals(ctx,data){
  const knownGoals=data.goals.filter(g=>known(g.target)&&g.target>0&&known(g.saved));
  return `<section class="dashboard-panel dashboard-goals"><div class="dashboard-chapter"><div><span class="dashboard-kicker">WHAT IT’S ALL FOR</span><h2>Your life goals</h2></div>${link('goals','All goals')}</div>${knownGoals.length?knownGoals.slice(0,3).map(g=>{const ratio=Math.max(0,Math.min(1,g.saved/g.target));return `<article><div><strong>${esc(g.name)}</strong><span>${(ratio*100).toFixed(0)}%</span></div><progress value="${ratio}" max="1" aria-label="${esc(g.name)} savings progress"></progress><p><span>${esc(format(ctx,g.saved,g.currency))} of ${esc(format(ctx,g.target,g.currency))}</span><span>${g.targetDate?esc(dateLabel(g.targetDate)):'No target date'}</span></p></article>`;}).join(''):empty('Give your money a direction','Add the targets and dates that matter to your family. Savings are linked to your accounts, not counted as extra assets.')}<p class="dashboard-caption">Goal allocations already belong to your recorded assets. They are not added to the portfolio again.</p></section>`;
 }
 function renderOverview(ctx){
  const d=compute(ctx),p=d.portfolio;
  return `<div class="household-dashboard"><header class="dashboard-heading"><div><span class="dashboard-kicker">YOUR HOUSEHOLD</span><h1>The whole picture.</h1><p>How you’re doing today. Where your money is taking you.</p></div><div class="dashboard-heading-actions"><label class="dashboard-period"><span>Income & spending</span><select data-dashboard-period aria-label="Overview income and spending period"><option value="all" ${d.period==='all'?'selected':''}>All recorded history</option>${d.years.map(y=>`<option value="${y}" ${d.period===y?'selected':''}>${y}</option>`).join('')}</select></label><button class="button" type="button" data-upload-documents>Upload documents</button></div></header><section class="dashboard-metric-strip" aria-label="Household financial highlights">${metric('Average monthly income',format(ctx,d.averageIncome),`${d.averageIncomeMonths} finished months with both incomes`)}${metric('Average monthly spending',format(ctx,d.averageSpending),`${d.averageSpendingMonths} finished months with spending`)}${metric('Average monthly margin',format(ctx,d.averageMargin),`${d.averageMarginMonths} comparable finished months`,known(d.averageMargin)&&d.averageMargin<0?'is-negative':'is-accent')}${metric(p.missingCount?'Known investment balance':'Investment & savings balance',p.knownCount?format(ctx,p.missingCount?p.knownTotal:p.total):'Not supplied',`Latest saved snapshots · ${p.accounts.length} accounts`)}</section><div class="dashboard-period-note"><span>${d.months.length?`${esc(label(d.months[0],true))} — ${esc(label(d.months.at(-1),true))} · ${d.months.length} recorded months`:'Add documents to begin your financial history'}</span><span>Both people · ${esc(d.currency)} reporting view</span></div>${root.CasaAnalysis?.host()||''}<div class="dashboard-main-grid">${flowChart(ctx,d)}${categoryChart(ctx,d)}</div><div class="dashboard-main-grid dashboard-progress-grid">${investments(ctx,d)}${settlement(ctx,d)}</div>${goals(ctx,d)}<details class="dashboard-data-note"><summary>${d.missingConversions||d.incompleteIncome||d.unassigned||d.openReview?'A few details still need attention':'About these figures'}<span>${d.openReview?`${d.openReview} open review items`:'Source snapshots & recorded history'}</span></summary><div>${d.gaps.map(g=>`<p>${esc(g)}</p>`).join('')}<p>Averages exclude the current month and wholly unrecorded months. Income, spending and margin each use only eligible months; margin uses months with both household income and spending.</p>${link('review','Review your records')}</div></details></div>`;
 }
 function monthData(ctx){
  const month=ctx.ui.month,currency=ctx.ui.currency||'CLP';
  return root.CasaAnalytics?.compute(ctx.state,{month,currency,person:'all'},ctx.amount)||null;
 }
 function renderMonth(ctx){
  const analysis=ctx.monthAnalysis||monthData(ctx),selected=analysis?.selected||{},working=ctx.workingMonth?.(ctx.ui.month)||{},summary=ctx.monthSummary?.(ctx.ui.month)||{};
  const w={...working,incomes:{neal:summary.incomeNeal??working.incomes?.neal,partner:summary.incomePartner??working.incomes?.partner},ratio:summary.ratio??working.ratio,shared:summary.shared??working.shared,paid:summary.paidNeal??working.paid};
  const rows=(ctx.state.transactions||[]).filter(r=>included(r)&&monthOf(r.date)===ctx.ui.month);
  const income=selected.incomeRecorded??null,spending=selected.spending??null,margin=known(selected.income)&&known(spending)?selected.income-spending:null;
  const categories=(analysis?.categories||[]).filter(c=>known(c.selected)&&c.selected!==0).map(c=>({...c,total:c.selected}));
  const money=v=>format(ctx,v),ratio=known(w.ratio)?`${(w.ratio*100).toFixed(1)}%`:null,repayments=(ctx.state.settlements||[]).filter(r=>monthOf(r.date)===ctx.ui.month).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  let closed=[];try{closed=Array.isArray(ctx.state.settings.closed_months)?ctx.state.settings.closed_months:JSON.parse(ctx.state.settings.closed_months||'[]')}catch{}
  return `<div class="dashboard-month"><header class="dashboard-heading"><div><span class="dashboard-kicker">ONE MONTH, IN FOCUS</span><h1>${esc(label(ctx.ui.month))}</h1><p>Income, spending, your shared balance, and the plan ahead.</p></div><div class="dashboard-month-actions"><button class="button" data-action="repayment" type="button">Record repayment</button><button class="button primary" data-action="new-transaction" type="button">Add transaction</button></div></header><section class="dashboard-metric-strip dashboard-month-metrics" aria-label="Monthly finances">${metric('Income recorded',money(income),selected.incomeMissingPeople?.length?'Some household income is missing':'Both people · supplied monthly records')}${metric('Net spending',money(spending),'Personal + shared · after refunds')}${metric('Income less spending',money(margin),'Before investing · complete income needed',known(margin)&&margin<0?'is-negative':'is-accent')}</section><div class="dashboard-month-balance">${ctx.settlementHeroHTML||empty('Monthly balance','Income and shared expense records are needed for the split.')}<section class="dashboard-panel dashboard-month-calculation"><div class="dashboard-chapter"><div><span class="dashboard-kicker">HOW IT ADDS UP</span><h2>The shared calculation</h2></div><span class="dashboard-neutral-label">CLP</span></div><div class="dashboard-income-pair">${['neal','partner'].map(p=>`<div><span>${esc(person(ctx,p))}’s income</span>${known(w.incomes?.[p])?`<strong>${esc(format(ctx,w.incomes[p],'CLP'))}</strong>`:`<button class="dashboard-link" data-month-income="${p}">Add income${arrow}</button>`}</div>`).join('')}</div><div class="dashboard-calculation-row"><span>Shared expenses recorded</span><strong>${esc(format(ctx,w.shared,'CLP'))}</strong></div><div class="dashboard-calculation-row"><span>${esc(person(ctx,'neal'))}’s income share</span><strong>${ratio||'Income needed'}</strong></div><div class="dashboard-calculation-row"><span>${esc(person(ctx,'neal'))}’s share of shared costs</span><strong>${esc(format(ctx,known(w.shared)&&known(w.ratio)?w.shared*w.ratio:null,'CLP'))}</strong></div><div class="dashboard-calculation-row"><span>Shared purchases ${esc(person(ctx,'neal'))} paid</span><strong>${esc(format(ctx,w.paid,'CLP'))}</strong></div><div class="dashboard-calculation-row"><span>Net repayments · ${esc(person(ctx,'neal'))} → ${esc(person(ctx,'partner'))}</span><strong>${esc(format(ctx,summary.repaid??0,'CLP'))}</strong></div><p class="dashboard-caption">Shared costs follow your household rule. Personal purchases, transfers and investment funding are excluded from the split. The final net monthly amount includes recorded repayments.</p><details class="dashboard-more dashboard-repayments"><summary>Repayments this month <span>${repayments.length}</span></summary>${repayments.length?repayments.map(r=>`<div class="dashboard-repayment-row"><div><strong>${esc(person(ctx,r.from_person))} → ${esc(person(ctx,r.to_person))}</strong><small>${esc(dateLabel(r.date))}${r.notes?' · '+esc(r.notes):''}</small></div><span>${esc(format(ctx,r.amount_clp,'CLP'))}</span></div>`).join(''):'<p>No repayments recorded for this month.</p>'}<button type="button" class="dashboard-link" data-action="repayment">Record a repayment${arrow}</button></details></section></div>${ctx.budgetHTML||''}<div class="dashboard-month-detail-grid"><section class="dashboard-panel">${root.CasaOverviewCharts?.categories({categories,currency:ctx.ui.currency,formatMoney:money,categoryLabel:ctx.categoryLabel,subtitle:`${label(ctx.ui.month)} · both people`})||empty('No spending records','Upload a statement or add a transaction.')}</section><section class="dashboard-panel dashboard-coverage"><div class="dashboard-chapter"><div><span class="dashboard-kicker">BEHIND THE NUMBERS</span><h2>Record coverage</h2></div>${link('review','Review')}</div><div class="dashboard-coverage-grid"><div><strong>${rows.length}</strong><span>Included records</span></div><div><strong>${selected.missingConversionCount||0}</strong><span>Missing conversions</span></div><div><strong>${w.pending||0}</strong><span>Sharing decisions</span></div><div><strong>${selected.incomeMissingPeople?.length||0}</strong><span>Missing incomes</span></div></div><p>Original bank charges and source references are preserved in Transactions. Lower recorded spending may reflect missing records.</p>${link('transactions','Explore this month’s transactions')}<details class="dashboard-more"><summary>Income timing & currency notes</summary><p>≈ includes reporting conversions; actual bank charges are retained. Freelance income may use invoice month provisionally. The original CLP and USD charges remain in each transaction’s details.</p><button class="dashboard-link" type="button" data-action="${closed.includes(ctx.ui.month)?'reopen-month':'close-month'}">${closed.includes(ctx.ui.month)?'Reopen this month':'Close this month'}${arrow}</button></details></section></div>${ctx.averagesHTML||root.CasaAnalysis?.averages(analysis)||''}${root.CasaAnalysis?.host()||''}${ctx.recentHTML?`<section class="dashboard-panel dashboard-month-activity"><div class="dashboard-chapter"><h2>Recent activity</h2>${link('transactions','All transactions')}</div>${ctx.recentHTML}</section>`:''}<details class="dashboard-data-note"><summary>Earlier monthly balances<span>Each month keeps its own income split</span></summary><div class="dashboard-earlier-months">${unique((ctx.state.monthly_summaries||[]).map(s=>s.month)).filter(m=>m<ctx.ui.month).reverse().map(m=>{const s=ctx.monthSummary?.(m)||{},estimate=known(s.remaining)?s.remaining:ctx.workingMonth?.(m)?.estimate;return `<button type="button" data-dashboard-month="${m}"><span>${esc(label(m))}</span><strong>${known(estimate)?'≈ '+esc(format(ctx,estimate,'CLP')):'Income or conversion needed'}</strong></button>`;}).join('')||'<p>No earlier monthly balances yet.</p>'}</div></details></div>`;
 }
 function summaryPayload(ctx){
  const d=compute(ctx),base=d.base;if(!base)return null;
  const payload=root.CasaAnalytics.summaryPayload(base);
  payload.context='dashboard';
  payload.dashboard={periodLabel:d.period==='all'?'All recorded history':d.period,firstMonth:d.months[0]||null,lastMonth:d.months.at(-1)||null,recordedMonths:d.months.length,
   income:d.income,spending:d.spending,margin:d.margin,averageIncome:d.averageIncome,averageSpending:d.averageSpending,averageMargin:d.averageMargin,
   averageIncomeMonths:d.averageIncomeMonths,averageSpendingMonths:d.averageSpendingMonths,averageMarginMonths:d.averageMarginMonths,
   portfolio:{balance:d.portfolio.knownCount?d.portfolio.total:null,knownSubtotal:d.portfolio.knownTotal,accountCount:d.portfolio.accounts.length,missingCount:d.portfolio.missingCount,asOf:d.portfolio.asOf,
    groups:d.portfolio.groups.map(g=>({id:g.id,balance:g.total,accountCount:g.accounts.length})),history:d.history.slice(-24).map(h=>({date:h.date,balance:h.balance})),
    balanceChange:d.balanceChange,balanceChangePercent:d.balanceChangePercent,changeIsInvestmentReturn:false,assumptions:d.portfolio.assumptions},
   goals:d.goals.slice(0,20),settlement:{amountClp:d.settlement.amountClp,confirmed:d.settlement.confirmed,calculableMonths:d.settlement.calculableMonths,totalMonths:d.settlement.totalMonths,knownSubtotalClp:d.settlement.knownSubtotalClp},gaps:d.gaps};
  return payload;
 }
 let activeContext=null,chartDrillsBound=false;
 function mount(ctx){
  activeContext=ctx;
  if(!chartDrillsBound){
   document.addEventListener('click',event=>{
    const category=event.target.closest('.household-dashboard [data-drill-category]');
    const month=event.target.closest('.household-dashboard [data-chart-month]');
    if(!category&&!month)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(category)activeContext?.drillCategory?.(category.dataset.drillCategory);
    else activeContext?.selectMonth?.(month.dataset.chartMonth);
   },true);chartDrillsBound=true;
  }
  const rerender=()=>ctx.rerender?.();
  document.querySelector('[data-dashboard-period]')?.addEventListener('change',event=>{ctx.ui.dashboardPeriod=event.target.value;rerender()});
  document.querySelectorAll('[data-dashboard-range]').forEach(button=>button.onclick=()=>{ctx.ui.dashboardRange=button.dataset.dashboardRange;rerender()});
  document.querySelectorAll('[data-dashboard-investment-range]').forEach(button=>button.onclick=()=>{ctx.ui.dashboardInvestmentRange=button.dataset.dashboardInvestmentRange;rerender()});
  document.querySelectorAll('[data-dashboard-view]').forEach(button=>button.onclick=()=>ctx.navigate?.(button.dataset.dashboardView));
  document.querySelectorAll('[data-dashboard-month]').forEach(button=>button.onclick=()=>ctx.selectMonth?.(button.dataset.dashboardMonth));
  document.querySelectorAll('[data-dashboard-category]').forEach(button=>button.onclick=()=>ctx.drillCategory?.(button.dataset.dashboardCategory));
 }
 root.CasaDashboard=Object.freeze({compute,renderOverview,renderMonth,mount,summaryPayload});
})(typeof window!=='undefined'?window:globalThis);
