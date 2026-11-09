/* Read-only evidence, never financial assumptions or amounts. */
(function(root){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function orders(t,state){
  const ids=String(t.order_ids||'').split(/[,;|\s]+/).filter(Boolean);
  return (state.order_evidence||[]).filter(o=>ids.includes(String(o.id))||String(o.matched||'')===t.id);
 }
 function render(t,state,expanded=false){
  const linked=orders(t,state),sources=state.source_evidence?.[t.id]||[];
  const items=[...new Set([...linked.map(o=>o.items),t.order_details].filter(Boolean).flatMap(v=>String(v).split(/;|\n/)).map(v=>v.trim()).filter(v=>v&&!/^counti?$/i.test(v)))];
  const itemList=items.length?`<div class="evidence-items"><span class="evidence-label">Order items</span><ul>${items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>${linked.map(o=>`<small>${esc(o.platform)} · ${esc(o.merchant)} · ${esc(String(o.date||'').slice(0,10))} · Order ${esc(o.id)}${o.status?` · ${esc(o.status)}`:''}</small>`).join('')}</div>`:'';
  const pair=(label,value)=>value?`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`:'';
  const body=`<dl class="evidence-facts">${sources.length?sources.map(s=>pair('Original statement description',s.description)+pair('Statement location',`${s.source_file}${s.source_page?' · page '+s.source_page:''}${s.source_row?' · row '+s.source_row:''}`)+pair('Installment',s.installment)+pair('Source date',s.original_date)).join(''):pair('Recorded description',t.merchant)+pair('Original statement description','Not separately transcribed for this record.')}${pair('Notes',t.notes)}${pair('Import assessment',t.review_reason)}${pair('Category reasoning',t.category_basis)}${pair('Sharing reasoning',t.sharing_basis)}${pair('Date basis',t.date_basis)}${pair('Order references',t.order_ids)}${pair('Related transaction',t.linked_transaction_id)}${pair('Source location',`${t.source_file||'Manual entry'}${t.source_row?' · row '+t.source_row:''}`)}</dl>${sources.length?'<small class="evidence-caveat">Original source text; screenshot transcriptions may contain OCR errors. Long numeric identifiers are hidden.</small>':''}`;
  return `<div class="transaction-evidence">${itemList}${expanded?body:`<details class="source-details"><summary>Descriptions & supporting evidence</summary>${body}</details>`}</div>`;
 }
 root.CasaEvidence=Object.freeze({render,orders});
})(window);
