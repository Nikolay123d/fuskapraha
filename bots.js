// Manual bots for quick seeding/testing
async function runHelpBot(city){
  const ref = fb.db.ref(`help/${city}`).push();
  const card = { title:"Гаряча допомога", text:"Волонтерський хаб", url:"https://umapa.cz/",
    photo:"https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/OOjs_UI_icon_heart.svg/512px-OOjs_UI_icon_heart.svg.png", ts:Date.now() };
  await ref.set(card); toast("🤖 Додано картку допомоги");
}
async function runMapBot(city){
  const poiRef = fb.db.ref(`map/poi/${city}`).push();
  await poiRef.set({ title:"Волонтерський пункт", type:"help", url:"https://umapa.cz/", lat:50.0755, lng:14.4378, ts:Date.now() });
  toast("🤖 Додано точку на мапу");
}
async function runChatBot(city){ await fb.db.ref(`messages/${city}`).push({ uid:"bot", text:"Тестове повідомлення", photo:"", ts:Date.now() }); toast("🤖 Чат оновлено"); }
async function runRentBot(city){ await fb.db.ref(`rentMessages/${city}`).push({ uid:"bot", text:"Тестова оренда", photo:"", ts:Date.now() }); toast("🤖 Оренда оновлена"); }
window.Bot = { runHelpBot, runMapBot, runChatBot, runRentBot };
