// Admin: settings (design/sounds/payments banners)
//
// Fixes:
// - Idempotent UI wiring (no duplicated listeners on repeated open)
// - Live RTDB watchers are attached only while Settings section is visible
//   (startAdminSettingsLive/stopAdminSettingsLive)

(function mkAdminSettings(){
  if(window.__MK_ADMIN_SETTINGS__) return;
  window.__MK_ADMIN_SETTINGS__ = true;

  function readFileAsDataURL(file){
    return new Promise((resolve,reject)=>{
      const r = new FileReader();
      r.onload = ()=>resolve(r.result);
      r.onerror = ()=>reject(r.error || new Error('read failed'));
      r.readAsDataURL(file);
    });
  }

  async function adminSet(path, value){
    if(!auth.currentUser) throw new Error('no auth');
    if(!window.__isAdmin) throw new Error('not admin');
    return db.ref(path).set(value);
  }

  function bindUpload(id, onData){
    const el = document.getElementById(id);
    if(!el) return;
    // idempotent: bind only once
    if(el.dataset.wired === '1') return;
    el.dataset.wired = '1';

    el.addEventListener('change', async ()=>{
      try{
        if(!window.__isAdmin){
          toast('Pouze administrátor.');
          try{ el.value=''; }catch(e){}
          return;
        }
        const f = el.files && el.files[0];
        if(!f) return;
        const data = await readFileAsDataURL(f);
        await onData(data, f);
        try{ el.value=''; }catch(e){}
      }catch(e){
        console.warn(e);
        toast('Chyba při uploadu');
        try{ el.value=''; }catch(_e){}
      }
    });
  }

  function setThumb(id, dataUrl){
    try{
      const img = document.getElementById(id);
      if(img && typeof dataUrl === 'string' && (dataUrl.startsWith('data:') || dataUrl.startsWith('http'))){
        img.src = dataUrl;
      }
    }catch(e){}
  }

  let __wired = false;
  let __liveUnsubs = [];

  function stopAdminSettingsLive(){
    try{
      __liveUnsubs.forEach(fn=>{ try{ fn(); }catch(e){} });
    }catch(e){}
    __liveUnsubs = [];
  }
  window.stopAdminSettingsLive = stopAdminSettingsLive;

  function startAdminSettingsLive(){
    stopAdminSettingsLive();
    if(!window.__isAdmin) return;

    // Wallpapers previews
    try{
      const ref = db.ref('settings/wallpapers');
      const cb = (s)=>{
        const v = s.val() || {};
        const get = (k)=> (typeof v[k] === 'string') ? v[k] : (v[k] && v[k].url);
        const main = get('main'); if(main) setThumb('wpGlobalPrev', main);
        const authw = get('auth'); if(authw) setThumb('wpAuthPrev', authw);
        const chat = get('chat'); if(chat) setThumb('wpChatPrev', chat);
        const dm = get('dm'); if(dm) setThumb('wpDmPrev', dm);
        const prof = get('profile'); if(prof) setThumb('wpProfilePrev', prof);
      };
      ref.on('value', cb);
      __liveUnsubs.push(()=>ref.off('value', cb));
    }catch(e){}

    // Sound settings
    try{
      const mv = document.getElementById('masterVolume');
      const mvVal = document.getElementById('masterVolumeVal');
      const mute = document.getElementById('muteDefault');

      const ref = db.ref('settings/sounds');
      const cb = (s)=>{
        const v = s.val() || {};
        try{
          if(mv && typeof v.masterVolume !== 'undefined'){
            mv.value = String(v.masterVolume);
            if(mvVal) mvVal.textContent = String(Number(v.masterVolume).toFixed(2));
          }
        }catch(e){}
        try{
          if(mute && typeof v.muteDefault !== 'undefined'){
            mute.checked = !!v.muteDefault;
          }
        }catch(e){}
      };
      ref.on('value', cb);
      __liveUnsubs.push(()=>ref.off('value', cb));
    }catch(e){}

    // Premium fields
    try{
      const ref = db.ref('settings/premium');
      const cb = (s)=>{
        const v = s.val() || {};
        try{
          if(typeof v.qr === 'string') setThumb('premiumQrPreview', v.qr);
        }catch(e){}
        try{
          const txtEl = document.getElementById('premiumText');
          if(txtEl && typeof v.text === 'string') txtEl.value = v.text;
        }catch(e){}
        try{
          const supEl = document.getElementById('supportUid');
          if(supEl && typeof v.supportUid === 'string') supEl.value = v.supportUid;
        }catch(e){}
      };
      ref.on('value', cb);
      __liveUnsubs.push(()=>ref.off('value', cb));
    }catch(e){}
  }
  window.startAdminSettingsLive = startAdminSettingsLive;

  function wireOnce(){
    if(__wired) return;
    __wired = true;

    // Wallpapers uploads
    bindUpload('wpGlobal', async (data)=>{
      setMainWallpaper(data);
      setThumb('wpGlobalPrev', data);
      await adminSet('settings/wallpapers/main', { url:data, ts:Date.now(), by: auth.currentUser.uid });
      toast('Global wallpaper uložen');
    });
    bindUpload('wpAuth', async (data)=>{
      setAuthWallpaper(data);
      setThumb('wpAuthPrev', data);
      await adminSet('settings/wallpapers/auth', { url:data, ts:Date.now(), by: auth.currentUser.uid });
      toast('Auth wallpaper uložen');
    });
    bindUpload('wpChat', async (data)=>{
      setChatWallpaper(data);
      setThumb('wpChatPrev', data);
      await adminSet('settings/wallpapers/chat', { url:data, ts:Date.now(), by: auth.currentUser.uid });
      toast('Chat wallpaper uložen');
    });
    bindUpload('wpDm', async (data)=>{
      setDmWallpaper(data);
      setThumb('wpDmPrev', data);
      await adminSet('settings/wallpapers/dm', { url:data, ts:Date.now(), by: auth.currentUser.uid });
      toast('DM wallpaper uložen');
    });
    bindUpload('wpProfile', async (data)=>{
      setProfileWallpaper(data);
      setThumb('wpProfilePrev', data);
      await adminSet('settings/wallpapers/profile', { url:data, ts:Date.now(), by: auth.currentUser.uid });
      toast('Profile wallpaper uložen');
    });

    // Payments QR upload (legacy field)
    bindUpload('payQrImg', async (data)=>{
      setThumb('payQrImgPrev', data);
      await adminSet('settings/payments/qrImg', data);
      toast('QR pro platby uložen');
    });

    // Sounds uploads
    bindUpload('sndDm', async (data)=>{
      _setAudioSrc('dm', data);
      await adminSet('settings/sounds/dm', data);
      toast('dm.mp3 uložen');
    });
    bindUpload('sndNotify', async (data)=>{
      _setAudioSrc('notify', data);
      await adminSet('settings/sounds/notify', data);
      toast('notify.mp3 uložen');
    });
    bindUpload('sndFriend', async (data)=>{
      _setAudioSrc('friend', data);
      await adminSet('settings/sounds/friend', data);
      toast('friend.mp3 uložen');
    });

    // Sound tests
    document.getElementById('testDm')?.addEventListener('click', ()=>playSound('dm'));
    document.getElementById('testNotify')?.addEventListener('click', ()=>playSound('notify'));
    document.getElementById('testFriend')?.addEventListener('click', ()=>playSound('friend'));

    // Master volume + mute
    const mv = document.getElementById('masterVolume');
    const mvVal = document.getElementById('masterVolumeVal');
    const mute = document.getElementById('muteDefault');

    if(mv){
      if(mv.dataset.wired !== '1'){
        mv.dataset.wired = '1';
        mv.addEventListener('input', ()=>{
          SOUND_CFG.masterVolume = Number(mv.value);
          applySoundVolumes();
          if(mvVal) mvVal.textContent = String(Number(mv.value).toFixed(2));
        });
        mv.addEventListener('change', async ()=>{
          try{ await adminSet('settings/sounds/masterVolume', Number(mv.value)); }catch(e){ console.warn(e); }
        });
      }
    }
    if(mute){
      if(mute.dataset.wired !== '1'){
        mute.dataset.wired = '1';
        mute.addEventListener('change', async ()=>{
          try{ await adminSet('settings/sounds/muteDefault', !!mute.checked); }catch(e){ console.warn(e); }
        });
      }
    }

    // Premium / QR (new field)
    bindUpload('premiumQrUpload', async (data)=>{
      setThumb('premiumQrPreview', data);
      await adminSet('settings/payments/qrImg', data);
      toast('QR uložen');
    });

    const saveBtn = document.getElementById('savePremium');
    if(saveBtn && saveBtn.dataset.wired !== '1'){
      saveBtn.dataset.wired = '1';
      saveBtn.addEventListener('click', async ()=>{
        try{
          if(!window.__isAdmin){ toast('Pouze administrátor'); return; }
          const txt = document.getElementById('premiumText')?.value || '';
          const sup = document.getElementById('supportUid')?.value || '';
          await adminSet('settings/premium/text', txt);
          await adminSet('settings/premium/supportUid', sup);
          await adminSet('settings/premium/plans', { premium:{price:150}, premium_plus:{price:200} });
          toast('Premium nastavení uloženo');
        }catch(e){
          console.warn(e);
          toast('Chyba uložení');
        }
      });
    }
  }

  // Public API used by admin router
  window.initAdminSettings = function initAdminSettings(){
    wireOnce();
    startAdminSettingsLive();
  };

})();
