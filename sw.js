self.addEventListener('install', (e)=>{
  e.waitUntil(caches.open('pcc-v2').then(c=>c.addAll([
    './','./index.html','./style.css','./style.js','./app.js','./dm.js','./admin.js','./payments.js','./config.js','./bots.js','./default-avatar.svg'
  ])));
});
self.addEventListener('fetch', (e)=>{
  e.respondWith(
    caches.match(e.request).then(r=> r || fetch(e.request))
  );
});
