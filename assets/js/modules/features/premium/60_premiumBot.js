
export const BOT_UID = "PREMIUM_BOT_UID_HERE"; // <-- set real bot UID in Firebase Auth

export const PREMIUM_PLANS = {
  vip: { title:"VIP", price:100, period:"navždy / forever" },
  premium: { title:"Premium", price:150, period:"měsíc / month" },
  premiumPlus: { title:"Premium+", price:200, period:"měsíc / month" }
};

export function premiumRoomKey(meUid){
  return [meUid, BOT_UID].sort().join("_");
}

export async function sendBotMessage(room, text){
  const ts = Date.now();
  return firebase.database().ref("privateMessages/"+room).push({by: BOT_UID, ts, text, bot:true});
}

export function botTextIntro(){
  return (
`CZ: Ahoj! Jsem bot pro nákup privilegia. Vyber balíček, zaplať přes QR a pošli sem fotku / screenshot platby. Potom stiskni „Podat žádost“.

`+
`RU: Привет! Я бот покупки привилегий. Выбери пакет, оплати по QR и отправь сюда фото/скрин платежа. Потом нажми «Подать заявку».`
  );
}

export function botTextAfterChoose(planTitle, price){
  return (
`CZ: Vybral(a) jste ${planTitle}. Cena: ${price} Kč. Naskenujte QR a pošlete fotku platby.

`+
`RU: Вы выбрали ${planTitle}. Цена: ${price} Kč. Сканируй QR и отправь фото оплаты.`
  );
}

export function botTextNeedProof(){
  return (
`CZ: Pošlete prosím fotku / screenshot platby do tohoto chatu.
`+
`RU: Отправь фото/скрин платежа в этот чат.`
  );
}

export async function submitPremiumRequest(planKey, proofImg){
  const u = firebase.auth().currentUser;
  if(!u) throw new Error("Login required");
  const plan = PREMIUM_PLANS[planKey];
  if(!plan) throw new Error("Unknown plan");

  const req = {
    uid: u.uid,
    email: u.email || "",
    plan: planKey,
    price: plan.price,
    period: plan.period,
    proofImg: proofImg || null,
    ts: Date.now(),
    status: "pending"
  };
  const ref = firebase.database().ref("payments/requests/"+u.uid).push();
  await ref.set(req);
  await firebase.database().ref("notifications/"+u.uid).push({ts:Date.now(), type:"premium", text:"Request submitted / Žádost odeslána", read:false});
  return ref.key;
}
