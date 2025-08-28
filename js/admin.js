// ==== Адмін-панель: права по e-mail або по settings/admins/<uid>
async function isAdminUser(){
  const u=firebase.auth().currentUser; if(!u) return false;
  const byUid=(await firebase.database().ref('settings/admins/'+u.uid).get()).val()===true;
  const email=(u.email||'').toLowerCase();
  const byMail=(email==='urciknikolaj642@gmail.com' || email==='darausoan@gmail.com'); // замінити при потребі
  return byUid || byMail;
}

document.getElementById('membersBtn').onclick=async()=>{
  if(await isAdminUser()) document.getElementById('adminPanel').classList.add('show');
  else alert('Потрібні права адміністратора.');
};
document.getElementById('adminClose').onclick=()=> document.getElementById('adminPanel').classList.remove('show');

// ==== Тема сайту (обої)
const wallUrlInput=document.getElementById('wallUrlInput');
document.getElementById('wallApplyLocal').onclick=()=>{ const u=wallUrlInput.value.trim(); if(u){ localStorage.setItem('wallUrl',u); document.documentElement.style.setProperty('--wall-url',`url('${u}')`); alert('Застосовано локально'); } };
document.getElementById('wallSave').onclick=async()=>{
  if(!await isAdminUser()){ alert('Немає прав'); return; }
  const u=wallUrlInput.value.trim(); if(!u) return;
  await firebase.database().ref('settings/theme/wallUrl').set(u);
  alert('Збережено для всіх');
};

// Завантаження файлу обоїв у Storage з автозаповненням поля
const wallFile=document.getElementById('wallFile');
if(wallFile){
  wallFile.addEventListener('change', async e=>{
    const f=e.target.files[0]; if(!f) return;
    if(!window.PF_USE_STORAGE){ alert('Storage вимкнено'); return; }
    const ref=firebase.storage().ref('wallpapers/'+Date.now()+'_'+f.name);
    await ref.put(f); const url=await ref.getDownloadURL();
    wallUrlInput.value=url; alert('Фото завантажено. Тепер натисни «Зберегти для всіх» або «Тільки мені».');
  });
}
