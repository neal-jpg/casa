/* Read-only transaction selections. OR within a filter, AND between filters. */
(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unique = values => [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value && value !== 'all'))];
  const kindLabels = Object.freeze({expense:'Purchases',refund:'Refunds',income:'Income',transfer:'Transfers',transfer_review:'Transfer purpose unresolved',investment_transfer:'Investment funding',possible_duplicate:'Possible duplicates',duplicate_conflict:'Duplicate conflicts'});
  function normalize(selection = {}) {
    return {categories:unique(selection?.categories),types:unique(selection?.types),dateFrom:typeof selection?.dateFrom === 'string' ? selection.dateFrom.trim() : '',dateTo:typeof selection?.dateTo === 'string' ? selection.dateTo.trim() : ''};
  }
  function validDate(value) {
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
  }
  function error(selection) {
    const value = normalize(selection);
    if ((value.dateFrom && !validDate(value.dateFrom)) || (value.dateTo && !validDate(value.dateTo))) return 'Enter valid dates for the range.';
    if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) return 'The start date must be on or before the end date.';
    return '';
  }
  function hasDateRange(selection) { const value = normalize(selection); return !!(value.dateFrom || value.dateTo); }
  function matches(row, selection) {
    const value = normalize(selection);
    if (error(value)) return false;
    if (value.categories.length && !value.categories.includes(String(row.category_id || ''))) return false;
    if (value.types.length && !value.types.includes(String(row.kind || ''))) return false;
    if (hasDateRange(value)) {
      const date = String(row.date || '').slice(0,10);
      if (!validDate(date) || (value.dateFrom && date < value.dateFrom) || (value.dateTo && date > value.dateTo)) return false;
    }
    return true;
  }
  function items(values, defaults = {}) {
    return (values || []).map(value => typeof value === 'string' ? {id:value,name:defaults[value] || value.replaceAll('_',' ')} : {id:String(value.id),name:value.name || defaults[value.id] || value.id});
  }
  function menu(key, label, options, selected) {
    const current = [...options];
    for (const id of selected) if (!current.some(item => item.id === id)) current.push({id,name:id});
    return `<details class="tx-filter-menu" data-tx-menu="${key}"><summary aria-label="Filter ${label.toLowerCase()}"><span>${label}</span><span class="tx-filter-count">${selected.length || 'All'}</span><span class="tx-filter-chevron" aria-hidden="true">⌄</span></summary><div class="tx-filter-popover"><fieldset><legend class="sr-only">Select ${label.toLowerCase()}</legend><div class="tx-filter-options">${current.map(option => `<label class="tx-filter-option"><input type="checkbox" data-tx-option="${key}" value="${escape(option.id)}" ${selected.includes(option.id)?'checked':''}><span>${escape(option.name)}</span></label>`).join('') || '<p class="tx-filter-empty">No options available.</p>'}</div></fieldset><div class="tx-filter-actions"><button type="button" class="button small" data-tx-clear="${key}">Clear</button><button type="button" class="button small primary" data-tx-apply="${key}">Apply ${label.toLowerCase()}</button></div></div></details>`;
  }
  function render(ctx = {}) {
    const value = normalize(ctx.selection), invalid = error(value), custom = hasDateRange(value);
    const categoryItems = items(ctx.categories).sort((a,b)=>a.name.localeCompare(b.name));
    const typeItems = items(ctx.types?.length ? ctx.types : Object.keys(kindLabels),kindLabels);
    return `<section class="transaction-filters" id="transaction-filters" aria-label="Transaction filters"><div class="tx-filter-top">${menu('categories','Categories',categoryItems,value.categories)}${menu('types','Types',typeItems,value.types)}<button type="button" class="small-link tx-reset-filters" data-tx-clear="all" ${!value.categories.length && !value.types.length && !custom?'disabled':''}>Reset filters</button></div><div class="tx-date-row"><div class="tx-date-input"><label for="tx-date-from">From date</label><input type="date" id="tx-date-from" value="${escape(value.dateFrom)}" aria-describedby="tx-date-help"></div><span class="tx-date-separator" aria-hidden="true">–</span><div class="tx-date-input"><label for="tx-date-to">To date</label><input type="date" id="tx-date-to" value="${escape(value.dateTo)}" aria-describedby="tx-date-help"></div><div class="tx-date-actions"><button type="button" class="button small" data-tx-apply="dates">Apply dates</button>${custom?'<button type="button" class="small-link" data-tx-clear="dates">Clear dates</button>':''}</div></div><p class="tx-date-help${custom?' active':''}" id="tx-date-help">${custom?'Custom date range is active. It replaces the year and month selection above.':'Choose dates and Apply dates to search across months or years. Leave dates blank to use the selected reporting period.'}</p>${invalid?`<p class="tx-filter-error" role="alert">${escape(invalid)}</p>`:''}</section>`;
  }
  function mount(ctx = {}) {
    const element = root.document?.getElementById('transaction-filters');
    if (!element) return;
    const current = normalize(ctx.selection);
    const emit = next => { if (typeof ctx.onChange === 'function') ctx.onChange(normalize(next)); };
    element.onclick = event => {
      const apply = event.target.closest('[data-tx-apply]'), clear = event.target.closest('[data-tx-clear]');
      if (apply) {
        const key = apply.dataset.txApply;
        if (key === 'dates') {
          const from = element.querySelector('#tx-date-from'), to = element.querySelector('#tx-date-to');
          if (!from.reportValidity() || !to.reportValidity()) return;
          emit({...current,dateFrom:from.value,dateTo:to.value});
        } else if (['categories','types'].includes(key)) emit({...current,[key]:[...element.querySelectorAll(`[data-tx-option="${key}"]:checked`)].map(input=>input.value)});
      } else if (clear) {
        const key = clear.dataset.txClear;
        if (key === 'all') emit({});
        else if (key === 'dates') emit({...current,dateFrom:'',dateTo:''});
        else if (['categories','types'].includes(key)) emit({...current,[key]:[]});
      }
    };
    element.onkeydown = event => {
      if (event.key === 'Escape') {
        const menu = event.target.closest('[data-tx-menu]');
        if (menu) { menu.open=false; menu.querySelector('summary').focus(); event.preventDefault(); }
      } else if (event.key === 'Enter' && event.target.matches('#tx-date-from,#tx-date-to')) {
        event.preventDefault(); element.querySelector('[data-tx-apply="dates"]').click();
      }
    };
    element.addEventListener('toggle', event => {
      if (!event.target.matches?.('[data-tx-menu]') || !event.target.open) return;
      for (const menu of element.querySelectorAll('[data-tx-menu]')) if (menu !== event.target) menu.open=false;
    }, true);
  }
  // Native details keeps keyboard support; clicking elsewhere dismisses a menu.
  if (root.document) root.document.addEventListener('click', event => {
    if (!event.target.closest) return;
    for (const menu of root.document.querySelectorAll('#transaction-filters [data-tx-menu][open]')) if (!menu.contains(event.target)) menu.open=false;
  });
  root.CasaTransactionFilters = Object.freeze({render,mount,matches,normalize,hasDateRange,error,kindLabels});
})(typeof window !== 'undefined' ? window : globalThis);
