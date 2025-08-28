document.getElementById('adminBtn').addEventListener('click', ()=>{
  // просто переключаемся на вкладку Учасники
  const trg = document.querySelector('.tab-button[data-target="peopleTab"]');
  trg && trg.click();
});
