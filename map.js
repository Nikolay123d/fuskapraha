
const db=firebase.database(); const auth=firebase.auth();
let MAP, tiles;
function initMap(){
  MAP = L.map('map').setView([50.0755, 14.4378], 11);
  tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(MAP);

  db.ref('map').on('child_added', snap=>{
    const v=snap.val(); if(!v) return;
    L.marker([v.lat,v.lng]).addTo(MAP).bindPopup(`<b>${v.title||''}</b><br>${v.desc||''}`);
  });

  MAP.on('click', async (e)=>{
    const u=firebase.auth().currentUser; if(!u) return alert('Přihlaste se');
    const title=prompt('Název bodu:'); if(!title) return;
    const id=db.ref('map').push().key;
    await db.ref('map/'+id).set({lat:e.latlng.lat, lng:e.latlng.lng, title, by:u.uid, ts:Date.now()});
  });
}
window.addEventListener('DOMContentLoaded', initMap);
