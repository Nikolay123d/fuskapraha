
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
    const m = await import("../admin/50_admin.js");
    m.initAdmin?.();
    await m.renderAdmin?.();
  }
