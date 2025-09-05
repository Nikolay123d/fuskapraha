// Admin helpers
window.isAdminEmail = (email)=> email && email.toLowerCase() === (window.PF.ADMIN_EMAIL||'').toLowerCase();
async function ensureAdminPath(){ try{ await fb.db.ref("settings/adminEmail").set(window.PF.ADMIN_EMAIL); }catch(e){} }
ensureAdminPath();
