MAKÁME.cz — build (RTDB + Auth)

Co je hotové:
- Role-based admin: /roles/{uid}/admin === true
- 2x kamera (admin-only):
  - hlavní oboi: settings/wallpapers/main
  - oboi přihlášení: settings/wallpapers/auth
- DM opravené (privateMembers + privateMessages + inboxMeta)
- Pravidla RTDB bez "..." (validní JSON)

Struktura:
- index.html, style.css, app.js
- database.rules.json (nahrajte do Realtime Database Rules)
- img/ (statické obrázky)
- sounds/ (wav notifikace)

Poznámka:
- Po prvním přihlášení nastavte admina:
  /roles/<YOUR_UID>/admin = true

Deploy (Firebase CLI):
1) Přihlášení:
   firebase login
2) Nasadit pravidla + hosting:
   firebase deploy --only database,storage,hosting
3) Nasadit Cloud Functions (push + bot tick):
   cd functions && npm i && cd ..
   firebase deploy --only functions

Soubory:
- database.rules.json = RTDB rules
- storage.rules = Storage rules
- functions/index.js = Scheduler (botTick) + HTTPS (sendPush)


## GitHub Pages

- Settings → Pages → Deploy from branch: **main**, folder: **/docs**.
- После деплоя файл `docs/index.html` будет доступен как сайт.
