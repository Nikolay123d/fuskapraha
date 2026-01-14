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
