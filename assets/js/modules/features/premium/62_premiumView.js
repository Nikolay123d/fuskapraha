// features/premium/62_premiumView.js
// User-facing Premium purchase flow (QR + proof upload) + request status.
// Admin approval happens in Admin -> Premium заявки.

import { getAccess, isAuthed } from "../../firebase/10_access.js";
import { renderPremiumCabinet } from "./61_premiumCabinet.js";

let __inited = false;

function el(tag, attrs={}, html=""){
  const x = document.createElement(tag);
  for(const [k,v] of Object.entries(attrs)){
    if(k==='class') x.className=v;
    else x.setAttribute(k,v);
  }
  if(html) x.innerHTML = html;
  return x;
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

async function uploadProof(file){
  const a = getAccess();
  const u = a.auth?.currentUser;
  if(!u) throw new Error('login-required');
  const st = a.st;
  if(!st || !st.ref) throw new Error('storage-not-ready');

  const safeName = String(file.name||'proof').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,64);
  const path = `premiumProof/${u.uid}/${Date.now()}_${safeName}`;
  const ref = st.ref().child(path);
  await ref.put(file);
  return await ref.getDownloadURL();
}

function renderPurchaseUI(root){
  const u = firebase.auth().currentUser;
  if(!u){
    root.innerHTML = `<div class="panel"><div class="panel-head">Premium</div><div class="muted" style="padding:12px">Login required.</div></div>`;
    return;
  }

  root.innerHTML = `
    <div class="panel">
      <div class="panel-head">Premium</div>
      <div class="muted" style="margin-top:8px">
        1) Выбери пакет → 2) Оплати по QR → 3) Отправь скрин → 4) Нажми «Подать заявку».
      </div>

      <div class="mk-grid2" style="margin-top:12px; gap:10px">
        <button class="btn btn-neon" data-plan="premium">Premium · 150 Kč / měsíc</button>
        <button class="btn btn-neon" data-plan="premiumPlus">Premium+ · 200 Kč / měsíc</button>
        <button class="btn btn-neon" data-plan="vip">VIP · 100 Kč / forever</button>
      </div>

      <div id="premChoice" class="glass" style="margin-top:12px; padding:12px; display:none"></div>
    </div>

    <div id="premCab" style="margin-top:12px"></div>
  `;

  const PLANS = {
    vip: { title:"VIP", price:100, period:"navždy / forever" },
    premium: { title:"Premium", price:150, period:"měsíc / month" },
    premiumPlus: { title:"Premium+", price:200, period:"měsíc / month" }
  };

  const choice = root.querySelector('#premChoice');
  let selected = null;
  let proofUrl = null;

  root.querySelectorAll('[data-plan]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      selected = btn.getAttribute('data-plan');
      const plan = PLANS[selected];
      if(!plan) return;
      choice.style.display = 'block';
      choice.innerHTML = `
        <div style="font-weight:700">Выбрано: ${escapeHtml(plan.title)} · ${plan.price} Kč</div>
        <div class="muted" style="margin-top:6px">Сканируй QR и отправь скрин оплаты.</div>
        <div style="margin-top:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:flex-start">
          <img src="assets/img/csob-qr.png" alt="QR" style="width:180px; border-radius:14px; border:1px solid rgba(255,255,255,.12)">
          <div>
            <input id="premFile" type="file" accept="image/*" style="display:none" />
            <button id="premUpload" class="btn btn-neon" type="button">Отправить скрин</button>
            <div id="premProof" class="muted" style="margin-top:8px">Скрин не загружен.</div>
            <button id="premSubmit" class="btn btn-neon" type="button" style="margin-top:10px">Подать заявку</button>
            <div class="muted" style="margin-top:6px; font-size:12px">Заявка появится у админа в «Premium заявки».</div>
          </div>
        </div>
      `;

      const fileI = choice.querySelector('#premFile');
      const proofEl = choice.querySelector('#premProof');
      choice.querySelector('#premUpload').onclick = ()=> fileI.click();
      fileI.onchange = async ()=>{
        const f = fileI.files && fileI.files[0];
        fileI.value='';
        if(!f) return;
        proofEl.textContent = 'Загрузка…';
        try{
          proofUrl = await uploadProof(f);
          proofEl.innerHTML = `Загружено ✅ <div style="margin-top:6px"><img src="${escapeHtml(proofUrl)}" style="width:140px;border-radius:12px;border:1px solid rgba(255,255,255,.12)"></div>`;
        }catch(e){
          console.error(e);
          proofEl.textContent = 'Ошибка загрузки (Storage rules?).';
          proofUrl = null;
        }
      };

      choice.querySelector('#premSubmit').onclick = async ()=>{
        if(!selected) return;
        if(!proofUrl){ alert('Сначала загрузи скрин оплаты.'); return; }
        const plan = PLANS[selected];
        const req = {
          uid: u.uid,
          email: u.email || '',
          plan: selected,
          price: plan.price,
          period: plan.period,
          proofImg: proofUrl,
          ts: Date.now(),
          status: 'pending'
        };
        try{
          await firebase.database().ref('payments/requests/'+u.uid).push(req);
          alert('Заявка отправлена.');
          // refresh cabinet
          const cab = root.querySelector('#premCab');
          cab.innerHTML='';
          renderPremiumCabinet(cab);
        }catch(e){
          console.error(e);
          alert('Не удалось отправить заявку (rules?).');
        }
      };

    });
  });

  const cab = root.querySelector('#premCab');
  renderPremiumCabinet(cab);
}

export async function init(){
  if(__inited) return;
  const root = document.getElementById('view-premium');
  if(root) renderPurchaseUI(root);
  __inited = true;
}

export async function onEnter(){
  const root = document.getElementById('view-premium');
  if(root) renderPurchaseUI(root);
}

export async function onExit(){
  // nothing
}
