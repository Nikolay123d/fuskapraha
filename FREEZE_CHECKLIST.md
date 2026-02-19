# Freeze Checklist (перед запуском на 50+ юзеров)

## A. Инфраструктура / безопасность
- [ ] App Check включён в проекте и **Enforcement** включен для:
  - Realtime Database
  - Cloud Functions
  - Storage
  DoD: запросы без AppCheck токена получают отказ.

- [ ] Бюджет/алерты в GCP (чтобы не улететь в деньги)
  DoD: настроен budget + email alert.

## B. Functions анти-абьюз
- [x] Rate-limit на критичных callable (dmRequestSend, dmConfirmAtomic, dmSend, consumeLimit, friend*, promo, payments, autopost*)
- [ ] (Опционально) Включён hard-check App Check в callable (в коде), после подключения App Check в веб-клиенте

## C. RTDB rules (server authority)
- [x] server-only пути закрыты на write для клиента
- [x] DM: privateMessages/dmConfirmed/privateMembers/inboxMeta — server-only write
- [ ] (Cost security) На больших ветках чатов добавить требования query с limitToLast/orderByChild + .indexOn

## D. DM (server-first)
- [x] 1 сообщение до ответа (dmRequestSend → dmConfirmAtomic → dmSend)
- [x] Нет тройных окон/модалок
- [x] UI не ловит permission_denied на неподтверждённом чате (нет чтения privateMessages до confirm)
- [ ] Read receipts/lastReadTs корректны на всех клиентах (проверить 2 аккаунтами)

## E. Storage
- [ ] Разнести публичное/приватное:
  - avatars/* публичные
  - paymentsProof/* приватные (owner + admin)
  - лимиты size/mime

## F. UX/шум
- [ ] Консоль без красных ошибок (нет firebase-messaging-sw.js 404 если не нужен)
- [ ] Лоадеры и пустые состояния в DM/Inbox/Профиль
- [ ] Проверены smoke-тесты (см. SMOKE_TESTS_CONSOLE.md)
