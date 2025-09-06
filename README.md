# PRÁCE CZ — mobile chat fix (v8)

- Bottom composer fixed/sticky on mobile and desktop.
- Collapsible/wrappable tab bar (hide/show).
- Default avatar (`assets/img/avatar_default.svg`) used everywhere until user uploads one.
- Photo workflow: file -> Firebase Storage -> URL -> toast "Фото успішно додано…" -> message send.
- Wallpapers admin: global and per-city URLs.
- DM via `dm/{uidA_uidB}` with `members/{uid}` (rules).
- Anti-spam: Free plan = 1 chat msg / 30 min, `limits/{uid}` (changeable by admin later).
- Realtime Database rules included.
