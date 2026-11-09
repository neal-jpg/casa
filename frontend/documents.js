/* Native household uploads. Only the owner setup uses Google OAuth/Picker. */
(function(root){
 'use strict';
 let cycle=0,sdkPromise,picker;
 const el=id=>document.getElementById(id);
 const status=text=>{if(el('documents-status'))el('documents-status').textContent=text};
 function setupStatus(message){status(message);const node=el('documents-setup-status');if(node){node.textContent=message;node.hidden=false;node.scrollIntoView?.({block:'nearest'});}}
 function normalizedSecret(input){
  let value=input.trim();
  if(value.startsWith('{')||value.startsWith('"')){
   let parsed;try{parsed=JSON.parse(value)}catch{throw Error('Paste the complete downloaded credentials JSON, or just the full client secret.');}
   if(parsed&&typeof parsed==='object'){
    parsed=parsed.web||parsed;
    if(parsed.client_id&&parsed.client_id!==root.CASA_PUBLIC_CONFIG.googleClientId)throw Error('These credentials belong to another Google client. Use Casa Web.');
    value=parsed.client_secret;
   }else value=parsed;
  }
  if(typeof value!=='string')throw Error('The credentials do not contain a client secret.');value=value.trim();
  if(value.endsWith('.apps.googleusercontent.com'))throw Error('That is the public Client ID. Copy the separate Client secret value.');
  if(/[*•●…]/.test(value))throw Error('That value is masked. Google only shows the full secret when created. Use Add secret in Casa Web and copy the new full value.');
  if(value.length<15||value.length>512||/[^\x21-\x7e]/.test(value))throw Error('Copy the complete, unmasked client secret, or paste the downloaded credentials JSON.');
  return value;
 }
 function loadPicker(){
  if(root.google?.picker)return Promise.resolve();
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
   const load=()=>root.gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('The one-time folder chooser could not load.'))});
   if(root.gapi)return load();const script=document.createElement('script');script.src='https://apis.google.com/js/api.js';script.async=true;script.onload=load;script.onerror=()=>reject(Error('Google’s folder chooser could not load.'));document.head.append(script);
  }).catch(error=>{sdkPromise=null;throw error});return sdkPromise;
 }
 async function grantInbox(config,ctx,round){
  await loadPicker();if(round!==cycle)return;
  const view=new root.google.picker.DocsView(root.google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true).setFileIds(config.inbox_id);
  picker=new root.google.picker.PickerBuilder().addView(view).setOAuthToken(config.access_token).setDeveloperKey(config.picker_key).setAppId(config.project_number).setOrigin(root.location.origin).setTitle('One-time setup: select 00_INBOX').enableFeature(root.google.picker.Feature.NAV_HIDDEN).setSize(Math.max(566,Math.min(900,root.innerWidth-24)),Math.max(350,Math.min(650,root.innerHeight-40))).setCallback(async data=>{
   if(round!==cycle)return;
   if(data.action===root.google.picker.Action.CANCEL){setupStatus('Folder selection cancelled. Reopen Upload documents and choose Continue Inbox setup; you do not need to enter the secret again.');return;}
   if(data.action!==root.google.picker.Action.PICKED)return;
   if(data.docs?.length!==1||data.docs[0].id!==config.inbox_id){setupStatus('Select the existing 00_INBOX finance folder.');return;}
   try{await ctx.request('/api/documents/confirm',{});picker?.setVisible(false);await open(ctx);}catch(error){setupStatus(error.message+' Reopen Upload documents to continue without entering the secret again.')}
  }).build();picker.setVisible(true);
 }
 function connect(ctx,round){
  let secret;
  try{secret=normalizedSecret(el('documents-secret').value);}catch(error){setupStatus(error.message);el('documents-secret').focus?.();return;}
  if(!root.google?.accounts?.oauth2){setupStatus('Google is still loading. Try again in a moment.');return;}
  el('documents-secret').value='';el('documents-connect').disabled=true;
  setupStatus('Step 1 of 2 · Approve the owner Google connection…');
  root.google.accounts.oauth2.initCodeClient({client_id:root.CASA_PUBLIC_CONFIG.googleClientId,scope:'openid email https://www.googleapis.com/auth/drive.file',include_granted_scopes:false,ux_mode:'popup',
   callback:async response=>{
    if(round!==cycle){secret='';return;}
    if(!response.code){secret='';el('documents-connect').disabled=false;setupStatus('Google authorization was cancelled or denied. No connection was saved.');return;}
    try{setupStatus('Saving the owner connection…');const config=await ctx.request('/api/documents/connect',{code:response.code,client_secret:secret});secret='';if(round!==cycle)return;if(config.ready)await open(ctx);else{setupStatus('Step 2 of 2 · Select the existing 00_INBOX folder.');await grantInbox(config,ctx,round);}}
    catch(error){setupStatus(error.message);}
    finally{secret='';if(round===cycle)el('documents-connect').disabled=false;}
   },error_callback:()=>{secret='';if(round!==cycle)return;el('documents-connect').disabled=false;setupStatus('The Google window closed or could not open. No connection was saved. Use Chrome or Safari.');}}).requestCode();
 }
 async function open(ctx){
  const round=++cycle;
  ctx.openModal('Upload documents',`<p class="documents-intro">Add statements, receipts, screenshots, or CSVs to your private Inbox.</p><div class="documents-destination"><strong>00_INBOX</strong><p>Uploads save documents only. Press Refresh to analyze new files and update Casa. Uncertain records wait for review.</p></div><div class="documents-actions"><button class="button primary" id="documents-choose" type="button" disabled>Choose documents</button><input id="documents-files" type="file" multiple hidden><a class="button" id="documents-open-inbox" target="_blank" rel="noopener noreferrer" hidden>Open Inbox</a></div><div id="documents-results" aria-live="polite"></div><p id="documents-status" role="status" class="documents-status">Connecting to Inbox…</p><details id="documents-setup" hidden><summary>One-time owner connection</summary><p class="documents-help">Only the owner connects Google Drive once. Household members then upload using their existing Casa sign-in. Paste the existing Casa Web OAuth client secret below; it is encrypted in Google Secret Manager. Never paste it into chat.</p><label for="documents-secret">Google web client secret</label><input id="documents-secret" type="password" autocomplete="off" maxlength="8000"><p class="documents-help">Use the full secret, not the masked preview or public Client ID. You can also paste the downloaded credentials JSON.</p><button class="button" type="button" id="documents-connect">Connect uploads once</button><p id="documents-setup-status" class="documents-setup-status" role="alert" hidden></p></details><button class="button" type="button" id="documents-resume" hidden>Continue Inbox setup</button><p class="documents-help">20 MB per document. PDF, CSV, XLSX, images and text supported. Images and document content are sent to Google AI when you press Refresh; crop or redact identifiers you do not want included.</p>`,'',null,false);
  const dialog=el('modal');const closed=()=>{if(!dialog.open&&round===cycle){cycle++;picker?.setVisible(false);}dialog.removeEventListener('close',closed)};dialog.addEventListener('close',closed);
  try{
   const config=await ctx.request('/api/documents/config');if(round!==cycle||!el('modal').open)return;
   const link=el('documents-open-inbox');link.href='https://drive.google.com/drive/folders/'+config.inbox_id;link.hidden=false;
   el('documents-setup').hidden=config.ready||!config.can_connect||!!config.can_resume;
   if(config.can_connect&&!config.ready&&!config.can_resume)el('documents-setup').open=true;
   const resume=el('documents-resume');resume.hidden=config.ready||!config.can_resume;
   resume.onclick=async()=>{resume.disabled=true;try{setupStatus('Finishing Inbox permission…');const next=await ctx.request('/api/documents/resume',{});if(round!==cycle)return;if(next.ready)await open(ctx);else await grantInbox(next,ctx,round);}catch(error){setupStatus(error.message);el('documents-setup').hidden=false;el('documents-setup').open=true;}finally{if(round===cycle)resume.disabled=false;}};
   el('documents-connect').onclick=()=>connect(ctx,round);
   el('documents-files').accept=config.extensions.join(',');
   const choose=el('documents-choose');choose.disabled=!config.ready;
   choose.onclick=()=>el('documents-files').click();
   el('documents-files').onchange=async event=>{
    const files=[...event.target.files];event.target.value='';choose.disabled=true;
    for(const file of files){
     if(round!==cycle)break;
     const row=document.createElement('p');row.className='documents-file';row.textContent=file.name+' · Uploading…';el('documents-results').append(row);
     if(file.size>config.max_bytes){row.textContent=file.name+' · Too large (20 MB maximum)';continue;}
     try{const body=new FormData();body.append('file',file);const response=await root.fetch('/api/documents/upload',{method:'POST',body});const value=await response.json();if(!response.ok)throw Error(value.error||'Upload failed.');row.textContent=file.name+(value.duplicate?' · Already in Inbox':' · Saved to Inbox');}
     catch(error){row.textContent=file.name+' · '+error.message;}
    }
    if(round===cycle){choose.disabled=false;status('Uploads finished. Press Refresh when you want to analyze new documents.');}
   };
   status(config.ready?'✓ Connected to Inbox. Choose documents to upload.':config.can_resume?'Owner connection saved. Choose Continue Inbox setup to finish the folder permission.':config.can_connect?'Finish the one-time owner connection below to enable uploads for the household.':'The household owner needs to finish the one-time Inbox connection.');
  }catch(error){status(error.message)}
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-upload-documents]')){el('web-nav-close')?.click();if(root.CasaDocumentContext)open(root.CasaDocumentContext());}});
 root.CasaDocuments=Object.freeze({open});
})(window);
