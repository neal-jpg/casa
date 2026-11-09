/* Google finance assistant and source review. Conversations remain in page memory. */
(function(root){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let history=[],currentTab='chat',generation=0;
 const el=id=>document.getElementById(id);
 async function open(tab='chat'){
  const ctx=root.CasaDocumentContext();currentTab=tab;const round=++generation;
  ctx.openModal('Casa assistant',`<div class="assistant-tabs" role="tablist">${[['chat','Ask Casa'],['inbox','Inbox review'],['usage','AI usage']].map(([id,label])=>`<button class="button ${tab===id?'primary':''}" type="button" data-assistant-tab="${id}" role="tab" aria-selected="${tab===id}">${label}</button>`).join('')}</div><div id="assistant-body" class="assistant-body"><p role="status">Loading…</p></div>`);
  el('modal').classList.add('assistant-dialog');
  document.querySelectorAll('[data-assistant-tab]').forEach(button=>button.onclick=()=>open(button.dataset.assistantTab));
  if(tab==='chat')return paintChat(ctx,round);
  try{
   if(tab==='usage'){
    const data=await ctx.request('/api/ai/status');if(round!==generation)return;
    el('assistant-body').innerHTML=`<div class="documents-destination"><strong>US$${Number(data.estimated_usd).toFixed(3)} / US$${Number(data.limit_usd).toFixed(2)}</strong><p>${escape(data.month)} · ${data.requests} model requests</p></div><p>Imports: ${escape(data.models.imports)}<br>Summaries & chat: ${escape(data.models.assistant)}</p><p class="documents-help">Conservative estimates use standard token prices, including reasoning and uncertain requests. Promotional credits can lower your Google bill. Casa pauses new calls at its allowance; Google’s billing alert is separate.</p>`;return;
   }
   const [data,stateResult]=await Promise.all([ctx.request('/api/ai/inbox'),ctx.request('/api/state')]);if(round!==generation)return;
   const state=stateResult.state||stateResult;const files=[...(data.files||[])].reverse();
   el('assistant-body').innerHTML=`<p class="documents-help">Refresh analyzes new files once. Validated statements can import automatically; uncertain sources wait here. Reviewing a draft does not call AI.</p>${files.map(file=>`<details class="assistant-source"><summary><strong>${escape(file.name)}</strong><span class="pill ${file.status==='review'?'amber':'neutral'}">${escape(file.status)}</span></summary><p>${escape(file.message)}</p><a href="https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view" target="_blank" rel="noopener noreferrer">Open original</a>${file.status==='review'?`<div id="draft-${escape(file.id)}"></div><button class="button small" type="button" data-ai-retry="${escape(file.id)}">Allow a new AI analysis</button>`:''}</details>`).join('')||'<div class="empty-state"><strong>No analyzed documents yet</strong>Upload documents, then press Refresh.</div>'}`;
   files.filter(file=>file.status==='review').forEach(file=>draft(file,state,ctx,round));
   document.querySelectorAll('[data-ai-retry]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await ctx.request('/api/ai/inbox/retry',{id:button.dataset.aiRetry});ctx.toast('Ready to retry. Press Refresh to analyze this document again.');await open('inbox');}catch(error){button.disabled=false;ctx.showError(error)}});
  }catch(error){if(round===generation)el('assistant-body').textContent=error.message;}
 }
 function paintChat(ctx,round){
  el('assistant-body').innerHTML=`<div id="assistant-messages" class="assistant-messages" role="log" aria-live="polite"></div><div id="assistant-form"><label for="assistant-question">Ask about your saved finances</label><textarea id="assistant-question" maxlength="2000" rows="3" placeholder="How does our grocery spending compare across months?" required></textarea><div class="documents-actions"><button class="button primary" type="button" id="assistant-send">Ask Casa</button><button class="button" type="button" id="assistant-clear">New conversation</button></div><p id="assistant-chat-status" role="status" class="documents-help">Google Gemini · read-only · conversation stays in this browser session</p></div>`;
  const message=(role,text)=>{const node=document.createElement('article');node.className='assistant-message '+role;const name=document.createElement('strong');name.textContent=role==='user'?'You':'Casa';const content=document.createElement('p');content.textContent=text;node.append(name,content);el('assistant-messages').append(node);node.scrollIntoView?.({block:'nearest'});};
  history.forEach(row=>message(row.role,row.text));
  el('assistant-clear').onclick=()=>{history=[];open('chat')};
  el('assistant-send').onclick=async event=>{
   event.preventDefault();const question=el('assistant-question').value.trim();if(!question)return;
   const button=el('assistant-send');button.disabled=true;el('assistant-question').disabled=true;message('user',question);el('assistant-chat-status').textContent='Reading your saved figures…';
   try{const answer=await ctx.request('/api/ai/chat',{question,history:history.slice(-8)});history.push({role:'user',text:question},{role:'assistant',text:answer.answer});history=history.slice(-8);if(round===generation){message('assistant',answer.answer);el('assistant-question').value='';el('assistant-chat-status').textContent='Google Gemini · based on your saved records; verify financial decisions.';}}
   catch(error){if(round===generation)el('assistant-chat-status').textContent=error.message;}
   finally{if(round===generation){button.disabled=false;el('assistant-question').disabled=false;el('assistant-question').focus();}}
  };
 }
 function draft(file,state,ctx,round){
  const host=el('draft-'+file.id);if(!host)return;
  const raw=file.draft?.rows||[];if(!raw.length){host.innerHTML='<p class="documents-help">No editable extraction is available. Check the source, or allow another analysis and press Refresh.</p>';return;}
  const options=(choices,value)=>`<option value="">Choose…</option>`+choices.map(([id,label])=>`<option value="${escape(id)}" ${id===value?'selected':''}>${escape(label)}</option>`).join('');
  const candidates=raw.map((row,i)=>{const id='ai-'+file.sha256.slice(0,24)+'-'+(i+1);const prepared=(file.rows||[]).find(x=>x.id===id);return {row:prepared||{...row,id,notes:[row.notes,'Original: '+row.original_description,'Items: '+(row.items||[]).join('; ')].join('\n')},valid:!!prepared}});
  host.innerHTML=`${[...(file.draft?.warnings||[]),...(file.issues||[])].length?`<ul class="documents-help">${[...(file.draft?.warnings||[]),...(file.issues||[])].map(x=>`<li>${escape(x)}</li>`).join('')}</ul>`:''}<div class="assistant-draft-form">${candidates.map(({row,valid},i)=>`<details class="assistant-draft-row"><summary><label><input type="checkbox" data-include="${i}" ${valid?'checked':''}> ${escape(row.merchant||'Unknown description')}</label> · ${escape(row.date||'Date needed')} · ${escape(row.charged_currency||row.currency||'')} ${escape(row.charged_amount??row.amount??'')}</summary><div class="assistant-fields" data-draft-row="${i}"><label>Date<input data-key="date" type="date" value="${escape(row.date||'')}"></label><label>Person<select data-key="person">${options([['neal','Neal'],['partner','Paola']],row.person)}</select></label><label>Type<select data-key="kind">${options(['expense','income','refund','transfer','investment_transfer','transfer_review'].map(x=>[x,x.replaceAll('_',' ')]),row.kind)}</select></label><label>Category<select data-key="category_id">${options(state.categories.filter(x=>!x.archived).map(x=>[x.id,x.name]),row.category_id)}</select></label><label>Household use<select data-key="sharing">${options([['shared','Shared'],['personal','Personal'],['needs_review','Needs review']],row.sharing)}</select></label><label>Original amount<input data-key="amount" type="number" min="0" step="any" value="${escape(row.amount??'')}"></label><label>Original currency<select data-key="currency">${options([['CLP','CLP'],['USD','USD']],row.currency)}</select></label><label>Charged amount<input data-key="charged_amount" type="number" min="0" step="any" value="${escape(row.charged_amount??'')}"></label><label>Charged currency<select data-key="charged_currency">${options([['CLP','CLP'],['USD','USD']],row.charged_currency)}</select></label><label>Description<input data-key="merchant" maxlength="300" value="${escape(row.merchant||'')}"></label></div><p class="documents-help">${escape(raw[i].original_description||'')}<br>${escape((raw[i].items||[]).join('; '))}</p></details>`).join('')}<p class="documents-help">Select only records to import. Matching transactions are skipped again on save. Confirm owners, dates, charges and shared use before saving.</p><button class="button primary" type="button" data-save-draft>Save selected records to Sheet</button><p class="documents-help" role="status" data-draft-status></p></div>`;
  host.querySelector('[data-save-draft]').onclick=async event=>{
   event.preventDefault();const form=host.querySelector('.assistant-draft-form'),button=form.querySelector('[data-save-draft]');button.disabled=true;
   const rows=[];candidates.forEach(({row},i)=>{if(!form.querySelector(`[data-include="${i}"]`).checked)return;const value={...row};form.querySelectorAll(`[data-draft-row="${i}"] [data-key]`).forEach(input=>value[input.dataset.key]=['amount','charged_amount'].includes(input.dataset.key)?(input.value===''?null:Number(input.value)):input.value);value.included=!['investment_transfer','transfer_review'].includes(value.kind);rows.push(value)});
   try{await ctx.request('/api/ai/inbox/commit',{id:file.id,version:state.version,rows});ctx.toast('Reviewed records saved to Google Sheets.');if(round===generation)await open('inbox');}
   catch(error){button.disabled=false;form.querySelector('[data-draft-status]').textContent=error.message;}
  };
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-casa-assistant]');if(button){el('web-nav-close')?.click();open(button.dataset.casaAssistant||'chat')}});
 root.CasaAssistant=Object.freeze({open});
})(window);
