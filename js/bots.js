// Bot runtime — читает настройки и публикует по расписанию
(function botRuntime(){
  const activeTimers = new Map();
  function postNow(id, b){
    const msg = { uid:'bot_'+id, nick:b.nick||'Бот', avatar:b.avatar||'public/images/bot1.jpg', text:b.text||'', image:b.image||null, ts:Date.now() };
    return db.ref('messages').push(msg).catch(()=>{});
  }
  function reschedule(id, b){
    if(activeTimers.has(id)){ clearInterval(activeTimers.get(id)); activeTimers.delete(id); }
    const mins = Math.max(1, Number(b.minutes||3));
    const t = setInterval(()=> postNow(id,b), mins*60*1000);
    activeTimers.set(id, t);
  }
  auth.onAuthStateChanged(u=>{
    if(!u) return;
    // только для админа инициируем расписания (чтобы не плодить посты несколькими клиентами)
    const isAdmin = (u.email===ADMIN_EMAIL);
    if(!isAdmin) return;
    db.ref('settings/bots').on('value', snap=>{
      const bots = snap.val()||{};
      // удаляем лишние
      Array.from(activeTimers.keys()).forEach(id=>{ if(!(id in bots)){ clearInterval(activeTimers.get(id)); activeTimers.delete(id); } });
      // запускаем/перезапускаем
      Object.entries(bots).forEach(([id,b])=> reschedule(id,b));
    });
  });
})();

// DM inbox sound
auth.onAuthStateChanged(u=>{
  if(!u) return;
  db.ref('inboxMeta/'+u.uid).orderByChild('ts').limitToLast(1).on('child_changed', ()=> { SND.dm(); });
});
