# Server-only ветки (клиент НЕ должен писать напрямую)

Ниже список веток, которые должны быть *write:false* для клиента (или разрешены только админам/модерам),
а запись выполняется только Cloud Functions (Admin SDK).

## Профиль / планы
- usersPublic/**            (write: только admin/mod или через Functions; клиент не пишет)
- roles/**                  (admin-only)
- bans/** / mutes/**        (admin-only)
- payments/**               (создание/approve через Functions)

## DM / приватность
- privateMembers/**
- dmConfirmed/**
- inboxMeta/**
- privateMessages/**         (человеческие DM — только сервер)
- dmRequests/**              (создание/удаление — только сервер)
- privateRoomsByUser/**      (индекс членства; server-only write)

## Лимиты/анти-абьюз
- users/{uid}/limits/**
- rateLimits/**              (server-only)

## Автопостинг
- autopostCampaigns/**
- autopostActive/**
- autopostStats/**

## Промокоды
- promoCodes/**
- promoRedemptions/**

## Логи/аудит
- auditLogs/**

## Примечание
Реальные правила лежат в `firebase/database.rules.json`.
