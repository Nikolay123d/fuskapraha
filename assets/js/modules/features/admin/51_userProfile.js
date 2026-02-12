
import { q, qs } from "../../core/01_dom.js";
import { getAccess } from "../../firebase/10_access.js";

function normNick(s){ return String(s||'').trim().toLowerCase().replace(/\s+/g,' '); }

export async function openAdminUser(uid){
  const root = q('#adminPanelBody');
  if(!root) return;
  root.innerHTML = '<div class="mk-card"><div class="mk-muted">Loading user…</div></div>';

  const db = firebase.database();
  const [pubSnap, privSnap, accessSnap] = await Promise.all([
    db.ref('usersPublic/'+uid).get(),
    db.ref('users/'+uid).get(),
    db.ref('mk_access/'+uid).get().catch(()=>null)
  ]);

  const pub = pubSnap.exists()? pubSnap.val() : {};
  const priv = privSnap.exists()? privSnap.val() : {};
  const acc = accessSnap && accessSnap.exists? (accessSnap.exists()? accessSnap.val():{}) : {};

  const access = getAccess();
  if(!access.isAdmin){ root.innerHTML = '<div class="mk-card">No access</div>'; return; }

  const nick = pub.nick || '(no nick)';
  const email = priv.email || '(hidden)';
  const role = pub.role || priv.role || 'user';
  const plan = priv.plan || pub.plan || 'free';

  root.innerHTML = `
    <div class="mk-card">
      <div class="mk-row mk-between">
        <div>
          <div class="mk-h3">User: <span class="mk-mono">${uid}</span></div>
          <div class="mk-muted">Nick: <b>${nick}</b> · Role: <b>${role}</b> · Plan: <b>${plan}</b></div>
          <div class="mk-muted">Email: ${email}</div>
        </div>
        <div class="mk-col mk-gap8">
          <button class="btn btn-neon" id="btnBan">Ban 24h</button>
          <button class="btn btn-neon" id="btnMute">Mute 2h</button>
          <button class="btn btn-neon" id="btnDmBan">DM-ban 24h</button>
        </div>
      </div>
    </div>

    <div class="mk-card">
      <div class="mk-h3">Audit trail (minimal)</div>
      <div id="auditTrail" class="mk-muted">Loading…</div>
    </div>
  `;

  function logAction(type, payload){
    const me = firebase.auth().currentUser?.uid || 'anon';
    const ts = Date.now();
    return db.ref('audit/'+uid).push({ ts, by: me, type, payload });
  }

  const banBtn = q('#btnBan');
  const muteBtn = q('#btnMute');
  const dmBanBtn = q('#btnDmBan');

  const now = Date.now();
  banBtn && banBtn.addEventListener('click', async ()=>{
    const until = now + 24*60*60*1000;
    await db.ref('bans/'+uid).set({ until });
    await logAction('ban', { until });
    alert('Banned 24h');
  });

  muteBtn && muteBtn.addEventListener('click', async ()=>{
    const until = Date.now() + 2*60*60*1000;
    await db.ref('mutes/'+uid).set({ until });
    await logAction('mute', { until });
    alert('Muted 2h');
  });

  dmBanBtn && dmBanBtn.addEventListener('click', async ()=>{
    const until = Date.now() + 24*60*60*1000;
    await db.ref('dmBans/'+uid).set({ until });
    await logAction('dmBan', { until });
    alert('DM-banned 24h');
  });

  // audit list (last 30)
  try{
    const snap = await db.ref('audit/'+uid).orderByChild('ts').limitToLast(30).get();
    const items = [];
    snap.forEach(ch => items.push(ch.val()));
    items.sort((a,b)=> (b.ts||0)-(a.ts||0));
    const el = q('#auditTrail');
    if(el){
      el.innerHTML = items.length ? items.map(a=>`<div class="mk-row mk-between"><span>${new Date(a.ts).toLocaleString()}</span><span class="mk-mono">${a.type}</span></div>`).join('') : '<div class="mk-muted">No actions.</div>';
    }
  }catch(e){
    const el = q('#auditTrail'); if(el) el.textContent = 'Audit load failed';
  }
}
