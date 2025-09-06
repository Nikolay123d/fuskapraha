
(function(){
  const app = firebase.initializeApp(window.FB_CONFIG);
  const auth = firebase.auth();
  const db = firebase.database();
  const storage = firebase.storage();

  const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
  const sndSend=$("#sndSend"), sndPing=$("#sndPing");
  const toast=(t)=>{const el=$("#toast"); if(!el) return; el.textContent=t; el.classList.add('show'); clearTimeout(window.__t); window.__t=setTimeout(()=>el.classList.remove('show'),2000);};

  // Tabs (safe-guard if minimal index)
  if($$('.tab').length){
    $$('.tab').forEach(b=>b.onclick=()=>{
      $$('.tab').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      const id=b.dataset.tab; $$('.page').forEach(p=>p.classList.remove('visible')); const pg=$("#tab-"+id); if(pg) pg.classList.add('visible');
    });
  }

  // Cities
  let currentCity = (window.CITIES && window.CITIES[0]) || 'Praha';
  if($("#citySel")) {
    $("#citySel").innerHTML=(window.CITIES||["Praha"]).map(c=>`<option ${c===currentCity?'selected':''}>${c}</option>`).join('');
    $("#citySel").onchange=()=>{ currentCity=$("#citySel").value; localStorage.setItem('pf_city', currentCity); applyWallpaper(); };
  }

  // Grace anonymous
  const MODE=window.AUTH_GRACE_MODE||'30min';
  const GRACE_MS=(window.GRACE_MINUTES||30)*60*1000;
  let graceStart=+localStorage.getItem('pf_grace_ts')||0, sentAsGuest=false;
  async function ensureAnon(){
    if(!auth.currentUser){
      try{ await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);}catch(e){}
      await auth.signInAnonymously(); graceStart=Date.now(); localStorage.setItem('pf_grace_ts', String(graceStart));
    }
  }
  function mustUpgrade(){
    const u=auth.currentUser; if(!u) return true; if(!u.isAnonymous) return false;
    if(MODE==='afterFirstMessage') return sentAsGuest;
    return (Date.now()-graceStart)>GRACE_MS;
  }

  // Auth buttons if exist
  if($("#btnLoginGoogle")){
    $("#btnLoginGoogle").onclick=async()=>{
      try{ const p=new firebase.auth.GoogleAuthProvider(); try{ await auth.signInWithPopup(p);}catch(e){ await auth.signInWithRedirect(p);} }catch(e){ alert('Дозволь вспливаючі для вашого домену'); }
    };
  }
  if($("#btnLoginEmail")){
    $("#btnLoginEmail").onclick=async()=>{
      const email=prompt('Email:'), pass=prompt('Пароль:'); if(!email||!pass) return;
      try{ await auth.signInWithEmailAndPassword(email,pass); }catch(e){ if(confirm('Створити?')) await auth.createUserWithEmailAndPassword(email,pass); else alert(e.message); } 
    };
  }

  let isAdmin=false, myPlan='Free';
  auth.onAuthStateChanged(async u=>{
    isAdmin = !!(u && u.email && u.email.toLowerCase()===(window.ADMIN_EMAIL||'').toLowerCase());
    $$('.adminOnly').forEach(el=> el.style.display= isAdmin? '' : 'none');
    if(u && $("#btnLoginGoogle")) $("#btnLoginGoogle").style.display = u.isAnonymous? '' : 'none';
    if(u && $("#btnLoginEmail"))  $("#btnLoginEmail").style.display  = u.isAnonymous? '' : 'none';
    if(u && db){
      const nick=u.displayName || ('Користувач '+u.uid.slice(0,6));
      await db.ref('usersPublic/'+u.uid).update({nick,email:u.email||null,photoURL:u.photoURL||null, ts: firebase.database.ServerValue.TIMESTAMP, isBot:false});
    }
  });

  // Minimal chat send (if elements exist)
  async function uploadPhoto(file){
    if(!file) return null;
    const id='p_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const ref=storage.ref('uploads/'+(auth.currentUser?.uid||'anon')+'/'+id);
    await ref.put(file); return await ref.getDownloadURL();
  }
  async function sendChat(kind){
    if(mustUpgrade()) return alert('Будь ласка, увійдіть, щоб продовжити.');
    const input = kind==='chat'? $("#chatInput"):$("#rentInput");
    const f = (kind==='chat'? $("#chatPhoto"):$("#rentPhoto")).files[0]||null;
    if(!input || (!input.value.trim() && !f)) return;
    const url=await uploadPhoto(f);
    const u=auth.currentUser||{};
    const data={uid:u.uid||null,email:u.email||null,nick:u.displayName||null,text:(input.value||'').trim()||null,photoUrl:url||null,ts:firebase.database.ServerValue.TIMESTAMP};
    await db.ref((kind==='chat'?'messages/':'rentMessages/')+currentCity).push(data);
    input.value=''; (kind==='chat'? $("#chatPhoto"):$("#rentPhoto")).value=''; toast('Надіслано'); if(sndSend){sndSend.currentTime=0; sndSend.play();}
    sentAsGuest = sentAsGuest || (u && u.isAnonymous);
  }
  if($("#chatSend")) $("#chatSend").onclick=()=>sendChat('chat');
  if($("#rentSend")) $("#rentSend").onclick=()=>sendChat('rent');
  if($("#chatPhoto")) $("#chatPhoto").onchange=()=>toast('✔️ Фото успішно додано…');
  if($("#rentPhoto")) $("#rentPhoto").onchange=()=>toast('✔️ Фото успішно додано…');

  async function applyWallpaper(){
    if(!db) return;
    const city = (window.CITIES && $("#citySel") && $("#citySel").value) || 'Praha';
    const s=await db.ref('settings/wallpapers/city/'+city).get();
    const url=s.val(); if(url) document.body.style.backgroundImage=`url('${url}')`;
    else{
      const s2=await db.ref('settings/wallpapers/global').get();
      const u2=s2.val(); document.body.style.backgroundImage= u2?`url('${u2}')`:"url('assets/bg.jpg')";
    }
  }

  (async function start(){ await ensureAnon(); applyWallpaper(); })();
})();
