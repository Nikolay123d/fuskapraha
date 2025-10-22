/* Stage 3 uses Stage 2 admin; keep as-is */
function isAdmin(){const u=auth.currentUser;return!!(u&&(window.ADMIN_EMAILS||[]).includes((u.email||'').toLowerCase()));}
function isCreator(){const u=auth.currentUser;return!!(u&&(u.email||'').toLowerCase()===window.CREATOR_EMAIL.toLowerCase());}
auth.onAuthStateChanged(u=>{if(isAdmin()){bindAdmin();}});
function bindAdmin(){
  $('#cleanChat').onclick=async()=>{if(!isAdmin())return alert('Jen pro adminy');const city=($('#cityInput').value||'praha').toLowerCase();const snap=await db.ref('messages/'+city).limitToLast(1000).get();const rows=snap.val()||{};const keys=Object.keys(rows);await Promise.all(keys.map(id=>db.ref('messages/'+city+'/'+id).remove()));await log('cleanChat',{city,count:keys.length});alert('Smazáno: '+keys.length);};
  $('#refreshUsers').onclick=loadAdminUsers;$('#applyRole').onclick=applyRoleToFilter;$('#ban30').onclick=()=>banFiltered(30);$('#unban').onclick=()=>unbanFiltered();$('#refreshPayments').onclick=loadPayments;$('#createAdAcc').onclick=createAdAcc;$('#refreshBots').onclick=loadAdAccs;$('#runScheduler').onclick=runSchedulerMVP;
  loadAdminUsers();loadPayments();loadAdAccs();loadLogs();
}
async function loadAdminUsers(){const box=$('#adminUsers');box.innerHTML='';const s=await db.ref('usersPublic').get();const all=s.val()||{};const q=($('#adminSearch')?.value||'').toLowerCase();Object.entries(all).forEach(([uid,up])=>{if(q&&!((up.name||'').toLowerCase().includes(q)||uid.includes(q)||(up.email||'').toLowerCase().includes(q)))return;const row=document.createElement('div');row.className='msg';row.dataset.uid=uid;row.innerHTML=`<div class="ava"><img src="${up.avatar||window.INIT_AVATAR}"></div><div class="bubble"><div class="name">${up.name||uid} · <span class="muted">${up.role||'user'}</span></div><div class="muted">${up.email||''}</div></div>`;box.appendChild(row);});const inp=$('#adminSearch');if(inp)inp.oninput=loadAdminUsers;}
async function applyRoleToFilter(){if(!isAdmin())return;const role=$('#roleSelect').value;const q=($('#adminSearch')?.value||'').toLowerCase();const s=await db.ref('usersPublic').get();const all=s.val()||{};const updates={};Object.entries(all).forEach(([uid,up])=>{if(q&&!((up.name||'').toLowerCase().includes(q)||uid.includes(q)||(up.email||'').toLowerCase().includes(q)))return;updates['usersPublic/'+uid+'/role']=role;});await db.ref().update(updates);await log('applyRole',{role,filter:q||'*'});alert('Role nastaveny (filter='+(q||'*')+')');loadAdminUsers();}
async function banFiltered(mins){if(!isAdmin())return;const q=($('#adminSearch')?.value||'').toLowerCase();const s=await db.ref('usersPublic').get();const all=s.val()||{};const until=Date.now()+mins*60*1000;const updates={};Object.entries(all).forEach(([uid,up])=>{if(q&&!((up.name||'').toLowerCase().includes(q)||uid.includes(q)||(up.email||'').toLowerCase().includes(q)))return;updates['bans/'+uid]={until,by:auth.currentUser.email||'admin',reason:'admin-30min'};});await db.ref().update(updates);await log('ban',{mins,filter:q||'*'});alert('Ban hotovo');}
async function unbanFiltered(){if(!isAdmin())return;const q=($('#adminSearch')?.value||'').toLowerCase();const s=await db.ref('usersPublic').get();const all=s.val()||{};const updates={};Object.entries(all).forEach(([uid,up])=>{if(q&&!((up.name||'').toLowerCase().includes(q)||uid.includes(q)||(up.email||'').toLowerCase().includes(q)))return;updates['bans/'+uid]=null;});await db.ref().update(updates);await log('unban',{filter:q||'*'});alert('Rozban hotovo');}
async function loadPayments(){const box=$('#paymentsBox');box.innerHTML='';const s=await db.ref('payments/requests').get();const byUser=s.val()||{};for(const uid in byUser){const user=(await db.ref('usersPublic/'+uid).get()).val()||{};const group=byUser[uid]||{};Object.entries(group).forEach(([rid,req])=>{const el=document.createElement('div');el.className='msg';el.innerHTML=`<div class="bubble"><div class="name">${user.name||uid} · <span class="muted">${uid}</span></div><div>${req.plan||'premium'} — ${req.amount||'?'} Kč · ${new Date(req.ts||Date.now()).toLocaleString('cs-CZ')}</div><div><a href="${req.qrUrl||'#'}" target="_blank">QR</a> · VS:${req.vs||'-'} · Zpráva:${req.msg||'-'}</div><div class="row"><button data-approve="${uid},${rid}">Schválit</button><button data-reject="${uid},${rid}">Zamítnout</button></div></div>`;box.appendChild(el);});}box.onclick=async e=>{const ap=e.target.dataset.approve;const rj=e.target.dataset.reject;if(ap){const [uid,rid]=ap.split(',');await approvePayment(uid,rid);loadPayments();}if(rj){const [uid,rid]=rj.split(',');await rejectPayment(uid,rid);loadPayments();}};}
async function approvePayment(uid,rid){await db.ref('usersPublic/'+uid+'/premium').set(true);await db.ref('payments/requests/'+uid+'/'+rid+'/status').set('approved');await log('paymentApprove',{uid,rid});}
async function rejectPayment(uid,rid){await db.ref('payments/requests/'+uid+'/'+rid+'/status').set('rejected');await log('paymentReject',{uid,rid});}
async function createAdAcc(){if(!isCreator())return alert('Jen tvůrce');const snap=await db.ref('usersPublic').orderByChild('ad').equalTo(true).get();const exists=snap.val()||{};if(Object.keys(exists).length>=10)return alert('Max 10 reklamních účtů');const name=prompt('Jméno účtu (REKLAMA)','PromoBot');if(!name)return;const avatar=prompt('URL avataru',window.INIT_AVATAR)||window.INIT_AVATAR;const obj={name,avatar,role:'user',ad:true,createdAt:Date.now()};await db.ref('usersPublic').push(obj);await log('adCreate',{name});loadAdAccs();}
async function loadAdAccs(){const box=$('#adAccounts');box.innerHTML='';const s=await db.ref('usersPublic').orderByChild('ad').equalTo(true).get();const ads=s.val()||{};for(const id in ads){const b=ads[id];const conf=(await db.ref('bots/'+id).get()).val()||{everyMin:30,active:false,text:'',autoReplies:[]};const el=document.createElement('div');el.className='msg';el.innerHTML=`<div class="ava"><img src="${b.avatar||window.INIT_AVATAR}"></div><div class="bubble"><div class="name">${b.name} · <span class="reklama">REKLAMA</span></div><div class="muted">every ${conf.everyMin||30} min — active: ${!!conf.active}</div><div class="row"><button data-edit="${id}">Upravit</button><button data-del="${id}">Smazat</button><button data-run="${id}">Post teď</button></div></div>`;box.appendChild(el);}box.onclick=async e=>{const id=e.target.dataset.edit||e.target.dataset.del||e.target.dataset.run;if(!id)return;if(e.target.dataset.edit){const c=(await db.ref('bots/'+id).get()).val()||{};const every=parseInt(prompt('Minuty mezi posty',c.everyMin||30)||'30',10);const text=prompt('Text příspěvku',c.text||'Dobrý den!');const active=confirm('Aktivovat plánovač?');await db.ref('bots/'+id).update({everyMin:every,text,active});await log('botConfig',{id,every,text,active});loadAdAccs();}else if(e.target.dataset.del){if(confirm('Smazat účet REKLAMA?')){await db.ref('usersPublic/'+id).remove();await db.ref('bots/'+id).remove();await log('adDelete',{id});loadAdAccs();}}else if(e.target.dataset.run){await botPostOnce(id);alert('Odesláno');}};}
async function runSchedulerMVP(){if(!isCreator())return alert('Jen tvůrce');const s=await db.ref('usersPublic').orderByChild('ad').equalTo(true).get();const ads=s.val()||{};const now=Date.now();for(const id in ads){const conf=(await db.ref('bots/'+id).get()).val()||{};if(conf.active&&conf.everyMin){const last=(await db.ref('bots/'+id+'/lastTs').get()).val()||0;if(now-last>conf.everyMin*60*1000){await botPostOnce(id);}}}await log('schedulerRun',{});alert('Scheduler proběhl (MVP)');}
async function botPostOnce(id){const conf=(await db.ref('bots/'+id).get()).val()||{text:'Dobrý den!'};const city=($('#cityInput')?.value||'praha').toLowerCase();await db.ref('messages/'+city).push({by:id,text:conf.text||'Dobrý den!',ts:Date.now()});await db.ref('bots/'+id+'/lastTs').set(Date.now());await log('botPost',{id,city});}
async function loadLogs(){const box=$('#logsBox');box.innerHTML='';const s=await db.ref('logs').limitToLast(200).get();const all=s.val()||{};Object.entries(all).forEach(([id,v])=>{const el=document.createElement('div');el.className='msg';el.innerHTML=`<div class="bubble"><div class="name">${v.type||'log'} · <span class="muted">${new Date(v.ts||Date.now()).toLocaleString('cs-CZ')}</span></div><div class="muted">${(v.email||'')}</div><pre style="white-space:pre-wrap">${JSON.stringify(v.data||{},null,2)}</pre></div>`;box.appendChild(el);});}
async function log(type,data){const u=auth.currentUser||{};await db.ref('logs').push({ts:Date.now(),by:u.uid||'?',email:(u.email||'').toLowerCase(),type,data});}



// --- Admin upgrade: roles & privileges ---
const ADMIN = {
  isCreator(){ return (auth.currentUser?.email||'').toLowerCase()=== (window.CREATOR_EMAIL||'').toLowerCase(); },
  async getSuper(){ return (await db.ref('settings/superAdminUid').get()).val()||null; },
  async setSuper(uid){ if(!ADMIN.isCreator()) return alert('Pouze tvůrce'); await db.ref('settings/superAdminUid').set(uid); await log('setSuper', uid); },
  async setRole(uid, role){ if(!(await ADMIN.canManage(uid))) return alert('Nedostatečná práva'); await db.ref('roles/'+uid+'/role').set(role); await log('setRole', uid+':'+role); },
  async setPriv(uid, key, val){ if(!(await ADMIN.canManage(uid))) return alert('Nedostatečná práva'); await db.ref('roles/'+uid+'/'+key).set(val); await log('setPriv', uid+':'+key+'='+val); },
  async canManage(uid){ const me=auth.currentUser; if(!me) return false; if(ADMIN.isCreator()) return true; const superUid = await ADMIN.getSuper(); return me.uid===superUid; },
  async ban(uid, mins=30, reason=''){ if(!(await ADMIN.canModerate())) return alert('Nedostatečná práva'); const until=Date.now()+mins*60*1000; await db.ref('bans/'+uid).set({until,reason}); await log('ban', uid+':'+mins+'m'); },
  async unban(uid){ if(!(await ADMIN.canModerate())) return alert('Nedostatečná práva'); await db.ref('bans/'+uid).remove(); await log('unban', uid); },
  async canModerate(){ if(ADMIN.isCreator()) return true; const superUid=await ADMIN.getSuper(); if((auth.currentUser?.uid)===superUid) return true; const myRole=(await db.ref('roles/'+auth.currentUser.uid+'/role').get()).val(); return myRole==='moderator'; },
  async cleanChat(city){ if(!(await ADMIN.canModerate())) return alert('Nedostatečná práva'); await db.ref('messages/'+(city||'praha')).remove(); await log('cleanChat', city); },
};
async function log(type, msg){ await db.ref('logs').push({by:auth.currentUser?.uid||'?', type, msg, ts:Date.now()}); }

// Hook up UI (if present)
document.addEventListener('DOMContentLoaded', ()=>{
  const listEl = document.querySelector('#adminUsers');
  const searchEl = document.querySelector('#adminSearch');
  async function refresh(){
    const snap = await db.ref('usersPublic').limitToLast(500).get();
    const data = snap.val()||{}; const q=(searchEl?.value||'').toLowerCase();
    listEl.innerHTML='';
    for(const [uid, up] of Object.entries(data)){
      const match = !q || uid.includes(q) || (up.name||'').toLowerCase().includes(q) || (up.email||'').toLowerCase().includes(q);
      if(!match) continue;
      const role = (await db.ref('roles/'+uid+'/role').get()).val()||'user';
      const canBots = (await db.ref('roles/'+uid+'/canBots').get()).val()||false;
      const canEditPlaces = (await db.ref('roles/'+uid+'/canEditPlaces').get()).val()||false;
      const canCleanChat = (await db.ref('roles/'+uid+'/canCleanChat').get()).val()||false;
      const canBan = (await db.ref('roles/'+uid+'/canBan').get()).val()||false;
      const row = document.createElement('div'); row.className='msg';
      row.innerHTML = `<div class="ava"><img src="${up.avatar||window.INIT_AVATAR}"></div>
      <div class="bubble"><div class="name">${up.name||uid} · <span class="muted">${up.email||''}</span> · Role: <b>${role}</b></div>
      <div class="row">
        <button data-role="user" data-uid="${uid}">user</button>
        <button data-role="moderator" data-uid="${uid}">moderator</button>
        <button data-super="${uid}">super-admin</button>
      </div>
      <div class="row">
        <label><input type="checkbox" data-p="canBots" ${canBots?'checked':''}> canBots</label>
        <label><input type="checkbox" data-p="canEditPlaces" ${canEditPlaces?'checked':''}> canEditPlaces</label>
        <label><input type="checkbox" data-p="canCleanChat" ${canCleanChat?'checked':''}> canCleanChat</label>
        <label><input type="checkbox" data-p="canBan" ${canBan?'checked':''}> canBan</label>
      </div>
      <div class="row">
        <button data-ban="${uid}">Ban 30 min</button>
        <button data-unban="${uid}">Unban</button>
        <button data-clean="${uid}">Čistka města</button>
      </div></div>`;
      row.querySelectorAll('[data-role]').forEach(b=> b.onclick=()=> ADMIN.setRole(b.dataset.uid, b.dataset.role));
      row.querySelector('[data-super]').onclick=()=> ADMIN.setSuper(uid);
      row.querySelectorAll('input[type="checkbox"][data-p]').forEach(ch=> ch.onchange=()=> ADMIN.setPriv(uid, ch.dataset.p, ch.checked));
      row.querySelector('[data-ban]').onclick=()=> ADMIN.ban(uid, 30, 'admin');
      row.querySelector('[data-unban]').onclick=()=> ADMIN.unban(uid);
      row.querySelector('[data-clean]').onclick=()=>{ const city=(document.querySelector('#cityInput')?.value||'praha'); ADMIN.cleanChat(city); };
      listEl.appendChild(row);
    }
  }
  document.querySelector('#refreshUsers')?.addEventListener('click', refresh);
  document.querySelector('#applyRole')?.addEventListener('click', refresh);
  refresh();
});
