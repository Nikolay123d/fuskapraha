/* ============================================================================
 * MAKÁME CZ — MK namespace
 * Single Source of Truth (state) + safe storage helpers
 * ----------------------------------------------------------------------------
 * Goals:
 *  - Keep navigation state (city/view/tab + DM state) consistent everywhere.
 *  - Centralize all related localStorage keys in one place.
 *  - Provide safe getters/setters (no crashes in private mode / quota errors).
 * ========================================================================== */
(function(){
  'use strict';

  // Global namespace
  const MK = window.MK = window.MK || {};

  // Version (manual bump)
  MK.VERSION = MK.VERSION || 'v34-premium-modal';

  // Global feature flags (safe defaults)
  // NOTE: You can toggle these from console for debugging.
  // Prefetch MUST be disabled by default to keep strict lazy-loading.
  window.MK_PREFETCH_ENABLED = (window.MK_PREFETCH_ENABLED === true);

  // Modern modules switches (Stage5 legacy hooks will respect these flags).
  window.MK_NOTIFS_MODERN = (window.MK_NOTIFS_MODERN !== false);
  window.MK_FRIENDS_MODERN = (window.MK_FRIENDS_MODERN !== false);

  // Centralized storage keys (one place = one truth)
  MK.keys = MK.keys || {
    city: 'city',

    // view/tab restore
    lastView: 'mk_last_view',
    lastViewLegacy: 'lastView',
    lastTab: 'mk_last_tab',

    // DM UI mode restore
    dmMode: 'mk_dm_mode',   // 'list' | 'thread'
    dmPeer: 'mk_dm_peer',   // uid when mode === 'thread'

    // Last opened conversation (for restore)
    lastDmPeer: 'mk_last_dm_peer',
    lastDmRoom: 'mk_last_dm_room'
  };

  // Safe localStorage wrapper
  MK.storage = MK.storage || {
    get(key, fallback=''){
      try{
        const v = localStorage.getItem(key);
        return (v==null ? fallback : v);
      }catch(e){
        return fallback;
      }
    },
    set(key, value){
      try{
        if(value===undefined){ return; }
        if(value===null){ localStorage.removeItem(key); return; }
        localStorage.setItem(key, String(value));
      }catch(e){}
    },
    remove(key){
      try{ localStorage.removeItem(key); }catch(e){}
    }
  };

  // Single source of truth for navigation state.
  // NOTE: We keep the shape minimal so we can adopt it gradually.
  const state = MK.state = MK.state || {
    city: 'praha',
    view: 'view-chat',
    tab: 'chat',
    dm: {
      mode: 'list', // 'list' | 'thread'
      peer: '',     // uid
      room: ''      // dmKey(a,b)
    }
  };

  function normalizeView(v){
    v = String(v||'').trim();
    if(!v) return 'view-chat';
    if(!v.startsWith('view-')) v = 'view-' + v;
    return v;
  }
  function viewToTab(v){
    const id = String(v||'').replace('view-','').trim();
    return id || 'chat';
  }
  function normalizeDmMode(m){
    return (String(m||'').trim()==='thread') ? 'thread' : 'list';
  }

  // Load persisted state from localStorage
  MK.stateLoad = MK.stateLoad || function(){
    try{
      // city
      const c = String(MK.storage.get(MK.keys.city, '')||'').trim();
      if(c) state.city = c;

      // view
      const mv = String(MK.storage.get(MK.keys.lastView, '')||'').trim();
      const lv = String(MK.storage.get(MK.keys.lastViewLegacy, '')||'').trim();
      const view = normalizeView(mv || lv || 'view-chat');
      state.view = view;

      // tab
      const t = String(MK.storage.get(MK.keys.lastTab, '')||'').trim();
      state.tab = t || viewToTab(view);

      // dm mode/peer
      const dmMode = normalizeDmMode(MK.storage.get(MK.keys.dmMode, 'list'));
      const dmPeer = String(MK.storage.get(MK.keys.dmPeer, '')||'').trim();
      state.dm.mode = dmMode;
      state.dm.peer = (dmMode==='thread') ? dmPeer : '';

      // last opened room/peer
      const lastPeer = String(MK.storage.get(MK.keys.lastDmPeer, '')||'').trim();
      const lastRoom = String(MK.storage.get(MK.keys.lastDmRoom, '')||'').trim();
      if(lastPeer) state.dm.peer = (state.dm.mode==='thread') ? (state.dm.peer || lastPeer) : state.dm.peer;
      if(lastRoom) state.dm.room = lastRoom;
    }catch(e){}
  };

  // Persist helpers (the only place that writes these keys)
  MK.persist = MK.persist || {};

  MK.persist.city = function(city){
    const c = String(city||'').trim() || 'praha';
    state.city = c;
    MK.storage.set(MK.keys.city, c);
  };

  MK.persist.view = function(viewId){
    const v = normalizeView(viewId);
    state.view = v;
    state.tab = viewToTab(v);

    // keep legacy key for backwards compatibility
    MK.storage.set(MK.keys.lastView, v);
    MK.storage.set(MK.keys.lastViewLegacy, v);
    MK.storage.set(MK.keys.lastTab, state.tab);
  };

  MK.persist.tab = function(tab){
    const t = String(tab||'').trim() || viewToTab(state.view);
    state.tab = t;
    MK.storage.set(MK.keys.lastTab, t);
  };

  MK.persist.dmState = function(mode, peer){
    const m = normalizeDmMode(mode);
    const p = String(peer||'').trim();

    state.dm.mode = m;
    state.dm.peer = (m==='thread') ? p : '';

    MK.storage.set(MK.keys.dmMode, m);
    if(m==='thread' && p){
      MK.storage.set(MK.keys.dmPeer, p);
    }else{
      MK.storage.remove(MK.keys.dmPeer);
    }

    // also persist "last opened peer"
    if(p){
      MK.storage.set(MK.keys.lastDmPeer, p);
    }
  };

  MK.persist.dmLastRoom = function(roomId){
    const r = String(roomId||'').trim();
    state.dm.room = r;
    if(r) MK.storage.set(MK.keys.lastDmRoom, r);
  };

  // Initialize state immediately
  try{ MK.stateLoad(); }catch(e){}

  // --------------------------------------------------------------------------
  // Auth-ready (single point of truth)
  // --------------------------------------------------------------------------
  MK.auth = MK.auth || { user: null, isReady: false, _resolveReady: null };

  // Promise resolves exactly once (first auth state known after redirect handling)
  if(!MK.authReady){
    MK.authReady = new Promise((resolve)=>{ MK.auth._resolveReady = resolve; });
  }

  MK.authSetUser = MK.authSetUser || function(user){
    MK.auth.user = user || null;
    if(!MK.auth.isReady){
      MK.auth.isReady = true;
      try{ MK.auth._resolveReady && MK.auth._resolveReady(MK.auth.user); }catch(e){}
    }
  };

  // --------------------------------------------------------------------------
  // Subscription registry (no duplicate listeners, easy teardown)
  // --------------------------------------------------------------------------
  MK.subs = MK.subs || {
    _map: new Map(),
    _mkKey(scope, key){
      return String(scope||'tab') + '|' + String(key||'');
    },
    add(offFn, meta={}){
      const scope = meta.scope || 'tab';
      const key = meta.key || ('sub_'+Math.random().toString(36).slice(2));
      const k = this._mkKey(scope, key);
      // Replace previous subscription with same scope+key
      const prev = this._map.get(k);
      if(typeof prev === 'function'){
        try{ prev(); }catch(e){}
      }
      if(typeof offFn === 'function'){
        this._map.set(k, offFn);
      }
    },
    clear(scope){
      const s = String(scope||'');
      for(const [k, off] of Array.from(this._map.entries())){
        const ks = k.split('|')[0];
        if(ks !== s) continue;
        try{ off && off(); }catch(e){}
        this._map.delete(k);
      }
    },
    clearAllTabs(){
      for(const [k, off] of Array.from(this._map.entries())){
        const scope = k.split('|')[0];
        if(scope === 'global') continue;
        try{ off && off(); }catch(e){}
        this._map.delete(k);
      }
    },
    clearAll(){
      for(const [k, off] of Array.from(this._map.entries())){
        try{ off && off(); }catch(e){}
        this._map.delete(k);
      }
    }
  };

  // Public helper required by spec: on tab change -> unsubscribeAll()
  window.unsubscribeAll = window.unsubscribeAll || function(){
    try{ MK.subs && MK.subs.clearAllTabs && MK.subs.clearAllTabs(); }catch(e){}
  };

  // --------------------------------------------------------------------------
  // UI action locks (anti double-click)
  // --------------------------------------------------------------------------
  MK.locks = MK.locks || new Map();
  MK.lockTake = MK.lockTake || function(key, ms=1200){
    const k = String(key||'');
    const now = Date.now();
    const until = Number(MK.locks.get(k)||0);
    if(until > now) return false;
    const next = now + Math.max(250, Number(ms||0));
    MK.locks.set(k, next);
    setTimeout(()=>{ try{ if(Number(MK.locks.get(k)||0) <= Date.now()) MK.locks.delete(k); }catch(e){} }, Math.max(300, Number(ms||0))+80);
    return true;
  };
  MK.lockRelease = MK.lockRelease || function(key){
    try{ MK.locks.delete(String(key||'')); }catch(e){}
  };

})();
