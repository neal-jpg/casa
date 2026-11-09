/* Native household uploads. Only the owner setup uses Google OAuth/Picker. */
(function(root){
 'use strict';
 let cycle=0,sdkPromise,picker;
 const el=id=>document.getElementById(id);
 const status=text=>{if(el('documents-status'))el('documents-status').textContent=text};
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
   if(data.action===root.google.picker.Action.CANCEL){status('Setup cancelled. The owner can reconnect when ready.');return;}
   if(data.action!==root.google.picker.Action.PICKED)return;
   if(data.docs?.length!==1||data.docs[0].id!==config.inbox_id){status('Select the existing 00_INBOX finance folder.');return;}
   try{await ctx.request('/api/documents/confirm',{});picker?.setVisible(false);await open(ctx);}catch(error){status(error.message)}
  }).build();picker.setVisible(true);
 }
 function connect(ctx,round){
  const secret=el('documents-secret').value.trim();el('documents-secret').value='';
  if(!secret){status('Paste the Google web client secret into this private setup field.');return;}
  if(!root.google?.accounts?.oauth2){status('Google is still loading. Try again in a moment.');return;}
  status('Completing the one-time owner connection…');
  root.google.accounts.oauth2.initCodeClient({client_id:root.CASA_PUBLIC_CONFIG.googleClientId,scope:'openid email https://www.googleapis.com/auth/drive.file',include_granted_scopes:false,ux_mode:'popup',
   callback:async response=>{
    if(round!==cycle)return;
    if(!response.code){status('The Google owner connection was not completed.');return;}
    try{const config=await ctx.request('/api/documents/connect',{code:response.code,client_secret:secret});if(round!==cycle)return;if(config.ready)await open(ctx);else await grantInbox(config,ctx,round);}catch(error){status(error.message)}
   },error_callback:()=>status('The owner connection window could not open. Use Chrome or Safari.')}).requestCode();
 }
 async function open(ctx){
  const round=++cycle;
  ctx.openModal('Upload documents',`<p class="documents-intro">Add statements, receipts, screenshots, or CSVs to your private Inbox.</p><div class="documents-destination"><strong>00_INBOX</strong><p>Uploads save documents only. Press Refresh to analyze new files and update Casa. Uncertain records wait for review.</p></div><div class="documents-actions"><button class="button primary" id="documents-choose" type="button" disabled>Choose documents</button><input id="documents-files" type="file" multiple hidden><a class="button" id="documents-open-inbox" target="_blank" rel="noopener noreferrer" hidden>Open Inbox</a></div><div id="documents-results" aria-live="polite"></div><p id="documents-status" role="status" class="documents-status">Connecting to Inbox…</p><details id="documents-setup" hidden><summary>One-time owner connection</summary><p class="documents-help">Only the owner connects Google Drive once. Household members then upload using their existing Casa sign-in. Paste the existing Casa Web OAuth client secret below; it is encrypted in Google Secret Manager. Never paste it into chat.</p><label for="documents-secret">Google web client secret</label><input id="documents-secret" type="password" autocomplete="off" maxlength="200"><button class="button" type="button" id="documents-connect">Connect uploads once</button></details><p class="documents-help">20 MB per document. PDF, CSV, XLSX, images and text supported. Images and document content are sent to Google AI when you press Refresh; crop or redact identifiers you do not want included.</p>`,'',null,false);
  const dialog=el('modal');const closed=()=>{if(!dialog.open&&round===cycle){cycle++;picker?.setVisible(false);}dialog.removeEventListener('close',closed)};dialog.addEventListener('close',closed);
  try{
   const config=await ctx.request('/api/documents/config');if(round!==cycle||!el('modal').open)return;
   const link=el('documents-open-inbox');link.href='https://drive.google.com/drive/folders/'+config.inbox_id;link.hidden=false;
   el('documents-setup').hidden=!config.can_connect;
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
   status(config.ready?'Ready. Choose documents—no extra Google sign-in required.':config.can_connect?'Finish the one-time owner connection below to enable uploads for the household.':'The household owner needs to finish the one-time Inbox connection.');
  }catch(error){status(error.message)}
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-upload-documents]')){el('web-nav-close')?.click();if(root.CasaDocumentContext)open(root.CasaDocumentContext());}});
 root.CasaDocuments=Object.freeze({open});
})(window);
