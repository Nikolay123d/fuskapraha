(function(){
var currentRoom = null;

auth.onAuthStateChanged(function(user){
  if(!user) return;

  var list = document.getElementById('dm-list');
  var roomBox = document.getElementById('dm-room');
  var msgs = document.getElementById('dm-messages');
  var input = document.getElementById('dm-input');
  var send = document.getElementById('dm-send');

  db.ref('dmRooms/'+user.uid).on('child_added', function(s){
    var peer = s.key;
    var div = document.createElement('div');
    div.textContent = 'Chat with ' + peer;
    div.onclick = function(){
      openRoom(peer);
    };
    list.appendChild(div);
  });

  function openRoom(peer){
    currentRoom = [user.uid, peer].sort().join('_');
    roomBox.style.display = 'block';
    msgs.innerHTML = '';
    db.ref('dmMessages/'+currentRoom).limitToLast(50).on('child_added', function(s){
      var m = s.val();
      var d = document.createElement('div');
      d.textContent = m.uid + ': ' + m.text;
      msgs.appendChild(d);
      msgs.scrollTop = msgs.scrollHeight;
    });
  }

  send.onclick = function(){
    if(!input.value || !currentRoom) return;
    db.ref('dmMessages/'+currentRoom).push({
      uid: user.uid,
      text: input.value,
      ts: Date.now()
    });
    input.value='';
  };
});
})();