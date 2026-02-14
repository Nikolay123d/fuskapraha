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
  MK.VERSION = MK.VERSION || 'v40-hardening';

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

  /* ------------------------------------------------------------------------
   * Unified subscription registry
   *
   * Goal: one place to register/unregister ALL long-lived listeners.
   *
   * Hard rule:
   *  - scope = 'global'      → lives across tab switches
   *  - scope = 'tab:view-*'  → MUST be cleared on every view exit
   *
   * Usage:
   *   MK.subs.set('global', 'roles', offFn)
   *   MK.subs.set('tab:view-chat', 'chatFeed', offFn)
   *   MK.subs.clear('tab:view-chat')
   * ---------------------------------------------------------------------- */
  MK.subs = MK.subs || (function(){
    const scopes = new Map();

    function _norm(s){
      s = String(s||'').trim();
      return s || 'default';
    }
    function _key(k){
      k = String(k||'').trim();
      return k || '__anon__';
    }
    function _scope(name){
      name = _norm(name);
      if(!scopes.has(name)) scopes.set(name, new Map());
      return scopes.get(name);
    }

    function set(scope, key, off){
      scope = _norm(scope);
      key = _key(key);
      const m = _scope(scope);
      const prev = m.get(key);
      if(prev){ try{ prev(); }catch(e){} }
      if(typeof off === 'function') m.set(key, off);
      else m.delete(key);
    }

    function off(scope, key){
      scope = _norm(scope);
      key = _key(key);
      const m = scopes.get(scope);
      if(!m) return;
      const prev = m.get(key);
      if(prev){ try{ prev(); }catch(e){} }
      m.delete(key);
    }

    function clear(scope){
      scope = _norm(scope);
      const m = scopes.get(scope);
      if(!m) return;
      for(const fn of m.values()){
        try{ fn(); }catch(e){}
      }
      m.clear();
    }

    function clearPrefix(prefix){
      prefix = String(prefix||'');
      if(!prefix) return;
      for(const name of Array.from(scopes.keys())){
        if(name === prefix || name.startsWith(prefix)){
          clear(name);
        }
      }
    }

    function list(){
      const out = {};
      for(const [name,m] of scopes.entries()){
        out[name] = Array.from(m.keys());
      }
      return out;
    }

    return { set, off, clear, clearPrefix, list };
  })();

})();
