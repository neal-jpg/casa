/* Google sign-in and transport. Financial records and credentials are memory-only. */
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
  let credential='',expiresTimer=null,unlock,initialState=null,initialPreferences=null;
  const ready=new Promise(resolve=>{unlock=resolve});
  let signedIn=false,signingIn=false;
  const status=text=>{const element=document.getElementById('web-login-status');if(element)element.textContent=text;};
  function clearScreen(){
    credential='';initialState=null;initialPreferences=null;signedIn=false;clearTimeout(expiresTimer);
    const shell=document.getElementById('web-app');if(shell){shell.hidden=true;shell.inert=true;}
    document.getElementById('content')?.replaceChildren();
    document.getElementById('modal')?.close();document.getElementById('modal-content')?.replaceChildren();
    const gate=document.getElementById('web-login');if(gate)gate.hidden=false;
  }
  function signOut(){clearScreen();root.google?.accounts?.id?.disableAutoSelect();root.location.reload();}
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
    if(result.status===401){clearScreen();root.location.reload();throw new Error('Your sign-in expired. Sign in again.');}
    return result;
  }
  root.fetch=apiFetch;
  async function onCredential(response){
    if(signingIn||!response?.credential)return;
    signingIn=true;status('Verifying your access…');
    try{
      // Only the backend decides whether this credential is valid and allowed.
      const result=await nativeFetch(apiBase+'/api/state',{headers:{Authorization:'Bearer '+response.credential},credentials:'omit',cache:'no-store',redirect:'error'});
      if(!result.ok){if(result.status===403)throw new Error('This Google account is not authorized for Casa.');throw new Error('Your sign-in could not be verified. Try again.');}
      initialState=await result.json();initialPreferences=initialState.preferences||null;
      credential=response.credential;signedIn=true;
      // Decoding exp only schedules local cleanup; signature and identity are verified by the server.
      let lifetime=50*60*1000;
      try{const payload=JSON.parse(root.atob(credential.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));lifetime=Math.max(0,Math.min(lifetime,payload.exp*1000-Date.now()));}catch{}
      expiresTimer=setTimeout(signOut,lifetime);
      document.getElementById('web-login').hidden=true;
      const shell=document.getElementById('web-app');shell.hidden=false;shell.inert=false;
      unlock();
    }catch(error){credential='';initialState=null;initialPreferences=null;status(error.message||'Sign-in could not be verified. Try again.');}
    finally{signingIn=false;}
  }
  function loadGoogleSignIn(){
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
    document.getElementById('web-signin-retry').addEventListener('click',loadGoogleSignIn);
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
    loadGoogleSignIn();
  });
  root.CasaWeb=Object.freeze({ready,signOut,isSignedIn:()=>signedIn,
    takeInitialState:()=>{const value=initialState;initialState=null;return value;},
    initialPreferences:()=>initialPreferences});
})(window);
