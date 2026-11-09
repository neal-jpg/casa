/* Account settings use existing workbook records; source subtotals stay separate. */
(function (root) {
  'use strict';
  const options={owner:'all',status:'all',search:''};
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const archived=a=>[true,1,'true','TRUE'].includes(a.archived)||a.status==='archived';
  const role=a=>a.id==='cash-header-control'?'Source control total':a.id==='cash-external'?'External accounts subtotal':a.kind==='cash'?'Cash snapshot':'Portfolio account';
  const names=ctx=>({family:'Shared',neal:ctx.personName?.('neal')||'Neal',partner:ctx.personName?.('partner')||'Paola'});
  const accountType=a=>a.type||'Cash';
  const purpose=a=>a.purpose_group||root.CasaGrowth?.groupOf(a)||'other';
  const purposeOptions=[['retirement','Retirement'],['children','Children & college'],['brokerage','Brokerage'],['other','Cash & other']];
  const rows=ctx=>[...(ctx.state.investments||[]).map(a=>({...a,kind:'investment'})),...(ctx.state.balances||[]).map(a=>({...a,kind:'cash'}))];
  const date=value=>value?new Date(String(value).slice(0,10)+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'Date not supplied';
  const amount=(ctx,a)=>ctx.nativeMoney(a.balance,a.currency);
  const status=a=>archived(a)?'Archived':a.status==='closed'?'Closed':a.status==='balance_missing'?'Balance pending':'Active';
  function render(ctx){
    const all=rows(ctx),people=names(ctx),filtered=all.filter(a=>(options.owner==='all'||a.person===options.owner)&&(options.status==='all'||(options.status==='archived'?archived(a):!archived(a)))&&`${a.name} ${accountType(a)} ${role(a)}`.toLowerCase().includes(options.search.toLowerCase()));
    const table=kind=>{const records=filtered.filter(a=>a.kind===kind);return `<section class="card accounts-section"><div class="card-header"><div><h2 class="section-title">${kind==='investment'?'Investment accounts':'Cash accounts & saved source totals'}</h2><p>${kind==='investment'?'Account ownership, purpose, and archive settings':'Saved source balances; totals can overlap other accounts'}</p></div><span class="pill neutral">${records.length} records</span></div><div class="table-scroll"><table class="compact-table accounts-table"><thead><tr><th>Account</th><th>For</th><th>Type & purpose</th><th class="right">Recorded balance</th><th>Status</th><th><span class="sr-only">Settings</span></th></tr></thead><tbody>${records.map(a=>`<tr${archived(a)?' class="accounts-archived"':''}><td><strong>${escape(a.name)}</strong><small>${escape(role(a))}${a.kind==='cash'&&a.include_in_assets===false?' · excluded from consolidation':''}</small></td><td><span class="person-badge ${a.person==='partner'?'partner':''}">${escape(people[a.person]||a.person)}</span></td><td>${escape(accountType(a))}<small>${escape(purposeOptions.find(([value])=>value===purpose(a))?.[1]||'Cash & other')}</small></td><td class="right"><span class="amount-chip compact">${escape(amount(ctx,a))}</span><small>${escape(date(a.as_of))}</small></td><td><span class="pill neutral">${escape(status(a))}</span></td><td class="right"><button class="button small" data-account-edit="${escape(a.id)}" data-account-kind="${a.kind}" aria-label="Edit ${escape(a.name)} settings">Settings</button></td></tr>`).join('')||'<tr><td colspan="6" class="muted">No accounts match these filters.</td></tr>'}</tbody></table></div></section>`;};
    return `<div id="accounts-page" class="accounts-page">${ctx.pageHead('Your accounts','Names, ownership, purposes, and archive settings in one place.',`<button class="button primary" data-account-add>${ctx.icon?.('plus')||''} Add investment account</button>`,'ACCOUNT SETTINGS')}<div class="accounts-counts"><span><strong>${all.filter(a=>!archived(a)).length}</strong> unarchived records</span><span><strong>${all.filter(archived).length}</strong> archived</span><span><strong>${all.filter(a=>a.person==='family').length}</strong> shared</span></div><div class="toolbar accounts-toolbar"><div class="field"><label for="accounts-owner">Owner</label><select id="accounts-owner">${[['all','Everyone'],...Object.entries(people)].map(([value,label])=>`<option value="${value}" ${value===options.owner?'selected':''}>${escape(label)}</option>`).join('')}</select></div><div class="field"><label for="accounts-status">Records</label><select id="accounts-status">${[['all','All records'],['active','Unarchived'],['archived','Archived']].map(([value,label])=>`<option value="${value}" ${value===options.status?'selected':''}>${label}</option>`).join('')}</select></div><div class="field accounts-search"><label for="accounts-search">Find an account</label><input id="accounts-search" type="search" value="${escape(options.search)}" placeholder="Search names or types…"></div></div>${table('investment')}${table('cash')}<p class="table-note accounts-method">Each row is an existing workbook record. Cash snapshots and source totals can overlap investments, so this page does not add them into a net worth total. Shared ownership changes account filters; it does not change historical transaction ownership. Archiving excludes an account from the active portfolio and projections while preserving its records and history.</p></div>`;
  }
  function mount(ctx){
    const host=document.getElementById('accounts-page');if(!host)return;
    const refresh=(focus,position)=>{host.outerHTML=render(ctx);mount(ctx);const input=document.getElementById(focus);input?.focus();if(typeof position==='number'&&input?.setSelectionRange)input.setSelectionRange(position,position);};
    host.onclick=event=>{const button=event.target.closest('[data-account-edit],[data-account-add]');if(!button)return;if(button.hasAttribute('data-account-add'))add(ctx);else edit(ctx,button.dataset.accountEdit,button.dataset.accountKind);};
    host.onchange=event=>{if(event.target.id==='accounts-owner'){options.owner=event.target.value;refresh('accounts-owner');}if(event.target.id==='accounts-status'){options.status=event.target.value;refresh('accounts-status');}};
    host.oninput=event=>{if(event.target.id==='accounts-search'){options.search=event.target.value;refresh('accounts-search',event.target.selectionStart);}};
  }
  function settingsForm(ctx,a,isNew){
    const people=names(ctx),field=ctx.field,select=ctx.selectField,cash=a.kind==='cash';
    const types=cash?[['Cash','Cash'],['Cash management','Cash management'],['Other','Other']]:['Brokerage','Retirement','Education','Life goal','Cash','Cash management','Other'].map(v=>[v,v]);
    const statuses=[['active','Active'],['closed','Closed'],['balance_missing','Balance pending']];
    if(a.status&&!statuses.some(([value])=>value===a.status))statuses.push([a.status,a.status]);
    const percent=value=>value===null||value===undefined||value===''?'':Number(value)*100;
    const planning=cash?'':`<details class="accounts-planning"><summary>Planning assumptions (optional)</summary><p class="table-note">Leave unavailable assumptions blank. Zero is a recorded assumption. These settings do not change historical balances.</p><div class="field-row">${field('Assumed annual return before fees (%)','annual_return',percent(a.annual_return),'number','min="-99" max="100" step="any"')}${field('Annual fees (%)','annual_fee',percent(a.annual_fee),'number','min="0" max="100" step="any"')}</div><div class="field-row">${field('Equity allocation (%)','equity_fraction',percent(a.equity_fraction),'number','min="0" max="100" step="any"')}${field('Largest single-asset allocation (%)','single_asset_fraction',percent(a.single_asset_fraction),'number','min="0" max="100" step="any"')}</div></details>`;
    const sourceNote=cash&&a.include_in_assets===false?'<div class="notice amber">This is a source subtotal or control record. It remains excluded from consolidation, even if its name or owner changes.</div>':'';
    return `<p class="modal-description">${isNew?'Add an account without assuming missing balances or contributions.':'Settings save to the existing workbook record. Its source references and history are retained.'}</p>${sourceNote}${field('Account name','name',a.name||'','text','required maxlength="100"')}<div class="field-row">${select('Owner','person',Object.entries(people),a.person||'neal')}${select('Type','type',types,accountType(a))}</div>${select('Purpose group','purpose_group',purposeOptions,purpose(a))}<div class="field-row">${select('Status','status',statuses,a.status||'active')}${select('Archive','archived',[['false',cash?'Keep in account list':'Keep in active portfolio'],['true','Archive and retain history']],archived(a)?'true':'false')}</div>${isNew?`<div class="field-row">${select('Account currency','currency',[['USD','USD'],['CLP','CLP']],a.currency||'USD')}${field('Initial balance (optional)','balance','','number','min="0" step="0.01"')}</div>${field('Snapshot date (required with a balance)','as_of','','date')}`:`<div class="accounts-saved-balance"><span>Saved source balance</span><strong>${escape(amount(ctx,a))}</strong><small>${escape(date(a.as_of))}. Source amounts and historical currencies are preserved by these settings.</small></div>`}${!cash?field('Planned monthly contribution (account currency)','monthly_contribution',a.monthly_contribution??'','number','min="0" step="0.01"'):''}${planning}<div class="field"><label for="m-notes">Notes</label><textarea id="m-notes" name="notes" rows="3" maxlength="4000">${escape(a.notes||'')}</textarea></div><p class="table-note">Archiving retains all history and excludes the account from active portfolio totals and projections. A closed account can stay unarchived if you want its recorded balance included.</p>`;
  }
  function launch(ctx,account,isNew){
    try{ctx.guardEditing();}catch(error){ctx.showError?.(error);return;}
    ctx.openModal(isNew?'Add investment account':'Account settings',settingsForm(ctx,account,isNew),'<button class="button primary" type="submit">Save account settings</button>',async form=>{
      ctx.guardEditing();const data=Object.fromEntries(form),cash=account.kind==='cash';data.archived=data.archived==='true';
      if(cash){await ctx.mutate('/api/account',{account:{id:account.id,...data}},'Account settings saved to Excel');return;}
      if(isNew){data.balance=data.balance===''?null:Number(data.balance);if(data.balance!==null&&!data.as_of)throw new Error('Enter the snapshot date for the initial balance.');}
      data.monthly_contribution=data.monthly_contribution===''?null:Number(data.monthly_contribution);
      for(const key of ['annual_return','annual_fee','equity_fraction','single_asset_fraction']){
        if(!Object.hasOwn(data,key))continue;
        const original=account[key],displayed=original===null||original===undefined||original===''?'':String(Number(original)*100);
        data[key]=String(data[key])===displayed?(original??null):data[key]===''?null:Number(data[key])/100;
      }
      const investment={...account,...data};delete investment.kind;
      if(isNew)delete investment.id;
      await ctx.mutate('/api/investment',{investment},'Account settings saved to Excel');
    });
  }
  function edit(ctx,id,kind='investment'){
    const account=rows(ctx).find(a=>a.id===id&&a.kind===kind);if(!account){ctx.showError?.(new Error('This account could not be found. Reload the workbook.'));return;}
    launch(ctx,account,false);
  }
  function add(ctx){launch(ctx,{kind:'investment',person:'neal',type:'Brokerage',purpose_group:'brokerage',currency:'USD',status:'active',archived:false},true);}
  root.CasaAccounts=Object.freeze({render,mount,edit,add});
})(window);
