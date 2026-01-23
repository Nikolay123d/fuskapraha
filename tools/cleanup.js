#!/usr/bin/env node
/**
 * Makáme.cz / Praha Fušky — retention cleanup (Admin SDK)
 *
 * Deletes messages older than RETENTION_DAYS from:
 *  - messages/{city}
 *  - rentMessages/{city}
 *  - privateMessages/{roomId}
 *
 * Optional archive (disabled by default):
 *  - archive/messages/{city}/{YYYYMM}/{msgId}
 *  - archive/privateMessagesByUser/{uid}/{YYYYMM}/{roomId}/{msgId}   (if you implement per-user archive)
 *
 * Requirements:
 *   npm i firebase-admin
 *
 * Auth:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json
 *   or run in an environment with Application Default Credentials.
 *
 * Usage:
 *   node tools/cleanup.js --days 14 --dry
 *   node tools/cleanup.js --days 14
 *
 * Notes:
 * - Uses indexed queries: orderByChild('ts').endAt(cutoff).limitToFirst(BATCH)
 * - Deletes in small batches to avoid timeouts.
 */

const admin = require('firebase-admin');

const args = process.argv.slice(2);
const getArg = (k, def=null) => {
  const i = args.indexOf(k);
  return i >= 0 ? (args[i+1] ?? true) : def;
};

const RETENTION_DAYS = Number(getArg('--days', 14));
const DRY = args.includes('--dry');
const BATCH = Number(getArg('--batch', 500));
const MAX_ROOMS = Number(getArg('--maxRooms', 5000));

function yyyymm(ts){
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth()+1).padStart(2,'0');
  return `${y}${m}`;
}

async function init(){
  if(!admin.apps.length){
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
    });
  }
  return admin.database();
}

async function cleanupByTs(db, path, cutoff, batch=BATCH){
  let total = 0;
  while(true){
    const snap = await db.ref(path).orderByChild('ts').endAt(cutoff).limitToFirst(batch).get();
    if(!snap.exists()) break;
    const updates = {};
    snap.forEach(ch => { updates[`${path}/${ch.key}`] = null; });
    const n = Object.keys(updates).length;
    if(DRY){
      console.log(`[DRY] ${path}: would delete ${n}`);
    }else{
      await db.ref().update(updates);
      console.log(`${path}: deleted ${n}`);
    }
    total += n;
    if(n < batch) break;
  }
  return total;
}

async function main(){
  const db = await init();
  const now = Date.now();
  const cutoff = now - RETENTION_DAYS*24*60*60*1000;
  console.log(`Retention cleanup: days=${RETENTION_DAYS} cutoff=${new Date(cutoff).toISOString()} dry=${DRY}`);

  // Cities list (keep in sync with your app)
  const cities = (process.env.CITIES || 'Praha,Brno,Ostrava,Plzen,Liberec').split(',').map(s=>s.trim()).filter(Boolean);

  let total = 0;
  for(const c of cities){
    total += await cleanupByTs(db, `messages/${c}`, cutoff);
    total += await cleanupByTs(db, `rentMessages/${c}`, cutoff);
  }

  // DM rooms
  const roomsSnap = await db.ref('privateMessages').limitToFirst(MAX_ROOMS).get();
  const rooms = roomsSnap.exists() ? Object.keys(roomsSnap.val() || {}) : [];
  console.log(`Rooms: ${rooms.length}`);
  for(const roomId of rooms){
    total += await cleanupByTs(db, `privateMessages/${roomId}`, cutoff);
  }

  console.log(`Done. Total deleted: ${total}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
