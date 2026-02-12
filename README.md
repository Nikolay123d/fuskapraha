
Makáme v8 — Google auth (popup→redirect), DM restore (inbox vs room), topbar badges, premium bot (QR + proof + submit)

Setup checklist
1) Configure Firebase in assets/js/modules/00_firebase.js
2) Firebase Console:
   - Authentication -> Sign-in method: enable Google (and Email/Password if you want).
   - Authentication -> Settings -> Authorized domains: add your GitHub Pages domain and web.app if using hosting.
3) Realtime Database rules: paste database.rules.json
4) IMPORTANT: Premium bot requires a real bot user UID:
   - Create a user (or service account user) in Auth
   - Put its UID into assets/js/modules/60_premiumBot.js as BOT_UID
5) Deploy to GitHub Pages.

Restore:
- mk_state stores {view, dmMode, room, peer}
- F5 returns exactly to inbox or inside конкретный room

Badges:
- DM badge sums inboxMeta/*/unread
- Bell badge counts notifications/* where read!=true


v9 визуальная авторизация: full-screen overlay + Prague BG + typewriter ticker (no scroll, no click-through).