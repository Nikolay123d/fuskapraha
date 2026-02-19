# Push уведомления (Firebase Cloud Messaging)

Цель: уведомления в фоне, когда вкладка закрыта. Web Push работает только на HTTPS (или localhost). Если браузер полностью «убит» ОС (без фонового процесса), часть устройств может не доставлять push — это нормально для Web Push.

## Что уже добавлено в проект

- `firebase-messaging-sw.js` (service worker для background уведомлений)
- Подключение `firebase-messaging-compat.js` в `index.html`
- Регистрация SW + получение FCM token в `app.js` (не ломает чат/ЛС/друзей — добавлено отдельным блоком)
- RTDB rules: добавлен раздел `fcmTokens` (для хранения токенов по UID)

## 1) Получи публичный VAPID key

Firebase Console → Project settings → **Cloud Messaging** → Web configuration → **Web Push certificates**.

Скопируй **Public key**.

В `app.js` найди:

```js
const FCM_VAPID_KEY = 'PASTE_YOUR_PUBLIC_VAPID_KEY_HERE';
```

и вставь туда свой ключ.

## 2) Хостинг

Сайт должен быть на HTTPS.

- Firebase Hosting: рекомендуется.
- Любой другой HTTPS хостинг: тоже ок.

Важно: файл `firebase-messaging-sw.js` должен быть доступен по адресу:

- `https://<твой-домен>/firebase-messaging-sw.js`

## 3) Разрешение на уведомления

В проекте уже есть логика запроса разрешения после согласия на cookies.

Проверка:
- Открой сайт → согласись на cookies → разреши уведомления.
- В RTDB появится запись: `fcmTokens/<uid>/<token>`.

## 4) Отправка уведомлений

Фоновое уведомление нельзя надежно отправлять «с фронта» (без сервера) — нужен backend (Cloud Functions или любой сервер), который вызывает FCM.

В ZIP добавлен пример Cloud Functions (папка `functions/`).

### Развернуть Functions (кратко)

1) Установи Firebase CLI:

```bash
npm i -g firebase-tools
```

2) Логин и привязка проекта:

```bash
firebase login
firebase use <projectId>
```

3) Установка зависимостей и деплой:

```bash
cd functions
npm i
cd ..
firebase deploy --only functions
```

### Вызов

Функция: `sendPromoToUid` (HTTP POST)

Тело запроса:

```json
{ "uid": "<UID получателя>", "title": "Makáme.cz", "body": "Твой текст...", "image": "https://.../Prague.jpeg" }
```

Авторизация для примера реализована по заголовку:
- `x-admin-uid: <UID админа>`

Админ определяется:
- либо через custom claim `admin=true`,
- либо через RTDB `roles/<uid>/admin = true`.

## 5) Изображение в push

В Web Push поле `image` поддерживается не во всех браузерах, но вреда нет.

Рекомендация:
- `icon`: маленькая иконка (квадрат 192×192)
- `image`: большое изображение (например, твоя Прага)
