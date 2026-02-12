// features/router/20_router.js
// Единственный entrypoint для навигации/инициализации view.

import { ensureModule } from '../lazy/14_lazy.js';
import { getState, setView, setDmRoom } from '../../core/02_state.js';

function isAuthed(){
  return !!(window.auth && window.auth.currentUser);
}

// View -> module name (lazy chunk)
const VIEW_TO_MODULE = {
  chat: 'chat',
  dm: 'dm',
  profile: 'profile',
  friends: 'friends',
  rental: 'rental',
  map: 'map',
  admin: 'admin',
  premium: 'premium'
};

const inited = {}; // moduleName -> true
let currentView = null;
let currentModule = null;

function requireAuthForView(view) {
  // Гостям разрешаем ТОЛЬКО чтение публичного чата.
  return view !== 'chat';
}

function showViewDom(view) {
  // Прячем все view секции
  document.querySelectorAll('[data-view]').forEach(el => el.classList.add('hidden'));
  const target = document.querySelector(`[data-view="${view}"]`);
  if (target) target.classList.remove('hidden');
}

async function getOrInitModule(moduleName) {
  const mod = await ensureModule(moduleName);
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
    // Отправляем на чат (гостевой режим) и показываем auth overlay кнопкой Login
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
    // если явно передали room — сохраняем
    if (opts.room) setDmRoom(opts.room, opts.peer || null);
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
  if (s.view === 'dm' && s.dmMode === 'room' && s.room) {
    return openView('dm', { room: s.room, peer: s.peer || null });
  }
  if (s.view) return openView(s.view);
  return openView('chat');
}
