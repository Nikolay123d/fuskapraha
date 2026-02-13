// Admin: bots management (modalBots) + optional auto-post scheduler
// Clean implementation (no Stage5 legacy IDs).

(function mkAdminBots(){
  if(window.__MK_ADMIN_BOTS__) return;
  window.__MK_ADMIN_BOTS__ = true;

  let _botTimer = null;
  let _selectedBotId = null;
  let _pendingAva = null;
  let _pendingImg = null;
  let _busy = false;

  function _isAdmin(){
    try{ return isAdminUser(auth.currentUser); }catch(e){ return false; }
  }

  function _lockBtn(btn, ms=900){
    if(!btn) return;
    if(btn.disabled) return;
    btn.disabled = true;
    setTimeout(()=>{ try{ btn.disabled=false; }catch(e){} }, ms);
  }

  function _scRow(text='', img=''){
    const row=document.createElement('div');
    row.className='row';
    row.style.gap='8px';

    const t=document.createElement('input');
    t.type='text';
    t.placeholder='Text';
    t.value=text||'';
    t.style.flex='1';

    const i=document.createElement('input');
    i.type='text';
    i.placeholder='Img (URL / data:)';
    i.value=img||'';
    i.style.flex='1';

    const del=document.createElement('button');
    del.type='button';
    del.className='ghost';
    del.textContent='✕';
    del.addEventListener('click', ()=>row.remove());

    row.appendChild(t); row.appendChild(i); row.appendChild(del);

    row._get = ()=>({ text:(t.value||'').trim(), img:(i.value||'').trim() });
    return row;
  }

  function _readScenarios(){
    const box=document.getElementById('botScenarioList');
    if(!box) return [];
    const out=[];
    box.querySelectorAll('.row').forEach(r=>{
      if(typeof r._get==='function'){
        const v=r._get();
        if(v.text || v.img) out.push(v);
      }
    });
    return out;
  }

  function _clearScenarios(){
    const box=document.getElementById('botScenarioList');
    if(box) box.innerHTML='';
  }

  function _fillEditor(id, bot){
    _selectedBotId = id || null;
    const set=(eid,val)=>{ const el=document.getElementById(eid); if(el) el.value = (val==null?'':String(val)); };
    const setChk=(eid,val)=>{ const el=document.getElementById(eid); if(el) el.checked = !!val; };

    set('botEditId', id||'');
    set('botEditNick', bot?.nick||'');
    set('botEditCity', bot?.city||'');
    set('botEditMode', bot?.mode||'chat');
    set('botEditInterval', bot?.intervalMin||15);
    setChk('botEditEnabled', bot?.enabled!==false);
    set('botEditText', bot?.text||'');

    _pendingAva = null;
    _pendingImg = null;
    try{ const f1=document.getElementById('botEditAvatar'); if(f1) f1.value=''; }catch(e){}
    try{ const f2=document.getElementById('botEditImg'); if(f2) f2.value=''; }catch(e){}

    _clearScenarios();
    const sc = Array.isArray(bot?.scenarios) ? bot.scenarios : [];
    const box=document.getElementById('botScenarioList');
    if(box){
      if(sc.length){
        sc.forEach(s=> box.appendChild(_scRow(s?.text||'', s?.img||'')) );
      }else{
        box.appendChild(_scRow(bot?.text||'', bot?.img||''));
      }
    }
  }

  async function loadBotsModal(selectId){
    if(!_isAdmin()) return toast('Jen admin');
    if(_busy) return;
    _busy=true;
    try{
      const listEl=document.getElementById('botsModalList');
      if(listEl) listEl.innerHTML = '<div class="muted">Načítám…</div>';

      const snap = await db.ref('bots').orderByChild('createdAt').limitToLast(80).get();
      const bots = snap.val() || {};
      const ids = Object.keys(bots).sort((a,b)=> (bots[a].createdAt||0)-(bots[b].createdAt||0));

      if(listEl){
        listEl.innerHTML = '';
        if(!ids.length){
          const e=document.createElement('div');
          e.className='muted';
          e.textContent='Zatím žádní boti';
          listEl.appendChild(e);
        }else{
          ids.forEach(id=>{
            const b=bots[id]||{};
            const row=document.createElement('div');
            row.className='row';
            row.style.justifyContent='space-between';
            row.style.alignItems='center';

            const left=document.createElement('div');
            left.style.display='flex';
            left.style.alignItems='center';
            left.style.gap='10px';

            const ava=document.createElement('img');
            ava.className='ava';
            ava.alt='bot';
            ava.src = normalizeAvatarUrl(b.avatar||'./img/default-avatar.svg');

            const meta=document.createElement('div');
            const title=document.createElement('div');
            title.innerHTML = '<b>'+esc(b.nick||'Bot')+'</b> <span class="muted">('+esc(b.city||'')+')</span>';
            const sub=document.createElement('div');
            sub.className='muted';
            sub.style.fontSize='12px';
            sub.textContent = (b.enabled===false?'OFF':'ON') + ' · ' + (b.intervalMin||15)+'m · ' + (b.mode||'chat');
            meta.appendChild(title); meta.appendChild(sub);

            left.appendChild(ava); left.appendChild(meta);

            const right=document.createElement('button');
            right.type='button';
            right.className='ghost';
            right.textContent='Edit';
            right.addEventListener('click', ()=>{
              _fillEditor(id, b);
            });

            row.appendChild(left);
            row.appendChild(right);
            listEl.appendChild(row);
          });
        }
      }

      const pick = selectId || _selectedBotId || (ids[ids.length-1]||null);
      if(pick && bots[pick]) _fillEditor(pick, bots[pick]);
      else _fillEditor('', {});
    }catch(e){
      console.warn(e);
      toast('Chyba načítání botů');
    }finally{
      _busy=false;
    }
  }
  window.loadBotsModal = loadBotsModal;

  async function _saveBotFromEditor(){
    if(!_isAdmin()) return toast('Jen admin');
    const id=(document.getElementById('botEditId')?.value||'').trim();
    if(!id) return toast('Chybí ID');
    const nick=(document.getElementById('botEditNick')?.value||'').trim() || 'Bot';
    const city=(document.getElementById('botEditCity')?.value||'').trim() || getCity();
    const mode=(document.getElementById('botEditMode')?.value||'chat').trim();
    const intervalMin=parseInt((document.getElementById('botEditInterval')?.value||'15'),10);
    const enabled=!!document.getElementById('botEditEnabled')?.checked;
    const text=(document.getElementById('botEditText')?.value||'').trim();
    const scenarios=_readScenarios();

    const patch={
      nick, city, mode,
      intervalMin: isFinite(intervalMin) ? Math.max(1, Math.min(1440, intervalMin)) : 15,
      enabled,
      text,
      scenarios,
      updatedAt: Date.now()
    };
    if(_pendingAva) patch.avatar=_pendingAva;
    if(_pendingImg) patch.img=_pendingImg;

    await db.ref('bots/'+id).update(patch);
    toast('Uloženo');
    try{ playSound('ok'); }catch(e){}
    _pendingAva=null; _pendingImg=null;
    await loadBotsModal(id);
  }

  async function _deleteBotFromEditor(){
    if(!_isAdmin()) return toast('Jen admin');
    const id=(document.getElementById('botEditId')?.value||'').trim();
    if(!id) return;
    if(!confirm('Smazat bota?')) return;
    await db.ref('bots/'+id).remove();
    toast('Smazáno');
    try{ playSound('trash'); }catch(e){}
    _selectedBotId=null;
    await loadBotsModal();
  }

  async function botTick(){
    const me=auth.currentUser;
    if(!isAdminUser(me)) return;
    try{
      const snap=await db.ref('bots').orderByChild('createdAt').limitToLast(80).get();
      const bots=snap.val()||{};
      const now=Date.now();
      const ids=Object.keys(bots);
      for(const id of ids){
        const b=bots[id]||{};
        if(b.enabled===false) continue;
        const _mode=String(b.mode||'chat');
        if(_mode !== 'chat' && _mode !== 'both') continue;
        const interval = Math.max(1, parseInt(b.intervalMin||15,10));
        const last = parseInt(b.lastTs||0,10) || 0;
        if(now - last < interval*60000) continue;

        const botUid = String(b.uid || ('bot_'+id));
        // ensure bot has public profile
        try{
          const puRef = db.ref('usersPublic/'+botUid);
          const puSnap = await puRef.get();
          if(!puSnap.exists()){
            await puRef.set({nick: b.nick||'Bot', avatar: b.avatar||'./img/default-avatar.svg', role:'bot', createdAt: now, updatedAt: now});
          }else{
            await puRef.update({nick: b.nick||'Bot', avatar: b.avatar||puSnap.val().avatar||'./img/default-avatar.svg', role:'bot', updatedAt: now});
          }
        }catch(e){ /* ignore */ }

        // pick message
        let msgText = (b.text||'').trim();
        let msgImg = (b.img||'').trim();
        const sc = Array.isArray(b.scenarios) ? b.scenarios.filter(x=>x && (x.text||x.img)) : [];
        if(sc.length){
          const pick = sc[Math.floor(Math.random()*sc.length)] || {};
          msgText = (pick.text||msgText||'').trim();
          msgImg = (pick.img||msgImg||'').trim();
        }
        if(!msgText && !msgImg) continue;

        const city = (b.city||getCity()||'praha').toLowerCase();
        // For MVP we only auto-post to public chat (DM bots require server/bot accounts)
        const msg={ by: botUid, ts: now };
        if(msgText) msg.text = msgText.slice(0, 800);
        if(msgImg) msg.img = msgImg.slice(0, 400000);

        await db.ref('messages/'+city).push(msg);
        await db.ref('bots/'+id).update({ lastTs: now });
      }
    }catch(e){
      console.warn('botTick error', e);
    }
  }
  window.botTick = botTick;

  function _startBots(){
    if(!_isAdmin()) return toast('Jen admin');
    if(_botTimer) return toast('Boti již běží');
    _botTimer=setInterval(()=>botTick(), 5000);
    toast('Boti spuštěni');
  }
  function _stopBots(){
    if(_botTimer){ clearInterval(_botTimer); _botTimer=null; toast('Boti zastaveni'); }
  }

  function initBotsModalUI(){
    // Wire buttons once
    const btnAdd=document.getElementById('botsModalAdd');
    const btnRun=document.getElementById('botsModalRun');
    const btnStop=document.getElementById('botsModalStop');

    btnAdd?.addEventListener('click', async ()=>{
      if(!_isAdmin()) return toast('Jen admin');
      _lockBtn(btnAdd, 1000);
      try{
        const id=db.ref('bots').push().key;
        const now=Date.now();
        await db.ref('bots/'+id).set({
          nick:'Bot',
          city:getCity(),
          mode:'chat',
          intervalMin:15,
          text:'Ahoj!',
          enabled:true,
          scenarios:[{text:'Ahoj! Napiš prosím více detailů.', img:''}],
          createdAt: now,
          updatedAt: now,
          lastTs: 0
        });
        await loadBotsModal(id);
      }catch(e){
        console.warn(e);
        toast('Chyba při vytváření bota');
      }
    });

    btnRun?.addEventListener('click', _startBots);
    btnStop?.addEventListener('click', _stopBots);

    document.getElementById('botScenarioAdd')?.addEventListener('click', ()=>{
      const box=document.getElementById('botScenarioList');
      if(!box) return;
      box.appendChild(_scRow('', ''));
    });

    document.getElementById('botEditSave')?.addEventListener('click', ()=>_saveBotFromEditor().catch(e=>{ console.warn(e); toast('Chyba uložení'); }));
    document.getElementById('botEditDelete')?.addEventListener('click', ()=>_deleteBotFromEditor().catch(e=>{ console.warn(e); toast('Chyba'); }));

    document.getElementById('botEditAvatar')?.addEventListener('change', async (e)=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      try{ _pendingAva = await fileToDataURL(f); toast('Avatar připraven'); }catch(err){ _pendingAva=null; toast('Chyba souboru'); }
    });
    document.getElementById('botEditImg')?.addEventListener('change', async (e)=>{
      const f=e.target.files && e.target.files[0]; if(!f) return;
      try{ _pendingImg = await fileToDataURL(f); toast('Obrázek připraven'); }catch(err){ _pendingImg=null; toast('Chyba souboru'); }
    });

    // When the modal opens (from admin menu), refresh list
    document.getElementById('modalBots')?.addEventListener('click', (e)=>{
      // clicking backdrop closes via closeModal; no need
    });
  }
  window.initBotsModalUI = initBotsModalUI;

})();
