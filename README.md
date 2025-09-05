# Praha Fušky — Full Frontend (GitHub Pages ready)

## Что готово
- Регистрация: Ник + Email + Пароль + выбор языка (uk/cs). Google-вход с fallback на Redirect.
- Авторизация «при первом СМС»: модалка логина открывается по клику «Відправити», если вы не вошли.
- Чаты (місто) + Оренда: текст/фото, тосты «Фото успішно додано…», бесконечная автопрокрутка вниз.
- Фото: загрузка в Firebase Storage, в сообщение попадает `getDownloadURL()`.
- ЛС (DM): собственная лента, inboxMeta, нотификации, фото в ЛС.
- Друзі та заявки: добавление в друзья с тостом.
- Сповіщення (дзвіночок): показывает/очищает уведомления.
- Учасники + розширена адмінка: бан/розбан (данные пишутся в /bans). Видно только админу (email из PF.ADMIN_EMAIL).
- Карта (Leaflet): показ точек `/map/poi/{city}`, админ может добавлять по центру карты. Кнопка 🤖 — бот добавит пример.
- Допомога: фид карточек `/help/{city}`. Кнопка 🤖 — бот добавит пример.
- Обої: глобальні та для міста, змінюються з адмінки миттєво.
- Переклад контенту чату/ЛС/оренди під мову інтерфейсу: використовується публічний endpoint translate.googleapis.com (без ключа).
  Якщо CORS заважає — поставте проксі (наприклад, через Cloudflare Worker), або вимкніть переклад у `app.js`.

## Запуск
1) В Firebase Console включите:
   - Authentication → Email/Password, Google. В Settings → Authorized domains добавьте: `github.io` (или ваш домен).
   - Realtime Database → импортируйте `database.rules.json` и Publish.
   - Storage → включите. Проверьте, что `storageBucket` = `praga-4baee.appspot.com` в `config.js`.

2) В Realtime Database создайте ключ: `settings/adminEmail = urciknikolaj642@gmail.com`.

3) Деплойте на GitHub Pages / Netlify / Vercel. **Не** открывайте `file://`.

## Частые ошибки
- `Firebase: Error (auth/invalid-login-credentials)` — домен не в Authorized Domains, заблокированы попапы,
  или очищайте незавершённый редирект: перезайдите на страницу и жмите «Увійти Google» ещё раз — у нас есть fallback на redirect.
- Пустая страница без стилей — проверьте, что имена файлов латиницей: `index.html`, `style.css`, `app.js`… и пути относительные.

Удачи!
