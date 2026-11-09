/* Google finance assistant and source review. Conversations remain in page memory. */
(function(root){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let history=[],currentTab='chat',generation=0;
 const el=id=>document.getElementById(id);
 async function open(tab='chat'){
  if(tab==='chat'){openChat();return;}
  const ctx=root.CasaDocumentContext();currentTab=tab;const round=++generation;
  ctx.openModal('Casa assistant',`<div class="assistant-tabs" role="tablist">${[['inbox','Inbox review'],['usage','AI usage']].map(([id,label])=>`<button class="button ${tab===id?'primary':''}" type="button" data-assistant-tab="${id}" role="tab" aria-selected="${tab===id}">${label}</button>`).join('')}</div><div id="assistant-body" class="assistant-body"><p role="status">Loading…</p></div>`);
  el('modal').classList.add('assistant-dialog');
  document.querySelectorAll('[data-assistant-tab]').forEach(button=>button.onclick=()=>open(button.dataset.assistantTab));
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
 let chatBusy=false;
 function message(role,text){
  const node=document.createElement('article');node.className='chat-message '+role;
  const name=document.createElement('strong');name.textContent=role==='user'?'You':'Casa';
  const content=document.createElement('p');content.textContent=text;node.append(name,content);
  el('casa-chat-messages').append(node);el('casa-chat-welcome').hidden=true;
  el('casa-chat-messages').scrollTop=el('casa-chat-messages').scrollHeight;
 }
 function mountChat(){
  if(el('casa-chat-launcher'))return;
  const shell=el('web-app');if(!shell)return;
  const host=document.createElement('div');host.id='casa-chat';
  host.innerHTML=`<button class="chat-launcher" id="casa-chat-launcher" type="button" aria-label="Ask Casa about your finances" aria-expanded="false" aria-controls="casa-chat-panel"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-6 3v-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M8 9h8M8 13h5"/></svg><span>Ask Casa</span></button><section class="chat-panel" id="casa-chat-panel" role="region" aria-label="Casa finance chat" hidden><header class="chat-header"><div class="chat-avatar" aria-hidden="true">c.</div><div><strong>Ask Casa</strong><small>Your finances, in conversation</small></div><button id="casa-chat-new" class="chat-header-button" type="button" aria-label="Start a new conversation" title="New conversation">↺</button><button id="casa-chat-close" class="chat-header-button" type="button" aria-label="Minimize finance chat">−</button></header><div id="casa-chat-messages" class="chat-messages" role="log" aria-live="polite"><div id="casa-chat-welcome" class="chat-welcome"><span class="chat-welcome-icon" aria-hidden="true">✦</span><h3>A little clarity, whenever you need it.</h3><p>Ask about spending, your monthly balance, or the goals you’re working toward.</p><div class="chat-suggestions"><button type="button" data-chat-suggestion="How does our spending compare with previous months?">How is our spending changing?</button><button type="button" data-chat-suggestion="Which categories could we review to reduce costs?">Where could we spend less?</button><button type="button" data-chat-suggestion="Explain our latest monthly shared-expense balance and any missing information.">Explain our monthly balance</button></div></div></div><p id="casa-chat-status" class="chat-status" role="status" aria-live="polite">Google Gemini · answers from saved records</p><div class="chat-composer"><label class="sr-only" for="casa-chat-question">Your finance question</label><textarea id="casa-chat-question" maxlength="2000" rows="2" placeholder="Ask about your finances…"></textarea><button id="casa-chat-send" type="button" aria-label="Send question" disabled><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 12 7-7 7 7M12 5v15"/></svg></button></div><div class="chat-disclosure">Read-only · check answers against your records</div></section>`;
  shell.append(host);
  el('casa-chat-launcher').onclick=()=>el('casa-chat-panel').hidden?openChat():closeChat();
  el('casa-chat-close').onclick=closeChat;
  el('casa-chat-new').onclick=()=>{if(chatBusy)return;history=[];el('casa-chat-messages').querySelectorAll('.chat-message').forEach(node=>node.remove());el('casa-chat-welcome').hidden=false;el('casa-chat-status').textContent='Google Gemini · answers from saved records';};
  const input=el('casa-chat-question');input.oninput=()=>{el('casa-chat-send').disabled=chatBusy||!input.value.trim()};
  input.onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat();}else if(event.key==='Escape')closeChat()};
  el('casa-chat-send').onclick=sendChat;
  host.querySelectorAll('[data-chat-suggestion]').forEach(button=>button.onclick=()=>{input.value=button.dataset.chatSuggestion;sendChat()});
 }
 function openChat(){mountChat();if(!el('casa-chat-panel'))return;el('casa-chat-panel').hidden=false;el('casa-chat-launcher').setAttribute('aria-expanded','true');if(!chatBusy)el('casa-chat-question').focus();}
 function closeChat(){el('casa-chat-panel').hidden=true;el('casa-chat-launcher').setAttribute('aria-expanded','false');el('casa-chat-launcher').focus();}
 async function sendChat(){
  const input=el('casa-chat-question'),question=input.value.trim();if(chatBusy||!question)return;
  chatBusy=true;input.value='';input.disabled=true;el('casa-chat-send').disabled=true;el('casa-chat-new').disabled=true;
  message('user',question);el('casa-chat-status').textContent='Looking through your saved figures…';el('casa-chat-status').classList.add('thinking');
  try{
   const value=await root.CasaDocumentContext().request('/api/ai/chat',{question,history:history.slice(-8)});
   history.push({role:'user',text:question},{role:'assistant',text:value.answer});history=history.slice(-8);
   message('assistant',value.answer);el('casa-chat-status').textContent='Google Gemini · based on your saved records';
  }catch(error){el('casa-chat-status').textContent=error.message;input.value=question;}
  finally{chatBusy=false;input.disabled=false;el('casa-chat-new').disabled=false;el('casa-chat-send').disabled=!input.value.trim();el('casa-chat-status').classList.remove('thinking');if(!el('casa-chat-panel').hidden)input.focus();}
 }
 if(root.CasaWeb)root.CasaWeb.ready.then(mountChat);
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
