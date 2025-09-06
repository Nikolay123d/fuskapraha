
// Interval bot loop (admin only)
let botTimer=null;
async function startBotLoop(){
  if(botTimer) clearInterval(botTimer);
  const poll = async ()=>{
    const s=await db.ref('settings/bots/chat').get(); if(!s.exists()) return;
    const b=s.val(); if(!b.enabled) return;
    const now=Date.now(); const last=(await db.ref('settings/bots/chatLast').get()).val()||0;
    const mins=Math.max(1,parseInt(b.interval||30,10));
    const city=(b.city||'praha');
    if(now-last>mins*60*1000){ await db.ref('messages/'+city).push({text:b.text||null,photo:b.image||null,by:'__bot__',ts:now}); await db.ref('settings/bots/chatLast').set(now); }
  };
  botTimer=setInterval(poll, 15000); poll();
}
auth.onAuthStateChanged(u=>{ if(u && u.email===window.ADMIN_EMAIL) startBotLoop(); else if(botTimer){ clearInterval(botTimer); botTimer=null; } });


// Quota reminder bot (admin only)
let quotaTimer=null;
async function startQuotaBotLoop2(){
  if(quotaTimer) clearInterval(quotaTimer);
  const tick = async ()=>{
    try{
      // Admin-only: read limits and nudge users with low quotas (≤10%)
      const sn = await db.ref('limits').get();
      const lims = sn.val()||{};
      const usersSn = await db.ref('usersPublic').get();
      const up = usersSn.val()||{};
      for(const uid in lims){
        const q = lims[uid]||{};
        const low = ((q.text||0)<=20) || ((q.photo||0)<=10);
        if(low && window.OWNER_UID){
          const tid = [window.OWNER_UID, uid].sort().join('_');
          await db.ref('privateMessages/'+tid).push({text:'У вас залишилось мало лімітів. Оформіть підписку у профілі → Оплати.', by:'__bot__', ts:Date.now()});
          await db.ref('inboxMeta/'+uid+'/'+window.OWNER_UID).set({ts:Date.now()});
          await db.ref('inboxMeta/'+window.OWNER_UID+'/'+uid).set({ts:Date.now()});
        }
      }
    }catch(e){ /* silent */ }
  };
  quotaTimer = setInterval(tick, 60000); // 1 хв.
}
auth.onAuthStateChanged(u=>{ if(u && u.email===window.ADMIN_EMAIL){ startQuotaBotLoop2(); } else if(quotaTimer){ clearInterval(quotaTimer); quotaTimer=null; } });

