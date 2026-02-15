// Admin: info pages + support

function initInfoPages(){
  const rulesHtml = `
    <h3>Pravidla MAKÁME CZ</h3>
    <ol>
      <li><b>Respekt:</b> zákaz urážek, výhrůžek, diskriminace a nenávisti.</li>
      <li><b>Spam:</b> zákaz floodu, opakování stejného textu, klamavých nabídek.</li>
      <li><b>Podvody:</b> zákaz vylákání plateb mimo dohodnutý proces, falešných profilů.</li>
      <li><b>Soukromí:</b> nezveřejňujte cizí osobní údaje bez souhlasu.</li>
      <li><b>Obsah:</b> žádné ilegální služby, drogy, násilí, zbraně, extremismus.</li>
      <li><b>Moderace:</b> porušení pravidel může vést k mute/ban dle závažnosti.</li>
    </ol>
    <p class="muted">Pozn.: Systém je ve vývoji. Pokud narazíte na chybu, použijte „Kontakt / Stížnost“.</p>
  `;
  const helpHtml = `
    <h3>Pomoc + Pravidla</h3>
    <div class="card" style="padding:12px;margin:10px 0;">
      <h4 style="margin:0 0 6px 0;">Rychlá pomoc</h4>
      <ul>
        <li><b>Chat:</b> vyberte město nahoře a pište do veřejného chatu.</li>
        <li><b>DM:</b> otevřete „Osobní (DM)“ a napište příteli nebo botovi.</li>
        <li><b>Přátelé:</b> pošlete žádost e‑mailem. Nové žádosti uvidíte v 🔔.</li>
        <li><b>Privilegia:</b> v menu ⭐ najdete nákup a potvrzení.</li>
        <li><b>Notifikace:</b> povolení se nabídne po souhlasu s cookies (automaticky, se zpožděním).</li>
      </ul>
      <p class="muted" style="margin:6px 0 0 0;">Tip: Pokud se něco načítá déle, vyčkejte – mini‑preloader ukazuje stav.</p>
    </div>
    <div class="card" style="padding:12px;margin:10px 0;">
      ${rulesHtml}
    </div>
    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;">
      <button id="openSupportFromHelp" class="btn btn-neon">Kontakt / Stížnost</button>
    </div>
  `;
  const rulesEl=document.getElementById('rulesContent'); if(rulesEl) rulesEl.innerHTML = rulesHtml;
  const helpEl=document.getElementById('helpContent'); if(helpEl) helpEl.innerHTML = helpHtml;

  // One entry point: "Pomoc + Pravidla" (drawer) -> helpModal, inside it you can open support ticket.
  document.getElementById('drawerSupport')?.addEventListener('click', (e)=>{ e.preventDefault(); openModal('helpModal'); try{ window.__closeDrawer?.(); }catch{} });

  document.getElementById('rulesClose')?.addEventListener('click', ()=>closeModal('rulesModal'));
  document.getElementById('helpClose')?.addEventListener('click', ()=>closeModal('helpModal'));
  document.getElementById('supportClose')?.addEventListener('click', ()=>closeModal('supportModal'));

  // open support from combined help
  setTimeout(()=>{
    document.getElementById('openSupportFromHelp')?.addEventListener('click', ()=>{ closeModal('helpModal'); openModal('supportModal'); });
  },0);
}

// --- Support tickets (users -> admin) ---
let _supportImgData=null;
document.getElementById('supportImg')?.addEventListener('change', async (e)=>{
  try{
    const f=e.target.files && e.target.files[0];
    if(!f){ _supportImgData=null; return; }
    _supportImgData = await fileToDataURL(f);
    toast('Screenshot přidán'); playSound('ok');
  }catch(e){ _supportImgData=null; }
});
document.getElementById('supportSend')?.addEventListener('click', async ()=>{
  try{
    const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    const txt=(document.getElementById('supportText')?.value||'').trim();
    if(!txt && !_supportImgData) return;
    await db.ref('support/tickets').push({by:u.uid, ts:Date.now(), text:txt||null, img:_supportImgData||null, ua:(navigator.userAgent||'')});
    document.getElementById('supportText').value='';
    document.getElementById('supportImg').value='';
    _supportImgData=null;
    toast('Odesláno. Děkujeme.'); playSound('ok');
    closeModal('supportModal');
  }catch(e){ console.warn(e); toast('Chyba odeslání'); playSound('err'); }
});

// --- Broadcast (admin -> all users) ---
let _broadcastImg=null, _broadcastMp3=null;
document.getElementById('broadcastImg')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  _broadcastImg = f ? await fileToDataURL(f) : null;
});
document.getElementById('broadcastMp3')?.addEventListener('change', async (e)=>{
  const f=e.target.files && e.target.files[0];
  _broadcastMp3 = f ? await fileToDataURL(f) : null;
});
document.getElementById('broadcastSave')?.addEventListener('click', async ()=>{
  try{
    if(!window.__isAdmin){ toast('Pouze admin'); return; }
    const title=(document.getElementById('broadcastTitle')?.value||'').trim()||'MAKÁME CZ';
    const text=(document.getElementById('broadcastText')?.value||'').trim()||'';
    const link=(document.getElementById('broadcastLink')?.value||'').trim()||'';
    const id = String(Date.now()) + '_' + Math.random().toString(16).slice(2,8);
    await db.ref('settings/broadcast').set({id, title, text, link, img:_broadcastImg||null, mp3:_broadcastMp3||null, ts:Date.now(), by:auth.currentUser.uid});
    toast('Uloženo'); playSound('ok');
    closeModal('adminBroadcastModal');
  }catch(e){ console.warn(e); toast('Chyba uložení'); playSound('err'); }
});
