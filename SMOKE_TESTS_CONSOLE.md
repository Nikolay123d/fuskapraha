# Smoke-тесты (быстрые проверки) — копируй в DevTools Console

Требование: ты залогинен в приложении (auth.currentUser != null).

## 0) Мост для Functions
```js
typeof window.callFn === 'function'
```
Ожидаешь: `true`

## 0.5) Profile init (usersPublic создаётся/чинится сервером)
```js
await window.callFn('profileInit', { nick: 'Test ' + Date.now(), role: 'seeker', avatar: window.DEFAULT_AVATAR })
```
Ожидаешь: `{ ok:true, existed:true/false }`

## 1) Проверка consumeLimit (dryRun)
```js
await window.callFn('consumeLimit', { action: 'dm_init', dryRun: true })
```
Ожидаешь: `{ ok:true/false, limit, used, remaining, plan }`

## 2) DM: отправить запрос (первое сообщение)
Подставь UID получателя:
```js
const TO_UID = '<TO_UID>';
await window.callFn('dmRequestSend', {
  toUid: TO_UID,
  previewText: 'тест-запрос ' + new Date().toISOString()
})
```
Ожидаешь: `{ ok:true, room, ts }`

## 3) DM: подтвердить (на аккаунте получателя)
Зайди получателем (TO_UID) и выполни:
```js
const FROM_UID = '<FROM_UID>';
await window.callFn('dmConfirmAtomic', { peerUid: FROM_UID })
```
Ожидаешь: `{ ok:true, room, moved:true/false }`

## 4) DM: отправка сообщения в подтверждённый room
```js
const PEER = '<PEER_UID>';
const room = [firebase.auth().currentUser.uid, PEER].sort().join('_');
await window.callFn('dmSend', { room, text: 'hello ' + Date.now() })
```
Ожидаешь: `{ ok:true, mid, ts }`

## 5) DM: markRead
```js
const PEER = '<PEER_UID>';
const room = [firebase.auth().currentUser.uid, PEER].sort().join('_');
await window.callFn('dmMarkRead', { room })
```
Ожидаешь: `{ ok:true, ts }`

## 6) Autopost: создать кампанию (если доступно по плану)
```js
await window.callFn('autopostCampaignCreate', {
  city: 'praha',
  text: 'autopost-test ' + Date.now(),
  intervalMin: 120,
  imageUrl: ''
})
```
Ожидаешь: `{ ok:true, id, nextPostTs }` или `{ ok:false, reason:'no_feature' }`

## 7) Support ticket
```js
await window.callFn('supportTicketCreate', { text: 'test ticket ' + Date.now() })
```
Ожидаешь: `{ ok:true, ticketId }`
