
(function(){
  const running = {};
  async function postOnce(bot){
    const user = auth.currentUser;
    if(!user) return;
    const city = bot.city || 'praha';
    const payload = { by: user.uid, text: bot.text || null, photo: bot.photo || null, ts: Date.now(), fromBot: true };
    await db.ref('messages/'+city).push(payload);
    const tid = [user.uid, user.uid].sort().join('_');
    await db.ref('privateMessages/'+tid).push({by:user.uid, text:'(бот) '+(bot.text||''), photo:bot.photo||null, ts:Date.now()});
  }
  window.startBot = function(opts){
    const botId = 'bot_'+opts.city;
    if(running[botId]) return;
    running[botId] = setInterval(()=>postOnce(opts), parseInt(opts.interval,10)||120000);
    postOnce(opts);
  };
  window.stopBot = function(city){
    const botId = 'bot_'+city;
    if(running[botId]){ clearInterval(running[botId]); delete running[botId]; }
  };
})();