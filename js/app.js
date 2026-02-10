/*
  CLEAN APPLICATION BRAIN
  Single source of truth: localStorage.mk_last_tab
  ES5-safe (no const/let/export)
*/

(function(){
  'use strict';

  var TAB_KEY = 'mk_last_tab';

  function setTab(tab){
    try { localStorage.setItem(TAB_KEY, tab); } catch(e){}
  }
  function getTab(){
    try { return localStorage.getItem(TAB_KEY) || 'chat'; } catch(e){ return 'chat'; }
  }

  function hideAllViews(){
    var views = document.querySelectorAll('[id^="view-"]');
    for(var i=0;i<views.length;i++){
      views[i].classList.remove('active');
    }
  }

  window.showView = function(viewId){
    hideAllViews();
    var el = document.getElementById(viewId);
    if(el) el.classList.add('active');
    setTab(viewId.replace('view-',''));
  };

  window.openDMInbox = function(){
    setTab('dm');
    hideAllViews();
    var el = document.getElementById('view-dm');
    if(el) el.classList.add('active');
  };

  function openByTab(tab){
    if(tab === 'dm') window.openDMInbox();
    else if(tab === 'friends') window.showView('view-friends');
    else window.showView('view-chat');
  }

  function restoreAfterAuth(){
    openByTab(getTab());
  }

  document.addEventListener('DOMContentLoaded', function(){
    if(!window.firebase || !firebase.auth){
      console.error('[clean-app] Firebase not ready');
      return;
    }

    firebase.auth().onAuthStateChanged(function(user){
      if(!user){
        hideAllViews();
        var authView = document.getElementById('view-auth');
        if(authView) authView.classList.add('active');
        return;
      }
      restoreAfterAuth();
    });

    document.addEventListener('click', function(e){
      var btn = e.target.closest('[data-view]');
      if(!btn) return;
      e.preventDefault();
      var v = btn.getAttribute('data-view');
      if(v === 'dm') window.openDMInbox();
      else window.showView('view-' + v);
    });
  });

  console.log('[clean-app] loaded');
})();
