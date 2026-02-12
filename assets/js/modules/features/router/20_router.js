// features/router/20_router.js
// Единственный entrypoint для навигации/инициализации view.

import { ensureModule } from '../lazy/14_lazy.js';
import { getState, setView, setDmRoom } from '../../core/02_state.js';
import { openAuth } from '../auth/09_auth.js';

function isAuthed(){
  return !!(window.auth && window.auth.currentUser);
}

// View -> module name (lazy chunk)
const VIEW_TO_MODULE = {
  chat: 'chat',
  dm: 'dm',
  profile: 'profile',
  friends: 'friends',
  admin: 'admin'
};

const inited = {}; // moduleName -> true
let currentView = null;
let currentModule = null;

function requireAuthForView(view) {
  // Гостям разрешаем ТОЛЬКО чтение публичного чата.
  return view !== 'chat';
}

function showViewDom(view) {
  // Hide all view sections (NOT nav buttons)
  document.querySelectorAll('section.view[data-view]').forEach(el => el.classList.add('hidden'));
  const target = document.querySelector(`section.view[data-view="${view}"]`);
  if (target) target.classList.remove('hidden');
}

async function getOrInitModule(moduleName) {
  const mod = await ensureModule(moduleName);
  if(!mod){
    console.warn('[router] module not found for', moduleName);
    return {};
  }
  if (!inited[moduleName]) {
    // contract: init() optional
    if (typeof mod.init === 'function') await mod.init();
    // back-compat: старые имена
    if (typeof mod.initChat === 'function') await mod.initChat();
    if (typeof mod.initDM === 'function') await mod.initDM();
    if (typeof mod.initProfile === 'function') await mod.initProfile();
    if (typeof mod.initFriends === 'function') await mod.initFriends();
    if (typeof mod.initRental === 'function') await mod.initRental();
    if (typeof mod.initMap === 'function') await mod.initMap();
    if (typeof mod.initAdmin === 'function') await mod.initAdmin();
    inited[moduleName] = true;
  }
  return mod;
}

export async function openView(view, opts = {}) {
  if (!VIEW_TO_MODULE[view]) {
    console.warn('[router] unknown view:', view);
    view = 'chat';
  }

  // Auth gate
  if (requireAuthForView(view) && !isAuthed()) {
    // Guest mode: bounce to chat + open auth overlay
    try{ openAuth(); }catch{}
    view = 'chat';
  }

  // 1) Exit previous
  try {
    if (currentModule && typeof currentModule.onExit === 'function') await currentModule.onExit();
  } catch (e) {
    console.warn('[router] onExit failed', e);
  }

  // 2) DOM
  showViewDom(view);

  // 3) State persistence (единый источник)
  if (view === 'chat') {
    setView('chat');
  } else if (view === 'dm') {
    // If explicit room -> store it
    if (opts.room) setDmRoom(opts.room);
    else setView('dm');
  } else {
    setView(view);
  }

  // 4) Init & Enter
  const moduleName = VIEW_TO_MODULE[view];
  const mod = await getOrInitModule(moduleName);
  currentView = view;
  currentModule = mod;

  const state = getState();
  try {
    // contract: onEnter(state, opts)
    if (typeof mod.onEnter === 'function') await mod.onEnter(state, opts);
  } catch (e) {
    console.warn('[router] onEnter failed', e);
  }
}

export function restoreAfterReload() {
  const s = getState();
  // state shape: { view, dm:{room} }
  if (s.view === 'dm' && s.dm && s.dm.room) {
    return openView('dm', { room: s.dm.room });
  }
  if (s.view) return openView(s.view);
  return openView('chat');
}
