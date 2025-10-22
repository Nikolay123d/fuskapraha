# PRÁCE CZ CHAT — Stage 5 (Roles + Bots + Anti-spam)

- Дефолтные обои без мигания, приветствие только для darausoan@… с ✖
- Селектор города (Praha/Brno/Olomouc/Ostrava/Plzeň), привязка чатов
- Карта: фото точки через камеру (base64), без Firebase Storage
- Cookies + LocalStorage для согласий звука/уведомлений
- Антиспам 5 секунд в Rules (throttle/<uid>/lastTs)
- Роли и привилегии в БД: /roles/{uid}, /settings/superAdminUid
- Админ: назначение super-admin, выдача привилегий (canBots, canEditPlaces, canCleanChat, canBan)
- Баны/разбаны, чистка чата по городу, логи
- Боты: до 10 на владельца, типы chat/rent/help, интервал everyMin, REKLAMA-метка
