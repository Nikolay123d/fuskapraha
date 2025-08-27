# Praha Fušky — FIX 4 (URL-фото + Storage fallback + хелп-бот)
Запуск:
1) Firebase → Realtime Database → Rules → вставь `firebase/database.rules.json`
2) Firebase Storage → включи (если хочешь загрузку файлов). Если нет — открой `js/app.js` и поставь `window.PF_USE_STORAGE=false;`
3) Открой `index.html`
Фото: либо файл через 📷 (Storage), либо ссылкой через кнопку 🌐 URL.
Сменить обои: localStorage.wallUrl="ПРЯМАЯ_ССЫЛКА"; location.reload()
