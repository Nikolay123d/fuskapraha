function isCreator(){const u=auth.currentUser;return!!(u&&(u.email||'').toLowerCase()===window.CREATOR_EMAIL.toLowerCase());}
let _schedulerInt=null;auth.onAuthStateChanged(u=>{if(isCreator()){if(_schedulerInt)clearInterval(_schedulerInt);_schedulerInt=setInterval(async()=>{const now=Date.now();const s=await db.ref('usersPublic').orderByChild('ad').equalTo(true).get();const ads=s.val()||{};for(const id in ads){const conf=(await db.ref('bots/'+id).get()).val()||{};if(conf.active&&conf.everyMin){const last=(await db.ref('bots/'+id+'/lastTs').get()).val()||0;if(now-last>conf.everyMin*60*1000){const city='praha';await db.ref('messages/'+city).push({by:id,text:conf.text||'Dobrý den!',ts:Date.now()});await db.ref('bots/'+id+'/lastTs').set(Date.now());}}}},60000);}else{if(_schedulerInt){clearInterval(_schedulerInt);_schedulerInt=null;}});



// --- Bots upgrade ---
const BOTS = {
  async canRun(){
    const u=auth.currentUser; if(!u) return false;
    const isCreator = (u.email||'').toLowerCase()=== (window.CREATOR_EMAIL||'').toLowerCase();
    const superUid = (await db.ref('settings/superAdminUid').get()).val();
    if (isCreator || u.uid===superUid) return true;
    return !!(await db.ref('roles/'+u.uid+'/canBots').get()).val();
  },
  async list(){ return (await db.ref('bots').limitToLast(100).get()).val()||{}; },
  async create(bot){
    if(!(await BOTS.canRun())) return alert('Nemáte práva na bota');
    const me=auth.currentUser;
    const count = Object.values(await BOTS.list()).filter(b=>b.ownerUid===me.uid).length;
    if(count>=10) return alert('Limit botů 10 byl dosažen');
    bot.ownerUid = me.uid; bot.active = !!bot.active; bot.ts=Date.now();
    bot.ad = true; // štítek REKLAMA
    return db.ref('bots').push(bot);
  },
  async toggle(id, active){ if(!(await BOTS.canRun())) return; await db.ref('bots/'+id+'/active').set(!!active); },
  _timer: null,
  startLoop(){
    if(BOTS._timer) clearInterval(BOTS._timer);
    BOTS._timer = setInterval(BOTS.tick, 15*1000); // každých 15s проверяем due
  },
  async tick(){
    if(!(await BOTS.canRun())) return;
    const bots = await BOTS.list();
    const now = Date.now();
    for(const [id, b] of Object.entries(bots)){
      if(!b.active) continue;
      const due = !b.nextTs || now >= b.nextTs;
      if(!due) continue;
      await BOTS.post(b);
      const every = Math.max(1, parseInt(b.everyMin||30,10));
      await db.ref('bots/'+id+'/nextTs').set(now + every*60*1000);
    }
  },
  async post(b){
    const me=auth.currentUser; if(!me) return;
    const ownerUp = (await db.ref('usersPublic/'+me.uid).get()).val()||{};
    const payload = { by: me.uid, ts: Date.now(), text: b.text||'' };
    if (b.img) payload.img = b.img;
    if (b.type === 'rent'){
      await db.ref('rent').push({ by:me.uid, title:b.title||'Inzerát', city:b.city||'praha', price:b.price||'', img:b.img||null, ts:Date.now(), ad:true });
    } else if (b.type === 'help'){
      await db.ref('help').push({ by:me.uid, title:b.title||'Pomoc', img:b.img||null, ts:Date.now(), ad:true });
    } else {
      await db.ref('messages/'+(b.city||'praha')).push(payload);
    }
  }
};
document.addEventListener('DOMContentLoaded', ()=>{
  const btn = document.querySelector('#runScheduler');
  if(btn){ btn.addEventListener('click', ()=> BOTS.startLoop()); }
  const crt = document.querySelector('#createAdAcc');
  if(crt){ crt.addEventListener('click', async ()=>{
    const type = prompt('Typ: chat/rent/help','chat'); if(!type) return;
    const city = prompt('Město (praha/brno/olomouc/ostrava/plzen)','praha');
    const every = prompt('Každých X minut (min 1, default 30)','30');
    const text = prompt('Text zprávy (pro chat) nebo titulek (pro rent/help)','REKLAMA: ...');
    await BOTS.create({ type, city, everyMin:parseInt(every||'30',10), text });
    alert('Bot vytvořen');
  }); }
});
