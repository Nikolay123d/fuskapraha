// Premium modal: plan selection, QR info and submission
let chosenPlan = 200;
document.addEventListener('DOMContentLoaded', ()=>{
  const buyBtn = document.getElementById('buyPremium');
  if (buyBtn){
    buyBtn.addEventListener('click', async (e)=>{
      e.preventDefault();
      chosenPlan = parseInt(e.target.dataset.plan, 10) || 200;
      await loadBankAndShowQR(chosenPlan);
      toast('Відкрийте Адмін → Показати QR (для банківського платежу)');
    });
  }
});

async function loadBankAndShowQR(amount){
  const s = await db.ref('settings/payments/bank').get(); const b=s.val()||{};
  const spd = buildSPD(b.account||b.iban||'', amount, (b.msg||'PRACE CZ PREMIUM'), b.vs||'');
  // Here you can also render a user-side QR preview if desired
}

function buildSPD(acc, amount, msg, vs){
  const parts = ["SPD*1.0"];
  parts.push("ACC:"+String(acc||""));
  parts.push("AM:"+Number(amount||0));
  parts.push("CC:CZK");
  if(vs) parts.push("X-VS:"+vs);
  if(msg) parts.push("MSG:"+msg);
  return parts.join("*")+"*";
}
