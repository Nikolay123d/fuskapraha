// === MAP (lazy, city-based POI) ===
let MAP=null;
let POI_REF=null;
let __LEAFLET_READY_PROM=null;

function loadCssOnce(href){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`link[href="${href}"]`)) return resolve();
    const l=document.createElement('link');
    l.rel='stylesheet'; l.href=href;
    l.onload=()=>resolve();
    l.onerror=()=>reject(new Error('CSS load failed: '+href));
    document.head.appendChild(l);
  });
}
function loadJsOnce(srcUrl){
  return new Promise((resolve,reject)=>{
    if(document.querySelector(`script[src="${srcUrl}"]`)) return resolve();
    const s=document.createElement('script');
    s.src=srcUrl;
    s.defer=true;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error('JS load failed: '+srcUrl));
    document.head.appendChild(s);
  });
}

async function ensureLeaflet(){
  if(window.L) return;
  if(__LEAFLET_READY_PROM) return __LEAFLET_READY_PROM;
  const css='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const js='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  __LEAFLET_READY_PROM = (async ()=>{
    await loadCssOnce(css);
    await loadJsOnce(js);
  })();
  return __LEAFLET_READY_PROM;
}

function mapMini(show, text){
  const el=document.getElementById('mapMiniLoad');
  if(!el) return;
  if(show){
    el.style.display='flex';
    el.querySelector('.t') && (el.querySelector('.t').textContent = text||'Načítáme mapu…');
  }else{
    el.style.display='none';
  }
}

async function ensureMapLoadedOnce(){
  try{
    mapMini(true, 'Načítáme mapu…');
    const stop = startMiniSequence('mapMiniLoad', [
      'Načítáme mapu…',
      'OpenStreetMap…',
      'Načítáme body pomoci…'
    ], 650);
    await ensureLeaflet();
    if(!MAP){
      MAP = L.map('map').setView([50.0755, 14.4378], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(MAP);
      window.__MAP = MAP;
    }
    loadPoi();
    mapMini(false,'');
    try{ stop && stop(); }catch(e){}
  }catch(e){
    console.error(e);
    mapMini(true,'Chyba mapy. Zkuste znovu.');
  }
}
window.ensureMapLoadedOnce = ensureMapLoadedOnce;

function initMap(){
  // kept for compatibility; map is ensured lazily
  if(MAP) return;
}

function loadPoi(){
  if(!window.L || !MAP) return;
  const city=getCity();

  // clear layers except tiles
  try{
    MAP.eachLayer(l=>{ if(l && l._url) return; try{ MAP.removeLayer(l); }catch{} });
  }catch{}
  try{
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(MAP);
  }catch{}

  if(POI_REF){ try{ POI_REF.off(); }catch{} }
  POI_REF=db.ref('map/poi/'+city);
  const ref = POI_REF;
  ref.on('child_added', async snap=>{
    const v=snap.val()||{};
    try{
      const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(MAP);
      m.bindPopup(`<b>${esc(v.title||'Bod')}</b><br>${esc(v.type||'')}`);
    }catch{}
  });

  // Tab-scoped teardown (map is heavy; kill listeners on tab switch)
  try{
    if(window.MK && window.MK.subs){
      window.MK.subs.add(()=>{ try{ ref.off(); }catch(e){} try{ MAP && MAP.off('click'); }catch(e){} }, {scope:'tab', key:'mapPoi'});
    }
  }catch(e){}

  MAP.off('click');
  MAP.on('click', async (e)=>{
    const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
    if(window.__EMAIL_VERIFY_REQUIRED__){ toast('Nejdřív potvrďte e-mail.'); openModalAuth('login'); return; }
    if(u.emailVerified===false){
      const until=getVerifyDeadline(u);
      if(until && Date.now()>until){ window.__EMAIL_VERIFY_REQUIRED__=true; toast('Potvrzení e-mailu vypršelo.'); openModalAuth('login'); return; }
    }
    const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
    if(!isAdmin() && !isMod) return;
    const title=prompt('Název bodu:'); if(!title) return;
    const type=prompt('Typ (např. медицина, юрист...)','');
    await db.ref('map/poi/'+city).push({lat:e.latlng.lat, lng:e.latlng.lng, title, type, by:u.uid, ts:Date.now()});
    toast('Bod přidán'); playSound('ok');
  });
}

