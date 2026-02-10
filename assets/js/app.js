(function(){
  'use strict';
  var TAB_KEY = 'mk_last_tab';

  function setTab(tab){
    try{ localStorage.setItem(TAB_KEY, tab); }catch(e){}
  }
  function getTab(){
    try{ return localStorage.getItem(TAB_KEY) || 'chat'; }catch(e){ return 'chat'; }
  }
  function hideAll(){
    var v = document.querySelectorAll('[id^="view-"]');
    for(var i=0;i<v.length;i++) v[i].classList.remove('active');
  }
  window.showView = function(id){
    hideAll();
    var el = document.getElementById(id);
    if(el) el.classList.add('active');
    setTab(id.replace('view-',''));
  };
  window.openDMInbox = function(){
    setTab('dm');
    hideAll();
    var el = document.getElementById('view-dm');
    if(el) el.classList.add('active');
  };
  function openByTab(tab){
    if(tab === 'dm') window.openDMInbox();
    else if(tab === 'friends') window.showView('view-friends');
    else window.showView('view-chat');
  }
  document.addEventListener('DOMContentLoaded', function(){
    if(!window.firebase || !firebase.auth){
      console.error('[clean-app] Firebase not ready');
      return;
    }
    firebase.auth().onAuthStateChanged(function(user){
      if(!user){
        hideAll();
        var a = document.getElementById('view-auth');
        if(a) a.classList.add('active');
        return;
      }
      openByTab(getTab());
    });
  });
  console.log('[clean-app] loaded');
})();