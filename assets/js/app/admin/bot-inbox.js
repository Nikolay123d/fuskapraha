// Admin: bot inbox modal (read-only for admins)
// Extracted from former Stage5 monolith.

(function mkBotInboxModule(){
  if(window.__MK_BOT_INBOX__) return;
  window.__MK_BOT_INBOX__ = true;

  // --- Bot Inbox modal (Admin) ---
    let __BOT_INBOX_MODAL_WIRED = false;
    let __BOT_INBOX_MODAL_STATE = { botUid:'', limit:50, items:[] };

    async function _botInboxFetch(adminUid, botUid, limit){
      const snap = await db.ref('botsInbox/'+adminUid+'/'+botUid).orderByChild('ts').limitToLast(limit).get();
      const vv = snap.val()||{};
      const items = Object.keys(vv).map(k=>({ id:k, ...(vv[k]||{}) }))
        .sort((a,b)=> ((b.ts||0) - (a.ts||0)));
      return items;
    }

    function _normBotInboxItem(it){
      const x = it || {};
      const fromUid = x.fromUid || x.from || '';
      const fromNick = x.fromNick || '';
      const ts = +x.ts || 0;
      const type = x.type || ((typeof PREMIUM_BOT_UID!=='undefined' && __BOT_INBOX_MODAL_STATE.botUid===PREMIUM_BOT_UID) ? 'payment' : 'other');
      return { ...x, fromUid, fromNick, ts, type };
    }

    function _renderBotInboxModal(){
      const box=document.getElementById('botInboxFeedModal');
      const info=document.getElementById('botInboxInfo');
      if(!box) return;

      const term = (document.getElementById('botInboxSearch')?.value||'').toString().trim().toLowerCase();
      const all = (__BOT_INBOX_MODAL_STATE.items||[]).map(_normBotInboxItem);

      let list = all;
      if(term){
        list = all.filter(it=>{
          const n = (it.fromNick||'').toString().toLowerCase();
          const u = (it.fromUid||'').toString().toLowerCase();
          const t = (it.text||'').toString().toLowerCase();
          return n.includes(term) || u.includes(term) || t.includes(term);
        });
      }

      try{
        if(info){
          const shown=list.length, total=all.length;
          info.textContent = total ? (shown + '/' + total) : '';
        }
      }catch(e){}

      box.innerHTML='';
      if(!list.length){
        box.innerHTML='<div class="muted">Zatím žádné zprávy.</div>';
        return;
      }

      const adminUid = auth.currentUser?.uid || '';
      const botUid = __BOT_INBOX_MODAL_STATE.botUid;

      for(const it0 of list){
        const it = _normBotInboxItem(it0);
        const el=document.createElement('div'); el.className='msg';

        const nick = it.fromNick || it.fromUid || 'Uživatel';
        const tsStr = it.ts ? new Date(it.ts).toLocaleString() : '';
        const typeStr = it.type ? String(it.type) : '';

        el.innerHTML = `
          <div class="ava" data-uid="${esc(it.fromUid||'')}"><img src="${esc(window.DEFAULT_AVATAR)}" alt="" loading="lazy"></div>
          <div class="bubble" style="width:100%">
            <div class="name"><b>${esc(nick)}</b> <span class="muted">${esc(tsStr)}</span>
              ${typeStr?`<span class="pill" style="margin-left:6px">${esc(typeStr)}</span>`:''}
            </div>
            ${it.text?`<div class="text">${esc(it.text)}</div>`:''}
            ${it.img?`<div class="text"><img src="${esc(it.img)}"></div>`:''}
            <div class="actions">
              <button data-act="open">Otevřít DM</button>
              <button data-act="del">Smazat</button>
            </div>
          </div>
        `;

        // Lazy-fill avatar (optional)
        try{
          const imgEl = el.querySelector('.ava img');
          if(imgEl && it.fromUid){
            getUser(it.fromUid).then(u=>{ if(u && u.avatar) imgEl.src = u.avatar; }).catch(()=>{});
          }
        }catch(e){}

        el.addEventListener('click', async (e)=>{
          const act=e.target?.dataset?.act; if(!act) return;
          if(act==='open' && it.fromUid){
            try{ closeModal('modalBotInbox'); }catch(e){}
            try{ openDMRoom(adminUid, it.fromUid); }catch(e){}
            try{ showView('view-dm'); }catch(e){}
          }
          if(act==='del'){
            if(!botUid || !it.id) return;
            try{ await db.ref('botsInbox/'+adminUid+'/'+botUid+'/'+it.id).remove(); }catch(e){}
            __BOT_INBOX_MODAL_STATE.items = (__BOT_INBOX_MODAL_STATE.items||[]).filter(x=>String(x.id||'')!==String(it.id));
            _renderBotInboxModal();
          }
        });

        box.appendChild(el);
      }
    }

    async function loadBotInboxModal(opts={}){
      const me=auth.currentUser; if(!isAdminUser(me)) return toast('Jen admin');
      const adminUid=me.uid;

      const sel=document.getElementById('botInboxSelect');
      const box=document.getElementById('botInboxFeedModal');
      const moreBtn=document.getElementById('botInboxMore');
      const clearBtn=document.getElementById('botInboxClear');
      const search=document.getElementById('botInboxSearch');

      if(!sel || !box) return;

      // build bot list (plus system/premium bot)
      const s=await db.ref('bots').limitToLast(50).get(); const v=s.val()||{};
      const ids=Object.keys(v);

      sel.innerHTML='';

      // System bot: Premium
      try{
        if(typeof PREMIUM_BOT_UID!=='undefined'){
          const o=document.createElement('option');
          o.value = PREMIUM_BOT_UID;
          o.textContent = 'Bot — Privilegia ('+PREMIUM_BOT_UID+')';
          sel.appendChild(o);
        }
      }catch(e){}

      for(const id of ids){
        const botUid='bot_'+id;
        const opt=document.createElement('option');
        opt.value=botUid;
        opt.textContent = (v[id]?.nick||'Bot')+' ('+botUid+')';
        sel.appendChild(opt);
      }

      if(!sel.options.length){
        sel.innerHTML='<option value="">—</option>';
        box.innerHTML='<div class="muted">Zatím žádní boti.</div>';
        __BOT_INBOX_MODAL_STATE = { botUid:'', limit:50, items:[] };
        _renderBotInboxModal();
        return;
      }

      const setBot = async (botUid, reset=true)=>{
        const b = String(botUid||'').trim();
        if(!b) return;
        if(reset){
          __BOT_INBOX_MODAL_STATE.botUid = b;
          __BOT_INBOX_MODAL_STATE.limit = 50;
        }else{
          __BOT_INBOX_MODAL_STATE.limit = Math.min(1000, (__BOT_INBOX_MODAL_STATE.limit||50) + 50);
        }

        try{
          box.innerHTML='<div class="muted">Načítám…</div>';
          const items = await _botInboxFetch(adminUid, b, __BOT_INBOX_MODAL_STATE.limit);
          __BOT_INBOX_MODAL_STATE.items = items;
        }catch(e){
          console.warn(e);
          __BOT_INBOX_MODAL_STATE.items = [];
        }
        _renderBotInboxModal();
      };

      // Wire once
      if(!__BOT_INBOX_MODAL_WIRED){
        __BOT_INBOX_MODAL_WIRED = true;

        sel.addEventListener('change', ()=>{ setBot(sel.value, true); });
        search?.addEventListener('input', ()=>{ _renderBotInboxModal(); });

        moreBtn?.addEventListener('click', ()=>{ if(!sel.value) return; setBot(sel.value, false); });

        clearBtn?.addEventListener('click', async ()=>{
          const me2=auth.currentUser; if(!isAdminUser(me2)) return;
          const botUid = sel.value;
          if(!botUid) return;
          if(!confirm('Vyčistit inbox pro '+botUid+'?')) return;
          await db.ref('botsInbox/'+me2.uid+'/'+botUid).remove();
          toast('Vyčištěno');
          setBot(botUid, true);
        });
      }

      // restore selection (if requested)
      try{
        const wanted = (opts && opts.botUid) ? String(opts.botUid) : '';
        if(wanted) sel.value = wanted;
      }catch(e){}

      // initial load
      await setBot(sel.value, true);
    }

    // Expose for FAB menu / other modules
    try{ window.loadBotInboxModal = loadBotInboxModal; }catch(e){}

  async function botTick(){
      const me=auth.currentUser; if(!isAdminUser(me)) return;
      const s=await db.ref('bots').limitToLast(50).get(); const v=s.val()||{};
      const now=Date.now();
      for(const [id,b] of Object.entries(v)){
        if(!b || !b.enabled) continue;
        const last = +b.lastTs || 0;
        const intervalMs = Math.max(1,(+b.intervalMin||15))*60*1000;
        if(now-last < intervalMs) continue;
        const city = (b.city||'praha');
        // create /usersPublic for botId (virtual)
        const botUid = 'bot_'+id;
        await db.ref('usersPublic/'+botUid).update({nick:b.nick||'Bot', avatar:b.avatar||window.DEFAULT_AVATAR, role:'bot', plan:'bot'});
        await db.ref('messages/'+city).push({by:botUid, ts:now, text:b.text||'', img:b.img||''});
        await db.ref('bots/'+id).update({lastTs:now});
      }
    }

})();
