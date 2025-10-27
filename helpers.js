
const db=firebase.database();
async function fetchUserPublic(uid){
  const up = (await db.ref('usersPublic/'+uid).get()).val();
  if (up) return up;
  const u = (await db.ref('users/'+uid).get()).val();
  if (u) return { nick: u.name || u.nick || 'Uživatel', email: u.email, avatar: u.avatar };
  const p = (await db.ref('profiles/'+uid).get()).val();
  if (p) return p;
  return { nick:'Uživatel' };
}
window.fetchUserPublic = fetchUserPublic;
