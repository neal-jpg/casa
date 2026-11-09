/* Investment presentation. Account balances are source records; scenarios are previews. */
(function (global) {
  'use strict';
  const settings = {group:'all',years:20,inspectYear:20,rates:{conservative:3,normal:6,aggressive:9},monthly:{}};
  const groups = [
    {id:'retirement',label:'Retirement',symbol:'retirement',description:'Long-term retirement accounts',tone:'retirement'},
    {id:'children',label:'Children & college',symbol:'goals',description:'Children’s accounts and education savings',tone:'children'},
    {id:'brokerage',label:'Brokerage',symbol:'investments',description:'General investment portfolios',tone:'brokerage'},
    {id:'other',label:'Cash & other',symbol:'wallet',description:'Cash management and other purposes',tone:'other'}
  ];
  const scenarios = [{id:'conservative',label:'Conservative'},{id:'normal',label:'Normal'},{id:'aggressive',label:'Aggressive'}];
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const format = (value,currency) => finite(value) ? `${currency} ${new Intl.NumberFormat(currency==='CLP'?'es-CL':'en-US',{minimumFractionDigits:currency==='USD'?2:0,maximumFractionDigits:currency==='USD'?2:0}).format(Number(value))}` : 'Balance not supplied';
  const compact = value => Math.abs(value)>=1e9 ? `${(value/1e9).toFixed(1)}b` : Math.abs(value)>=1e6 ? `${(value/1e6).toFixed(1)}m` : Math.abs(value)>=1e3 ? `${(value/1e3).toFixed(0)}k` : `${Math.round(value)}`;
  const dateLabel = value => value ? new Date(String(value).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Date not supplied';
  const symbol = (ctx,key) => ctx.icon ? ctx.icon(key) : '';
  const name = (ctx,person) => ctx.personName ? ctx.personName(person) : person==='partner'?'Paola':person==='neal'?'Neal':person==='family'?'Family':'Everyone';
  const model = (ctx,group=settings.group) => global.CasaGrowth.aggregate(ctx.state,{person:ctx.ui.person,currency:ctx.ui.currency,group:group==='all'?undefined:group});
  const scope = ctx => `${ctx.ui.person}:${ctx.ui.currency}:${settings.group}`;
  const monthly = ctx => Object.hasOwn(settings.monthly,scope(ctx)) ? settings.monthly[scope(ctx)] : 0;
  const groupInfo = id => groups.find(g=>g.id===id);
  const isClosed = account => String(account.status||'').toLowerCase()==='closed' || /\bclosed\b/i.test(String(account.name||''));
  const purpose = (ctx,id) => {const item=groupInfo(id);return `<span class="portfolio-purpose-symbol ${id}" aria-hidden="true">${symbol(ctx,item?.symbol||'wallet')}</span>`;};
  const yearLabel = (result,year) => {
    const base=result.asOf?new Date(result.asOf+'T12:00:00'):new Date();
    base.setMonth(base.getMonth()+Math.round(Number(year)*12));
    return base.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  };

  function personTabs(ctx) {
    return `<div class="person-tabs" role="group" aria-label="Filter investments by person">${['all','neal','partner'].map(p=>`<button class="person-tab ${ctx.ui.person===p?'active':''}" data-person="${p}" aria-pressed="${ctx.ui.person===p}">${escape(name(ctx,p))}</button>`).join('')}</div>`;
  }
  function allocation(ctx,all) {
    const visible=groups.map(group=>({...group,...all.groups.find(item=>item.id===group.id)}));
    return `<div class="portfolio-allocation" aria-label="Allocation of known investment balances"><div class="portfolio-allocation-track">${visible.filter(g=>g.knownTotal>0).map(g=>`<span class="${g.id}" style="flex:${g.knownTotal}" title="${escape(g.label)} · ${format(g.knownTotal,all.currency)}"></span>`).join('')}</div><div class="portfolio-allocation-legend">${visible.map(g=>`<button data-port-group="${g.id}" class="portfolio-allocation-item"><i class="${g.id}" aria-hidden="true"></i><span>${escape(g.label)}</span><strong>${all.knownTotal>0?(g.knownTotal/all.knownTotal*100).toFixed(1)+'%':'—'}</strong></button>`).join('')}</div></div>`;
  }
  function tabs(ctx,all) {
    return `<div class="portfolio-tabs" role="tablist" aria-label="Investment purpose">${[{id:'all',label:'All investments'},...groups].map(group=>{const count=group.id==='all'?all.accounts.length:all.accounts.filter(a=>a.group===group.id).length;return `<button id="portfolio-tab-${group.id}" class="portfolio-tab ${settings.group===group.id?'active':''}" data-port-group="${group.id}" role="tab" aria-selected="${settings.group===group.id}" aria-controls="portfolio-purpose-content" tabindex="${settings.group===group.id?'0':'-1'}">${group.id==='all'?'':purpose(ctx,group.id)}<span>${escape(group.label)}</span><small>${count}</small></button>`}).join('')}</div>`;
  }
  function snapshotNote(result) {
    const changed=result.accounts.some(a=>a.currency!==result.currency&&finite(a.displayBalance));
    return `${result.asOf?'Latest saved snapshot '+dateLabel(result.asOf):'Snapshot dates not supplied'}${changed&&result.fx?.date?` · ≈ ${result.currency} display uses reference FX from ${dateLabel(result.fx.date)}`:''}`;
  }
  function accountTable(ctx,result) {
    const rows=groups.filter(g=>result.accounts.some(a=>a.group===g.id)).map(group=>{
      const accounts=result.accounts.filter(a=>a.group===group.id);
      const subtotal=accounts.reduce((total,a)=>total+(finite(a.displayBalance)?Number(a.displayBalance):0),0);
      const unknown=accounts.filter(a=>!finite(a.displayBalance)).length;
      const anyKnown=accounts.some(a=>finite(a.displayBalance));
      return `<tbody class="portfolio-account-group"><tr class="portfolio-group-row"><th colspan="4">${purpose(ctx,group.id)}<span>${escape(group.label)}</span><small>${accounts.length} ${accounts.length===1?'account':'accounts'}${unknown?' · '+unknown+' balance pending':''}</small></th><td class="right"><strong>${anyKnown?format(subtotal,result.currency):'Balance pending'}</strong></td><td></td></tr>${accounts.map(account=>`<tr><td><div class="portfolio-account-name"><strong>${escape(account.name)}</strong><small>${escape(account.type)}${isClosed(account)?' · Closed':''}</small></div></td><td><span class="person-badge ${account.person==='partner'?'partner':''}">${escape(name(ctx,account.person))}</span></td><td class="portfolio-snapshot-date">${dateLabel(account.valuationDate||account.as_of)}</td><td class="right"><span class="portfolio-secondary-amount">${finite(account.displayMonthlyContribution)?format(account.displayMonthlyContribution,result.currency):'Not supplied'}</span></td><td class="right"><span class="amount-chip ${finite(account.displayBalance)?'':'muted'}">${finite(account.displayBalance)?format(account.displayBalance,result.currency):'Balance pending'}</span>${account.currency!==result.currency&&finite(account.balance)?`<small class="portfolio-native-amount">${format(account.balance,account.currency)} native</small>`:''}</td><td><button class="icon-button" data-edit-investment="${escape(account.id)}" aria-label="Edit ${escape(account.name)}">${symbol(ctx,'edit')}</button></td></tr>`).join('')}</tbody>`;
    }).join('');
    return `<section class="portfolio-ledger"><div class="portfolio-chapter-heading"><div><h2 class="section-title">Your accounts, by purpose</h2><p>${settings.group==='all'?'A complete breakdown of the accounts in this view.':'The accounts included in this purpose group.'}</p></div><div class="portfolio-ledger-actions"><span>${result.accounts.length} accounts</span><button class="small-link" data-port-growth>Growth scenarios →</button></div></div>${result.accounts.length?`<div class="table-scroll portfolio-account-scroll"><table class="compact-table portfolio-account-table"><thead><tr><th>Account</th><th>For</th><th>Snapshot</th><th class="right">Monthly contribution</th><th class="right">Recorded balance</th><th><span class="sr-only">Edit account</span></th></tr></thead>${rows}<tfoot><tr><th colspan="4">${result.missingCount?'Known balances subtotal':'Recorded total'}${result.missingCount?`<small>${result.missingCount} ${result.missingCount===1?'balance is':'balances are'} still missing</small>`:''}</th><td class="right"><span class="amount-chip total">${result.knownCount?format(result.knownTotal,result.currency):'Balance pending'}</span></td><td></td></tr></tfoot></table></div>`:`<div class="portfolio-empty"><strong>No accounts in this view</strong><p>${ctx.ui.person!=='all'&&settings.group==='children'?'Children’s assets are recorded under the household. Select Everyone to see them.':'Add an account or select a different purpose.'}</p>${ctx.ui.person!=='all'?'<button class="button" data-person="all">View household investments</button>':''}</div>`}<p class="portfolio-ledger-note">Account balances are counted once. Goal allocations and proposed transfers are not added to this portfolio again. “Not supplied” means unknown, not zero.</p></section>`;
  }
  const archivedAccount = account => [true,1,'true','TRUE'].includes(account.archived) || String(account.status||'').toLowerCase()==='archived';
  const monthLabel = value => new Date(String(value).slice(0,7)+'-15T12:00:00').toLocaleDateString('en-US',{month:'short',year:'numeric'});
  function historySeries(state, sourceAccounts, selection='all', displayCurrency='USD') {
    const observations=(state.investment_history||[]).filter(row=>finite(row.balance));
    const visible=sourceAccounts.filter(account=>!archivedAccount(account));
    const eligible=visible.filter(account=>observations.filter(row=>row.account_id===account.id).length>1);
    const selected=selection==='all'?null:eligible.find(account=>account.id===selection);
    const accounts=selected?[selected]:eligible;
    const all=selection==='all'||!selected;
    const currencies=[...new Set(accounts.map(account=>account.currency))];
    const currency=currencies.length===1?currencies[0]:displayCurrency;
    const history=observations.filter(row=>accounts.some(account=>account.id===row.account_id));
    const accountRows=account=>history.filter(row=>row.account_id===account.id).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    let rows=[];
    if(!all&&selected)rows=accountRows(selected).map(row=>({date:String(row.date).slice(0,10),balance:Number(row.balance),knownBalance:Number(row.balance),count:1,expected:1,missing:0,label:/month only/i.test(row.notes||'')?monthLabel(row.date):dateLabel(row.date),sourceMonthOnly:/month only/i.test(row.notes||'')}));
    else {
      const months=[...new Set(history.map(row=>String(row.date).slice(0,7)))].sort();
      rows=months.map(month=>{
        const observations=accounts.map(account=>({account,row:accountRows(account).filter(row=>String(row.date).slice(0,7)===month).at(-1)}));
        const dates=observations.map(item=>item.row?.date).filter(Boolean).sort();
        let knownBalance=0,count=0;
        observations.forEach(({account,row})=>{if(!row)return;const value=global.CasaGrowth.convert(row.balance,account.currency,currency,global.CasaGrowth.latestRate(state,String(row.date).slice(0,10)));if(value!==null){knownBalance+=value;count++;}});
        return {date:month+'-15',month,balance:count===accounts.length?knownBalance:null,knownBalance,count,expected:accounts.length,missing:accounts.length-count,label:monthLabel(month),sourceDates:dates};
      });
    }
    return {accounts,eligible,excluded:visible.length-eligible.length,selection:all?'all':selected.id,currency,rows,all,converted:currencies.length>1};
  }
  function balanceHistory(ctx,result) {
    const historyScope=`${ctx.ui.person}:${settings.group}`;
    const series=historySeries(ctx.state,result.accounts,settings.historyAccounts?.[historyScope]||'all',ctx.ui.currency);
    if(!series.eligible.length)return '';
    const {rows,accounts,currency,all}=series;
    const mode=settings.historyMode||'line',title=all?'All investments':accounts[0].name;
    const w=760,h=260,l=72,r=20,t=22,b=44,valid=rows.filter(row=>row.balance!==null),max=Math.max(1,...valid.map(row=>row.balance))*1.08;
    const first=Date.parse(rows[0].date),last=Date.parse(rows.at(-1).date),span=Math.max(86400000,last-first);
    const x=(row,index)=>(all||mode==='bars')?l+(rows.length===1?.5:index/(rows.length-1))*(w-l-r):l+(Date.parse(row.date)-first)/span*(w-l-r);
    const y=value=>t+(h-t-b)*(1-Number(value)/max);
    let svg=`<svg class="chart-svg portfolio-history-svg" viewBox="0 0 ${w} ${h}" role="group" aria-label="${escape(title)} recorded balance history in ${currency}. ${mode==='bars'?'Bar':'Line'} chart. Focus a point for its exact value.">`;
    for(let i=0;i<4;i++){const val=max*i/3,yy=y(val);svg+=`<line class="chart-grid" x1="${l}" x2="${w-r}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="${l-10}" y="${yy+4}" text-anchor="end">${compact(val)}</text>`;}
    if(mode==='line'){
      let segment=[];const segments=[];const flush=()=>{if(segment.length>1)segments.push(segment.join(' '));segment=[];};
      rows.forEach((row,index)=>{if(row.balance===null){flush();return;}segment.push(`${x(row,index)},${y(row.balance)}`);});flush();
      svg+=segments.map(points=>`<polyline points="${points}" fill="none" stroke="var(--teal)" stroke-width="2.4" stroke-linejoin="round"/>`).join('');
    }
    rows.forEach((row,i)=>{
      const xx=x(row,i),value=row.balance;
      const text=`${row.label} · ${value===null?'Total unavailable':format(value,currency)}${all?` · ${row.count} of ${row.expected} accounts recorded`:''}`;
      const attrs=`class="portfolio-history-mark" tabindex="0" role="img" aria-label="${escape(text)}" data-history-tooltip="${escape(text)}"`;
      if(value!==null){
        if(mode==='bars'){const width=Math.min(27,(w-l-r)/Math.max(1,rows.length)*.62),height=Math.max(2,y(0)-y(value));svg+=`<rect ${attrs} x="${xx-width/2}" y="${y(value)-(value===0?2:0)}" width="${width}" height="${height}" rx="2" fill="var(--teal)"><title>${escape(text)}</title></rect>`;}
        else svg+=`<circle ${attrs} cx="${xx}" cy="${y(value)}" r="4.5" fill="var(--teal)"><title>${escape(text)}</title></circle>`;
      } else svg+=`<circle ${attrs} cx="${xx}" cy="${y(0)-5}" r="4" fill="var(--surface)" stroke="var(--muted)"><title>${escape(text)}</title></circle>`;
      if(i%Math.max(1,Math.ceil(rows.length/6))===0||i===rows.length-1)svg+=`<text class="chart-label" x="${xx}" y="${h-12}" text-anchor="middle">${new Date(row.date+'T12:00:00').toLocaleDateString('en-US',{month:'short',year:'2-digit'})}</text>`;
    });
    const coverage=all?`${accounts.length} ${accounts.length===1?'account':'accounts'} with comparable history${series.excluded?`; ${series.excluded} ${series.excluded===1?'account without a history series is':'accounts without a history series are'} excluded`:''}. The same accounts are used throughout. A month missing an account balance or conversion stays unknown.`:'Individual source observations are shown on their recorded dates. Month-only observations are labeled by month.';
    const table=rows.map(row=>`<tr><td>${escape(row.label)}</td><td class="right">${row.balance===null?'Not enough records':format(row.balance,currency)}</td>${all?`<td class="right">${row.count} / ${row.expected}</td>`:''}</tr>`).join('');
    return `<section class="portfolio-actual-history"><div class="card-header"><div><h2 class="section-title">Recorded balance history</h2><p>${rows.length} ${all?'monthly ':''}observations · ${currency} · ${escape(rows[0].label)} to ${escape(rows.at(-1).label)}</p></div><div class="portfolio-history-controls"><label class="sr-only" for="portfolio-history-account">History account</label><select id="portfolio-history-account"><option value="all" ${all?'selected':''}>All investments</option>${series.eligible.map(a=>`<option value="${escape(a.id)}" ${series.selection===a.id?'selected':''}>${escape(a.name)}</option>`).join('')}</select><div class="portfolio-history-switch" role="group" aria-label="Balance history chart type">${[['line','Line'],['bars','Bars']].map(([key,label])=>`<button type="button" data-history-mode="${key}" aria-pressed="${mode===key}">${label}</button>`).join('')}</div></div></div><p class="portfolio-history-coverage">${escape(coverage)}</p><div class="portfolio-history-plot">${svg}</svg><output class="portfolio-history-tooltip" role="status" hidden></output></div><details class="portfolio-history-values"><summary>View exact balances</summary><div class="table-scroll"><table class="compact-table"><thead><tr><th>${all?'Month':'Observation'}</th><th class="right">${currency} balance</th>${all?'<th class="right">Accounts recorded</th>':''}</tr></thead><tbody>${table}</tbody></table></div></details><p class="table-note">${mode==='bars'?'Bars space source observations evenly; exact dates remain in tooltips and the table. ':''}${series.converted?'Different currencies use each observation’s latest available saved historical reference FX; missing conversions remain unknown.':'Account currency is retained so exchange-rate changes do not look like investment gains.'} Lines connect supplied observations; intermediate balances are unknown. Monthly-only sources use calendar month-end for grouping. Balance changes can include deposits and withdrawals and are not a measured investment return.</p></section>`;
  }
  function history(ctx,result) {
    const ids=new Set(result.accounts.map(a=>a.id));
    const rows=(ctx.state.investment_history||[]).filter(item=>ids.has(item.account_id)&&finite(item.balance)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    const dates=[...new Set(rows.map(row=>String(row.date).slice(0,10)))];
    return `<details class="portfolio-history"><summary><span>Recorded history</span><small>${dates.length} ${dates.length===1?'observation date':'observation dates'}</small></summary><p>${dates.length<2?'The supplied accounts currently have a single saved observation date. There is no verified historical return or performance trend to plot yet.':'These are the actual balance observations supplied. Changes in balances can include deposits, withdrawals, and market movements; they are not automatically investment returns.'}</p>${rows.length?`<div class="table-scroll"><table class="compact-table"><thead><tr><th>Date</th><th>Account</th><th class="right">Balance in account currency</th></tr></thead><tbody>${rows.map(row=>{const account=result.accounts.find(a=>a.id===row.account_id);return `<tr><td>${dateLabel(row.date)}</td><td>${escape(account.name)}</td><td class="right">${format(row.balance,account.currency)}</td></tr>`}).join('')}</tbody></table></div>`:'<p>No historical observations have been supplied.</p>'}</details>`;
  }

  function growthControls(ctx,result) {
    const title=settings.group==='all'?'the portfolio':groupInfo(settings.group)?.label.toLowerCase();
    return `<section class="portfolio-growth"><div class="portfolio-chapter-heading"><div><div class="portfolio-kicker">LOOKING AHEAD</div><h2 class="section-title">Where ${escape(title)} could go</h2><p>Compare three return assumptions on one timeline · values in ${result.currency}.</p></div><span class="portfolio-preview-tag">Scenario preview</span></div><div class="portfolio-horizon"><div><label for="portfolio-years">Time horizon</label><strong id="portfolio-years-label">${settings.years} years</strong></div><input id="portfolio-years" type="range" min="1" max="40" step="1" value="${settings.years}"><div class="portfolio-horizon-presets">${[5,10,20,30,40].map(year=>`<button data-port-years="${year}" class="${Number(settings.years)===year?'active':''}">${year} yr</button>`).join('')}</div></div><div class="portfolio-assumptions"><div class="portfolio-contribution-control"><label for="portfolio-monthly">Additional monthly contribution (${result.currency})</label><input id="portfolio-monthly" type="number" min="0" max="1000000000" step="${result.currency==='CLP'?'1000':'25'}" value="${escape(monthly(ctx))}"><small>A scenario amount, not your account’s recorded contribution.</small></div><fieldset class="portfolio-rate-controls"><legend>Annual returns after fees</legend>${scenarios.map(s=>`<label class="portfolio-rate ${s.id}" for="portfolio-rate-${s.id}"><span><i aria-hidden="true"></i>${s.label}</span><span class="portfolio-rate-input"><input id="portfolio-rate-${s.id}" type="number" min="-50" max="30" step="0.5" value="${escape(settings.rates[s.id])}"><b>%</b></span></label>`).join('')}</fieldset></div><div id="portfolio-growth-output">${growthOutput(ctx,result)}</div><p class="portfolio-model-note">The initial 3%, 6%, and 9% rates are editable illustrations, not expected returns or recommendations. Contributions occur at month end. Values are nominal, before taxes and inflation; volatility and future exchange-rate changes are not modeled. ${result.missingCount?'Only supplied balances are projected. ':''}Adjusting this preview does not change the workbook.</p></section>`;
  }
  function chart(result,projection,inspectYear) {
    const width=920,height=300,left=68,right=28,top=24,bottom=42;
    const plotWidth=width-left-right,plotHeight=height-top-bottom;
    const all=scenarios.flatMap(s=>projection.series[s.id].map(point=>point.balance));
    const max=Math.max(1,...all,projection.finals.normal.contributions)*1.08;
    const x=month=>left+month/projection.months*plotWidth;
    const y=value=>top+plotHeight-(value/max)*plotHeight;
    const pointIndex=Math.round(inspectYear*12);
    const inspected=projection.series.normal[pointIndex];
    let svg=`<svg class="portfolio-growth-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="portfolio-chart-title portfolio-chart-description"><title id="portfolio-chart-title">Investment growth scenarios over ${projection.years} years</title><desc id="portfolio-chart-description">Conservative, normal, and aggressive constant-return paths, starting with the known ${result.currency} balance. Use the inspection slider below for exact values at each year.</desc>`;
    for(let i=0;i<=4;i++){const value=max*i/4,yy=y(value);svg+=`<line class="portfolio-gridline" x1="${left}" y1="${yy}" x2="${width-right}" y2="${yy}"/><text class="portfolio-axis-label" x="${left-10}" y="${yy+4}" text-anchor="end">${escape(compact(value))}</text>`;}
    const labelYears=[...new Set([0,Math.round(projection.years/4),Math.round(projection.years/2),Math.round(projection.years*3/4),projection.years])];
    labelYears.forEach(year=>{svg+=`<text class="portfolio-axis-label" x="${x(year*12)}" y="${height-10}" text-anchor="middle">${escape(yearLabel(result,year))}</text>`;});
    const rangeTop=projection.series.aggressive.map(point=>`${x(point.month)},${y(point.balance)}`).join(' L');
    const rangeBottom=[...projection.series.conservative].reverse().map(point=>`${x(point.month)},${y(point.balance)}`).join(' L');
    svg+=`<path class="portfolio-scenario-range" d="M${rangeTop} L${rangeBottom} Z"/>`;
    const contributions=projection.series.normal.map(point=>`${x(point.month)},${y(point.contributions)}`).join(' ');
    svg+=`<polyline class="portfolio-contribution-line" points="${contributions}"/>`;
    scenarios.forEach(s=>{svg+=`<polyline class="portfolio-scenario-line ${s.id}" points="${projection.series[s.id].map(point=>`${x(point.month)},${y(point.balance)}`).join(' ')}"/>`;});
    svg+=`<line class="portfolio-inspect-line" x1="${x(pointIndex)}" y1="${top}" x2="${x(pointIndex)}" y2="${height-bottom}"/>`;
    scenarios.forEach(s=>{const point=projection.series[s.id][pointIndex];svg+=`<circle class="portfolio-inspect-dot ${s.id}" cx="${x(pointIndex)}" cy="${y(point.balance)}" r="4.6"><title>${escape(s.label)} · ${escape(yearLabel(result,inspectYear))} · ${escape(format(point.balance,result.currency))}</title></circle>`;});
    svg+='</svg>';
    return `<div class="portfolio-chart"><div class="portfolio-chart-legend">${scenarios.map(s=>`<span class="${s.id}"><i></i>${s.label} ${settings.rates[s.id]}%</span>`).join('')}<span class="contributions"><i></i>Starting balance + deposits</span></div>${svg}<div class="portfolio-inspect-control"><label for="portfolio-inspect">Explore the timeline <strong>${yearLabel(result,inspectYear)} · year ${inspectYear}</strong></label><input id="portfolio-inspect" type="range" min="0" max="${projection.years}" step="1" value="${inspectYear}"></div><div class="portfolio-scenario-readout">${scenarios.map(s=>{const point=projection.series[s.id][pointIndex];return `<div class="${s.id}"><span><i></i>${s.label}</span><strong>${format(point.balance,result.currency)}</strong><small>${format(point.gain,result.currency)} investment growth</small></div>`;}).join('')}</div><div class="portfolio-paid-in"><span>Starting balance + new deposits at this point</span><strong>${format(inspected.contributions,result.currency)}</strong><span>New deposits ${format(inspected.addedContributions,result.currency)}</span></div></div>`;
  }
  function growthOutput(ctx,result) {
    if(!result.accounts.some(account=>finite(account.displayBalance)))return `<div class="portfolio-empty"><strong>A starting balance is needed</strong><p>Supply a balance for an account in this view to chart its growth. Missing balances are not assumed to be zero.</p></div>`;
    const rates=Object.fromEntries(scenarios.map(s=>[s.id,Number(settings.rates[s.id])]));
    if(!finite(monthly(ctx))||Number(monthly(ctx))<0||Number(monthly(ctx))>1e9||scenarios.some(s=>!finite(settings.rates[s.id])||rates[s.id]<-50||rates[s.id]>30)||!(rates.conservative<=rates.normal&&rates.normal<=rates.aggressive))return '<div class="portfolio-input-message" role="status">Enter a non-negative monthly contribution and return rates between −50% and 30%, ordered conservative ≤ normal ≤ aggressive.</div>';
    try {
      const projection=global.CasaGrowth.project({startingBalance:result.knownTotal,monthlyContribution:Number(monthly(ctx)),years:Number(settings.years),rates});
      settings.inspectYear=Math.max(0,Math.min(Number(settings.inspectYear),Number(settings.years)));
      return chart(result,projection,settings.inspectYear);
    }catch(error){return `<div class="portfolio-input-message" role="status">${escape(error.message||'Review the scenario inputs to calculate the timeline.')}</div>`;}
  }
  function body(ctx) {
    if(!global.CasaGrowth)return '<div class="notice amber">The investment planning view is still loading. Reload Casa to continue.</div>';
    const all=model(ctx,'all'),result=model(ctx);
    const focus=settings.group==='all'?'All investment purposes':groupInfo(settings.group)?.label||'Investments';
    return `<div class="page-head"><div><div class="eyebrow">YOUR MONEY, WITH A PURPOSE</div><h1>Your investment portfolio</h1><p>Retirement, children’s futures, and flexible investments in one clear view.</p></div><div class="head-actions"><button class="button primary" data-action="new-investment">${symbol(ctx,'plus')} Add account</button></div></div>${personTabs(ctx)}<section class="card portfolio-workspace"><header class="portfolio-summary"><div><span class="portfolio-kicker">${ctx.ui.person==='all'?'HOUSEHOLD':escape(name(ctx,ctx.ui.person)).toUpperCase()} · RECORDED INVESTMENTS</span><div class="portfolio-total">${all.knownCount?format(all.knownTotal,all.currency):all.accounts.length?'Balance pending':format(0,all.currency)}${all.missingCount?'<span>known balances</span>':''}</div><p>${escape(snapshotNote(all))}</p></div><div class="portfolio-summary-facts"><div><strong>${all.accounts.filter(a=>!isClosed(a)).length}</strong><span>open accounts</span></div><div><strong>${all.accounts.filter(a=>a.group==='retirement').length}</strong><span>retirement accounts</span></div><div><strong>${all.missingCount}</strong><span>balances pending</span></div></div></header>${all.missingCount?`<div class="portfolio-coverage-line">${symbol(ctx,'info')}<span>${all.missingCount} ${all.missingCount===1?'account balance is':'account balances are'} not supplied. The displayed total is a known-balance subtotal, not complete household assets.</span></div>`:''}${allocation(ctx,all)}${tabs(ctx,all)}<div id="portfolio-purpose-content" role="tabpanel" aria-labelledby="portfolio-tab-${settings.group}"><div class="portfolio-focus-heading"><div>${settings.group==='all'?'':purpose(ctx,settings.group)}<div><h2>${escape(focus)}</h2><p>${result.accounts.length} ${result.accounts.length===1?'account':'accounts'}${settings.group==='children'?' · household-owned records; beneficiary mapping remains to be confirmed':''}</p></div></div><strong>${result.knownCount?format(result.knownTotal,result.currency):result.accounts.length?'Balance pending':format(0,result.currency)}${result.missingCount?' <small>known</small>':''}</strong></div>${accountTable(ctx,result)}${balanceHistory(ctx,result)}${growthControls(ctx,result)}${history(ctx,result)}</div></section>`;
  }
  function render(ctx) {return `<div id="portfolio-page" class="portfolio-page">${body(ctx)}</div>`;}
  function mount(ctx) {
    const root=document.getElementById('portfolio-page');
    if(!root)return;
    const refresh=focus=>{root.innerHTML=body(ctx);mount(ctx);if(focus)root.querySelector(`[data-port-group="${focus}"][role="tab"]`)?.focus();};
    const refreshChart=()=>{const result=model(ctx),output=root.querySelector('#portfolio-growth-output');if(output)output.innerHTML=growthOutput(ctx,result);root.querySelector('#portfolio-years-label').textContent=settings.years+' years';root.querySelectorAll('[data-port-years]').forEach(button=>button.classList.toggle('active',Number(button.dataset.portYears)===Number(settings.years)));};
    root.onchange=event=>{if(event.target.id==='portfolio-history-account'){settings.historyAccounts??={};settings.historyAccounts[`${ctx.ui.person}:${settings.group}`]=event.target.value;refresh();}};
    const showHistoryTooltip=target=>{
      const mark=target.closest?.('[data-history-tooltip]');if(!mark)return;
      const plot=mark.closest('.portfolio-history-plot'),tip=plot?.querySelector('.portfolio-history-tooltip');if(!tip)return;
      const box=plot.getBoundingClientRect(),point=mark.getBoundingClientRect();tip.textContent=mark.dataset.historyTooltip;tip.hidden=false;
      const half=Math.min(tip.offsetWidth/2,box.width/2);tip.style.left=`${Math.max(half,Math.min(box.width-half,point.left-box.left+point.width/2))}px`;tip.style.top=`${Math.max(8,point.top-box.top-12)}px`;
    };
    const hideHistoryTooltip=event=>{const mark=event.target.closest?.('[data-history-tooltip]');if(!mark||mark.contains(event.relatedTarget))return;const tip=mark.closest('.portfolio-history-plot')?.querySelector('.portfolio-history-tooltip');if(tip)tip.hidden=true;};
    root.onpointerover=event=>showHistoryTooltip(event.target);
    root.onfocusin=event=>showHistoryTooltip(event.target);
    root.onpointerout=hideHistoryTooltip;root.onfocusout=hideHistoryTooltip;
    root.onclick=event=>{
      const historyMode=event.target.closest('[data-history-mode]');
      if(historyMode){settings.historyMode=historyMode.dataset.historyMode;refresh();root.querySelector(`[data-history-mode="${settings.historyMode}"]`)?.focus();return;}
      if(event.target.closest('[data-port-growth]')){root.querySelector('.portfolio-growth')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
      const group=event.target.closest('[data-port-group]');
      if(group){settings.group=group.dataset.portGroup;refresh(settings.group);return;}
      const years=event.target.closest('[data-port-years]');
      if(years){settings.years=Number(years.dataset.portYears);settings.inspectYear=settings.years;root.querySelector('#portfolio-years').value=settings.years;refreshChart();}
    };
    root.oninput=event=>{
      if(event.target.id==='portfolio-years'){
        const wasAtEnd=Number(settings.inspectYear)===Number(settings.years);
        settings.years=Number(event.target.value);
        settings.inspectYear=wasAtEnd?settings.years:Math.min(settings.inspectYear,settings.years);
        refreshChart();
      }
      else if(event.target.id==='portfolio-monthly'){settings.monthly[scope(ctx)]=event.target.value;refreshChart();}
      else if(event.target.id.startsWith('portfolio-rate-')){settings.rates[event.target.id.slice('portfolio-rate-'.length)]=event.target.value;refreshChart();}
      else if(event.target.id==='portfolio-inspect'){
        settings.inspectYear=Number(event.target.value);
        // Keep this range input mounted so pointer dragging remains continuous.
        const output=root.querySelector('#portfolio-growth-output'),buffer=document.createElement('div');
        buffer.innerHTML=growthOutput(ctx,model(ctx));
        for(const selector of ['.portfolio-growth-svg','.portfolio-scenario-readout','.portfolio-paid-in']){
          const current=output.querySelector(selector),replacement=buffer.querySelector(selector);
          if(current&&replacement)current.replaceWith(replacement);
        }
        const label=output.querySelector('.portfolio-inspect-control label'),replacement=buffer.querySelector('.portfolio-inspect-control label');
        if(label&&replacement)label.innerHTML=replacement.innerHTML;
      }
    };
    root.onkeydown=event=>{
      const tab=event.target.closest('[data-port-group][role="tab"]');
      if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();
      const ids=['all',...groups.map(g=>g.id)],index=ids.indexOf(settings.group);
      settings.group=ids[event.key==='Home'?0:event.key==='End'?ids.length-1:(index+(event.key==='ArrowLeft'?-1:1)+ids.length)%ids.length];
      refresh(settings.group);
    };
  }
  global.CasaPortfolio=Object.freeze({render,mount,historySeries});
})(window);
