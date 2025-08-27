// Хелп-бот: периодически напоминает, как добавлять фото
(function helperBot(){
  const id = 'bot_help';
  const nick = 'Помічник';
  const avatar = 'public/images/bot1.jpg';
  const interval = 15*60*1000; // каждые 15 минут
  async function post(){
    const msg = {
      uid:id, nick, avatar,
      text:'Щоб додати фото: натисніть 📷 для файлу або натисніть 🌐 URL і вставте посилання на зображення. Після вибору натисніть «Відправити».',
      ts:Date.now()
    };
    try{ await db.ref('messages').push(msg); }catch(e){}
  }
  // стартовать спустя минуту после загрузки, затем по таймеру
  setTimeout(()=>{ post(); setInterval(post, interval); }, 60000);
})();

// Антиспам «оплата» — только админ видит, с кулдауном
const PAY_COOLDOWN_MS = 30000;
let lastPayHintAt = 0;
let lastPayText = "";

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
      const now = Date.now();
      if((now - lastPayHintAt) < PAY_COOLDOWN_MS && (m.text||'')===lastPayText) return;
      const hint=(m.image||looksLikePaymentText(m.text)); if(!hint) return;
      lastPayHintAt = now; lastPayText = m.text||'';
      const seen=(await db.ref('settings/paymentInboxSeen/'+snap.key).get()).exists(); if(seen) return;
      await db.ref('settings/paymentInboxSeen/'+snap.key).set(true);
      await db.ref('notifications/'+u.uid).push({ ts:Date.now(), type:'pay', text:'Можлива оплата: перевірте вручну' }).catch(()=>{});
    });
  });
}
watchPaymentsInFeed();
