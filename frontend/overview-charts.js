/* Local display choices for the overview. Financial data never leaves the app. */
(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const readChoice = (key, allowed, fallback) => {
    try { const value = root.localStorage?.getItem(key); return allowed.includes(value) ? value : fallback; } catch { return fallback; }
  };
  const choices = {
    trend: readChoice('casa.overview.trend', ['bars', 'line'], 'bars'),
    categories: readChoice('casa.overview.categories', ['list', 'pie'], 'list')
  };
  let trendContext = null;
  let categoryContext = null;
  const writeChoice = (type, value) => {
    choices[type] = value;
    try { root.localStorage?.setItem(`casa.overview.${type}`, value); } catch { /* Appearance remains usable without browser storage. */ }
  };
  const compact = value => Math.abs(value) >= 1e6 ? `${(value / 1e6).toFixed(1)}m` : Math.abs(value) >= 1e3 ? `${(value / 1e3).toFixed(0)}k` : `${Math.round(value)}`;
  const money = (context, value) => known(value) ? (context.formatMoney ? context.formatMoney(Number(value)) : `${context.currency || ''} ${Number(value).toLocaleString('en-US')}`) : 'Amount not supplied';
  const monthLabel = (context, month, short = false) => context.monthLabel ? context.monthLabel(month, short) : new Date(`${month}-15T12:00:00`).toLocaleDateString('en-US', {month:short ? 'short' : 'long', year:short ? undefined : 'numeric'});
  const controls = (type, options, label) => `<div class="overview-chart-switch" role="group" aria-label="${escape(label)}">${options.map(([value, name]) => `<button type="button" data-overview-chart="${type}" data-overview-mode="${value}" aria-pressed="${choices[type] === value}">${escape(name)}</button>`).join('')}</div>`;
  const tooltip = text => `data-tooltip="${escape(text)}" aria-label="${escape(text)}"`;
  const detailTable = (context, series) => `<details class="overview-chart-data"><summary>View monthly figures</summary><div class="table-scroll"><table class="compact-table"><caption class="sr-only">Monthly income and net spending in ${escape(context.currency)}</caption><thead><tr><th>Month</th><th class="right">Income</th><th class="right">Net spending</th></tr></thead><tbody>${series.map(row => `<tr><td><button type="button" class="small-link" data-chart-month="${escape(row.month)}">${escape(monthLabel(context, row.month))}</button></td><td class="right">${escape(money(context, row.income))}</td><td class="right">${escape(money(context, row.spending))}</td></tr>`).join('')}</tbody></table></div></details>`;

  function trendGraph(context) {
    const series = Array.isArray(context.series) ? context.series : [];
    const values = series.flatMap(row => [row.income, row.spending]).filter(known).map(Number);
    if (!series.length || !values.length) return '<div class="empty-state overview-chart-empty"><strong>No recorded totals for this period</strong>Choose another period or add income and spending records.</div>';
    const width = 720, height = 252, left = 72, right = 18, top = 25, bottom = 39;
    const innerWidth = width - left - right, innerHeight = height - top - bottom;
    const rawMin = Math.min(0, ...values), rawMax = Math.max(0, ...values);
    const padding = Math.max(1, rawMax - rawMin) * .1;
    const min = rawMin < 0 ? rawMin - padding : 0;
    const max = rawMax > 0 ? rawMax + padding : (rawMin === 0 ? 1 : 0);
    const span = max - min;
    const y = value => top + innerHeight - (Number(value) - min) / span * innerHeight;
    const group = innerWidth / series.length;
    const x = index => left + group * (index + .5);
    const tick = context.formatCompact || compact;
    let chart = `<svg class="chart-svg overview-time-chart" viewBox="0 0 ${width} ${height}" role="group" aria-label="Recorded monthly income and net spending, ${escape(context.currency)}. ${choices.trend === 'line' ? 'Line' : 'Bar'} chart."><title>Income and net spending over time</title>`;
    for (let index = 0; index < 5; index++) {
      const value = min + span * index / 4, yy = y(value);
      chart += `<line class="chart-grid" x1="${left}" x2="${width-right}" y1="${yy}" y2="${yy}"/><text class="chart-label" x="${left-10}" y="${yy+3}" text-anchor="end">${escape(tick(value))}</text>`;
    }
    if (min < 0) chart += `<line class="overview-zero-line" x1="${left}" x2="${width-right}" y1="${y(0)}" y2="${y(0)}"/>`;
    const keys = [['income', 'Income'], ['spending', 'Net spending']];
    keys.forEach(([key, label], keyIndex) => {
      if (choices.trend === 'line') {
        // Unknown totals break the path. They must never be plotted as zero.
        let segment = [];
        const paths = [];
        const flush = () => { if (segment.length > 1) paths.push(segment.join(' ')); segment = []; };
        series.forEach((row, index) => {
          if (!known(row[key])) { flush(); return; }
          segment.push(`${segment.length ? 'L' : 'M'} ${x(index)} ${y(row[key])}`);
        });
        flush();
        chart += paths.map(path => `<path class="overview-line overview-${key}" d="${path}" fill="none" stroke-width="2.8" ${key === 'spending' ? 'stroke-dasharray="6 4"' : ''}/>`).join('');
      }
      series.forEach((row, index) => {
        if (!known(row[key])) return;
        const value = Number(row[key]), text = `${monthLabel(context, row.month)} · ${label}: ${money(context, value)}. Open this month’s records.`;
        const attrs = `class="${choices.trend === 'line' ? 'chart-point overview-point' : 'chart-bar overview-bar'} overview-${key}" data-chart-month="${escape(row.month)}" role="button" tabindex="0" ${tooltip(text)}`;
        if (choices.trend === 'line') {
          chart += `<circle ${attrs} cx="${x(index)}" cy="${y(value)}" r="4.5"><title>${escape(text)}</title></circle>`;
        } else {
          const bar = Math.min(21, group * .29), xx = x(index) + (keyIndex ? 2 : -bar-2);
          const yy = Math.min(y(value), y(0)), size = Math.abs(y(value)-y(0));
          chart += `<rect ${attrs} x="${xx}" y="${size ? yy : yy-1}" width="${bar}" height="${Math.max(2,size)}" rx="2"><title>${escape(text)}</title></rect>`;
        }
      });
    });
    series.forEach((row, index) => {
      chart += `<text class="chart-label" x="${x(index)}" y="${height-11}" text-anchor="middle">${escape(monthLabel(context, row.month, true))}</text>`;
    });
    const missing = series.some(row => !known(row.income) || !known(row.spending));
    return `<div class="chart-wrap">${chart}</svg><div class="chart-tooltip" hidden></div></div><p class="table-note overview-chart-note">Select a ${choices.trend === 'line' ? 'point' : 'bar'} to explore that month’s records.${missing ? ' Missing totals appear as gaps, never as zero.' : ''} Reporting conversions may be estimated; income may be incomplete or provisionally assigned by invoice month.</p>${detailTable(context, series)}`;
  }

  function trend(context) {
    trendContext = context;
    return `<section class="overview-trend"><div class="card-header overview-chart-header"><div><h2 class="section-title">Income & spending over time</h2><p>${escape(context.subtitle || `Recorded monthly totals · ${context.currency}`)}</p></div>${controls('trend', [['bars','Bars'],['line','Line']], 'Income and spending chart type')}</div><div class="overview-series-legend"><span><i class="overview-income"></i>Income</span><span><i class="overview-spending"></i>Net spending</span></div>${trendGraph(context)}</section>`;
  }

  // The workbook's category colors may all be identical. Give the chart its
  // own stable palette so the same category remains recognizable each month.
  const categoryColors = Object.freeze({
    'baby-supplies':'#bd72a0', business:'#4e87ba', 'camera-exchange':'#7b91a6',
    'car-maintenance-registration':'#9d7750', 'card-payment':'#69877e',
    'construction-improvements':'#c19840', 'daycare-school':'#8667bb',
    entertainment:'#777fc4', fuel:'#b4a047', 'gifts-parties':'#ce7c8e',
    groceries:'#4c9b77', 'health-medical':'#bb816a', 'home-furniture':'#c3657f',
    income:'#489d91', insurance:'#6e96ab', 'investment-contribution':'#5aaf9c',
    mortgage:'#466b9d', nanny:'#90a74f', 'other-personal':'#8b8c99',
    'personal-care':'#b35e98', 'restaurants-cafes':'#ba6670', shopping:'#9f7eb2',
    'streaming-apps':'#aa8dcc', takeout:'#d29250', 'taxes-fees':'#915d77',
    'transfer-review':'#7b988d', 'transport-parking':'#61a3ba', travel:'#51aeb0',
    unclassified:'#9f8d7b', 'utilities-communications':'#b7a359'
  });
  function colorFor(category) {
    if (categoryColors[category.id]) return categoryColors[category.id];
    let hash = 0;
    for (const character of String(category.id || category.name || 'category')) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
    return `hsl(${Math.abs(hash) % 360} 48% 55%)`;
  }
  const categoryName = (context, category) => context.categoryLabel ? context.categoryLabel(category) : `<span>${escape(category.name || category.id)}</span>`;
  function categoryList(context, withShares = false, positiveTotal = 0) {
    return `<div class="spending-category-list${withShares ? ' overview-pie-legend' : ''}">${context.categories.map(category => `<button type="button" class="overview-category-row" data-drill-category="${escape(category.id)}" aria-label="${escape(category.name || category.id)}: ${escape(money(context, category.total))}. View records."><span class="overview-category-name">${withShares ? `<i class="overview-pie-dot" style="background:${colorFor(category)}" aria-hidden="true"></i>` : ''}${categoryName(context, category)}</span><span class="overview-category-amount"><span class="amount-chip compact">${escape(money(context, category.total))}</span>${withShares ? `<small>${known(category.total) && Number(category.total) > 0 && positiveTotal > 0 ? `${(Number(category.total) / positiveTotal * 100).toFixed(1)}%` : '—'}</small>` : ''}</span></button>`).join('')}</div>`;
  }
  function pieGraph(context) {
    const positive = context.categories.filter(category => known(category.total) && Number(category.total) > 0);
    const missing = context.categories.filter(category => !known(category.total)).length;
    const negatives = context.categories.filter(category => known(category.total) && Number(category.total) < 0).length;
    const total = positive.reduce((sum, category) => sum + Number(category.total), 0);
    if (!positive.length) return `<div class="empty-state overview-chart-empty"><strong>No positive category totals to chart</strong>${missing ? 'Some category totals need information. ' : ''}Zero amounts and net refunds have no pie slice.</div>${categoryList(context)}`;
    const radius = 105, center = 125;
    let angle = -Math.PI / 2;
    const slices = positive.map(category => {
      const share = Number(category.total) / total, end = angle + share * Math.PI * 2;
      const startX = center + radius * Math.cos(angle), startY = center + radius * Math.sin(angle);
      const endX = center + radius * Math.cos(end), endY = center + radius * Math.sin(end);
      const text = `${category.name || category.id}: ${money(context, category.total)} · ${(share*100).toFixed(1)}% of charted spending. View records.`;
      const attrs = `class="overview-pie-slice" fill="${colorFor(category)}" data-drill-category="${escape(category.id)}" role="button" tabindex="0" ${tooltip(text)}`;
      angle = end;
      return share > .999999999 ? `<circle ${attrs} cx="${center}" cy="${center}" r="${radius}"><title>${escape(text)}</title></circle>` : `<path ${attrs} d="M ${center} ${center} L ${startX} ${startY} A ${radius} ${radius} 0 ${share > .5 ? 1 : 0} 1 ${endX} ${endY} Z"><title>${escape(text)}</title></path>`;
    }).join('');
    return `<div class="overview-pie-layout"><div class="overview-pie-visual"><div class="chart-wrap"><svg viewBox="0 0 250 250" class="overview-pie-chart" role="group" aria-label="Positive net spending by category in ${escape(context.currency)}. Select a slice to view records."><title>Where your money went</title>${slices}</svg><div class="chart-tooltip" hidden></div></div><div class="overview-pie-total"><span>Charted spending</span><strong>${escape(money(context, total))}</strong></div></div>${categoryList(context, true, total)}</div><p class="table-note overview-chart-note">Select a slice or category to explore its records. Percentages use positive, known category totals.${missing ? ` ${missing} ${missing === 1 ? 'category needs' : 'categories need'} information and ${missing === 1 ? 'has' : 'have'} no slice.` : ''}${negatives ? ` ${negatives} ${negatives === 1 ? 'category has' : 'categories have'} net refunds; ${negatives === 1 ? 'it remains' : 'they remain'} in the list and ${negatives === 1 ? 'is' : 'are'} excluded from the pie.` : ''}</p>`;
  }
  function categories(context) {
    categoryContext = {...context, categories:Array.isArray(context.categories) ? context.categories : []};
    return `<section class="overview-categories"><div class="card-header overview-chart-header"><div><h2 class="section-title">Where your money went</h2><p>${escape(context.subtitle || 'Recorded net spending by category')}</p></div>${controls('categories', [['list','List'],['pie','Pie']], 'Category spending chart type')}</div>${!categoryContext.categories.length ? '<div class="empty-state overview-chart-empty"><strong>No included spending records</strong>Category totals will appear here when spending is recorded.</div>' : choices.categories === 'pie' ? pieGraph(categoryContext) : categoryList(categoryContext)}</section>`;
  }

  function bind() {
    root.document.addEventListener('click', event => {
      const button = event.target.closest('[data-overview-chart]');
      if (!button) return;
      const type = button.dataset.overviewChart, value = button.dataset.overviewMode;
      if ((type === 'trend' && !['bars','line'].includes(value)) || (type === 'categories' && !['list','pie'].includes(value))) return;
      const container = button.closest(type === 'trend' ? '.overview-trend' : '.overview-categories');
      if (!container || choices[type] === value) return;
      writeChoice(type, value);
      container.outerHTML = type === 'trend' ? trend(trendContext) : categories(categoryContext);
      root.document.querySelector(`[data-overview-chart="${type}"][data-overview-mode="${value}"]`)?.focus();
    });
  }
  if (root.document) bind();
  root.CasaOverviewCharts = Object.freeze({trend, categories});
})(typeof window !== 'undefined' ? window : globalThis);
