# Práce CZ — Ready UI v6

**Важно (строго):**
- Имена файлов — только латиница (как в архиве).
- Пути `<link>`/`<script>` — относительные (без ведущего `/`).
- `storageBucket` заканчивается на `appspot.com` (уже так).
- Включены Firebase: Auth (Email+Google), Storage, Realtime DB.
- Разрешены pop-ups для `github.io`.
- Открывать **только** по http(s), не `file://`.

## Быстрый старт
1. Firebase Console → Authentication: включите Email/Password + Google.  
   Settings → Authorized domains: добавьте `github.io`.
2. Realtime Database → **Rules**: импортируйте `database.rules.json` → Publish.
3. Realtime Database → **Data**: создайте `settings/adminEmail = ваш_email`.
4. Залейте всё содержимое на GitHub Pages/Netlify/Vercel.
5. Откройте `diag.html` — убедитесь, что подключение ок.
6. Откройте `index.html` — логин/регистрация, чаты, ЛС, друзья, обои, карта, помощь.

## Структура БД
/messages/{city}/{msgId}  
/rentMessages/{city}/{msgId}  
/dm/{dialogId}/members/{uid} → true  
/dm/{dialogId}/msgs/{msgId}  
/inboxMeta/{uid}/{dialogId} → lastTs  
/friendRequests/{toUid}/{fromUid}  
/friends/{uid}/{friendUid}  
/usersPublic/{uid} → displayName, photoURL, email, lang  
/settings/adminEmail  
/settings/wallpapers/global  
/settings/wallpapers/city/{city}  
/map/poi/{city}/{poiId}  
/help/{city}/{id}  
/notifications/{uid}/{nid}

## Что готово
- Регистрация: ник+email+пароль, язык (в профиле). Google-вход popup→redirect.
- Профиль с фото (камера/галерея), аватар виден в чатах/ЛС/друзьях.
- Чат/Оренда: фото→Storage→URL→тост «Фото успішно додано…», бесконечная лента (догрузка вверх).
- ЛС (повноекранно): `members` для правил, вкладення, `inboxMeta`, уведомления-дзвіночок.
- Друзья: заявки `/friendRequests` (подтверждение/отклонение), список друзей, удалить.
- Учасники: все `usersPublic`, быстро открыть ЛС или отправить заявку в друзья.
- Адмінка: обои глобально/по городу; тестовые записи; карта + точки; «Допомога».

