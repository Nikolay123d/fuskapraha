// Simple client-side "bots" that admin can trigger manually.
// NOTE: true scheduled bots need a backend/Cloud Functions. This is a manual helper.

async function runHelpBot(city){
  const ref = fb.db.ref(`help/${city}`).push();
  const card = {
    title: "Гаряча допомога",
    text: "Волонтерський хаб: гарячі обіди, одяг, консультації",
    url: "https://umapa.cz/",
    photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/OOjs_UI_icon_heart.svg/512px-OOjs_UI_icon_heart.svg.png",
    ts: Date.now()
  };
  await ref.set(card);
  toast("🤖 Бот додав картку допомоги");
}

async function runMapBot(city){
  const poiRef = fb.db.ref(`map/poi/${city}`).push();
  await poiRef.set({
    title: "Волонтерський пункт",
    type: "help",
    url: "https://umapa.cz/",
    lat: 50.0755,
    lng: 14.4378,
    ts: Date.now()
  });
  toast("🤖 Бот додав точку на карту");
}

window.Bot = { runHelpBot, runMapBot };
