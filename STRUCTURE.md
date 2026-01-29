# Структура репозитория (Makáme.cz)

## public/  (то, что хостится)
- `index.html`
- `style.css`
- `app.js`
- `firebase-messaging-sw.js`  (ВАЖНО: должен лежать в корне hosting'а)
- `img/`
- `sounds/`

## firebase/  (правила RTDB/Storage)
- `database.rules.json`
- `storage.rules`

## functions/  (Cloud Functions — опционально)
- `index.js`
- `package.json`

## Корень
- `firebase.json`
- `.firebaserc`
- `.gitignore`
- `README.md`
- `push_setup.md`

### Команды
- Локально: `firebase emulators:start`
- Хостинг: `firebase deploy --only hosting`
- Rules: `firebase deploy --only database,storage`
- Functions: `firebase deploy --only functions`
