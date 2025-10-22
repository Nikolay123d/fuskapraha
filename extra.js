
document.addEventListener('click', async (e)=>{
  const t=e.target;
  if(!t) return;
  if (t.id === 'chatSend') {
    setTimeout(async ()=>{
      try{
        const u = auth.currentUser;
        if(u){ await db.ref('throttle/'+u.uid+'/lastTs').set(Date.now()); }
      }catch(err){}
    }, 350);
  }
  if (t.id === 'greetClose') {
    const o=document.getElementById('greetOverlay'); if(o) o.hidden=true;
  }
});
(function(){
  try{
    var w=localStorage.getItem('wall');
    if(w){ document.body.style.background = '#0b1416 url('+w+') center/cover fixed no-repeat'; }
  }catch(e){}
})();
if(!window.setCity){ window.setCity = function(c){ localStorage.setItem('city', c); }; }
