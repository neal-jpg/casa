/* Review transaction details in place. Drafts never change records until saved. */
(function(root){
  'use strict';
  const drafts=new Map();
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const completed=item=>['resolved','closed','dismissed'].includes(String(item.status||'open').toLowerCase());
  const locked=ctx=>Boolean(ctx.state.editing_external||ctx.state.storage?.read_only||ctx.state.storage?.online===false);
  const savedFields=transaction=>({date:String(transaction.date||'').slice(0,10),person:transaction.person,charged_amount:String(transaction.charged_amount??''),sharing:transaction.kind==='income'?'personal':transaction.sharing||'needs_review'});
  function changed(draft,transaction){
    const saved=savedFields(transaction);
    return Object.keys(saved).some(key=>key==='charged_amount'?Number(saved[key])!==Number(draft.fields[key]):saved[key]!==draft.fields[key]);
  }
  function draftFor(ctx,item,transaction){
    let draft=drafts.get(item.id);
    if(!draft||!draft.busy&&!draft.dirty&&!draft.error&&!draft.conflict&&draft.version!==ctx.state.version){draft={fields:transaction?savedFields(transaction):{},version:ctx.state.version,dirty:false,error:'',conflict:false,busy:false};drafts.set(item.id,draft);}
    if(draft.dirty&&draft.version!==ctx.state.version){draft.conflict=true;draft.error='Records changed since this row was edited. Reload the row before saving.';}
    return draft;
  }
  const option=(value,label,selected)=>`<option value="${escape(value)}" ${value===selected?'selected':''}>${escape(label)}</option>`;
  function transactionFields(ctx,item,transaction,draft){
    const f=draft.fields,off=locked(ctx)||draft.busy||draft.conflict,disabled=off?'disabled':'';
    const originalDiffers=transaction.currency!==transaction.charged_currency||Number(transaction.amount)!==Number(transaction.charged_amount);
    const original=originalDiffers?`<small class="review-original">Original: ${escape(ctx.nativeMoney(transaction.amount,transaction.currency))}</small>`:'';
    return `<div class="review-fields"><label class="review-field"><span>Date</span><input type="date" data-review-field="date" aria-label="Date for ${escape(transaction.merchant)}" value="${escape(f.date)}" required ${disabled}></label><label class="review-field"><span>Person</span><select data-review-field="person" aria-label="Person for ${escape(transaction.merchant)}" ${disabled}>${option('neal',ctx.personName('neal'),f.person)}${option('partner',ctx.personName('partner'),f.person)}</select></label><label class="review-field"><span>Amount charged</span><span class="review-amount-input"><span>${escape(transaction.charged_currency)}</span><input type="number" data-review-field="charged_amount" aria-label="Amount charged for ${escape(transaction.merchant)} in ${escape(transaction.charged_currency)}" min="0.000001" step="${transaction.charged_currency==='CLP'?'1':'0.01'}" value="${escape(f.charged_amount)}" required ${disabled}></span>${original}</label><label class="review-field"><span>Sharing</span><select data-review-field="sharing" aria-label="Sharing for ${escape(transaction.merchant)}" ${disabled||transaction.kind==='income'?'disabled':''}>${option('shared','Shared',f.sharing)}${option('personal','Personal',f.sharing)}${option('needs_review','Needs review',f.sharing)}</select></label></div>`;
  }
  function render(ctx){
    const all=ctx.state.review||[],transactions=new Map((ctx.state.transactions||[]).map(row=>[row.id,row]));
    const filter=ctx.ui.reviewFilter||{person:'all',from:'',to:''};
    const eligible=all.filter(item=>ctx.ui.reviewAll||!completed(item));
    const rows=eligible.filter(item=>{const t=transactions.get(item.record_id);if(filter.person!=='all'&&t?.person!==filter.person)return false;if((filter.from||filter.to)&&!t?.date)return false;return (!filter.from||t.date>=filter.from)&&(!filter.to||t.date<=filter.to);});
    const open=all.filter(item=>!completed(item)).length;
    const linkedOpen=all.filter(item=>!completed(item)&&transactions.has(item.record_id)).length;
    const filters=`<form id="review-filter-form" class="review-filters"><label>Person<select name="person" aria-label="Review person">${option('all','Everyone',filter.person)}${option('neal',ctx.personName('neal'),filter.person)}${option('partner',ctx.personName('partner'),filter.person)}</select></label><label>From date<input name="from" type="date" aria-label="Review from date" value="${escape(filter.from)}"></label><label>To date<input name="to" type="date" aria-label="Review to date" value="${escape(filter.to)}"></label><button class="button" type="submit">Apply filters</button><button class="small-link" type="button" data-review-clear>Reset</button><details class="review-filter-help"><summary>Filter tips</summary><p>Dates are inclusive. These filters search all recorded months. General questions without a person or transaction date are hidden when a filter is active.</p></details></form>`;
    const areas=new Map();for(const item of all.filter(item=>!completed(item)))areas.set(item.area||'Data',(areas.get(item.area||'Data')||0)+1);
    const explanation=`<details class="review-explanation"><summary>Why are there ${open} review items?</summary><p>${linkedOpen} items refer to transactions; ${open-linkedOpen} are broader questions about rates, dates, income coverage and balances. Some flags preserve uncertainty from the original import, including excluded repayments and transfers. A flag does not necessarily mean a charge is wrong.</p><div class="review-reasons">${[...areas].sort((a,b)=>b[1]-a[1]).map(([area,count])=>`<span>${escape(area)} <strong>${count}</strong></span>`).join('')}</div><p>Items remain open until resolved. The queue does not automatically re-check older import questions after new evidence arrives.</p></details>`;
    return `<div class="review-page" id="review-page">${ctx.pageHead('Review your records','Check the details, update the row, and tick it off when finished.')}${explanation}${filters}<div class="review-toolbar"><span><strong>${rows.length}</strong> shown · ${open} open overall</span><label class="review-show-completed"><input type="checkbox" id="review-all" ${ctx.ui.reviewAll?'checked':''}>Show completed</label></div>${locked(ctx)?'<p class="notice amber review-readonly">Editing is paused. You can inspect these records; resume app editing before saving changes.</p>':''}<div class="review-list" role="list">${rows.map(item=>{
      const transaction=transactions.get(item.record_id),draft=draftFor(ctx,item,transaction),done=completed(item),off=locked(ctx)||draft.busy||draft.conflict;
      const category=transaction&&(ctx.state.categories||[]).find(value=>value.id===transaction.category_id);
      return `<article class="review-item${done?' is-resolved':''}${draft.dirty?' is-dirty':''}" role="listitem" data-review-row="${escape(item.id)}"><div class="review-item-heading"><div class="review-item-title"><span class="review-area">${escape(item.area||'Data')}</span><h2>${escape(transaction?.merchant||item.area||'Source question')}</h2>${category?`<span class="review-category">${escape(category.name)}</span>`:''}</div><label class="review-resolve"><input type="checkbox" data-review-checkbox="${escape(item.id)}" aria-label="Resolved: ${escape(transaction?.merchant||item.issue||item.area||'review item')}" ${done?'checked':''} ${off?'disabled':''}><span class="review-check-icon" aria-hidden="true">${ctx.icon?.('check')||'✓'}</span><span>${done?'Resolved':'Mark resolved'}</span></label></div><p class="review-issue">${escape(item.issue||item.detail||'Check this source record.')}</p>${transaction?`${transactionFields(ctx,item,transaction,draft)}`:'<div class="review-no-transaction"><span>Date <strong>—</strong></span><span>Person <strong>—</strong></span><span>Amount <strong>—</strong></span><span>Sharing <strong>—</strong></span><small>No transaction is linked to this source question.</small></div>'}<div class="review-item-footer"><div class="review-detail-group"><details class="review-details"><summary>Details <span>Descriptions, items & notes</span></summary><div class="review-detail-body"><p class="review-full-issue">${escape(item.issue||item.detail||'Check this source record.')}</p>${transaction?window.CasaEvidence?.render(transaction,ctx.state,true)||'':''}<div class="review-source"><span>${escape(item.action||'Confirm the details against the source.')}</span>${item.source_file?`<small>${escape(item.source_file)}</small>`:''}</div></div></details>${transaction&&transaction.included===false||transaction&&transaction.included===0?'<small class="review-excluded">Excluded from financial totals</small>':''}</div><div class="review-row-actions">${transaction?`<button type="button" class="button small" data-review-save="${escape(item.id)}" ${!draft.dirty||off?'disabled':''}>Save changes</button>`:''}<button type="button" class="small-link review-reload" data-review-reload="${escape(item.id)}" ${draft.busy?'disabled':''} ${draft.dirty||draft.error?'':'hidden'}>Reload row</button><span class="review-row-state" role="status" aria-live="polite">${draft.busy?'Saving…':draft.dirty?'Unsaved changes':''}</span></div></div><p class="review-row-error" role="alert" ${draft.error?'':'hidden'}>${escape(draft.error)}</p></article>`;
    }).join('')||'<div class="card card-pad empty-state"><strong>No open review items</strong>Change filters or show completed items to revisit an earlier decision.</div>'}</div><p class="table-note">Amounts are shown in the currency actually charged. Resolving an item does not include an excluded transfer or change its transaction type.</p></div>`;
  }
  function mount(ctx){
    const host=document.getElementById('review-page');if(!host)return;
    host.querySelector?.('#review-filter-form')?.addEventListener('submit',event=>{event.preventDefault();const form=event.target;const from=form.elements.from.value,to=form.elements.to.value;form.elements.to.setCustomValidity(from&&to&&from>to?'End date must be on or after start date.':'');if(!form.reportValidity())return;ctx.ui.reviewFilter={person:form.elements.person.value,from,to};ctx.rerender();});
    host.querySelector?.('[data-review-clear]')?.addEventListener('click',()=>{ctx.ui.reviewFilter={person:'all',from:'',to:''};ctx.rerender();});
    const lookup=id=>{const item=(ctx.state.review||[]).find(r=>r.id===id),transaction=item&&(ctx.state.transactions||[]).find(t=>t.id===item.record_id);return {item,transaction,draft:item&&draftFor(ctx,item,transaction)};};
    const rowFor=id=>Array.from(host.querySelectorAll('[data-review-row]')).find(row=>row.dataset.reviewRow===id);
    function update(id){
      const row=rowFor(id),value=lookup(id);if(!row||!value.item)return;
      const {item,transaction,draft}=value,off=locked(ctx)||draft.busy||draft.conflict;
      row.classList.toggle('is-dirty',draft.dirty);
      for(const input of row.querySelectorAll('[data-review-field]'))input.disabled=off||input.dataset.reviewField==='sharing'&&transaction?.kind==='income';
      const save=row.querySelector('[data-review-save]');if(save)save.disabled=!draft.dirty||off;
      const checkbox=row.querySelector('[data-review-checkbox]');if(checkbox){checkbox.checked=completed(item);checkbox.disabled=off;}
      const reload=row.querySelector('[data-review-reload]');if(reload){reload.hidden=!draft.dirty&&!draft.error;reload.disabled=draft.busy;}
      const status=row.querySelector('.review-row-state');if(status)status.textContent=draft.busy?'Saving…':draft.dirty?'Unsaved changes':'';
      const error=row.querySelector('.review-row-error');if(error){error.hidden=!draft.error;error.textContent=draft.error;}
    }
    function fieldChange(event){
      const input=event.target.closest('[data-review-field]');if(!input)return;
      const row=input.closest('[data-review-row]'),{transaction,draft}=lookup(row.dataset.reviewRow);if(!transaction||!draft||draft.busy||draft.conflict||locked(ctx))return;
      draft.fields[input.dataset.reviewField]=input.value;draft.dirty=changed(draft,transaction);draft.error='';update(row.dataset.reviewRow);
    }
    async function save(id,nextStatus){
      const {item,transaction,draft}=lookup(id);if(!item||!draft||draft.busy)return;
      try{
        if(locked(ctx))throw new Error('Editing is paused. Resume app editing before saving changes.');
        ctx.guardEditing();
        if(draft.conflict||draft.version!==ctx.state.version)throw new Error('Records changed since this row was edited. Reload the row before saving.');
        const status=nextStatus||(['open','resolved','deferred'].includes(item.status)?item.status:completed(item)?'resolved':'open'),payload={version:draft.version,review:{id:item.id,status}};
        if(transaction&&draft.dirty){
          const amount=Number(draft.fields.charged_amount);
          if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.fields.date)||!Number.isFinite(amount)||amount<=0)throw new Error('Enter a valid date and a positive charged amount.');
          payload.transaction={id:transaction.id,date:draft.fields.date,person:draft.fields.person,charged_amount:amount,sharing:transaction.kind==='income'?'personal':draft.fields.sharing};
        }
        draft.busy=true;draft.error='';update(id);
        const result=await ctx.request('/api/review',payload);
        drafts.delete(id);ctx.acceptResult(result,nextStatus==='resolved'?'Review item resolved':nextStatus==='open'?'Review item reopened':'Review changes saved');
      }catch(error){
        draft.busy=false;draft.error=error?.message||'This row could not be saved. Your changes are still here.';
        if(error?.status===409||error?.code===409||/changed|version|conflict/i.test(draft.error))draft.conflict=true;
        update(id);
      }finally{draft.busy=false;}
    }
    host.addEventListener('input',fieldChange);
    host.addEventListener('change',event=>{
      if(event.target.closest('#review-filter-form'))host.querySelector('#review-filter-form').elements.to.setCustomValidity('');
      fieldChange(event);
      const checkbox=event.target.closest('[data-review-checkbox]');if(!checkbox)return;
      event.stopPropagation();const resolved=checkbox.checked;checkbox.checked=!resolved;void save(checkbox.dataset.reviewCheckbox,resolved?'resolved':'open');
    });
    host.addEventListener('click',event=>{
      const saveButton=event.target.closest('[data-review-save]');if(saveButton){event.preventDefault();event.stopPropagation();void save(saveButton.dataset.reviewSave);return;}
      const reload=event.target.closest('[data-review-reload]');if(reload){event.preventDefault();drafts.delete(reload.dataset.reviewReload);const row=rowFor(reload.dataset.reviewReload),value=lookup(reload.dataset.reviewReload);for(const input of row?.querySelectorAll('[data-review-field]')||[])input.value=value.draft.fields[input.dataset.reviewField];update(reload.dataset.reviewReload);}
    });
  }
  root.CasaReview=Object.freeze({render,mount});
})(window);
