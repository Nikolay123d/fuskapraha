window.I18N=(function(){
  const dict={
    cs:{
      brand_slogan:"— práce začíná z makame.cz",
      city:"Město:",
      chat:"Chat",
      rent:"Pronájem",
      map:"Mapa",
      dm:"Osobní",
      help:"Pomoc",
      announce:"Oznámení",
      admin:"Admin",
      send:"Odeslat",
      addFriend:"Přidat",
      profile:"Můj profil",
      buyPremium:"Koupit Premium",
      resetPass:"Obnovit heslo",
      signout:"Odhlásit",
      askNick:"Požádat o změnu nicku",
      qrPay:"QR platba",
      requests:"Žádosti o přátelství",
      incoming:"Příchozí",
      outgoing:"Odchozí",
      accept:"Přijmout",
      decline:"Odmítnout"
    },
    uk:{
      brand_slogan:"— робота починається з makame.cz",
      city:"Місто:",
      chat:"Чат",
      rent:"Оренда",
      map:"Карта",
      dm:"Особисті",
      help:"Допомога",
      announce:"Оголошення",
      admin:"Адмін",
      send:"Надіслати",
      addFriend:"Додати",
      profile:"Мій профіль",
      buyPremium:"Купити Преміум",
      resetPass:"Скинути пароль",
      signout:"Вийти",
      askNick:"Запросити зміну ніку",
      qrPay:"QR платіж",
      requests:"Заявки в друзі",
      incoming:"Вхідні",
      outgoing:"Вихідні",
      accept:"Прийняти",
      decline:"Відхилити"
    }
  };
  let lang=localStorage.getItem('lang')||'cs';
  function t(k){ return (dict[lang]&&dict[lang][k]) || (dict.cs[k]||k); }
  function apply(root=document){
    root.querySelectorAll('[data-i18n]').forEach(el=>{
      const key=el.getAttribute('data-i18n');
      el.textContent=t(key);
    });
  }
  function setLang(l){ lang=l; localStorage.setItem('lang',l); apply(); }
  return {t,apply,setLang};
})();
document.addEventListener('DOMContentLoaded',()=>I18N.apply());