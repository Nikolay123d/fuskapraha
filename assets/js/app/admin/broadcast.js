// Admin: broadcast banner

function showBroadcastBanner(data){
  if(!data || !data.id) return;
  try{
    const seenKey='broadcast_seen_'+data.id;
    if(localStorage.getItem(seenKey)==='1') return;

    let banner=document.getElementById('broadcastBanner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='broadcastBanner';
      banner.className='broadcast-banner';
      banner.innerHTML = `
        <div class="bb-left">
          <div class="bb-title"></div>
          <div class="bb-text"></div>
        </div>
        <div class="bb-actions">
          <button class="ghost" id="bbOpen" type="button">Otevřít</button>
          <button class="ghost" id="bbSupport" type="button">Kontakt</button>
          <button class="ghost" id="bbHide" type="button">Nezobrazovat</button>
          <button class="iconbtn" id="bbX" type="button" aria-label="Zavřít">✕</button>
        </div>`;
      document.body.appendChild(banner);
    }
    banner.querySelector('.bb-title').textContent = data.title || 'MAKÁME CZ';
    banner.querySelector('.bb-text').textContent = data.text || '';
    banner.style.display='flex';

    if(data.mp3){ try{ _setAudioSrc('notify', data.mp3); playSound('notify'); }catch{} }

    banner.querySelector('#bbHide').onclick=()=>{
      try{ localStorage.setItem(seenKey,'1'); }catch{}
      banner.style.display='none';
    };
    banner.querySelector('#bbX').onclick=()=>{ banner.style.display='none'; };
    banner.querySelector('#bbSupport').onclick=()=>{
      openModal('supportModal');
      try{
        const t=document.getElementById('supportText');
        if(t && data.title) t.value = `Broadcast: ${data.title}\n\n`;
      }catch{}
    };
    banner.querySelector('#bbOpen').onclick=()=>{
      if(data.link){ try{ window.open(data.link,'_blank'); }catch{} }
      else openModal('helpModal');
      banner.style.display='none';
    };
  }catch(e){}
}
function watchBroadcast(){
  try{
    db.ref('settings/broadcast').on('value', (s)=>{
      const v=s.val();
      if(v) showBroadcastBanner(v);
    });
  }catch(e){}
}

// --- Admin: Users list & user card ---
let _adminUsersMode='users'; // 'users' | 'complaints'
let _adminSelectedUid=null;
