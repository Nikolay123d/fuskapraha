// UI: modal helpers (stack + backdrop + ESC)
// Extracted from former features/17-stage5.js to remove monolith.

(function mkModalModule(){
  if(window.__MK_MODAL_MODULE__) return;
  window.__MK_MODAL_MODULE__ = true;

  // --- Modal helpers (stack + backdrop + ESC) ---
    const __openModals = new Set();
    function openModal(id){
      // When opening any modal, close transient overlays (FAB menu / drawer / etc)
      // so we never end up with "stacked" UI layers blocking taps.
      try{ if(typeof window.closeAllOverlays === 'function') window.closeAllOverlays(id); }catch(e){}
      try{ if(typeof window.closeDrawer === 'function') window.closeDrawer(); }catch(e){}

      const el = document.getElementById(id);
      if(!el) return;
      // close any other modal of the same "layer" to prevent invisible overlays blocking clicks
      document.querySelectorAll('.modal').forEach(m=>{
        if(!m.hidden && m.id !== id) m.hidden = true;
      });
      el.hidden = false;
      __openModals.add(id);
      try{ if(window.MK && MK.state) MK.state.modal = id; }catch(e){}
      document.body.classList.add('modal-open');
      // NOTE: we intentionally do NOT pushState here.
      // On some setups it caused "stuck" UI after closing (especially with hash routing).
      // Mobile back button support can be added later via a dedicated modal route.
    }
    function closeModal(id){
      const el = document.getElementById(id);
      if(!el) return;
      el.hidden = true;
      __openModals.delete(id);
      // Close mobile keyboard if it was focused inside a modal
      try{ document.activeElement && document.activeElement.blur && document.activeElement.blur(); }catch(e){}
      try{ if(window.MK && MK.state && MK.state.modal === id) MK.state.modal = null; }catch(e){}
      if(__openModals.size===0) document.body.classList.remove('modal-open');
    }

    // Expose modal helpers for inline onclick handlers
    try{ if(!window.openModal) window.openModal = openModal; }catch(e){}
    try{ if(!window.closeModal) window.closeModal = closeModal; }catch(e){}

    // Backdrop click closes
    document.addEventListener('click', (e)=>{
      const m = e.target && e.target.classList && e.target.classList.contains('modal') ? e.target : null;
      if(m && !m.hidden){
        closeModal(m.id);
      }
    }, true);
    // ESC closes topmost
    document.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape' && __openModals.size){
        const last = Array.from(__openModals).slice(-1)[0];
        closeModal(last);
      }
    });
    // Browser back closes modal if open
    window.addEventListener('popstate', ()=>{
      if(__openModals.size){
        const last = Array.from(__openModals).slice(-1)[0];
        closeModal(last);
      }
    });
})();
