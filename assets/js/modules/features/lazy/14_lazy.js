// features/lazy/14_lazy.js
// Lazy-loader: ТОЛЬКО загружает модули и кэширует экспорт.
// Никаких init()/onEnter() здесь быть не должно — это делает router.

const loaded = {}; // name -> module exports

async function load(name) {
  switch (name) {
    case 'chat':    return import('../chat/30_chat.js');
    case 'dm':      return import('../dm/40_dm.js');
    case 'profile': return import('../profiles/70_profiles.js');
    case 'friends': return import('../friends/71_friends.js');
    case 'admin':   return import('../admin/50_admin.js');
    case 'map':     return import('../map/70_map.js');
    default:        return null;
  }
}

export async function ensureModule(name) {
  if (loaded[name]) return loaded[name];
  const mod = await load(name);
  if (!mod) return null;
  loaded[name] = mod;
  return mod;
}

export function getModule(name) {
  return loaded[name] || null;
}
