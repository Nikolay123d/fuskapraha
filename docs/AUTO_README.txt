
PRÁCE CZ CHAT — build v30 (2025-08-30T21:39:48.087317Z)

Содержимое архива:
- index.html — стартовая страница
- style.css — стили
- js/app.js — основная логика (чаты, ЛС, друзья, карта, табы, обои, лимиты, авторизация)
- js/bots.js — боты (админ напоминаний, чат-бот)
- js/admin.js — задел админ-функций
- firebase/config.js — твои ключи + ADMIN_EMAIL
- firebase/database.rules.json — правила Realtime DB
- data/cities.json — список городов
- assets/img/*.jpg — обои/картинки
- docs/README.md — твоя памятка

Как запустить:
1) Firebase Console: включи Authentication (Email/Password, Google), Storage.
2) Realtime Database → Rules → вставь из firebase/database.rules.json и Publish.
3) Открой index.html через локальный сервер (VS Code Live Server и т.п.). Не через file://
4) Зайди под своей админ-почтой (указана в firebase/config.js).

Примечание:
- Если Google-вход "слетает", убедись, что сайт открыт по http/https и что cookies/localStorage не отключены в браузере.
- Для мобильного вида ввод находится снизу, лента — бесконечная прокрутка.
