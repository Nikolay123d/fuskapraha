const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

async function isAdmin(uid) {
  if (!uid) return false;

  // Option A (preferred): custom claim
  try {
    const user = await admin.auth().getUser(uid);
    if (user.customClaims && user.customClaims.admin === true) return true;
  } catch (e) {
    // ignore
  }

  // Option B: RTDB role flag: /roles/{uid}/admin === true
  try {
    const snap = await admin.database().ref(`roles/${uid}/admin`).get();
    if (snap.exists() && snap.val() === true) return true;
  } catch (e) {
    // ignore
  }

  return false;
}

async function getTokensForUid(uid) {
  const snap = await admin.database().ref(`fcmTokens/${uid}`).get();
  if (!snap.exists()) return [];
  const obj = snap.val() || {};
  return Object.keys(obj);
}

exports.sendPromoToUid = functions.https.onRequest(async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const authHeader = req.get('Authorization') || '';
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) return res.status(401).send('Missing Bearer token');

    const idToken = match[1];
    const decoded = await admin.auth().verifyIdToken(idToken);

    const callerUid = decoded.uid;
    const ok = await isAdmin(callerUid);
    if (!ok) return res.status(403).send('Forbidden');

    const { uid, title, body, imageUrl } = (req.body || {});
    if (!uid) return res.status(400).send('Missing uid');

    const tokens = await getTokensForUid(uid);
    if (!tokens.length) return res.status(404).send('No tokens for this UID');

    const message = {
      tokens,
      notification: {
        title: title || 'Makáme.cz',
        body: body || 'Odemkni Privilegium a získej více možností hned teď.'
      },
      webpush: {
        notification: {
          icon: '/img/logo-192.png',
          badge: '/img/logo-192.png',
          image: imageUrl || undefined
        },
        fcmOptions: {
          link: 'https://makame.cz/'
        }
      }
    };

    const resp = await admin.messaging().sendEachForMulticast(message);

    // clean invalid tokens
    const updates = {};
    resp.responses.forEach((r, i) => {
      if (!r.success) {
        const code = (r.error && r.error.code) || '';
        if (code.includes('registration-token-not-registered')) {
          updates[`fcmTokens/${uid}/${tokens[i]}`] = null;
        }
      }
    });
    if (Object.keys(updates).length) {
      await admin.database().ref().update(updates);
    }

    return res.json({ ok: true, sent: resp.successCount, failed: resp.failureCount });
  } catch (e) {
    console.error(e);
    return res.status(500).send(String(e && e.message ? e.message : e));
  }
});
