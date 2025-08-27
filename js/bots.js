function looksLikePaymentText(t){ if(!t) return false; const s=t.toLowerCase(); return s.includes('оплат')||s.includes('платіж')||s.includes('payment')||s.includes('донат')||s.includes('premium')||s.includes('199')||s.includes('100'); }
function watchPaymentsInFeed(){
  auth.onAuthStateChanged(async (u)=>{
    if(!u) return;
    const isAdmin = (u.email === ADMIN_EMAIL);
    if(!isAdmin) return;
    const feed=db.ref('messages').limitToLast(200);
    const _seenLocal=new Set();
    feed.on('child_added', async snap=>{
      if(_seenLocal.has(snap.key)) return; _seenLocal.add(snap.key);
      const m=snap.val()||{}; if(!m.uid) return;
      const hint=(m.image||looksLikePaymentText(m.text)); if(!hint) return;
      const seen=(await db.ref('settings/paymentInboxSeen/'+snap.key).get()).exists(); if(seen) return;
      await db.ref('settings/paymentInboxSeen/'+snap.key).set(true);
      await db.ref('notifications/'+u.uid).push({ ts:Date.now(), type:'pay', text:'Можлива оплата: перевірте вручну' }).catch(()=>{});
    });
  });
}
watchPaymentsInFeed();

window.BOTS_DEF = window.BOTS_DEF || [
  { id:'bot_1', nick:'Марина', avatar:'public/images/bot1.jpg',
    posts:[
      {text:'O2 СІМ КАРТА. Без ліміту інтернет, дзвінки. 699 Kč/міс. Старт 299 Kč.', image:'public/images/bot1.jpg'},
      {text:'Продаю iPhone 11 Pro Max + 26 чохлів. Пишіть у приват.', image:'public/images/bot2.jpg'}
    ], baseInterval:120000 },
];

const BotController=(()=>{
  const timers=new Map(), indices=new Map(), speeds=new Map();
  function nextPost(id,posts){ const i=(indices.get(id)||0); indices.set(id,i+1); return posts[i%posts.length]; }
  async function post(bot){ const p=nextPost(bot.id,bot.posts); try{ await db.ref('messages').push({ uid:bot.id, nick:bot.nick, avatar:bot.avatar, text:p.text, image:p.image||null, ts:Date.now() }); }catch(e){ console.error('bot push', e); } }
  function isRunning(id){ return timers.has(id); }
  function computeInterval(bot){ const mult=speeds.get(bot.id)||1; const min=15000; return Math.max(min, bot.baseInterval/mult); }
  function start(bot){ if(isRunning(bot.id)) return; const tick=async()=>{ await post(bot); schedule(); }; function schedule(){ const t=setTimeout(tick, computeInterval(bot)); timers.set(bot.id,t); } schedule(); }
  function stop(id){ const t=timers.get(id); if(t){ clearTimeout(t); timers.delete(id); } }
  function setSpeed(id,m){ speeds.set(id,m); if(timers.has(id)){ clearTimeout(timers.get(id)); timers.delete(id); const b=BOTS_DEF.find(x=>x.id===id); if(b) start(b); } }
  function postOnce(bot){ return post(bot); }
  function stopAll(){ Array.from(timers.keys()).forEach(stop); }
  function startAll(){ BOTS_DEF.forEach(start); }
  function postOnceAll(){ return Promise.all(BOTS_DEF.map(postOnce)); }
  return {start,stop,setSpeed,postOnce,stopAll,startAll,postOnceAll,isRunning:isRunning};
})();