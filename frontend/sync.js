/* Immediate edits, encrypted device persistence, and serialized verified Sheet saves. */
(function(root){
 'use strict';
 const clone=v=>JSON.parse(JSON.stringify(v));
 const canonical=v=>JSON.stringify(v===undefined?null:v,(_,value)=>value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))):value);
 const edits={'/api/transaction':['transactions','transaction'],'/api/category':['categories','category'],
  '/api/settlement':['settlements','settlement'],'/api/goal':['goals','goal'],'/api/investment':['investments','investment'],'/api/account':['balances','account']};
 const paths=new Set([...Object.keys(edits),'/api/settings','/api/budget','/api/review','/api/category/archive']);
 const active=r=>![false,0,'FALSE','false','no'].includes(r.included);
 const truth=v=>[true,1,'true','TRUE'].includes(v);
 const number=v=>v===null||v===undefined||v===''?null:Number(v);
 const configured=(s,key)=>{try{return new Set(JSON.parse(s[key]||'[]'))}catch{return new Set()}};
 function summaries(state){
  const settings=state.settings||{},months=[...new Set([...state.transactions,...state.settlements].map(r=>r.date.slice(0,7)))].sort();
  const complete=configured(settings,'income_complete_months'),sharing=configured(settings,'sharing_confirmed_months');
  const zero={neal:configured(settings,'zero_income_neal_months'),partner:configured(settings,'zero_income_partner_months')};
  let cumulative=Number(settings.opening_balance_clp||0),unresolved=!truth(settings.opening_balance_confirmed);
  const clp=r=>{const value=number(r.charged_amount);return r.charged_currency==='CLP'?value:number(r.fx_clp_per_usd)===null?null:value*Number(r.fx_clp_per_usd)};
  const total=rows=>{const values=rows.map(clp);return values.includes(null)?null:values.reduce((sum,v,i)=>sum+v*(rows[i].kind==='refund'?-1:1),0)};
  return months.map(month=>{
   const all=state.transactions.filter(r=>r.date.startsWith(month)),rows=all.filter(active),meaningful=rows.filter(r=>['income','expense','refund'].includes(r.kind));
   const pending=rows.filter(r=>['expense','refund'].includes(r.kind)&&r.sharing==='needs_review').length;
   const missing=meaningful.filter(r=>clp(r)===null).length,coverage=all.filter(r=>!active(r)&&['needs_review','pending','review','open'].includes(String(r.review_status||'').toLowerCase())).length;
   const income={},paid={};for(const p of ['neal','partner']){const rs=rows.filter(r=>r.kind==='income'&&r.person===p);income[p]=rs.length?total(rs):zero[p].has(month)?0:null;paid[p]=total(rows.filter(r=>['expense','refund'].includes(r.kind)&&r.sharing==='shared'&&r.person===p))}
   const inc=Object.values(income).includes(null)?null:income.neal+income.partner,shared=Object.values(paid).includes(null)?null:paid.neal+paid.partner;
   const ratio=inc!==null&&inc>0?income.neal/inc:null,reasons=[];
   if(missing)reasons.push(`${missing} transactions need dated FX`);if(!complete.has(month))reasons.push('Income completeness needs confirmation');
   if(!sharing.has(month)||pending)reasons.push('Shared versus personal spending needs confirmation');if(coverage)reasons.push(`${coverage} excluded source records need purpose or coverage review`);if(ratio===null)reasons.push('Income ratio unavailable');
   const raw=shared!==null&&ratio!==null?shared*ratio-paid.neal:null,obligation=!reasons.length&&raw!==null?Math.sign(raw)*Math.floor(Math.abs(raw)+.5+1e-8):null;
   const repaid=state.settlements.filter(r=>r.date.startsWith(month)).reduce((sum,r)=>sum+Number(r.amount_clp)*(r.from_person==='neal'?1:-1),0);
   if(obligation===null)unresolved=true;else cumulative+=obligation-repaid;
   const expense=total(rows.filter(r=>['expense','refund'].includes(r.kind)));
   return {month,income_neal_clp:income.neal,income_partner_clp:income.partner,income_clp:inc,expense_clp:expense,shared_clp:shared,shared_paid_neal_clp:paid.neal,shared_paid_partner_clp:paid.partner,neal_ratio:ratio,obligation_neal_clp:obligation,repaid_neal_clp:repaid,month_remaining_neal_clp:obligation===null?null:obligation-repaid,cumulative_neal_clp:unresolved?null:cumulative,unresolved,surplus_clp:inc===null||expense===null?null:inc-expense,reasons,missing_fx_count:missing,pending_sharing_count:pending};
  });
 }
 function normalized(path,payload,state){
  const value=clone(payload);delete value.version;delete value._request_id;
  const pair=edits[path];if(pair){const row=value[pair[1]];if(!row||typeof row!=='object')throw Error('Choose a record to save.');if(!row.id)row.id=pair[1].slice(0,3)+'-'+root.crypto.randomUUID();
   for(const field of ['amount','charged_amount','fx_clp_per_usd','monthly_contribution','balance','annual_return','annual_fee','equity_fraction','single_asset_fraction','target','saved','amount_clp'])if(Object.hasOwn(row,field))row[field]=number(row[field]);
   for(const field of ['included','archived'])if(Object.hasOwn(row,field))row[field]=field==='archived'?truth(row[field]):![false,0,'FALSE','false','no'].includes(row[field]);
   for(const field of ['merchant','name','notes'])if(typeof row[field]==='string')row[field]=row[field].trim();
   const old=state[pair[0]]?.find(r=>r.id===row.id);if(old)for(const field of Object.keys(row))if(field!=='id'&&canonical(old[field])===canonical(row[field]))delete row[field];
  }
  return value;
 }
 function project(state,path,payload){
  const next={...state,settings:{...state.settings}},pair=edits[path];
  const upsert=(key,row)=>{const list=[...(next[key]||[])];next[key]=list;const i=list.findIndex(x=>x.id===row.id);if(i<0)list.push(row);else list[i]={...list[i],...row}};
  if(pair){const row=clone(payload[pair[1]]);upsert(pair[0],row);
   if(path==='/api/investment'&&row.as_of&&row.balance!==null&&row.balance!==undefined&&!next.investment_history.some(x=>x.account_id===row.id))next.investment_history=[...next.investment_history,{date:row.as_of,account_id:row.id,balance:row.balance,contribution:null,net_gain:null}];
  }else if(path==='/api/settings')Object.assign(next.settings,payload.settings);
  else if(path==='/api/category/archive')upsert('categories',{id:payload.id,archived:true});
  else if(path==='/api/budget'){
   const budgets=JSON.parse(next.settings.monthly_budgets_v1||'{"version":1,"months":{}}');budgets.months[payload.month]??={};budgets.months[payload.month][payload.person]={currency:payload.currency,goals:payload.goals};next.settings.monthly_budgets_v1=JSON.stringify(budgets);
  }else if(path==='/api/review'){
   upsert('review',payload.review);if(payload.transaction){const old=next.transactions.find(x=>x.id===payload.transaction.id),row={...payload.transaction};if(old&&old.currency===old.charged_currency&&old.amount===old.charged_amount&&row.charged_amount!==undefined)row.amount=row.charged_amount;upsert('transactions',row)}
  }
  next.monthly_summaries=summaries(next);next.months=[...new Set([...next.transactions,...next.settlements].map(r=>r.date.slice(0,7)))].sort();
  return next;
 }
 function touched(state,path,payload){
  const pairs=edits[path]?[edits[path]]:path==='/api/review'?[['review','review'],...(payload.transaction?[['transactions','transaction']]:[])]:[];
  if(path==='/api/settings')return [['settings',clone(payload.settings),clone(state.settings)]];
  if(path==='/api/budget'){const value=JSON.parse(state.settings.monthly_budgets_v1||'{"months":{}}');return [['budget',payload.month+':'+payload.person,clone(value.months?.[payload.month]?.[payload.person]??null)]]}
  if(path==='/api/category/archive')return [['categories',{id:payload.id,archived:true},clone(state.categories.find(x=>x.id===payload.id)||null)]];
  return pairs.map(([key,field])=>[key,clone(payload[field]),clone(state[key].find(x=>x.id===payload[field].id)||null)]);
 }
 function conflict(intent,state){
  const equal=(a,b)=>canonical(a??null)===canonical(b??null);
  for(const [key,desired,original] of intent.before||[]){
   if(key==='budget'){const [month,person]=desired.split(':'),now=JSON.parse(state.settings.monthly_budgets_v1||'{"months":{}}').months?.[month]?.[person]??null,want={currency:intent.payload.currency,goals:intent.payload.goals};if(!equal(now,original)&&!equal(now,want))return true;continue}
   const now=key==='settings'?state.settings:state[key]?.find(r=>r.id===desired.id)||null;
   if(!original&&now){if(Object.keys(desired).some(k=>!equal(now[k],desired[k])))return true;continue}
   if(original&&!now)return true;
   for(const field of Object.keys(desired)){if(field==='id')continue;if(!equal(now?.[field],original?.[field])&&!equal(now?.[field],desired[field]))return true;}
  }
  return false;
 }
 function vault(session){
  let database,key;const prefix=session.ownerKey+':';
  const opened=new Promise((resolve,reject)=>{if(!root.indexedDB){reject(Error('Device storage is unavailable.'));return;}const r=root.indexedDB.open('casa-device-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('vault');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  function rawTransaction(mode,fn){return new Promise((resolve,reject)=>{const tx=database.transaction('vault',mode),store=tx.objectStore('vault');let result;fn(store,v=>result=v);tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Device save was interrupted.'))})}
  // A non-extractable browser key survives session renewal so unsynced edits are
  // recoverable after Today expires. Only a verified owner initializes this vault.
  const initialized=(async()=>{database=await opened;const generated=await root.crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);key=await rawTransaction('readwrite',(store,done)=>{const r=store.get(prefix+'key');r.onsuccess=()=>{const value=r.result||generated;if(!r.result)store.put(value,prefix+'key');done(value)}})})();
  async function transaction(mode,fn){await initialized;return rawTransaction(mode,fn)}
  async function encode(value,retained){await initialized;const iv=root.crypto.getRandomValues(new Uint8Array(12));return {iv,expiresAt:retained?null:Math.max(session.expiresAt,Date.now()+86400000),bytes:await root.crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(session.ownerKey)},key,new TextEncoder().encode(JSON.stringify(value)))}}
  async function decode(value){if(!value||value.expiresAt!==null&&value.expiresAt<=Date.now())return null;try{return JSON.parse(new TextDecoder().decode(await root.crypto.subtle.decrypt({name:'AES-GCM',iv:value.iv,additionalData:new TextEncoder().encode(session.ownerKey)},key,value.bytes)))}catch{throw Error('A retained device change could not be opened. Keep this browser data and contact support before clearing it.')}}
  return {
   async get(name){const value=await transaction('readonly',(store,done)=>{const r=store.get(prefix+name);r.onsuccess=()=>done(r.result)});return decode(value)},
   async put(name,value){const encoded=await encode(value,name.startsWith('edit:'));encoded.updatedAt=value.at||Date.now();return transaction('readwrite',store=>{if(name==='state'){const r=store.get(prefix+name);r.onsuccess=()=>{if(!r.result||r.result.updatedAt<=encoded.updatedAt)store.put(encoded,prefix+name)}}else store.put(encoded,prefix+name)})},
   async remove(name){return transaction('readwrite',store=>store.delete(prefix+name))},
   async entries(){const records=await transaction('readonly',(store,done)=>{const result=[],r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(!c){done(result);return;}if(String(c.key).startsWith(prefix+'edit:'))result.push(c.value);c.continue()}});return (await Promise.all(records.map(decode))).filter(Boolean).sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))},
   async clear(){return transaction('readwrite',store=>{const r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith(prefix))c.delete();c.continue()}}})}
  };
 }
 function create(options){
  const disk=options.vault;let base=null,pending=[],busy=false,paused=false,message='',lastSaved=null,initialized=false,timer=null,epoch=0,lastIntentAt=0;
  let notifyChannel;try{notifyChannel=new root.BroadcastChannel('casa-sync-v1');notifyChannel.onmessage=event=>{if(event.data?.owner===options.ownerKey)void restorePending(event.data.type==='confirmed')}}catch{}
  const signal=(type='changed')=>notifyChannel?.postMessage({owner:options.ownerKey,type});
  function current(){let value={...base,state:base.state};for(const item of pending)value.state=project(value.state,item.path,item.payload);if(pending.length)value.sync={pending:pending.length};return value}
  function status(){return {pending:pending.length,busy,paused,message,lastSaved,items:clone(pending)}}
  function publish(update=true){const value=base&&update?current():null;if(value)options.onState?.(value);options.onStatus?.(status());return value;}
  async function snapshot(){if(base)try{await disk.put('state',{result:clone(base),at:Date.now()})}catch{/* Fresh network state remains usable if device cache is unavailable. */}}
  async function restorePending(confirmed=false){try{pending=await disk.entries();if(confirmed&&!busy){const ticket=epoch,result=await options.request('/api/state');await accept(result,ticket);}publish();if(initialized&&!paused)void flush()}catch{}}
  async function initialize(){const cached=await disk.get('state');pending=await disk.entries();if(cached){base=cached.result;base.state.storage={...base.state.storage,device_cache:true,revalidating:true};publish()}initialized=true;return base?current():null}
  async function accept(result,expectedEpoch){if(expectedEpoch!==undefined&&expectedEpoch!==epoch)return base?current():null;const value=result.state?result:{state:result};base=clone(value);epoch++;base.state.storage={...base.state.storage,device_cache:false,revalidating:false};publish();void snapshot();if(pending.length&&!paused)void flush();return current()}
  async function enqueue(path,body){
   if(!base)throw Error('Wait for your records to open before making changes.');
   const displayed=current().state,payload=normalized(path,body,displayed);lastIntentAt=Math.max(Date.now(),lastIntentAt+1);const intent={id:root.crypto.randomUUID(),path,payload,at:lastIntentAt,before:touched(displayed,path,payload),attempts:0};
   try{await disk.put('edit:'+intent.id,intent)}catch{throw Error('This device could not retain your change. Keep this form open and try again.');}
   pending.push(intent);if(!paused)message='';const result=publish();signal();void flush();return result;
  }
  async function drain(){
   if(busy||paused||!base||!pending.length)return;busy=true;publish(false);
   try{
    pending=await disk.entries();
    while(pending.length&&!paused){
     const item=pending[0];
     if(root.navigator?.onLine===false){message='Saved on this device · waiting for a connection';break}
     if(conflict(item,base.state)){paused=true;message='This field changed elsewhere. Review your pending edit before retrying.';publish();break}
     try{
      const result=await options.request(item.path,{...item.payload,version:base.state.version,_request_id:item.id});
      base=clone(result.state?result:{state:result});epoch++;await disk.remove('edit:'+item.id);pending=await disk.entries();message='';lastSaved=Date.now();await snapshot();publish();signal('confirmed');
     }catch(error){
      if(error.status===409&&!/finishing another operation|Another Casa operation is running/.test(error.message)){
       try{const fresh=await options.request('/api/state');const state=fresh.state||fresh;
        if(!conflict(item,state)){base=clone(fresh.state?fresh:{state:fresh});item.attempts++;await disk.put('edit:'+item.id,item);if(item.attempts<3){publish();continue}}
       }catch{/* Keep the exact saved change available for review. */}
       paused=true;message='The Sheet changed. Review your pending edit before retrying.';
      }else if(error.status===409&&/finishing another operation|Another Casa operation is running/.test(error.message)){message='Waiting for the current analysis to finish · your edit is retained';timer=setTimeout(()=>void flush(),3500);}
      else if(error.status===400||error.status===403||error.status===422){paused=true;message=error.message;}
      else{item.attempts++;await disk.put('edit:'+item.id,item);message=error.message||'Connection interrupted. Your change is retained on this device.';if(item.attempts>=3)paused=true;else timer=setTimeout(()=>void flush(),Math.min(15000,2000*item.attempts));}
      publish();break;
     }
    }
   }catch(error){paused=true;message=error.message||'Device changes need attention. Your queued edits are retained.';}
   finally{busy=false;publish(false);}
  }
  async function flush(){
   if(busy||paused||!pending.length)return;
   if(root.navigator?.locks){await root.navigator.locks.request('casa-write-'+options.ownerKey,{ifAvailable:true},async lock=>{if(lock)await drain();else timer=setTimeout(()=>void flush(),2000)})}
   else await drain();
  }
  async function settle(maxMs=60000){pending=await disk.entries();const start=Date.now();void flush();while(pending.length&&Date.now()-start<maxMs){if(paused||root.navigator?.onLine===false)break;await new Promise(resolve=>setTimeout(resolve,100))}if(pending.length)throw Error('Your changes are retained on this device. Finish syncing before refreshing Inbox or signing out.');}
  async function retry(){paused=false;message='';for(const item of pending){item.attempts=0;await disk.put('edit:'+item.id,item)}publish();void flush();}
  async function discard(id){if(busy)throw Error('Wait for the current save to finish before removing a pending edit.');await disk.remove('edit:'+id);pending=await disk.entries();paused=false;message='';publish();signal();void flush();}
  root.addEventListener?.('online',()=>{if(!paused)void flush()});
  return {initialize,accept,enqueue,flush,settle,retry,discard,status,current,epoch:()=>epoch,suspend(){paused=true;clearTimeout(timer);notifyChannel?.close();},clearSnapshot:()=>disk.remove('state'),async clear(){const erase=async()=>{if((await disk.entries()).length)throw Error('Pending changes must finish syncing before device data can be cleared.');clearTimeout(timer);await disk.clear();notifyChannel?.close();base=null;pending=[];};if(root.navigator?.locks)return root.navigator.locks.request('casa-write-'+options.ownerKey,erase);return erase();}};
 }
 let controller=null;
 const handles=path=>paths.has(path);
 root.CasaSync={handles,project,summaries,conflict,create,vault,
  async configure(options){const session=await root.CasaWeb.getCacheKey();if(!session)return null;const candidate=create({...options,ownerKey:session.ownerKey,vault:vault(session)});controller?.suspend();controller=candidate;try{const result=await candidate.initialize();if(controller!==candidate){candidate.suspend();return null;}return result}catch(error){candidate.suspend();if(controller===candidate){controller=null;options.onStatus?.({pending:0,busy:false,paused:true,message:error.message})}return null}},
  accept:(...args)=>controller?.accept(...args),enqueue:(...args)=>controller.enqueue(...args),settle:(...args)=>controller?.settle(...args),epoch:()=>controller?.epoch(),
  status:()=>controller?.status()||{pending:0,busy:false,paused:false},retry:()=>controller?.retry(),discard:id=>controller?.discard(id),clear:()=>controller?.clear(),suspend:()=>controller?.suspend(),clearSnapshot:()=>controller?.clearSnapshot(),isConfigured:()=>!!controller};
})(window);
