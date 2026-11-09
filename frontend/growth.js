/* Shared, local investment valuation and scenario arithmetic. Never writes records. */
(function (root) {
  'use strict';
  const known = v => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(Number(v));
  const groups = Object.freeze([
    {id:'retirement',label:'Retirement'},
    {id:'children',label:'Children & college'},
    {id:'brokerage',label:'Brokerage'},
    {id:'other',label:'Cash & other'}
  ]);
  function groupOf(account) {
    if(groups.some(group=>group.id===account.purpose_group))return account.purpose_group;
    const label = `${account.type || ''} ${account.name || ''} ${account.id || ''}`.toLowerCase();
    if (/\b(child|children|college|education|529|educacion|hijos?)\b|real-child/.test(label)) return 'children';
    if (/\b(retirement|pension|roth|sep|ira|401k|401\(k\)|jubilacion)\b/.test(label)) return 'retirement';
    if (/\b(brokerage|broker|trading)\b/.test(label)) return 'brokerage';
    return 'other';
  }
  function latestRate(state, asOf) {
    const cutoff=asOf || new Date().toISOString().slice(0,10);
    const quotes = (state.exchange_rates || []).filter(q => known(q.clp_per_usd) && Number(q.clp_per_usd)>0 && String(q.date).slice(0,10)<=cutoff)
      .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const q=quotes.at(-1);
    return q ? {rate:Number(q.clp_per_usd),date:String(q.date).slice(0,10)} : {rate:null,date:null};
  }
  function convert(value, from, to, fx) {
    if (!known(value)) return null;
    if (from===to) return Number(value);
    const rate=typeof fx==='number'?fx:fx?.rate;
    if (!known(rate) || rate<=0 || !['USD','CLP'].includes(from) || !['USD','CLP'].includes(to)) return null;
    return from==='USD'?Number(value)*rate:Number(value)/rate;
  }
  function observation(state, account) {
    const date=String(account.as_of || account.source_date || '').slice(0,10);
    const history=(state.investment_history || []).filter(h=>h.account_id===account.id && known(h.balance))
      .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const last=history.at(-1);
    if(last && (!known(account.balance) || (date && String(last.date).slice(0,10)>date)))
      return {balance:Number(last.balance),date:String(last.date).slice(0,10)};
    return {balance:known(account.balance)?Number(account.balance):null,date:date || null};
  }
  function aggregate(state, options={}) {
    const currency=options.currency || 'USD', person=options.person || 'all';
    if(!['USD','CLP'].includes(currency)) throw new RangeError('Choose USD or CLP for valuation.');
    let accounts=(state.investments || []).filter(a=>(options.includeArchived||!isArchived(a))&&(person==='all' || a.person===person))
      .map(a=>({...a,group:groupOf(a),observation:observation(state,a)}));
    if(options.group && options.group!=='all') accounts=accounts.filter(a=>a.group===options.group);
    const dates=accounts.map(a=>a.observation.date).filter(Boolean).sort();
    const asOf=dates.at(-1) || null, fx=latestRate(state,asOf);
    accounts=accounts.map(a=>({...a,balance:a.observation.balance,valuationDate:a.observation.date,
      displayBalance:convert(a.observation.balance,a.currency,currency,fx),
      displayMonthlyContribution:convert(a.monthly_contribution,a.currency,currency,fx)}));
    const summarize=rows=>{
      const missingCount=rows.filter(a=>a.displayBalance===null).length;
      const knownTotal=rows.reduce((sum,a)=>sum+(a.displayBalance??0),0);
      return {knownTotal,total:missingCount?null:knownTotal,missingCount};
    };
    const summary=summarize(accounts);
    const missingContributions=accounts.filter(a=>a.displayMonthlyContribution===null).length;
    const knownMonthlyContribution=accounts.reduce((sum,a)=>sum+(a.displayMonthlyContribution??0),0);
    return {...summary,accounts,currency,person,asOf,fx,knownCount:accounts.length-summary.missingCount,
      missingBalances:summary.missingCount,
      missingFxCount:accounts.filter(a=>a.observation.balance!==null && a.displayBalance===null).length,
      dateRange:{oldest:dates[0] || null,latest:asOf},
      missingContributions,knownMonthlyContribution,
      monthlyContribution:missingContributions?null:knownMonthlyContribution,
      groups:groups.map(g=>{const rows=accounts.filter(a=>a.group===g.id);return {...g,accounts:rows,...summarize(rows)};})};
  }
  function numeric(value,label,min,max) {
    if(!known(value) || Number(value)<min || Number(value)>max) throw new RangeError(`${label} must be between ${min} and ${max}.`);
    return Number(value);
  }
  function project(input) {
    const startingBalance=numeric(input.startingBalance,'Starting balance',0,1e15);
    const monthlyContribution=numeric(input.monthlyContribution,'Monthly contribution',0,1e12);
    const years=numeric(input.years,'Timeline in years',0,60),months=Math.round(years*12);
    const rates=Object.fromEntries(['conservative','normal','aggressive'].map(key=>[key,numeric(input.rates?.[key],`${key} annual return (%)`,-99,100)]));
    if(rates.conservative>rates.normal || rates.normal>rates.aggressive) throw new RangeError('Order returns from conservative to normal to aggressive.');
    const series={},finals={};
    for(const [key,annual] of Object.entries(rates)){
      const monthlyRate=Math.pow(1+annual/100,1/12)-1;
      let balance=startingBalance;
      const points=[{month:0,year:0,balance,contributions:startingBalance,addedContributions:0,gain:0}];
      for(let month=1;month<=months;month++){
        balance=balance*(1+monthlyRate)+monthlyContribution;
        const addedContributions=month*monthlyContribution, contributions=startingBalance+addedContributions;
        if(!Number.isFinite(balance))throw new RangeError('These assumptions exceed the supported projection range.');
        points.push({month,year:month/12,balance,contributions,addedContributions,gain:balance-contributions});
      }
      series[key]=points;finals[key]=points.at(-1);
    }
    return {series,finals,startingBalance,monthlyContribution,years,months,rates};
  }
  function isArchived(account){return [true,1,'true','TRUE'].includes(account.archived)||String(account.status||'').toLowerCase()==='archived';}
  root.CasaGrowth=Object.freeze({aggregate,groupOf,convert,latestRate,project,groups,isArchived});
})(typeof window!=='undefined'?window:globalThis);
