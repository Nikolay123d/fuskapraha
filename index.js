
const {onValueCreated} = require("firebase-functions/v2/database");
const {logger} = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();
const {v3} = require("@google-cloud/translate");
const translateClient = new v3.TranslationServiceClient();
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const LOCATION = "global";
async function translateText(text, target) {
  if(!text || !target) return null;
  const request = { parent: `projects/${PROJECT_ID}/locations/${LOCATION}`, contents: [text], targetLanguageCode: target };
  const [response] = await translateClient.translateText(request);
  return response?.translations?.[0]?.translatedText || null;
}
async function translateNode(refPath) {
  const snap = await admin.database().ref(refPath).get();
  const val = snap.val(); if(!val || !val.text) return;
  if(val.translations && (val.translations.cs || val.translations.uk)) return;
  try { const [cs, uk] = await Promise.all([translateText(val.text, "cs"), translateText(val.text, "uk")]);
    await admin.database().ref(refPath).update({ translations: { cs: cs || null, uk: uk || null } });
    logger.info("Translated", {refPath});
  } catch (e) { logger.error("Translate error", {refPath, error: e}); }
}
exports.translateCityChat = onValueCreated("/messages/{city}/{msgId}", async (event) => {
  const path = `messages/${event.params.city}/${event.params.msgId}`;
  return translateNode(path);
});
exports.translateRent = onValueCreated("/rentMessages/{city}/{msgId}", async (event) => {
  const path = `rentMessages/${event.params.city}/${event.params.msgId}`;
  return translateNode(path);
});
exports.translateDm = onValueCreated("/dm/{dialogId}/items/{msgId}", async (event) => {
  const path = `dm/${event.params.dialogId}/items/${event.params.msgId}`;
  return translateNode(path);
});
