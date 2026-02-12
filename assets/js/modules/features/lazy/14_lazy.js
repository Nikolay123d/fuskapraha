const loaded = new Set();

export async function ensureModule(name){
  if(loaded.has(name)) return;
  loaded.add(name);

  if(name==="chat"){
    await import("../chat/30_chat.js");
  }else if(name==="dm"){
    await import("../dm/40_dm.js");
  }else if(name==="profile"){
    await import("../profiles/70_profiles.js");
  }else if(name==="friends"){
    await import("../friends/71_friends.js");
  }else if(name==="admin"){
    await import("../admin/50_admin.js");
  }else if(name==="premium"){
    await import("../premium/61_premiumCabinet.js");
  }
}
