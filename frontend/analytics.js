/* Local, read-only comparisons. No transaction or workbook value is changed here. */
(function (root) {
  'use strict';

  const included = row => ![false, 0, 'FALSE', 'false', 'no'].includes(row.included);
  const spend = row => row.kind === 'expense' || row.kind === 'refund';
  const meaningful = row => spend(row) || row.kind === 'income';
  const monthOf = value => {
    const month = String(value || '').slice(0, 7);
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  };
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const unique = values => [...new Set(values)].sort();
  const parseMonths = value => {
    let values = value;
    if (typeof values === 'string') {
      try { values = JSON.parse(values); } catch (_) { return []; }
    }
    return Array.isArray(values) ? unique(values.map(monthOf).filter(Boolean)) : [];
  };
  const sum = values => values.some(value => value === null) ? null : values.reduce((a, b) => a + b, 0);
  const mean = values => values.length ? sum(values) / values.length : null;
  const comparison = (value, average) => ({
    value, average,
    delta: value !== null && average !== null ? value - average : null,
    percent: value !== null && average !== null && average > 0 ? (value - average) / average : null
  });
  const priorMonth = month => {
    const [year, number] = month.split('-').map(Number);
    return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
  };

  function compute(state, options, conversionFn) {
    state = state || {};
    options = options || {};
    if (typeof conversionFn !== 'function') throw new TypeError('A reporting-currency conversion function is required.');
    if (options.period === 'year') return computeYear(state, options, conversionFn);
    const settings = state.settings || {};
    const now = options.today ? new Date(`${options.today}T12:00:00`) : new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const month = monthOf(options.month) || currentMonth;
    const currency = options.currency || 'CLP';
    const person = options.person || 'all';
    const people = person === 'all' ? ['neal', 'partner'] : [person];
    const inScope = row => person === 'all' || row.person === person;
    const transactions = (state.transactions || []).filter(inScope);
    const rows = transactions.filter(row => included(row) && meaningful(row) && monthOf(row.date));
    const zeroIncome = Object.fromEntries(people.map(p => [p, parseMonths(settings[`zero_income_${p}_months`])]));
    const confirmedIncome = parseMonths(settings.income_complete_months);
    const confirmedSpending = unique([
      ...parseMonths(settings.expense_complete_months),
      ...parseMonths(settings.closed_months)
    ]);
    const categoryLookup = Object.fromEntries((state.categories || []).map(category => [String(category.id), category]));
    const categoryId = row => String(row.category_id || 'uncategorized');
    const amount = row => {
      const value = conversionFn(row, currency);
      return finite(value) ? Number(value) * (row.kind === 'refund' ? -1 : 1) : null;
    };
    const groups = new Map();
    for (const row of rows) {
      const key = monthOf(row.date);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const months = unique([
      ...groups.keys(), month,
      ...(state.months || []).map(monthOf).filter(Boolean),
      ...people.flatMap(p => zeroIncome[p])
    ]);
    const monthly = months.map(key => {
      const records = groups.get(key) || [];
      const incomeRows = records.filter(row => row.kind === 'income');
      const expenseRows = records.filter(spend);
      const incomeMissingPeople = people.filter(p => !incomeRows.some(row => row.person === p) && !zeroIncome[p].includes(key));
      const expensePeople = unique(expenseRows.map(row => row.person).filter(Boolean));
      const spendingMissingPeople = people.filter(p => !expensePeople.includes(p));
      const incomeRecorded = incomeRows.length ? sum(incomeRows.map(amount)) : incomeMissingPeople.length ? null : 0;
      const income = incomeMissingPeople.length ? null : incomeRecorded;
      const spending = expenseRows.length ? sum(expenseRows.map(amount)) : null;
      const values = Object.fromEntries(unique(expenseRows.map(categoryId)).map(id => [
        id, sum(expenseRows.filter(row => categoryId(row) === id).map(amount))
      ]));
      return {
        month: key, income, incomeRecorded, spending,
        incomeMissingPeople, spendingMissingPeople, expensePeople,
        incomeCount: incomeRows.length, spendingCount: expenseRows.length,
        missingConversionCount: records.filter(row => amount(row) === null).length,
        ambiguousDateCount: records.filter(row => /ambiguous/i.test(String(row.date_basis || ''))).length,
        sharingReviewCount: expenseRows.filter(row => row.sharing === 'needs_review').length,
        excludedReviewCount: transactions.filter(row => monthOf(row.date) === key && !included(row) && ['needs_review', 'pending', 'review', 'open'].includes(String(row.review_status || '').toLowerCase())).length,
        incomeConfirmed: confirmedIncome.includes(key),
        spendingConfirmed: confirmedSpending.includes(key),
        incomeProvisional: incomeRows.some(row => /invoice/i.test(String(row.date_basis || ''))) ||
          (incomeRows.some(row => row.person === 'neal') && [true, 1, 'true', 'TRUE'].includes(settings.invoice_month_provisional)),
        categories: values
      };
    });
    const selected = monthly.find(row => row.month === month);
    const completed = monthly.filter(row => row.month < currentMonth);
    const incomeBaseline = completed.filter(row => row.income !== null);
    const spendingBaseline = completed.filter(row => row.spending !== null);
    const average = {
      income: mean(incomeBaseline.map(row => row.income)),
      spending: mean(spendingBaseline.map(row => row.spending)),
      incomeMonths: incomeBaseline.map(row => row.month),
      spendingMonths: spendingBaseline.map(row => row.month)
    };
    const previous = monthly.find(row => row.month === priorMonth(month));
    const categoryIds = unique([
      ...spendingBaseline.flatMap(row => Object.keys(row.categories)),
      ...Object.keys(selected.categories)
    ]);
    const categories = categoryIds.map(id => {
      const metadata = categoryLookup[id] || {};
      const selectedValue = selected.spendingCount ? (Object.hasOwn(selected.categories, id) ? selected.categories[id] : 0) : null;
      const averageValue = mean(spendingBaseline.map(row => row.categories[id] ?? 0));
      const previousValue = previous && previous.spendingCount ? (Object.hasOwn(previous.categories, id) ? previous.categories[id] : 0) : null;
      const categoryComparison = comparison(selectedValue, averageValue);
      const previousComparison = comparison(selectedValue, previousValue);
      return {
        id, name: metadata.name || (id === 'uncategorized' ? 'Uncategorized' : id),
        color: metadata.color || '#718a7a', archived: [true, 1, 'true', 'TRUE'].includes(metadata.archived),
        selected: selectedValue, average: averageValue,
        delta: categoryComparison.delta, percent: categoryComparison.percent,
        previousMonth: previousValue, previousDelta: previousComparison.delta, previousPercent: previousComparison.percent,
        months: [...average.spendingMonths], count: spendingBaseline.length
      };
    }).sort((a, b) => (b.selected ?? b.average ?? 0) - (a.selected ?? a.average ?? 0) || a.name.localeCompare(b.name));
    const baselineMissingPeopleMonths = spendingBaseline.filter(row => row.spendingMissingPeople.length).map(row => ({month: row.month, people: [...row.spendingMissingPeople]}));
    const baselineAmbiguousDateMonths = spendingBaseline.filter(row => row.ambiguousDateCount).map(row => row.month);
    const spendingCompletenessConfirmed = selected.spendingConfirmed && spendingBaseline.length > 0 && spendingBaseline.every(row => row.spendingConfirmed);
    const incomeProvisional = selected.incomeProvisional || incomeBaseline.some(row => row.incomeProvisional);
    const notes = [
      'All-time averages use finished calendar months with supplied, convertible records; months without records are excluded, not treated as zero.',
      'Every category uses the same spending-month denominator. A category with no recorded spending in an included month contributes zero for that recorded month.'
    ];
    if (!spendingCompletenessConfirmed) notes.push('Spending coverage has not been confirmed complete. These are averages of recorded spending, not verified total household costs.');
    if (baselineMissingPeopleMonths.length || selected.spendingMissingPeople.length) notes.push('Some months have no spending records for one person. Lower recorded spending may reflect missing records rather than savings.');
    if (selected.incomeMissingPeople.length) notes.push('Selected-month total income is unknown because at least one monthly income is missing. The recorded subtotal is shown separately.');
    if (incomeProvisional) notes.push('Freelance income is provisionally assigned by invoice month; this is not verified cash received in those months.');
    if (selected.ambiguousDateCount || baselineAmbiguousDateMonths.length) notes.push('Some source dates are ambiguous, so monthly comparisons may shift when those dates are corrected.');
    if (month >= currentMonth) notes.push('The selected month is current or future. Its month-to-date amounts are not a like-for-like comparison with finished months and are excluded from averages.');
    if (selected.missingConversionCount) notes.push('Selected-month totals with unavailable reporting conversions remain unknown; no missing conversion is treated as zero.');
    const coverage = {
      notes,
      currentMonthExcluded: monthly.some(row => row.month >= currentMonth && (row.incomeCount || row.spendingCount)),
      selectedIsPartialMonth: month >= currentMonth,
      incomeProvisional, spendingCompletenessConfirmed,
      baselineMissingPeopleMonths, baselineAmbiguousDateMonths,
      excludedIncomeMonths: completed.filter(row => row.income === null).map(row => row.month),
      excludedSpendingMonths: completed.filter(row => row.spending === null).map(row => row.month)
    };
    return {
      month, currency, person, currentMonth, selected, average,
      comparisons: {
        income: comparison(selected.income, average.income),
        spending: comparison(selected.spending, average.spending)
      },
      categories, coverage, monthly
    };
  }

  function computeYear(state, options, conversionFn) {
    const now = options.today ? new Date(`${options.today}T12:00:00`) : new Date();
    const year = /^\d{4}$/.test(String(options.year || '')) ? String(options.year) : String(options.month || now.getFullYear()).slice(0, 4);
    const yearMonths = Array.from({length: 12}, (_, index) => `${year}-${String(index + 1).padStart(2, '0')}`);
    // Include empty months in coverage, without inserting fabricated transactions.
    const base = compute({...state, months: unique([...(state.months || []), ...yearMonths])}, {...options, period: 'month', month: monthOf(options.month)?.startsWith(year + '-') ? options.month : yearMonths[0]}, conversionFn);
    const selectedMonths = base.monthly.filter(row => row.month.startsWith(year + '-'));
    const expected = selectedMonths.filter(row => row.month <= base.currentMonth);
    const recorded = selectedMonths.filter(row => row.incomeCount || row.spendingCount);
    const incomeMonths = selectedMonths.filter(row => row.month < base.currentMonth && row.income !== null);
    const spendingMonths = selectedMonths.filter(row => row.month < base.currentMonth && row.spending !== null);
    const total = key => sum(selectedMonths.map(row => row[key] || 0));
    const incomeRecords = selectedMonths.filter(row => row.incomeCount);
    const spendingRecords = selectedMonths.filter(row => row.spendingCount);
    const annualIncomeRecorded = incomeRecords.length ? sum(incomeRecords.map(row => row.incomeRecorded)) : expected.length && expected.every(row => row.income === 0) ? 0 : null;
    const selected = {
      income: expected.length && expected.every(row => row.income !== null) ? annualIncomeRecorded : null,
      incomeRecorded: annualIncomeRecorded,
      spending: spendingRecords.length ? sum(spendingRecords.map(row => row.spending)) : null,
      incomeMissingPeople: unique(expected.flatMap(row => row.incomeMissingPeople)),
      spendingMissingPeople: unique(expected.flatMap(row => row.spendingMissingPeople)),
      incomeCount: total('incomeCount'), spendingCount: total('spendingCount'),
      missingConversionCount: total('missingConversionCount'), ambiguousDateCount: total('ambiguousDateCount'),
      sharingReviewCount: total('sharingReviewCount'), excludedReviewCount: total('excludedReviewCount')
    };
    const selectedMonthlyAverage = {
      income: mean(incomeMonths.map(row => row.income)), spending: mean(spendingMonths.map(row => row.spending)),
      incomeMonths: incomeMonths.map(row => row.month), spendingMonths: spendingMonths.map(row => row.month)
    };
    const metadata = Object.fromEntries((state.categories || []).map(row => [String(row.id), row]));
    const baseline = base.monthly.filter(row => row.month < base.currentMonth && row.spending !== null);
    const ids = unique([...base.categories.map(row => row.id), ...selectedMonths.flatMap(row => Object.keys(row.categories))]);
    const categoryValue = (row, id) => Object.hasOwn(row.categories, id) ? row.categories[id] : 0;
    const categories = ids.map(id => {
      const category = metadata[id] || {};
      const selectedValue = mean(spendingMonths.map(row => categoryValue(row, id)));
      const averageValue = mean(baseline.map(row => categoryValue(row, id)));
      const c = comparison(selectedValue, averageValue);
      return {
        id, name: category.name || (id === 'uncategorized' ? 'Uncategorized' : id), color: category.color || '#718a7a',
        archived: [true, 1, 'true', 'TRUE'].includes(category.archived),
        selected: selectedValue, periodTotal: spendingRecords.length ? sum(spendingRecords.map(row => categoryValue(row, id))) : null,
        average: averageValue, delta: c.delta, percent: c.percent,
        previousMonth: null, previousDelta: null, previousPercent: null,
        months: baseline.map(row => row.month), count: baseline.length
      };
    }).sort((a, b) => (b.selected ?? b.average ?? 0) - (a.selected ?? a.average ?? 0) || a.name.localeCompare(b.name));
    const missingRecordMonths = expected.filter(row => !row.incomeCount && !row.spendingCount).map(row => row.month);
    const incomeGapMonths = expected.filter(row => row.income === null).map(row => row.month);
    const futureRecordMonths = recorded.filter(row => row.month > base.currentMonth).map(row => row.month);
    const spendingCompletenessConfirmed = expected.length > 0 && expected.every(row => row.spendingConfirmed);
    const incomeProvisional = selectedMonths.some(row => row.incomeProvisional) || base.coverage.incomeProvisional;
    const notes = [
      `${year} totals add supplied records only. Months without records are unknown, not zero; this is not a verified complete annual statement.`,
      'Year comparisons use average monthly amounts from finished, convertible recorded months in the selected year against all-time monthly averages. Annual totals are never compared with a monthly average.',
      'Income averages include only months with income supplied for every selected person. Spending averages include only months with convertible spending. The current calendar month and future months are excluded from averages.',
      'Each category uses the same spending-month denominator. A category absent from a recorded spending month contributes zero for that month; an entirely missing month is omitted.'
    ];
    if (missingRecordMonths.length) notes.push(`${missingRecordMonths.length} elapsed months in ${year} have no income or spending records. They are excluded from averages.`);
    if (incomeGapMonths.length) notes.push(`${incomeGapMonths.length} elapsed months have incomplete or unconvertible income. Recorded income is a subtotal; complete yearly income is unknown.`);
    if (!spendingCompletenessConfirmed) notes.push('Spending coverage is not confirmed complete. Category drops are changes in recorded spending and may reflect missing records.');
    if (selected.spendingMissingPeople.length) notes.push('Some selected-year months have no spending records for one person. Lower totals do not establish savings.');
    if (incomeProvisional) notes.push('Freelance income is provisionally assigned by invoice month; this is not verified received cash.');
    if (selected.missingConversionCount) notes.push('Any annual total containing an unavailable reporting conversion stays unknown. No missing conversion is treated as zero.');
    if (selected.ambiguousDateCount) notes.push('Some source dates are ambiguous; records may move between periods after correction.');
    if (year >= base.currentMonth.slice(0, 4)) notes.push('This year is in progress or future. Totals include supplied records only; future months are not assumed to have zero income or spending.');
    if (futureRecordMonths.length) notes.push('Some supplied records are future-dated. They appear in annual recorded totals but not in finished-month averages.');
    return {
      ...base, period: 'year', year, periodLabel: `${year} · Full year`, selected, selectedMonthlyAverage,
      categories, comparisons: {income: comparison(selectedMonthlyAverage.income, base.average.income), spending: comparison(selectedMonthlyAverage.spending, base.average.spending)},
      coverage: {
        ...base.coverage, notes, selectedIsPartialMonth: false, selectedIsPartialYear: year >= base.currentMonth.slice(0, 4),
        incomeProvisional, spendingCompletenessConfirmed,
        expectedMonths: expected.map(row => row.month), recordedMonths: recorded.map(row => row.month),
        missingRecordMonths, incomeGapMonths, futureRecordMonths
      }
    };
  }

  function summaryPayload(result) {
    const selectedKeys = ['income', 'incomeRecorded', 'spending', 'incomeMissingPeople', 'spendingMissingPeople', 'incomeCount', 'spendingCount', 'missingConversionCount', 'ambiguousDateCount', 'sharingReviewCount', 'excludedReviewCount'];
    const categoryKeys = ['id', 'name', 'selected', 'average', 'delta', 'percent', 'previousMonth', 'previousDelta', 'previousPercent'];
    const coverageKeys = ['notes', 'currentMonthExcluded', 'selectedIsPartialMonth', 'incomeProvisional', 'spendingCompletenessConfirmed', 'baselineMissingPeopleMonths', 'baselineAmbiguousDateMonths'];
    const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));
    const payload = {
      month: result.month, currency: result.currency, person: result.person, currentMonth: result.currentMonth,
      selected: pick(result.selected, selectedKeys), average: result.average, comparisons: result.comparisons,
      categories: result.categories.map(row => pick(row, categoryKeys)), coverage: pick(result.coverage, coverageKeys)
    };
    if (result.period === 'year') {
      Object.assign(payload, {period: 'year', year: result.year, comparisonBasis: 'monthly_average', selectedMonthlyAverage: result.selectedMonthlyAverage});
      payload.categories = result.categories.map(row => pick(row, [...categoryKeys, 'periodTotal']));
      Object.assign(payload.coverage, pick(result.coverage, ['selectedIsPartialYear', 'recordedMonths', 'missingRecordMonths', 'incomeGapMonths', 'futureRecordMonths']));
    }
    return payload;
  }

  root.CasaAnalytics = Object.freeze({compute, summaryPayload});
})(typeof window !== 'undefined' ? window : globalThis);
