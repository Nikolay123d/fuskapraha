# Makame CZ Chat — сборка (исправленная)

## Что внутри
- Обновлены обои: `bg.jpg`, `praha.jpg` (без «мигания» дефолтных картинок — файлы заменены на новые).
- Добавлен файл `database.rules.json` с индексом `.indexOn: ["ts"]` для `/profileChangeRequests` и базовыми правилами под текущую структуру (messages/usersPublic/rooms).

## Важно
1) **Firebase Realtime Database Rules**
   - Открой Firebase Console → Realtime Database → Rules
   - Вставь содержимое `database.rules.json` и опубликуй.

2) **Индексы**
   - В правилах уже есть `.indexOn: ["ts"]` для:
     - `/messages/$roomId`
     - `/rentMessages/$city`
     - `/profileChangeRequests`

Если в консоли уже другие правила — аккуратно объедини.

