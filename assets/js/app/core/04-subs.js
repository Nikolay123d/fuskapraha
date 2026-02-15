// ==== Subscriptions registry ("по-взрослому") ====
// Purpose: централизованно хранить и отписывать все realtime-подписки.
// - global scope: auth/usersPublic/roles + лёгкие badge-watchers
// - tab scope: тяжёлые слушатели вкладок (chat/dm/friends/…)
// Router обязан чистить только scope 'tab'.

(function(){
  if(window.__MK_SUBS__) return;
  window.__MK_SUBS__ = true;

  const MK = window.MK = window.MK || {};

  // key -> { unsub:Function, scope:String, createdAt:Number }
  const _map = new Map();

  function _safeCall(fn){
    try{ if(typeof fn === 'function') fn(); }catch(e){ console.warn('[subs] unsub error', e); }
  }

  function set(key, unsub, scope='tab'){
    if(!key) throw new Error('subs.set: key required');
    // Replace existing
    if(_map.has(key)){
      const old = _map.get(key);
      _safeCall(old?.unsub);
      _map.delete(key);
    }
    if(typeof unsub !== 'function') return;
    _map.set(String(key), {unsub, scope:String(scope||'tab'), createdAt:Date.now()});
  }

  function add(unsub, scope='tab'){
    const key = `${scope}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    set(key, unsub, scope);
    return key;
  }

  function clear(key){
    if(!_map.has(key)) return;
    const it = _map.get(key);
    _safeCall(it?.unsub);
    _map.delete(key);
  }

  function clearScope(scope){
    const s = String(scope||'');
    for(const [k, it] of Array.from(_map.entries())){
      if(String(it.scope) === s){
        _safeCall(it?.unsub);
        _map.delete(k);
      }
    }
  }

  function clearAll(){
    for(const [k, it] of Array.from(_map.entries())){
      _safeCall(it?.unsub);
      _map.delete(k);
    }
  }

  function count(scope){
    if(!scope) return _map.size;
    const s = String(scope);
    let n = 0;
    for(const it of _map.values()) if(String(it.scope) === s) n++;
    return n;
  }

  MK.subs = {
    set,
    add,
    clear,
    clearScope,
    clearAll,
    count,
    _dump: ()=>Array.from(_map.entries()).map(([k,v])=>({key:k, scope:v.scope, createdAt:v.createdAt}))
  };
})();
