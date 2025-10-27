(function(){
if(typeof firebase==='undefined') return;

const app = firebase.app();
const db = firebase.database();

let map, markersLayer;
function initMap(){
  if(map) return;
  map = L.map('map').setView([50.0755,14.4378], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  $('#mapCenter').addEventListener('click',()=> map.setView([50.0755,14.4378], 12));
}
window.addEventListener('DOMContentLoaded', initMap);

// Live POIs
firebase.auth().onAuthStateChanged(()=>{
  const city = (localStorage.getItem('city')||'praha').toLowerCase();
  db.ref('places/'+city).on('value', snap=>{
    markersLayer.clearLayers();
    const data = snap.val()||{};
    Object.entries(data).forEach(([id,p])=>{
      const m = L.marker([p.lat||50.0755,p.lng||14.4378]).addTo(markersLayer);
      const img = p.photo ? `<img src="${p.photo}" style="max-width:180px;border-radius:8px;margin:6px 0">` : '';
      const av = p.avatar ? `<img src="${p.avatar}" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:6px">` : '';
      m.bindPopup(`${av}<b>${p.title||'Bod'}</b><div>${p.desc||''}</div>${img}<div style="opacity:.7">${p.type||''}</div>`);
    });
  });
});

// Save city bg to localStorage and DB settings (if admin UI is used)
async function saveCityBg(url){
  const city=(localStorage.getItem('city')||'praha').toLowerCase();
  localStorage.setItem('bg_'+city, url);
  document.body.style.backgroundImage = `url('${url}')`;
  // Optional: write to settings for others (requires admin)
  try{
    const u=firebase.auth().currentUser;
    if(u) await firebase.database().ref('settings/theme/cityBackgrounds/'+city).set(url);
  }catch(e){}
}

// Controls
document.addEventListener('change', async (e)=>{
  if(e.target && e.target.id==='cityBgFile'){
    const f=e.target.files[0]; if(!f) return;
    const dataURL=await readFileAsDataURL(f);
    await saveCityBg(dataURL);
    toast('Pozadí města aktualizováno ✅');
  }
  if(e.target && e.target.id==='poiFile'){
    const f=e.target.files[0]; if(!f) return;
    const dataURL=await readFileAsDataURL(f);
    $('#poiPhoto').value=dataURL;
    toast('Fotka bodu přidána ✅');
  }
});

// Add POI (admin)
document.addEventListener('click', async (e)=>{
  if(e.target && e.target.id==='saveCityBg'){
    const url=$('#cityBgUrl').value.trim(); if(!url){ toast('Zadejte URL pozadí'); return; }
    await saveCityBg(url); toast('Pozadí města aktualizováno ✅'); return;
  }
  if(e.target && e.target.id==='poiAdd'){
    const u=firebase.auth().currentUser; if(!u){ toast('Přihlaste se'); return; }
    const city=(localStorage.getItem('city')||'praha').toLowerCase();
    const p={
      title: $('#poiTitle').value.trim()||'Bod',
      type: $('#poiType').value.trim()||'other',
      avatar: $('#poiAvatar').value.trim()||'',
      photo: $('#poiPhoto').value.trim()||'',
      lat: parseFloat($('#poiLat').value)||50.0755,
      lng: parseFloat($('#poiLng').value)||14.4378,
      by: u.uid, ts: Date.now()
    };
    const ref = db.ref('places/'+city).push();
    await ref.set(p);
    toast('Bod přidán ✅');
    ['poiTitle','poiType','poiAvatar','poiPhoto','poiLat','poiLng'].forEach(id=>$('#'+id).value='');
  }
});
})();