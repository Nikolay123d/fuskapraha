v30 (без Firebase Storage):
- Фото можно добавлять через ссылку (вставить URL картинки) или выбрать файл — он сожмётся в браузере и сохранится как dataURL в БД.
- ЛС, друзья (структуры готовы), участники — читаются из usersPublic.
- Карта — OpenStreetMap без внешних ключей.
Настройка:
1) Включить Authentication: Email/Password (в Firebase).
2) Database Rules → загрузить database.rules.json → Publish.
3) Задеплоить index.html+style.css+config.js+app.js на GitHub Pages.
