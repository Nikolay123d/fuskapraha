
# PRÁCE CZ — повний билд

## Швидкий старт
1. У Firebase Console ввімкни **Authentication** (Email/Password + Google), **Realtime Database**, **Storage**.
2. У Realtime Database створи: `settings/adminEmail = "urciknikolaj642@gmail.com"`.
3. Встав права з `database.rules.json` → **Publish**.
4. Задеплой фронтенд на GitHub Pages / Netlify / Vercel (HTTPS). Не відкривай через `file://`.
5. (Необов'язково) У `settings/googleMapsKey` через вкладку **Адмін** збережи ключ Google Maps і обмеж **HTTP referrers** у консолі GCP.

## Гостьовий режим
— 30 хвилин або до першого смс. Потім просить авторизацію Google/Email.

## Авто-переклад (Cloud Functions)
Папка `functions/`. Вимоги: проєкт на Blaze, ввімкнене білінг, змінна середовища `GOOGLE_APPLICATION_CREDENTIALS` або сервісний акаунт за замовчуванням.
- Три тригери: `messages`, `rentMessages`, `dm/items` — пишуть `translations.cs` і `translations.uk`.
- Клієнт показує переклад залежно від `usersPublic/{uid}/locale` (за замовчуванням uk).

### Деплой
```bash
cd functions
npm i
firebase deploy --only functions
```
(За потреби вкажи регіон і Node 20 у firebase.json).

## Вкладки
- **Чат / Оренда** — безкінечна лента (догрузка вверх), композер знизу, фото через 📷.
- **Вакансії** — адмін додає картки; видно всім.
- **Учасники** — пошук/фільтри/сортування, онлайн-статуси, кнопки Профіль/ЛС/Додати.
- **ЛС** — повноекранний діалог, фото, якщо пишеш боту — копія в `bots/inbox` (видно адміну).
- **Допомога** — картки допомоги (адмін).
- **Карта** — Leaflet/OSM; адмін додає POI з центру мапи; фото опціонально.
- **Відгуки** — адмін додає пости зі зображенням.
- **Адмін** — обої (глобальні/на місто, з файлу), секрет зберігання `googleMapsKey`, боти, сидинг 120 профілів, масові дії (Premium/Бан).

## API ключі
- **Storage bucket** виправлено на `appspot.com`.
- **Google Maps** ключ зберігається в БД (`settings/googleMapsKey`) і не вшитий у фронт. Обмеж доменами (HTTP referrers) у Google Cloud Console.

## Примітки
- На мобілці немає горизонтальних свайпів; вкладки кліком, поле вводу — прикріплене знизу.
- Якщо попап Google заблоковано — є fallback на Redirect.
