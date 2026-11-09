/* Manual document intake. OAuth tokens stay in memory; files go only to Google Drive. */
(function(root){
  'use strict';
  const SCOPE='https://www.googleapis.com/auth/drive.file';
  let settings=null, sdkPromise=null, picker=null, token='', context=null, cycle=0;
  const status=message=>{const element=document.getElementById('documents-status');if(element)element.textContent=message;};
  const clearToken=()=>{token='';};
  function loadPicker(){
    if(root.google?.picker)return Promise.resolve();
    if(sdkPromise)return sdkPromise;
    sdkPromise=new Promise((resolve,reject)=>{
      const load=()=>root.gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('Google’s upload window could not load. Try again.'))});
      if(root.gapi){load();return;}
      const script=document.createElement('script');script.src='https://apis.google.com/js/api.js';script.async=true;
      script.onload=load;script.onerror=()=>reject(new Error('Google’s upload window could not load. Check your connection.'));
      document.head.append(script);
    }).catch(error=>{sdkPromise=null;throw error;});
    return sdkPromise;
  }
  async function driveFile(id,fields){
    if(!/^[A-Za-z0-9_-]{10,200}$/.test(id))throw new Error('Google returned an invalid document identifier.');
    const response=await fetch('https://www.googleapis.com/drive/v3/files/'+id+'?fields='+encodeURIComponent(fields),{
      headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error'});
    if(!response.ok){const error=new Error('Google could not verify Inbox access. Choose a household Google account with access to the finance folder.');error.status=response.status;throw error;}
    return response.json();
  }
  function builder(view,title,callback){
    return new root.google.picker.PickerBuilder().addView(view).setOAuthToken(token)
      .setDeveloperKey(settings.picker_key).setAppId(settings.project_number)
      .setOrigin(root.location.origin).setTitle(title).hideNav().setCallback(callback)
      .setSize(Math.min(900,Math.max(280,root.innerWidth-24)),Math.min(650,Math.max(300,root.innerHeight-40)));
  }
  async function inboxAccess(){
    const folder=await driveFile(settings.inbox_id,'id,mimeType,trashed,capabilities(canAddChildren)');
    if(folder.trashed||folder.mimeType!=='application/vnd.google-apps.folder'||folder.capabilities?.canAddChildren!==true)
      throw new Error('Your Google account needs permission to add files to the finance Inbox.');
  }
  function showUploader(){
    const round=cycle;
    status('Choose documents in Google’s upload window. Files are saved to 00_INBOX.');
    const view=new root.google.picker.DocsUploadView().setParent(settings.inbox_id);
    picker=builder(view,'Upload documents to 00_INBOX',async data=>{
      if(round!==cycle||!document.getElementById('modal').open)return;
      if(data.action===root.google.picker.Action.CANCEL){clearToken();status('Upload window closed. Any completed uploads remain in Inbox.');return;}
      if(data.action!==root.google.picker.Action.PICKED)return;
      try{
        const documents=data.docs||[];
        if(!documents.length)throw new Error('Google did not confirm any uploaded documents. Check Inbox before retrying.');
        for(const doc of documents){const saved=await driveFile(doc.id,'id,parents');if(!saved.parents?.includes(settings.inbox_id))throw new Error('An upload’s destination could not be verified. Check Inbox before retrying.');}
        const message=`${documents.length} ${documents.length===1?'document':'documents'} uploaded to Inbox. Ready for your manual review in ChatGPT.`;
        status(message);context?.toast(message);
      }catch(error){status(error.message);}finally{clearToken();}
    }).build();picker.setVisible(true);
  }
  function chooseInbox(){
    const round=cycle;
    status('Select 00_INBOX to authorize this upload destination.');
    const view=new root.google.picker.DocsView(root.google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true).setSelectFolderEnabled(true).setFileIds(settings.inbox_id);
    picker=builder(view,'Select your finance Inbox',async data=>{
      if(round!==cycle||!document.getElementById('modal').open)return;
      if(data.action===root.google.picker.Action.CANCEL){clearToken();status('Inbox authorization cancelled. No documents were uploaded.');return;}
      if(data.action!==root.google.picker.Action.PICKED)return;
      if(data.docs?.length!==1||data.docs[0].id!==settings.inbox_id){clearToken();status('Please choose the existing 00_INBOX folder in your finance folder.');return;}
      try{await inboxAccess();showUploader();}catch(error){clearToken();status(error.message);}
    }).build();picker.setVisible(true);
  }
  function authorize(){
    const round=cycle;
    if(!settings||!root.google?.accounts?.oauth2){status('Google sign-in is still loading. Try again in a moment.');return;}
    // Called directly from a user click, so Google can open its account/consent window.
    const client=root.google.accounts.oauth2.initTokenClient({client_id:root.CASA_PUBLIC_CONFIG.googleClientId,
      scope:SCOPE,include_granted_scopes:false,
      callback:async response=>{
        if(round!==cycle||!document.getElementById('modal').open)return;
        if(response.error||!response.access_token){clearToken();status('Google Drive authorization was not completed. No documents were uploaded.');return;}
        token=response.access_token;
        if(!root.google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)){clearToken();status('Allow access to files you choose for Casa to enable uploads.');return;}
        try{await inboxAccess();showUploader();}catch(error){if(error.status===404)chooseInbox();else{clearToken();status(error.message);}}
      },error_callback:()=>{clearToken();status('Google’s account window could not open. Try Chrome or Safari, then choose documents again.');}});
    client.requestAccessToken({prompt:''});
  }
  async function open(ctx){
    const round=++cycle;context=ctx;clearToken();settings=null;
    // A non-modal dialog permits interaction with Google’s separately rendered Picker.
    ctx.openModal('Upload documents',`<p class="documents-intro">Add statements, receipts, screenshots, or CSVs to your private Google Drive Inbox.</p><div class="documents-destination"><strong>00_INBOX · manual analysis</strong><p>Ask ChatGPT in your finance chat when you want new documents analyzed and the master Sheet updated. Refresh reloads the Sheet.</p></div><div class="documents-actions"><button class="button primary" id="documents-choose" type="button" disabled>Choose documents</button><a class="button" id="documents-open-inbox" target="_blank" rel="noopener noreferrer" hidden>Open Inbox in Drive</a></div><p id="documents-status" class="documents-status" role="status" aria-live="polite">Connecting to your Inbox…</p><p class="documents-help">Uploads do not analyze files or change financial records. No AI API is connected. Google may ask you to allow access to the Inbox and files you select.</p>`,'',null,false);
    const dialog=document.getElementById('modal');
    const dismiss=()=>{if(round!==cycle){dialog.removeEventListener('close',dismiss);return;}if(dialog.open)return;cycle++;clearToken();picker?.setVisible(false);dialog.removeEventListener('close',dismiss);};dialog.addEventListener('close',dismiss);
    try{
      const [config]=await Promise.all([ctx.request('/api/documents/config'),loadPicker()]);
      if(!dialog.open||round!==cycle)return;
      if(!/^[A-Za-z0-9_-]{10,200}$/.test(config.inbox_id)||!/^AIza[A-Za-z0-9_-]{20,100}$/.test(config.picker_key)||!/^\d+$/.test(config.project_number))throw new Error('The documents connection is not configured.');
      settings=config;
      const link=document.getElementById('documents-open-inbox');link.href='https://drive.google.com/drive/folders/'+config.inbox_id;link.hidden=false;
      const button=document.getElementById('documents-choose');button.disabled=false;button.onclick=authorize;
      status('Ready. Documents go directly from your browser to Google Drive.');button.focus();
    }catch(error){status(error.message||'Inbox could not be opened. Try again.');}
  }
  document.addEventListener('click',event=>{
    if(!event.target.closest('[data-upload-documents]'))return;
    document.getElementById('web-nav-close')?.click();
    if(root.CasaDocumentContext)open(root.CasaDocumentContext());
  });
  root.CasaDocuments=Object.freeze({open});
})(window);
