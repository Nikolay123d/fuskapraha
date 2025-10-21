// Premium modal: plan selection, QR info and submission
let chosenPlan = 50;
document.addEventListener('DOMContentLoaded',()=>{
  $$('.buyBtn').forEach(b=> b.addEventListener('click', async (e)=>{
    chosenPlan = parseInt(e.target.dataset.plan,10)||50;
    await loadBankAndShowQR(chosenPlan);
  }));
  $('#sendPremiumReq').addEventListener('click', sendPremiumReq);
});

async function loadBankAndShowQR(amount){
  const s=await db.ref('settings/payments/bank').get(); const b=s.val()||{};
  const spd = buildSPD(b.account||b.iban||'', amount, (b.msg||'PRACE CZ PREMIUM'), b.vs||'');
  $('#qrArea').innerHTML = `<div>Реквізити: ${escapeHtml((b.account||b.iban||'—'))}</div>
    <div class="qr"><img src="https://chart.googleapis.com/chart?chs=300x300&cht=qr&chl=${encodeURIComponent(spd)}"></div>
    <div class="muted">${spd}</div>`;
}

// SPD builder (same as admin)
function buildSPD(acc, amount, msg, vs){
  function esc(s=''){ return encodeURIComponent(String(s).replace(/\*/g,'%2A')); }
  const parts = ["SPD*1.0"];
  parts.push("ACC:"+acc);
  parts.push("AM:"+Number(amount||0));
  parts.push("CC:CZK");
  if(vs) parts.push("X-VS:"+vs);
  if(msg) parts.push("MSG:"+msg);
  return parts.join("*")+"*";
}

async function sendPremiumReq(){
  const u=auth.currentUser; if(!u) return alert('Увійдіть');
  const receipt=$('#receiptUrl').value.trim(); if(!receipt){ alert('Додайте посилання/скрін квитанції'); return; }
  await db.ref('payments/requests/'+u.uid).push({uid:u.uid, plan: chosenPlan, amount: chosenPlan, receipt: receipt, ts:Date.now()});
  $('#premiumModal').hidden=true; $('#receiptUrl').value='';
  alert('Заявка відправлена. Підтвердження після перевірки.');
}
