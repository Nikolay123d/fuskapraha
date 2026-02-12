// core/02_state.js
// Единственный модуль, который пишет mk_state в localStorage.
// Все фичи меняют состояние только через setState().

const LS_KEY = 'mk_state';

// -------- utils --------
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function deepMerge(target, patch) {
  if (!isPlainObject(patch)) return target;
  const out = isPlainObject(target) ? { ...target } : {};
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    const tv = out[k];
    if (isPlainObject(pv) && isPlainObject(tv)) out[k] = deepMerge(tv, pv);
    else out[k] = pv;
  }
  return out;
}

// -------- state --------
const defaultState = {
  view: 'chat',
  city: 'Praha',
  dm: { room: null },
  ui: { authOpen: false },
};

let _state = loadState();
const _listeners = new Set();
let _saveTimer = null;

export function getState() {
  // не даём наружу ссылку на живой объект
  return structuredClone ? structuredClone(_state) : JSON.parse(JSON.stringify(_state));
}

export function subscribe(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function setState(patch, opts = {}) {
  const prev = _state;
  _state = deepMerge(_state, patch);

  // notify
  for (const fn of _listeners) {
    try { fn(getState(), prev); } catch (e) { console.warn('[state] listener error', e); }
  }

  if (opts.persist !== false) scheduleSave();
}

export function replaceState(next, opts = {}) {
  const prev = _state;
  _state = deepMerge(defaultState, isPlainObject(next) ? next : {});
  for (const fn of _listeners) {
    try { fn(getState(), prev); } catch (e) { console.warn('[state] listener error', e); }
  }
  if (opts.persist !== false) scheduleSave();
}

export function loadState() {
  const raw = localStorage.getItem(LS_KEY);
  const parsed = safeJsonParse(raw, null);
  return deepMerge(defaultState, parsed || {});
}

export function saveState() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(_state));
  } catch (e) {
    console.warn('[state] save failed', e);
  }
}

export function scheduleSave(ms = 150) {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    _saveTimer = null;
    saveState();
  }, ms);
}

// convenience for router
export function setView(view) {
  setState({ view });
}

export function setCity(city) {
  setState({ city });
}

export function setDmRoom(room) {
  setState({ dm: { room: room || null } });
}
