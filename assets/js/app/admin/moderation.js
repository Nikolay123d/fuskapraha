// Admin: moderation (map points)

// --- Map points: pending/approved + up to 5 photos ---
async function adminLoadMapPoints(){
  if(!window.__isAdmin) return;
  setMiniLoad('mapPointsMiniLoad','Načítáme…', true);
  const list=document.getElementById('mapPointsList'); if(list) list.innerHTML='';
  const city=getCity();
  try{
    const snap=await db.ref('map/poiPending/'+city).get();
    const v=snap.val()||{};
    const items=Object.keys(v).map(id=>({id, ...(v[id]||{})})).sort((a,b)=>(b.ts||0)-(a.ts||0));
    for(const it of items){
      const u=await getUser(it.by);
      const row=document.createElement('div'); row.className='msg';
      const photos = Array.isArray(it.photos)? it.photos.filter(Boolean).slice(0,5) : [];
      row.innerHTML = `
        <div class="ava" data-uid="${esc(it.by)}"><img src="${esc(u.avatar||window.DEFAULT_AVATAR)}"></div>
        <div class="bubble" style="width:100%">
          <div class="meta"><div class="name"><b>${esc(it.title||'Bod')}</b> <span class="muted">${esc(it.type||'')}</span></div><div class="time">${new Date(it.ts||0).toLocaleString()}</div></div>
          <div class="text">${esc(it.desc||'')}</div>
          ${photos.length?('<div class="row" style="flex-wrap:wrap;gap:6px">'+photos.map(p=>`<img src="${esc(p)}" style="width:78px;height:78px;object-fit:cover;border-radius:12px">`).join('')+'</div>'):''}
          <div class="actions" style="margin-top:8px">
            <button data-id="${esc(it.id)}" data-act="approve">Schválit</button>
            <button data-id="${esc(it.id)}" data-act="del" class="danger">Smazat</button>
          </div>
        </div>`;
      row.addEventListener('click', async (e)=>{
        const act=e.target?.dataset?.act;
        const id=e.target?.dataset?.id;
        if(!act||!id) return;
        if(act==='approve'){
          await db.ref('map/poiApproved/'+city+'/'+id).set({...it, status:'approved', approvedBy:auth.currentUser.uid, approvedAt:Date.now()});
          await db.ref('map/poiPending/'+city+'/'+id).remove();
          try{ auditLog && auditLog('map_point_approve', String(id), { city }); }catch(e){}
          adminLoadMapPoints();
          loadPoi(); // refresh map
        }else if(act==='del'){
          if(confirm('Smazat bod?')) await db.ref('map/poiPending/'+city+'/'+id).remove();
          try{ auditLog && auditLog('map_point_delete_pending', String(id), { city }); }catch(e){}
          adminLoadMapPoints();
        }
      });
      list.appendChild(row);
    }
  }catch(e){ console.warn(e); }
  setMiniLoad('mapPointsMiniLoad','', false);
}
document.getElementById('mapPointsReload')?.addEventListener('click', adminLoadMapPoints);

// Modify map loading to use approved nodes
try{
  // override loadPoi markers: rebind child_added for approved
  const _origLoadPoi = loadPoi;
  window.loadPoi = function(){
    initMap();
    const city=getCity();
    // clear layers except tiles
    MAP.eachLayer(l=>{ if(l && l._url) return; try{ MAP.removeLayer(l); }catch{} });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap' }).addTo(MAP);

    if(POI_REF){ try{ POI_REF.off(); }catch{} }
    POI_REF=db.ref('map/poiApproved/'+city);
    POI_REF.on('child_added', async snap=>{
      const v=snap.val()||{};
      const m=L.marker([v.lat||50.08, v.lng||14.43]).addTo(MAP);
      const photo = (Array.isArray(v.photos) && v.photos[0]) ? `<br><img src="${esc(v.photos[0])}" style="max-width:220px;border-radius:12px">` : '';
      m.bindPopup(`<b>${esc(v.title||'Bod')}</b><br>${esc(v.type||'')}` + (v.desc?`<br>${esc(v.desc)}`:'') + photo);
    });

    MAP.off('click');
    MAP.on('click', async (e)=>{
      const u=auth.currentUser; if(!u){ openModalAuth('login'); return; }
      const isMod=(await db.ref('roles/'+u.uid+'/moderator').get()).val()===true;
      if(!isAdmin() && !isMod) return;
      const title=prompt('Název bodu:'); if(!title) return;
      const type=prompt('Typ:','')||'';
      const desc=prompt('Popis:','')||'';

      // pick up to 5 photos
      const picker=document.createElement('input');
      picker.type='file'; picker.accept='image/*'; picker.multiple=true;
      picker.onchange = async ()=>{
        const files=[...(picker.files||[])].slice(0,5);
        const photos=[];
        for(const f of files){ try{ photos.push(await fileToDataURL(f)); }catch{} }
        const data={lat:e.latlng.lat, lng:e.latlng.lng, title, type, desc, photos, by:u.uid, ts:Date.now(), status:'pending'};
        await db.ref('map/poiPending/'+city).push(data);
        toast('Bod uložen do schválení'); playSound('ok');
      };
      picker.click();
    });
  };
}catch(e){}
