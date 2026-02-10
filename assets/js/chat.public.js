(function(){
auth.onAuthStateChanged(function(user){
  if(!user) return;

  var chatRef = db.ref('messages/public').limitToLast(50);
  var box = document.getElementById('chat-messages');
  var input = document.getElementById('chat-input');
  var send = document.getElementById('chat-send');

  chatRef.on('child_added', function(s){
    var m = s.val();
    var div = document.createElement('div');
    div.textContent = m.uid + ': ' + m.text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  });

  send.onclick = function(){
    if(!input.value) return;
    db.ref('messages/public').push({
      uid: user.uid,
      text: input.value,
      ts: Date.now()
    });
    input.value='';
  };
});
})();