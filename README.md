<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Помощь украинцам и русскоязычным в Праге</title>

<!-- Leaflet CSS -->
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-oUfkW33pM3Ef1mLuMuI1dx13B4E3UdyH6uyb+ZTOQoY="
  crossorigin=""
/>

<style>
  @import url('https://fonts.googleapis.com/css2?family=Roboto&display=swap');
  body, html {
    margin: 0; padding: 0; height: 100%;
    font-family: 'Roboto', sans-serif;
    background: #f5f5f5;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }
  header {
    background-color: #2c7a7b;
    color: white;
    padding: 15px 20px;
    text-align: center;
    font-weight: 700;
    font-size: 1.8rem;
    user-select: none;
  }
  nav {
    background: #319795;
    display: flex;
    justify-content: center;
    gap: 15px;
    padding: 10px 0;
  }
  nav button {
    background: #2c7a7b;
    color: white;
    border: none;
    padding: 10px 20px;
    font-weight: 700;
    cursor: pointer;
    border-radius: 30px;
    transition: background-color 0.3s ease;
  }
  nav button.active,
  nav button:hover {
    background: #ed8936;
  }

  main {
    flex: 1;
    max-width: 1000px;
    margin: 20px auto;
    background: white;
    border-radius: 10px;
    box-shadow: 0 0 15px rgb(0 0 0 / 0.1);
    padding: 20px;
    box-sizing: border-box;
  }

  section {
    display: none;
  }
  section.active {
    display: block;
  }

  /* --- Главная (карта и объявления) --- */
  #map {
    height: 400px;
    border-radius: 8px;
    margin-top: 15px;
  }
  .category-list {
    margin-bottom: 15px;
  }
  .category-list li {
    margin-bottom: 6px;
  }

  /* --- Полезная информация --- */
  #info-section h2 {
    margin-top: 0;
  }
  #info-section ul {
    padding-left: 20px;
  }
  #info-section a {
    color: #2c7a7b;
    text-decoration: none;
  }
  #info-section a:hover {
    text-decoration: underline;
  }

  /* --- Чат --- */
  #chat-section {
    height: 600px;
    max-width: 700px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    background: url('https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1470&q=80') no-repeat center center fixed;
    background-size: cover;
    border-radius: 12px;
    box-shadow: 0 0 15px rgb(0 0 0 / 0.3);
    color: white;
    overflow: hidden;
  }
  #chat-container {
    background: rgba(255 255 255 / 0.9);
    flex: 1;
    display: flex;
    flex-direction: column;
    border-radius: 12px;
    padding: 15px;
    box-sizing: border-box;
    overflow: hidden;
  }
  #messages {
    flex: 1;
    overflow-y: auto;
    padding-right: 10px;
  }
  .message {
    max-width: 70%;
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 18px;
    word-wrap: break-word;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.1);
    display: inline-block;
  }
  .message.sent {
    background-color: #27ae60;
    color: white;
    align-self: flex-end;
    border-bottom-right-radius: 4px;
  }
  .message.received {
    background-color: #ececec;
    color: #333;
    align-self: flex-start;
    border-bottom-left-radius: 4px;
  }
  .message img {
    max-width: 100%;
    border-radius: 10px;
    margin-top: 6px;
  }
  #input-area {
    display: flex;
    align-items: center;
    padding: 10px 0 0 0;
    gap: 10px;
  }
  #text-input {
    flex: 1;
    padding: 10px 14px;
    font-size: 1rem;
    border: 1px solid #ccc;
    border-radius: 20px;
    outline: none;
  }
  #file-input {
    border-radius: 8px;
  }
  #send-btn {
    padding: 10px 20px;
    background-color: #27ae60;
    border: none;
    color: white;
    font-weight: 700;
    border-radius: 20px;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }
  #send-btn:hover {
    background-color: #219150;
  }
  /* Scrollbar for messages */
  #messages::-webkit-scrollbar {
    width: 8px;
  }
  #messages::-webkit-scrollbar-thumb {
    background-color: #27ae60;
    border-radius: 4px;
  }
  #messages::-webkit-scrollbar-track {
    background: #f1f1f1;
  }
</style>
</head>
<body>

<header>Помощь украинцам и русскоязычным в Праге</header>

<nav>
  <button class="tab-btn active" data-tab="home">Главная</button>
  <button class="tab-btn" data-tab="info">Полезная информация</button>
  <button class="tab-btn" data-tab="chat">Прага Фушки (чат)</button>
</nav>

<main>
  <!-- Главная -->
  <section id="home" class="active" role="region" aria-label="Главная страница">
    <h2>Категории объявлений</h2>
    <ul class="category-list">
      <li>Жильё (аренда, поиск соседей)</li>
      <li>Работа (подработка, курьер, уборка и т.д.)</li>
      <li>Продажа и обмен вещей</li>
      <li>Услуги (переводы, помощь с документами)</li>
    </ul>

    <h2>Карта с важными точками</h2>
    <nav aria-label="Фильтр категорий на карте">
      <button data-filter="all" class="active" aria-pressed="true">Все</button>
      <button data-filter="medicine" aria-pressed="false">Медицина</button>
      <button data-filter="social" aria-pressed="false">Соцслужбы</button>
      <button data-filter="shops" aria-pressed="false">Магазины</button>
      <button data-filter="law" aria-pressed="false">Юридическая помощь</button>
    </nav>
    <div id="map" tabindex="0" aria-label="Интерактивная карта"></div>

    <h2>Обратная связь</h2>
    <form id="contact-form" aria-label="Форма обратной связи">
      <label for="name">Имя</label>
      <input type="text" id="name" name="name" required autocomplete="name" />

      <label for="email">Email</label>
      <input type="email" id="email" name="email" required autocomplete="email" />

      <label for="message">Сообщение</label>
      <textarea id="message" name="message" rows="4" required></textarea>

      <button type="submit">Отправить</button>
    </form>
  </section>

  <!-- Полезная информация -->
  <section id="info" role="region" aria-label="Полезная информация">
    <h2>Полезная информация и контакты</h2>

    <h3>Медицинские учреждения</h3>
    <ul>
      <li><b>Больница Мотол</b> — V Úvalu 84, Praha 5<br/>
        Телефон: +420 224 431 111<br/>
        Языки: русский, украинский, чешский<br/>
        Круглосуточно
      </li>
      <li><b>Поликлиника Прага 1</b> — Jungmannova 35, Praha 1<br/>
        Телефон: +420 123 456 789<br/>
        Языки: чешский, русский<br/>
        9:00–17:00
      </li>
      <li><b>Аптека «Свобода»</b> — Karlovo náměstí 14, Praha 2<br/>
        Телефон: +420 987 654 321<br/>
        Языки: русский, украинский<br/>
        8:00–20:00
      </li>
    </ul>

    <h3>Социальные службы и волонтёры</h3>
    <ul>
      <li><b>OAMP Прага 1</b> — Jungmannova 35, Praha 1<br/>
        Телефон: +420 123 456 789<br/>
        Языки: чешский, русский<br/>
        9:00–17:00
      </li>
      <li><b>Волонтёрский центр «Pomoc»</b> — Vinohradská 52, Praha 3<br/>
        Телефон: +420 555 666 777<br/>
        Языки: украинский, русский<br/>
        10:00–18:00
      </li>
    </ul>

    <h3>Юридическая помощь</h3>
    <ul>
      <li><b>Консультация «Pravda»</b> — Národní 10, Praha 1<br/>
        Телефон: +420 555 123 456<br/>
        Языки: русский, чешский<br/>
        9:00–18:00
      </li>
      <li><b>Центр правовой поддержки</b> — Jungmannova 35, Praha 1<br/>
        Телефон: +420 555 654 321<br/>
        Языки: украинский, русский<br/>
        9:00–17:00
      </li>
    </ul>

    <h3>Магазины и курсы чешского языка</h3>
    <ul>
      <li><b>Магазин для мигрантов «Pomoc»</b> — Karlovo nám. 23, Praha 2<br/>
        Телефон: +420 987 654 321<br/>
        Языки: русский, украинский<br/>
        10:00–20:00
      </li>
      <li><b>Курсы чешского языка «Česky snadno»</b> — Vodičkova 14, Praha 1<br/>
        Телефон: +420 222 333 444<br/>
        Языки: украинский, русский, чешский<br/>
        9:00–19:00
      </li>
    </ul>
  </section>

  <!-- Чат -->
  <section id="chat" role="region" aria-label="Онлайн чат Прага Фушки">
    <div id="chat-section">
      <div id="chat-container" role="main" aria-live="polite" aria-label="Чат сообщений">
        <div id="messages" tabindex="0"></div>

        <div id="input-area">
          <input
            type="text"
            id="text-input"
            placeholder="Напишите сообщение..."
            aria-label="Поле ввода текста сообщения"
          />
          <input type="file" id="file-input" accept="image/*" aria-label="Выбрать изображение для отправки" />
          <button id="send-btn" aria-label="Отправить сообщение">Отправить</button>
        </div>
      </div>
    </div>
  </section>
</main>

<footer style="background:#2c7a7b; color:white; padding:15px 20px; text-align:center; font-weight:700;">
  © 2025 Помощь в Праге для украинцев и русскоязычных
</footer>

<!-- Leaflet JS -->
<script
  src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-oUfkW33pM3Ef1mLuMuI1dx13B4E3UdyH6uyb+ZTOQoY="
  crossorigin=""
></script>

<script>
  // --- Переключение вкладок ---
  const tabButtons = document.querySelectorAll('nav button.tab-btn');
  const sections = document.querySelectorAll('main > section');

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      const tab = btn.dataset.tab;
      sections.forEach(sec => {
        sec.classList.toggle('active', sec.id === tab);
      });

      // Если переключаемся на карту — сброс фильтров на "Все"
      if(tab === 'home') {
        filterButtons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-pressed', 'false');
          if(b.dataset.filter === 'all') {
            b.classList.add('active');
            b.setAttribute('aria-pressed', 'true');
          }
        });
        filterMarkers('all');
      }
    });
  });

  // --- КАРТА ---
  const map = L.map("map").setView([50.0755, 14.4378], 12); // Центр Праги

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution:
      '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const points = [
    {
      id: 1,
      category: "medicine",
      name: "Больница Мотол",
      coords: [50.055, 14.383],
      lang: ["рус", "укр", "чеш"],
      address: "V Úvalu 84, Praha 5",
      phone: "+420 224 431 111",
      hours: "Круглосуточно",
      description: "Больница с обслуживанием на русском, украинском и чешском"
    },
    {
      id: 2,
      category: "medicine",
      name: "Поликлиника Прага 1",
      coords: [50.085, 14.421],
      lang: ["рус", "чеш"],
      address: "Jungmannova 35, Praha 1",
      phone: "+420 123 456 789",
      hours: "9:00–17:00",
      description: "Поликлиника с русскоязычными врачами"
    },
    {
      id: 3,
      category: "medicine",
      name: "Аптека «Свобода»",
      coords: [50.083, 14.417],
      lang: ["рус", "укр"],
      address: "Karlovo náměstí 14, Praha 2",
      phone: "+420 987 654 321",
      hours: "8:00–20:00",
      description: "Аптека с консультантами, говорящими на русском и украинском"
    },
    {
      id: 4,
      category: "social",
      name: "OAMP Прага 1",
      coords: [50.084, 14.419],
      lang: ["чеш", "рус"],
      address: "Jungmannova 35, Praha 1",
      phone: "+420 123 456 789",
      hours: "9:00–17:00",
      description: "Центр временной защиты"
    },
    {
      id: 5,
      category: "social",
      name: "Волонтёрский центр «Pomoc»",
      coords: [50.076, 14.437],
      lang: ["укр", "рус"],
      address: "Vinohradská 52, Praha 3",
      phone: "+420 555 666 777",
      hours: "10:00–18:00",
      description: "Поддержка мигрантов и волонтёрская помощь"
    },
    {
      id: 6,
      category: "law",
      name: "Консультация «Pravda»",
      coords: [50.086, 14.420],
      lang: ["рус", "чеш"],
      address: "Národní 10, Praha 1",
      phone: "+420 555 123 456",
      hours: "9:00–18:00",
      description: "Юридическая помощь для мигрантов"
    },
    {
      id: 7,
      category: "law",
      name: "Центр правовой поддержки",
      coords: [50.084, 14.418],
      lang: ["укр", "рус"],
      address: "Jungmannova 35, Praha 1",
      phone: "+420 555 654 321",
      hours: "9:00–17:00",
      description: "Юридическая консультация и поддержка"
    },
    {
      id: 8,
      category: "shops",
      name: "Магазин для мигрантов «Pomoc»",
      coords: [50.084, 14.416],
      lang: ["рус", "укр"],
      address: "Karlovo nám. 23, Praha 2",
      phone: "+420 987 654 321",
      hours: "10:00–20:00",
      description: "Товары и продукты для мигрантов"
    },
    {
      id: 9,
      category: "shops",
      name: "Курсы чешского языка «Česky snadno»",
      coords: [50.081, 14.420],
      lang: ["укр", "рус", "чеш"],
      address: "Vodičkova 14, Praha 1",
      phone: "+420 222 333 444",
      hours: "9:00–19:00",
      description: "Курсы чешского для новичков"
    }
  ];

  const markers = [];

  // Иконки для разных категорий (по цвету)
  const iconColors = {
    medicine: "red",
    social: "blue",
    shops: "green",
    law: "purple"
  };

  function createIcon(color) {
    return L.icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });
  }

  // Добавляем маркеры на карту
  points.forEach(point => {
    const icon = createIcon(iconColors[point.category] || 'blue');
    const marker = L.marker(point.coords, {icon}).addTo(map);
    marker.category = point.category;
    marker.bindPopup(`
      <b>${point.name}</b><br/>
      ${point.description}<br/>
      <b>Адрес:</b> ${point.address}<br/>
      <b>Телефон:</b> <a href="tel:${point.phone}">${point.phone}</a><br/>
      <b>Часы работы:</b> ${point.hours}<br/>
      <b>Языки:</b> ${point.lang.join(', ')}
    `);
    markers.push(marker);
  });

  // Фильтрация маркеров по категориям
  const filterButtons = document.querySelectorAll('nav[aria-label="Фильтр категорий на карте"] button');

  function filterMarkers(category) {
    markers.forEach(marker => {
      if (category === 'all' || marker.category === category) {
        if (!map.hasLayer(marker)) map.addLayer(marker);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    });
  }

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      filterMarkers(btn.dataset.filter);
    });
  });

  // --- Обработка формы обратной связи ---
  const contactForm = document.getElementById('contact-form');
  contactForm.addEventListener('submit', e => {
    e.preventDefault();
    alert('Спасибо за сообщение! Мы свяжемся с вами.');
    contactForm.reset();
  });

  // --- Чат ---
  const messagesDiv = document.getElementById('messages');
  const textInput = document.getElementById('text-input');
  const fileInput = document.getElementById('file-input');
  const sendBtn = document.getElementById('send-btn');

  let messages = [];

  function renderMessages() {
    messagesDiv.innerHTML = '';
    messages.forEach(({ text, type, imgSrc }) => {
      const div = document.createElement('div');
      div.classList.add('message');
      div.classList.add(type === 'sent' ? 'sent' : 'received');

      if(text) {
        const p = document.createElement('p');
        p.textContent = text;
        div.appendChild(p);
      }

      if(imgSrc) {
        const img = document.createElement('img');
        img.src = imgSrc;
        img.alt = "Прикрепленное изображение";
        div.appendChild(img);
      }

      messagesDiv.appendChild(div);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  function addMessage(text, type, imgSrc = null) {
    messages.push({ text, type, imgSrc });
    renderMessages();
  }

  sendBtn.addEventListener('click', () => {
    const text = textInput.value.trim();
    if(!text && !fileInput.files.length) return;

    if(fileInput.files.length) {
      const file = fileInput.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        addMessage(text || null, 'sent', e.target.result);
      };
      reader.readAsDataURL(file);
    } else {
      addMessage(text, 'sent');
    }

    textInput.value = '';
    fileInput.value = '';
    textInput.focus();
  });

  textInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });

  // Приветственное сообщение
  addMessage("Добро пожаловать в чат 'Прага Фушки'! Здесь вы можете делиться фишками и фото.", "received");
</script>

</body>
</html>
