(function(){
'use strict';
var KEY='mk_last_tab';
function setTab(t){try{localStorage.setItem(KEY,t)}catch(e){}}
function getTab(){try{return localStorage.getItem(KEY)||'chat'}catch(e){return'chat'}}
function hide(){var v=document.querySelectorAll('.view');for(var i=0;i<v.length;i++)v[i].classList.remove('active')}
window.showView=function(id){hide();var e=document.getElementById(id);if(e)e.classList.add('active');setTab(id.replace('view-',''))}
window.openDMInbox=function(){setTab('dm');hide();var d=document.getElementById('view-dm');if(d)d.classList.add('active')}
function openByTab(t){if(t==='dm')openDMInbox();else if(t==='friends')showView('view-friends');else showView('view-chat')}
document.addEventListener('DOMContentLoaded',function(){
 auth.onAuthStateChanged(function(u){
   if(!u){showView('view-auth');return}
   openByTab(getTab());
 });
});
})();