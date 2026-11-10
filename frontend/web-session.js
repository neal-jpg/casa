/* Google identity exchange and revocable Casa sessions. No Google token is persisted. */
(function(root){
  'use strict';
  const nativeFetch=root.fetch.bind(root);
  const raw=root.CASA_PUBLIC_CONFIG||{};
  let apiBase='',clientId='',configurationError='';
  try{
    const url=new URL(raw.apiBase);
    const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||!['','/'].includes(url.pathname))throw new Error();
    if(typeof raw.googleClientId!=='string'||!raw.googleClientId.endsWith('.apps.googleusercontent.com'))throw new Error();
    apiBase=url.origin;clientId=raw.googleClientId;
  }catch{configurationError='Casa is not connected yet. Complete the web deployment settings before signing in.';}
  const SESSION_KEY='casa-session-v1',PREFERENCE_KEY='casa-signin-duration';
  const MODES=['session','today','30days'];
  let credential='',expiresTimer=null,unlock,initialPreferences=null,sessionInfo=null;
  const ready=new Promise(resolve=>{unlock=resolve});
  let signedIn=false,signingIn=false,retryAction=null,sessionStarts=0;
  const endListeners=new Set(),startListeners=new Set(),preferenceListeners=new Set(),beforeSignOut=new Set();
  const preferenceCopy=()=>initialPreferences?{...initialPreferences}:null;
  function setPreferences(value){
    if(!signedIn||!value||typeof value!=='object'||Array.isArray(value))return preferenceCopy();
    const clean={};
    if(['light','dark','system'].includes(value.theme))clean.theme=value.theme;
    if(typeof value.ai_auto==='boolean')clean.ai_auto=value.ai_auto;
    if(!Object.keys(clean).length)return preferenceCopy();
    initialPreferences={...initialPreferences,...clean};
    for(const callback of preferenceListeners)try{callback(preferenceCopy())}catch{}
    return preferenceCopy();
  }
  const status=text=>{const element=document.getElementById('web-login-status');if(element)element.textContent=text;};
  const storage=name=>{try{return root[name]}catch{return null}};
  function forgetStored(){for(const name of ['localStorage','sessionStorage'])try{storage(name)?.removeItem(SESSION_KEY)}catch{}}
  function storedSession(){
    for(const name of ['sessionStorage','localStorage'])try{
      const raw=storage(name)?.getItem(SESSION_KEY);if(!raw)continue;const value=JSON.parse(raw);
      if(typeof value.credential==='string'&&value.credential.startsWith('casa1.')&&Number.isFinite(value.expires_at)&&value.expires_at*1000>Date.now()&&/^[a-f0-9]{64}$/.test(value.owner_key)&&MODES.includes(value.remember))return value;
      storage(name)?.removeItem(SESSION_KEY);
    }catch{try{storage(name)?.removeItem(SESSION_KEY)}catch{}}
    return null;
  }
  function sessionControls(){
    let select=document.getElementById('web-session-duration');if(select)return select;
    const host=document.getElementById('google-signin');if(!host)return null;
    const label=document.createElement('label');label.className='session-duration';label.htmlFor='web-session-duration';
    const caption=document.createElement('span');caption.textContent='Stay signed in';
    select=document.createElement('select');select.id='web-session-duration';select.name='session-duration';select.setAttribute('aria-label','Stay signed in');
    for(const [value,text] of [['today','For today'],['30days','For 30 days'],['session','Until I close this tab']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option)}
    let preference='today';try{const saved=storage('localStorage')?.getItem(PREFERENCE_KEY);if(MODES.includes(saved))preference=saved}catch{}
    select.value=preference;select.addEventListener('change',()=>{try{storage('localStorage')?.setItem(PREFERENCE_KEY,select.value)}catch{}});
    label.append(caption,select);host.before(label);
    const note=document.createElement('small');note.className='session-device-note';note.textContent='Use remembered sign-in only on a personal device.';host.after(note);
    return select;
  }
  function clearScreen(){
    credential='';sessionInfo=null;initialPreferences=null;signedIn=false;clearTimeout(expiresTimer);
    const shell=document.getElementById('web-app');if(shell){shell.hidden=true;shell.inert=true;}
    document.getElementById('content')?.replaceChildren();
    document.getElementById('modal')?.close();document.getElementById('modal-content')?.replaceChildren();
    const gate=document.getElementById('web-login');if(gate)gate.hidden=false;
  }
  async function endSession(reason='expired',forget=true,ownerKey=null){
    const detail={ownerKey:sessionInfo?.owner_key||ownerKey,reason};
    await Promise.allSettled([...endListeners].map(callback=>Promise.resolve().then(()=>callback(detail))));
    if(typeof root.CustomEvent==='function'&&typeof root.dispatchEvent==='function')root.dispatchEvent(new root.CustomEvent('casa:signout',{detail}));
    if(forget)forgetStored();clearScreen();
  }
  async function signOut(){
    for(const callback of beforeSignOut)if(await callback()===false)return;
    if(credential){
      try{
        const result=await nativeFetch(apiBase+'/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:'{}',credentials:'omit',cache:'no-store',redirect:'error'});
        if(!result.ok&&result.status!==401)throw new Error();
      }catch{status('Casa could not finish signing out. Check your connection and try again.');const banner=document.getElementById('error-banner');if(banner){banner.textContent='Sign-out could not be confirmed. Please retry when connected.';banner.hidden=false;}return;}
    }
    await endSession('signout');root.google?.accounts?.id?.disableAutoSelect();root.location.reload();
  }
  function apiPath(input){
    const value=typeof input==='string'?input:input?.url;
    if(typeof value!=='string')return null;
    const url=new URL(value,root.location.href);
    if((url.origin===root.location.origin||url.origin===apiBase)&&url.pathname.startsWith('/api/'))return url.pathname+url.search;
    return null;
  }
  async function apiFetch(input,options={}){
    const path=apiPath(input);
    if(!path)return nativeFetch(input,options);
    await ready;
    if(!credential)throw new Error('Sign in again to open your records.');
    const headers=new Headers(input?.headers||{});new Headers(options.headers||{}).forEach((value,key)=>headers.set(key,value));
    headers.set('Authorization','Bearer '+credential);
    const result=await nativeFetch(apiBase+path,{...options,headers,credentials:'omit',cache:'no-store',redirect:'error'});
    if(result.status===401||result.status===403){
      let authFailure=false;try{authFailure=(await result.clone().json()).auth_required===true}catch{}
      if(authFailure){await endSession(result.status===403?'denied':'expired');root.location.reload();throw new Error('Your Casa sign-in ended. Sign in again.');}
    }
    return result;
  }
  root.fetch=apiFetch;
  function scheduleExpiry(){
    clearTimeout(expiresTimer);if(!sessionInfo)return;
    const remaining=sessionInfo.expires_at*1000-Date.now();
    if(remaining<=0){void endSession('expired').then(()=>root.location.reload());return;}
    expiresTimer=setTimeout(scheduleExpiry,Math.min(remaining,2000000000));
  }
  function acceptSession(value,token){
    if(typeof token!=='string'||!token.startsWith('casa1.')||!Number.isFinite(value.expires_at)||value.expires_at*1000<=Date.now()||!/^[a-f0-9]{64}$/.test(value.owner_key)||!MODES.includes(value.remember))throw new Error('Casa returned an incomplete sign-in. Please try again.');
    credential=token;sessionInfo={expires_at:value.expires_at,remember:value.remember,owner_key:value.owner_key};signedIn=true;
    const target=value.remember==='session'?'sessionStorage':'localStorage',other=target==='sessionStorage'?'localStorage':'sessionStorage';
    try{storage(other)?.removeItem(SESSION_KEY);storage(target)?.setItem(SESSION_KEY,JSON.stringify({...sessionInfo,credential:token}))}catch{}
    document.getElementById('web-login').hidden=true;
    const shell=document.getElementById('web-app');shell.hidden=false;shell.inert=false;scheduleExpiry();unlock();
    const detail={ownerKey:sessionInfo.owner_key,remember:sessionInfo.remember,expiresAt:sessionInfo.expires_at*1000,initial:++sessionStarts===1,generation:sessionStarts};
    for(const callback of startListeners)try{callback({...detail})}catch{}
    if(typeof root.CustomEvent==='function'&&typeof root.dispatchEvent==='function')root.dispatchEvent(new root.CustomEvent('casa:sessionstart',{detail}));
  }
  async function errorText(result,fallback){try{return (await result.json()).error||fallback}catch{return fallback}}
  async function onCredential(response){
    if(signingIn||signedIn||!response?.credential)return;
    signingIn=true;status('Opening Casa…');
    try{
      const remember=sessionControls()?.value||'today';
      // Google token is exchanged once. Only a revocable Casa credential is saved.
      const result=await nativeFetch(apiBase+'/api/auth/session',{method:'POST',headers:{Authorization:'Bearer '+response.credential,'Content-Type':'application/json'},body:JSON.stringify({remember}),credentials:'omit',cache:'no-store',redirect:'error'});
      if(!result.ok)throw new Error(await errorText(result,'Your sign-in could not be verified. Try again.'));
      const value=await result.json();acceptSession(value,value.credential);
    }catch(error){credential='';sessionInfo=null;initialPreferences=null;status(error.message||'Sign-in could not be verified. Try again.');}
    finally{signingIn=false;}
  }
  async function restoreSession(){
    const saved=storedSession();if(!saved){loadGoogleSignIn();return;}
    const retry=document.getElementById('web-signin-retry');if(retry)retry.hidden=true;status('Opening your saved session…');
    try{
      const result=await nativeFetch(apiBase+'/api/auth/session',{headers:{Authorization:'Bearer '+saved.credential},credentials:'omit',cache:'no-store',redirect:'error'});
      if(result.status===401||result.status===403){await endSession(result.status===403?'denied':'expired',true,saved.owner_key);loadGoogleSignIn();return;}
      if(!result.ok)throw new Error(await errorText(result,'Casa could not verify your saved sign-in. Try again.'));
      acceptSession(await result.json(),saved.credential);
    }catch(error){status(error.message||'Could not connect to Casa. Your saved sign-in is retained.');retryAction=restoreSession;if(retry)retry.hidden=false;}
  }
  function loadGoogleSignIn(){
    sessionControls();retryAction=loadGoogleSignIn;
    const retry=document.getElementById('web-signin-retry');if(retry)retry.hidden=true;
    status('Loading Google sign-in…');
    const boot=()=>{
      root.google.accounts.id.initialize({client_id:clientId,callback:onCredential,auto_select:false,cancel_on_tap_outside:true});
      const host=document.getElementById('google-signin');host.replaceChildren();
      root.google.accounts.id.renderButton(host,{theme:'outline',size:'large',shape:'pill',text:'signin_with',width:Math.min(320,Math.max(200,root.innerWidth-100))});
      status('Only approved household accounts can access these records.');
    };
    if(root.google?.accounts?.id){boot();return;}
    document.getElementById('google-signin-sdk')?.remove();
    const sdk=document.createElement('script');sdk.id='google-signin-sdk';sdk.src='https://accounts.google.com/gsi/client';sdk.async=true;sdk.defer=true;
    sdk.onload=boot;sdk.onerror=()=>{status('Google sign-in could not load. Check your connection and try again.');if(retry)retry.hidden=false;};
    document.head.append(sdk);
  }
  function setupNavigation(){
    const menu=document.getElementById('web-menu-toggle'),sidebar=document.getElementById('web-sidebar'),overlay=document.getElementById('web-nav-overlay');
    let previousFocus;
    const setOpen=open=>{document.body.classList.toggle('web-nav-open',open);menu.setAttribute('aria-expanded',String(open));overlay.hidden=!open;if(open){previousFocus=document.activeElement;document.getElementById('web-nav-close').focus();}else previousFocus?.focus?.();};
    menu.addEventListener('click',()=>setOpen(menu.getAttribute('aria-expanded')!=='true'));
    document.getElementById('web-nav-close').addEventListener('click',()=>setOpen(false));overlay.addEventListener('click',()=>setOpen(false));
    document.getElementById('navigation').addEventListener('click',event=>{if(event.target.closest('button'))setOpen(false);});
    document.addEventListener('keydown',event=>{
      if(menu.getAttribute('aria-expanded')!=='true')return;
      if(event.key==='Escape'){setOpen(false);return;}
      if(event.key==='Tab'){
        const focusable=[...sidebar.querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length);
        if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    root.matchMedia('(min-width: 861px)').addEventListener('change',event=>{if(event.matches)setOpen(false);});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    setupNavigation();document.getElementById('web-signout').addEventListener('click',signOut);
    document.getElementById('web-signin-retry').addEventListener('click',()=>retryAction?.());
    document.addEventListener('click',async event=>{
      const anchor=event.target.closest('a[href]');if(!anchor||!apiPath(anchor.href))return;
      event.preventDefault();
      try{
        const result=await apiFetch(anchor.href);if(!result.ok)throw new Error('The workbook download could not be prepared.');
        const blob=await result.blob(),url=URL.createObjectURL(blob),download=document.createElement('a');
        download.href=url;download.download=anchor.download||'Family Finances.xlsx';download.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){const banner=document.getElementById('error-banner');banner.textContent=error.message;banner.hidden=false;}
    });
    if(configurationError){status(configurationError);return;}
    sessionControls();void restoreSession();
  });
  root.addEventListener?.('storage',event=>{
    if(event.key!==SESSION_KEY||!signedIn)return;
    let incoming=null;try{incoming=event.newValue?JSON.parse(event.newValue):null}catch{}
    if(incoming?.credential===credential)return;
    // A different tab owns the new credential, or already performed sign-out.
    // Hide this tab without removing its replacement or deleting pending edits.
    void endSession('another-tab',false).then(()=>root.location.reload());
  });
  root.CasaWeb=Object.freeze({ready,signOut,isSignedIn:()=>signedIn,
    takeInitialState:()=>null,initialPreferences:preferenceCopy,setPreferences,setInitialPreferences:setPreferences,
    getSessionInfo:()=>sessionInfo?{ownerKey:sessionInfo.owner_key,remember:sessionInfo.remember,expiresAt:sessionInfo.expires_at*1000}:null,
    getCacheKey:async()=>signedIn&&credential&&sessionInfo?{ownerKey:sessionInfo.owner_key,keyMaterial:credential,expiresAt:sessionInfo.expires_at*1000}:null,
    onSessionStart:callback=>{if(typeof callback!=='function')throw new TypeError('A session listener is required.');startListeners.add(callback);return ()=>startListeners.delete(callback)},
    onPreferences:callback=>{if(typeof callback!=='function')throw new TypeError('A preference listener is required.');preferenceListeners.add(callback);if(initialPreferences)callback(preferenceCopy());return ()=>preferenceListeners.delete(callback)},
    onSessionEnd:callback=>{endListeners.add(callback);return ()=>endListeners.delete(callback)},
    onBeforeSignOut:callback=>{beforeSignOut.add(callback);return ()=>beforeSignOut.delete(callback)}});
})(window);
