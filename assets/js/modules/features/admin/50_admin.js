
import { q } from "../../core/01_dom.js";
import { getAccess } from "../../firebase/10_access.js";

export function initAdmin(){
  const access = getAccess();
  if(!access.isAdmin) return;

  const panel = q('#view-admin');
  if(!panel) return;

  panel.innerHTML = `
    <div class="mk-card">
      <div class="mk-h2">Admin dashboard</div>
      <div class="mk-grid2 mk-gap10" id="adminActions">
        <button class="btn btn-neon" data-act="design">Design</button>
        <button class="btn btn-neon" data-act="premium">Premium заявки</button>
        <button class="btn btn-neon" data-act="logs">Логи</button>
        <button class="btn btn-neon" data-act="participants">Участники</button>
        <button class="btn btn-neon" data-act="search">Поиск по нику</button>
        <button class="btn btn-neon" data-act="special">Спец‑профили</button>
        <button class="btn btn-neon" data-act="perks">Админ‑плюшки</button>
      </div>
    </div>
    <div id="adminPanelBody"></div>
  `;

  panel.querySelectorAll('[data-act]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const act = btn.getAttribute('data-act');
      // Lazy-load only when needed
      if(act==='design'){ const m = await import('./56_design.js'); return m.renderDesign(); }
      if(act==='premium'){ const m = await import('./54_premiumRequests.js'); return m.renderPremiumRequests(); }
      if(act==='logs'){ const m = await import('./53_logs.js'); return m.renderLogs(); }
      if(act==='participants'){ const m = await import('./55_participants.js'); return m.renderParticipants(); }
      if(act==='search'){ const m = await import('./52_nickSearch.js'); return m.renderNickSearch(); }
      if(act==='special'){ const m = await import('./52_nickSearch.js'); return m.renderNickSearch(); }
      if(act==='perks'){
        const body = q('#adminPanelBody');
        if(body) body.innerHTML = '<div class="mk-card"><div class="mk-h3">Admin perks</div><div class="mk-muted">Placeholders: mass notify, cleanup, etc.</div></div>';
      }
    });
  });
}
