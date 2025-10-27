# PRÁCE CZ CHAT — v4 (Stage 4)
**Что внутри:**
- ✅ Без мигания обоев (кеш `bg_<city>` применяется до отрисовки)
- ✅ Тосты с крестиком, локально для пользователя
- ✅ Согласие на звуки + `SND.play()`
- ✅ Вкладка «Přátelé», DMs и участники рядом и кликабельны (при подключённых скриптах)
- ✅ Поздравление для `darausoan@gmail.com` — 10s оверлей, роза, звук

**Stage 4:**
- 🗺️ **Карта**: фото точки загружается через «📷» и сохраняется **base64** (без Firebase Storage)
- 🛡️ **Антиспам** в Rules: throttle (5 сек) + приватность ЛС по паре `uid_uid` (regex)
- 🏠 **Pronájem**: поиск, фильтр по городу, сортировка по цене/новизне; фото — через base64

**Файлы:**
- `index.html`, `style.css`, `utils.js` — ядро UI/UX
- `map.js` — base64 для `poiFile`/`poiPhoto`
- `rent.js` — фильтры/сортировка/фото base64
- `database.rules.suggested.json` — throttle/DM/userToasts/nickRequests/rent/places

**Как включить антиспам/приватность:**
Залей `database.rules.suggested.json` как активные правила Realtime Database (или внеси секции в свой `database.rules.json`).

**Примечания:**
- Все картинки и фото пользователей/объявлений/точек — dataURL (base64) в БД, без платного Storage.
- Если хочешь, добавлю «заявку на смену ника» (запись в `nickRequests`) и админ-панель модерации заявок.