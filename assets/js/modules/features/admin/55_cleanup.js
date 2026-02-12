
import { isAdmin } from "../../firebase/10_access.js";

/**
 * Cleanup (retention): delete messages older than 14 days.
 * To keep client cheap: run only when admin opens Admin view and clicks button.
 * Paths:
 *  - messages/global (by ts)
 *  - privateMessages/<room> (by ts)  [rooms enumerated by privateRoomsByUser/<adminUid>/... OR by scanning inboxMeta]
 *
 * Production upgrade: scheduled Cloud Function. But client-admin cleanup is still useful.
 */

const DAY = 24*60*60*1000;
const RET_MS = 14*DAY;

async function deleteOlderThan(ref, oldestTs){
  const snap = await ref.orderByChild("ts").endAt(oldestTs).limitToLast(500).get();
  const v = snap.val()||{};
  const updates = {};
  for(const [k,m] of Object.entries(v)){
    if((m?.ts||0) <= oldestTs){
      updates[k] = null;
    }
  }
  if(Object.keys(updates).length){
    await ref.update(updates);
  }
  return Object.keys(updates).length;
}

export async function cleanupNow(){
  if(!isAdmin()) return alert("Admin only");
  const cutoff = Date.now() - RET_MS;

  let removed = 0;

  // 1) Global chat
  removed += await deleteOlderThan(firebase.database().ref("messages/global"), cutoff);

  // 2) DMs: enumerate rooms from admin inboxMeta
  const me = firebase.auth().currentUser;
  const inboxSnap = await firebase.database().ref("inboxMeta/"+me.uid).get();
  const inbox = inboxSnap.val()||{};
  const rooms = Object.keys(inbox);

  for(const room of rooms){
    removed += await deleteOlderThan(firebase.database().ref("privateMessages/"+room), cutoff);
  }

  alert("Cleanup done. Removed: "+removed);
}
