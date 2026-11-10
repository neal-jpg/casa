/* Presentation for locally calculated comparisons and aggregate-only cloud analysis. */
(function (global) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
  const money = (value, currency) => known(value) ? `${currency} ${new Intl.NumberFormat(currency === 'CLP' ? 'es-CL' : 'en-US', {minimumFractionDigits:currency === 'USD' ? 2 : 0, maximumFractionDigits:currency === 'USD' ? 2 : 0}).format(value)}` : 'Not enough records';
  const month = value => new Date(`${value}-15T12:00:00`).toLocaleDateString('en-US', {month:'short',year:'numeric'});
  const amount = (value,currency,compact=false) => `<span class="amount-chip${compact?' compact':''}">${money(value,currency)}</span>`;
  const category = value => {const visual=global.CasaCategories?.visual(value)||{emoji:'🏷️',tone:'slate'};return `<span class="category-label"><span class="category-symbol" data-tone="${escape(visual.tone)}" aria-hidden="true">${escape(visual.emoji)}</span><span>${escape(value.name)}</span></span>`;};
  const change = (value, average, currency) => {
    if (!known(value) || !known(average)) return '<span class="comparison-muted">Comparison unavailable</span>';
    const delta = value - average;
    const percent = average > 0 ? `${(Math.abs(delta / average) * 100).toFixed(1)}%` : money(Math.abs(delta), currency);
    return `<span class="comparison-change ${delta > 0 ? 'rise' : delta < 0 ? 'fall' : ''}">${Math.abs(delta) < .005 ? 'Matches average' : `${delta > 0 ? '↑' : '↓'} ${percent} ${delta > 0 ? 'above' : 'below'} average`}</span>`;
  };
  function averages(result) {
    if (!result) return '';
    const currency = result.currency;
    const avg = result.average;
    const annual = result.period === 'year';
    const selected = annual ? result.selectedMonthlyAverage : result.selected;
    const selectedLabel = annual ? `${escape(result.year)} / month` : 'This month';
    const categories = [...result.categories].sort((a,b) => (b.average ?? -1) - (a.average ?? -1));
    const rows = categories.map(c => `<tr data-drill-category="${escape(c.id)}" tabindex="0" aria-label="Show ${escape(c.name)} transactions"><td>${category(c)}</td><td class="right">${amount(c.selected,currency,true)}</td><td class="right">${amount(c.average,currency,true)}</td><td class="right">${change(c.selected,c.average,currency)}</td></tr>`).join('');
    const range = months => months.length ? `${months.length} recorded ${months.length === 1 ? 'month' : 'months'} · ${month(months[0])}${months.length > 1 ? ' – '+month(months.at(-1)) : ''}` : 'No comparable finished months';
    return `<section class="card card-pad subsection averages-panel" aria-label="Monthly averages"><div class="card-header"><div><h2 class="section-title">${annual ? `How ${escape(result.year)} compares` : 'How this month compares'}</h2><p>${annual ? 'Monthly averages · selected year vs all-time' : 'All-time recorded averages'} · ${currency} · follows your person filter</p></div><span class="pill neutral">${annual ? escape(result.year) : month(result.month)}</span></div><div class="average-metrics"><article><div class="average-label">Average monthly income${annual ? ' · all-time' : ''}</div><strong class="average-value amount-chip">${money(avg.income,currency)}</strong><p>${escape(range(avg.incomeMonths))}</p><div class="average-selected"><span class="average-month-label">${selectedLabel}</span>${amount(selected.income,currency,true)}${change(selected.income,avg.income,currency)}</div>${annual ? `<small>${escape(range(selected.incomeMonths))} in the selected year. Only months with complete supplied income are averaged.</small>` : selected.incomeMissingPeople?.length ? '<small>Some monthly income is missing; no complete income comparison.</small>' : ''}</article><article><div class="average-label">Average monthly expenses${annual ? ' · all-time' : ''}</div><strong class="average-value amount-chip">${money(avg.spending,currency)}</strong><p>${escape(range(avg.spendingMonths))}</p><div class="average-selected"><span class="average-month-label">${selectedLabel}</span>${amount(selected.spending,currency,true)}${change(selected.spending,avg.spending,currency)}</div><small>${annual ? escape(range(selected.spendingMonths)) + ' in the selected year. ' : ''}Recorded spending after refunds; gaps in records can affect comparisons.</small></article></div><details class="category-averages"><summary>Average monthly spending by category <span>${categories.length} categories</span></summary><div class="table-scroll"><table class="compact-table comparison-table"><thead><tr><th>Category</th><th class="right">${selectedLabel}</th><th class="right">${annual ? 'All-time / month' : 'Monthly average'}</th><th class="right">Difference</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No expense records to compare yet.</td></tr>'}</tbody></table></div></details><details class="average-method"><summary>Which months are included?</summary><p>All-time income: ${escape(avg.incomeMonths.map(month).join(', ') || 'None yet')}.<br>All-time expenses: ${escape(avg.spendingMonths.map(month).join(', ') || 'None yet')}.</p>${annual ? `<p>${escape(result.year)} income: ${escape(selected.incomeMonths.map(month).join(', ') || 'None yet')}.<br>${escape(result.year)} expenses: ${escape(selected.spendingMonths.map(month).join(', ') || 'None yet')}.</p>` : ''}<p>Each average uses its own denominator. A missing category counts as zero only within a month with recorded spending. Months with no spending records are omitted. The current calendar month and future months are omitted from averages.</p>${(result.coverage.notes || []).map(note=>`<p>${escape(note)}</p>`).join('')}</details></section>`;
  }
  function host() {
    return '<section class="card card-pad subsection ai-panel" id="ai-summary" aria-label="AI financial summary" aria-live="polite"></section>';
  }
  const jobs = new Map();
  let mountedKey = null;
  let currentPayload = null;
  let pollTimer = null;
  let autoEnabled = !global.CasaWeb;
  let enableReady = false;
  let preferenceEdited = false;
  function receivePreferences(value) {
    if(preferenceEdited||typeof value?.ai_auto!=='boolean')return;
    const newlyEnabled=!autoEnabled&&value.ai_auto;
    autoEnabled=value.ai_auto;enableReady=true;
    if(currentPayload){paint(jobs.get(mountedKey));if(newlyEnabled&&jobs.get(mountedKey)?.status==='idle')void run(false);}
  }
  global.CasaWeb?.onPreferences?.(receivePreferences);
  global.CasaWeb?.onSessionEnd?.(()=>{
    clearTimeout(pollTimer);mountedKey=null;currentPayload=null;jobs.clear();
    autoEnabled=false;enableReady=false;preferenceEdited=false;
  });
  const periodTitle = () => currentPayload?.context==='dashboard' ? 'The bigger picture' : currentPayload?.period === 'year' ? `Your ${escape(currentPayload.year)}, explained` : 'Your month, explained';
  const header = (working=false) => `<div class="card-header"><div><div class="ai-eyebrow">CASA INTELLIGENCE <span>AI</span></div><h2 class="section-title">${periodTitle()}</h2></div><div class="ai-actions"><label class="ai-auto"><input type="checkbox" id="ai-auto" ${autoEnabled?'checked':''}> Auto summaries</label><button class="button small" id="ai-refresh" ${working?'disabled':''}>${working?'Analyzing…':'Refresh summary'}</button></div></div>`;
  const disclosure = () => '<details class="ai-privacy"><summary>About this AI summary <span>Aggregate data only · Cloud AI</span></summary><p class="table-note ai-disclosure">Google Gemini through Casa’s private backend. '+(currentPayload?.context==='dashboard'?'Household totals, category patterns, account-group balances, aggregate balance history, goal labels and coverage notes are sent.':'Selected-period totals, monthly category comparisons, and coverage notes are sent.')+' No transaction descriptions, account numbers, receipts, or workbook files. Summaries are cached privately in Drive and refresh when the figures change.</p></details>';
  function paint(job) {
    const element = document.getElementById('ai-summary');
    if (!element) return;
    const ready = job?.status === 'ready' && job.summary;
    if (ready) {
      const summary = job.summary;
      const cards = (title,items,kind) => items?.length ? `<div class="ai-column ${kind}"><h3>${title}</h3>${items.map(item=>`<article><strong>${escape(item.title)}</strong><p>${escape(item.detail)}</p></article>`).join('')}</div>` : '';
      const dashboard=currentPayload?.context==='dashboard';
      const results=`<div class="ai-results">${cards(dashboard?'What matters now':'What changed',summary.highlights,'highlights')}${cards(dashboard?'Opportunities to consider':'Ways to spend less',summary.cost_cutting,'savings')}</div>${summary.cautions?.length ? `<details class="ai-cautions"><summary>Keep in mind <span>${summary.cautions.length} record notes</span></summary><ul>${summary.cautions.map(c=>`<li>${escape(c)}</li>`).join('')}</ul></details>` : ''}`;
      element.innerHTML = `${header()}<p class="ai-overview">${escape(summary.overview)}</p>${dashboard?`<details class="ai-dashboard-details"><summary>Suggestions & things to watch</summary>${results}${disclosure()}</details>`:results}<div class="ai-timestamp">${job.generated_at?'Updated '+escape(new Date(job.generated_at).toLocaleString()):'AI generated'} · ${escape(job.provider || 'Google Gemini')} · check suggestions against your records</div>${dashboard?'':disclosure()}`;
    } else if (job?.status === 'running') {
      element.innerHTML = `${header(true)}<div class="ai-wait"><span class="ai-spinner"></span><div><strong>${currentPayload?.context==='dashboard'?'Looking across your financial picture':`Reading the patterns in your ${currentPayload?.period === 'year' ? 'year' : 'month'}`}</strong><p>${currentPayload?.context==='dashboard'?'Reviewing spending patterns, savings, investments and goals…':'Comparing totals, category changes, and the coverage of your records…'}</p></div></div>${disclosure()}`;
    } else {
      const error = job?.error;
      const text = error || (!autoEnabled ? 'Automatic AI summaries are off. Use Refresh summary whenever you want an analysis.' : currentPayload?.context==='dashboard'?'Preparing an overall view of spending, savings, investments and goals.':'Preparing an analysis of the selected period’s totals and category changes.');
      element.innerHTML = `${header()}<p class="ai-status">${escape(text)}</p>${disclosure()}`;
    }
    document.getElementById('ai-refresh')?.addEventListener('click',()=>run(true));
    document.getElementById('ai-auto')?.addEventListener('change',async event=>{
      autoEnabled = event.target.checked;
      preferenceEdited = true;enableReady=true;
      try { await post('/api/preferences',{ai_auto:autoEnabled}); } catch { /* Current session setting still works offline. */ }
      if (autoEnabled) await run(false); else paint(jobs.get(mountedKey));
    });
  }
  async function post(path,body) {
    const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const value=await response.json();
    if(!response.ok) throw new Error(value.error || 'AI analysis could not be loaded. Try Refresh summary.');
    return value;
  }
  async function run(force=false) {
    const key=mountedKey, payload=currentPayload;
    if(!payload) return;
    try {
      const value=await post('/api/insights/generate',{...payload,force});
      jobs.set(key,value);
      if(mountedKey===key){paint(value);if(['running','busy'].includes(value.status))poll(key,payload);}
    } catch(error) {const value={status:'error',error:error.message};jobs.set(key,value);if(mountedKey===key)paint(value);}
  }
  function poll(key,payload) {
    clearTimeout(pollTimer);
    pollTimer=setTimeout(async()=>{
      if(mountedKey!==key || !document.getElementById('ai-summary')) return;
      try {
        const value=await post('/api/insights/status',payload);
        jobs.set(key,value);
        if(mountedKey===key){paint(value);if(['running','busy'].includes(value.status))poll(key,payload);else if(value.status==='idle'&&autoEnabled)run(false);}
      } catch(error) {if(mountedKey===key)paint({status:'error',error:error.message});}
    },1800);
  }
  async function mount(payload) {
    clearTimeout(pollTimer);
    if(!payload||!document.getElementById('ai-summary')){mountedKey=null;currentPayload=null;return;}
    const key=JSON.stringify(payload);
    mountedKey=key;currentPayload=payload;
    paint(jobs.get(key));
    if(!enableReady){
      try {if(global.CasaWeb){receivePreferences(global.CasaWeb.initialPreferences?.());}else{const response=await fetch('/api/preferences',{credentials:'same-origin'});const prefs=await response.json();autoEnabled=prefs.ai_auto!==false;enableReady=true;}}catch{}
    }
    if(mountedKey!==key) return;
    try {
      const value=await post('/api/insights/status',payload);
      jobs.set(key,value);
      if(mountedKey!==key) return;
      paint(value);
      if(value.status==='running')poll(key,payload);
      else if(value.status==='idle'&&autoEnabled)run(false);
    }catch(error){if(mountedKey===key)paint({status:'error',error:error.message});}
  }
  global.CasaAnalysis={averages,host,mount,change};
})(window);
