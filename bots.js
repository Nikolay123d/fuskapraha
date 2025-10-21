// Simple placeholder for auto-posting bot (admin only)
let botTimer = null;
function startBot(intervalMin = 30){
  if (botTimer) clearInterval(botTimer);
  botTimer = setInterval(async ()=>{
    const u = auth.currentUser;
    if (!u || u.email!==window.ADMIN_EMAIL) return;
    await db.ref('board').push({
      by: u.uid, title: 'Автопостинг', text: 'Бот підняв оголошення', ts: Date.now(), city: localStorage.getItem('city')||'praha'
    });
  }, intervalMin*60*1000);
}
