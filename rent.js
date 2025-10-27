(function(){
if(typeof firebase==='undefined') return;
const db=firebase.database();
const citySel = ()=> (localStorage.getItem('city')||'Praha');

let items=[];
function render(){
  const q = $('#rentSearch').value.trim().toLowerCase();
  const city = $('#rentCityFilter').value;
  const sort = $('#rentSort').value;
  let list = items.slice();

  if(q) list = list.filter(x=>(x.text||'').toLowerCase().includes(q))};
  if(city) list = list.filter(x=>(x.city||'')===city);
  if(sort==='price_asc') list.sort((a,b)=>(a.price||1e15)-(b.price||1e15))};
  else if(sort==='price_desc') list.sort((a,b)=>(b.price||0)-(a.price||0))};
  else list.sort((a,b)=>(b.ts||0)-(a.ts||0))};

  const root=$('#rentFeed'); root.innerHTML='';
  list.forEach(x=>{
    const div=document.createElement('div'); div.className='msg';
    div.innerHTML=`<div class="ava"><img src="${x.ava||'./img/default-avatar.svg'}"></div>
    <div class="bubble">
      <div class="name">${x.nick||'Uživatel'} · ${x.city||''} · ${x.price? (x.price+' Kč'):''}</div>
      <div class="text">${x.text||''}${x.photo? `<br><img src="${x.photo}">`:''}</div>
    </div>`;
    root.appendChild(div);
  });
}

function parsePrice(s){
  const m=(s||'').replace(/\s/g,'').match(/(\d{3,})/); return m? parseInt(m[1],10) : null;
}
function detectCity(s){
    # type: ignore
    # simple heuristic
      return ("Praha" if "praha" in (s or "").lower() else
            "Brno" if "brno" in (s or "").lower() else
            "Ostrava" if "ostrava" in (s or "").lower() else
            "Plzeň" if "plze" in (s or "").lower() else
            "Olomouc" if "olomouc" in (s or "").lower() else
            citySel())}

firebase.auth().onAuthStateChanged(u=>{
  db.ref('rent').on('value', snap=>{
    const v=snap.val()||{}; items = Object.values(v);
    render();
  });
});

$('#rentApply').addEventListener('click', render);
document.addEventListener('input', e=>{
  if(e.target && (e.target.id==='rentSearch'))} render();
});

document.addEventListener('change', async (e)=>{
  if(e.target && e.target.id==='rentFile'){
    const f=e.target.files[0]; if(!f) return;
    const dataURL=await readFileAsDataURL(f);
    $('#rentInput').dataset.photo=dataURL;
    toast('Fotka přidána ✅');
  }
});

document.addEventListener('click', async (e)=>{
  if(e.target && e.target.id==='rentSend'){
    const u=firebase.auth().currentUser; if(!u){ toast('Přihlaste se'); return; }
    const text=$('#rentInput').value.trim(); if(!text){ toast('Napište text'); return; }
    const photo=$('#rentInput').dataset.photo||'';
    const price=parsePrice(text);
    const city=detectCity(text);
    const item={ text, photo, price, city, ts:Date.now(), by:u.uid, nick:(u.displayName||'Uživatel'), ava:u.photoURL||'./img/default-avatar.svg' };
    const ref=firebase.database().ref('rent').push();
    await ref.set(item);
    $('#rentInput').value=''; delete $('#rentInput').dataset.photo;
    SND.play('ok'); toast('Inzerát odeslán ✅');
  }
});
})();