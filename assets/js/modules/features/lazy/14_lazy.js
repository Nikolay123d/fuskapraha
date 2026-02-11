
const loaded = new Set();

export async function ensureModule(name){
  if(loaded.has(name)) return;
  loaded.add(name);

  if(name==="chat"){
    const m = await import("../chat/30_chat.js");
    m.initChat?.();
  }else if(name==="dm"){
    const m = await import("../dm/40_dm.js");
    m.initDM?.();
  }else if(name==="admin"){
    await import("../admin/50_admin.js");
    await import("../premium/61_premiumCabinet.js");
    await import("../admin/55_cleanup.js");
    window.__initAdminOnce?.();
  }else if(name==="profile"){
    const m = await import("../profiles/70_profiles.js");
    m.initProfiles?.();
    await m.renderProfile?.();
  }else if(name==="friends"){
    const m = await import("../friends/71_friends.js");
    m.initFriends?.();
    await m.renderFriends?.();
  }
}
