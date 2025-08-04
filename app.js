
Меню навигации
фускакрапраха

Код
Проблемы
Коммит 7828481
Николай123д
Николай123д
автор
29 минут назад
·
·

Проверено
Создать app.js
Подписано: Николай123d <urciknikolaj642@gmail.com>
основной
1 родитель
95e2cff
совершить
7828481
1 файл изменен
Поиск в коде
 
‎css/js/app.js
+ 214
Изменено строк: 214 добавлений и 0 удалений.
Номер строки исходного файла	Номер строки различия	Изменение линии дифференциала
@@ -0,0 +1,214 @@
// === Firebase config ===
const firebaseConfig = {
  apiKey: "AIzaSyDV2BslF-Ll37a1XO3GEfzNMXa7YsSXL1o",
  authDomain: "web-app-b4633.firebaseapp.com",
  databaseURL: "https://web-app-b4633-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "web-app-b4633",
  storageBucket: "web-app-b4633.appspot.com",
  messagingSenderId: "1041887915171",
  appId: "1:1041887915171:web:84d62eae54e9291b47a316",
  measurementId: "G-C65BPE81SJ"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
// --- Переключение вкладок ---
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
tabButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    tabButtons.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.getElementById(tab).classList.add("active");
    if (tab === "map") {
      setTimeout(() => { map.invalidateSize(); }, 300); // Обновляем карту при показе
    }
  });
});
// --- Чат ---
const messagesEl = document.getElementById("messages");
const textInput = document.getElementById("text-input");
const fileInput = document.getElementById("file-input");
const btnPhoto = document.getElementById("btn-photo");
const sendBtn = document.getElementById("send-btn");
let currentUser = null;
const messageIds = new Set();
function escapeHTML(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, m =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
  );
}
function addMessageToDOM(msg) {
  if (messageIds.has(msg.id)) return;
  messageIds.add(msg.id);
  const div = document.createElement("div");
  div.classList.add("message");
  div.classList.add(msg.uid === (currentUser ? currentUser.uid : "") ? "sent" : "received");
  let content = "";
  if (msg.nick) content += `<strong>${escapeHTML(msg.nick)}:</strong><br>`;
  if (msg.text) content += escapeHTML(msg.text);
  if (msg.image) content += `<br><img src="${msg.image}" alt="Фото" />`;
  div.innerHTML = content;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  // Добавляем возможность удаления своих сообщений (если нужно)
  if (msg.uid === (currentUser ? currentUser.uid : "")) {
    div.style.position = "relative";
    const delBtn = document.createElement("button");
    delBtn.textContent = "✖";
    delBtn.title = "Видалити повідомлення";
    delBtn.style.position = "absolute";
    delBtn.style.top = "5px";
    delBtn.style.right = "8px";
    delBtn.style.background = "transparent";
    delBtn.style.border = "none";
    delBtn.style.color = msg.text ? "#000" : "#fff";
    delBtn.style.cursor = "pointer";
    delBtn.style.fontSize = "14px";
    delBtn.addEventListener("click", () => {
      if (confirm("Ви дійсно хочете видалити це повідомлення?")) {
        db.ref("messages/" + msg.id).remove();
        messagesEl.removeChild(div);
        messageIds.delete(msg.id);
      }
    });
    div.appendChild(delBtn);
  }
}
async function loadMessages() {
  messagesEl.innerHTML = "";
  messageIds.clear();
  db.ref('messages').off(); // Отписываемся, если было
  db.ref('messages').orderByChild("timestamp").limitToLast(100).on('child_added', snapshot => {
    const msg = snapshot.val();
    addMessageToDOM(msg);
  });
  db.ref('messages').on('child_removed', snapshot => {
    const removedMsg = snapshot.val();
    // Удаляем из DOM если есть
    [...messagesEl.children].forEach(div => {
      if (div.querySelector("strong") && div.innerHTML.includes(removedMsg.id￼Enter
     // Если сообщение удалено, удаляем из DOM
      if (messageIds.has(removedMsg.id)) {
        div.remove();
        messageIds.delete(removedMsg.id);
      }
    });
  });
}
// Загрузка сообщений при запуске (после логина)
function startChat() {
  loadMessages();
  document.getElementById("register-modal").classList.remove("active");
}
// Отправка сообщения
sendBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  const text = textInput.value.trim();
  const file = fileInput.files[0];
  const msg = {
    id: Date.now().toString(),
    uid: currentUser.uid,
    nick: localStorage.getItem("nick") || "",
    timestamp: firebase.database.ServerValue.TIMESTAMP
  };
  if (text) msg.text = text;
  if (file) {
    const reader = new FileReader();
    reader.onload = () => {
      msg.image = reader.result;
      db.ref("messages/" + msg.id).set(msg);
    };
    reader.readAsDataURL(file);
  } else {
    db.ref("messages/" + msg.id).set(msg);
  }
  textInput.value = "";
  fileInput.value = "";
});
// Кнопка 📷 открывает выбор файла
btnPhoto.addEventListener("click", () => fileInput.click());
// === Регистрация ===
const registerForm = document.getElementById("register-form");
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  const nick = document.getElementById("reg-nick").value.trim();
  if (!email || !password || !nick) return alert("Заповніть всі поля");
  try {
    const userCred = await auth.createUserWithEmailAndPassword(email, password);
    currentUser = userCred.user;
    localStorage.setItem("nick", nick);
    startChat();
  } catch (err) {
    alert(err.message);
  }
});
// === Авторизация (если уже зарегистрирован) ===
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    startChat();
  } else {
    document.getElementById("register-modal").classList.add("active");
  }
});
// === Карта ===
const map = L.map('map').setView([50.0755, 14.4378], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: 'Map data © OpenStreetMap contributors',
}).addTo(map);
// Пример 20+ точек (можно заменить своими)
const locations = [
  [50.087, 14.420],
  [50.075, 14.445],
  [50.072, 14.438],
  [50.078, 14.427],
  [50.089, 14.415],
  [50.080, 14.400],
  [50.082, 14.430],
  [50.076, 14.450],
  [50.090, 14.420],
  [50.084, 14.410],
  [50.088, 14.445],
  [50.081, 14.435],
  [50.074, 14.424],
  [50.079, 14.418],
  [50.086, 14.440],
  [50.091, 14.448],
  [50.073, 14.419],
  [50.085, 14.437],
  [50.070, 14.430],
  [50.082, 14.422],
  [50.077, 14.416]
];
locations.forEach(([lat, lng], i) => {
  L.marker([lat, lng]).addTo(map)
    .bindPopup(`Допомога #${i + 1}`);
});
                           
