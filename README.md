# PRÁCE CZ CHAT — v26 (Patched)

Готовый сетап: централизованный onAuth, боты с дедуп, ServerValue.TIMESTAMP, безопасные Storage Rules и усиленные Database Rules.

## Как развернуть
1) `index.html` открыть через любой статический сервер (VSCode Live Server).
2) Firebase Console:
   - Realtime Database → Rules → загрузить `database.rules.json` → Publish.
   - Storage → Rules → загрузить `storage.rules` → Publish.
   - Authentication → включить Email/Password и Google.
3) В `config.js` уже стоят твои ключи и ADMIN_EMAIL.

## Папки загрузок в Storage
- `chat_images/{uid}/...` (публичные)
- `rent_images/{uid}/...` (публичные)
- `dm_images/{uid}/...` (приватные)
- `help_images/{city}/...` (админ)
- `payments/{uid}/...` (видны владельцу и админу)

## Боты
Запускаются/останавливаются из `app.js` при входе админа. Chat-бот защищён транзакцией от дублей. Quota-бот напоминает не чаще раза в 24 часа.