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

window.BOTS_DEF = window.BOTS_DEF || [
  { id:'bot_1', nick:'Марина', avatar:'public/images/bot1.jpg',
    posts:[
      {text:'O2 СІМ КАРТА. Без ліміту інтернет, дзвінки. 699 Kč/міс. Старт 299 Kč.', image:'public/images/bot1.jpg'},
      {text:'Продаю iPhone 11 Pro Max + 26 чохлів. Пишіть у приват.', image:'public/images/bot2.jpg'}
    ], baseInterval:120000 },
];
