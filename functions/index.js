const { createHash } = require("crypto");
const admin = require("firebase-admin");
const webpush = require("web-push");
const { defineString, defineSecret } = require("firebase-functions/params");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");

admin.initializeApp();
const db = admin.firestore();

const WEB_PUSH_PUBLIC_KEY = defineString("WEB_PUSH_PUBLIC_KEY");
const WEB_PUSH_SUBJECT = defineString("WEB_PUSH_SUBJECT");
const WEB_PUSH_PRIVATE_KEY = defineSecret("WEB_PUSH_PRIVATE_KEY");

const REGION = "us-central1";
const ORIGIN = "https://widgerestimable93.github.io";
const APPS = {
  baccpro: {
    title: "📚 baccPRO — petit rappel",
    body: "Il est 17 h. Prends quelques minutes pour réviser aujourd’hui.",
    url: "https://widgerestimable93.github.io/baccpro/"
  },
  "9emePRO": {
    title: "📚 9emePRO — petit rappel",
    body: "Il est 17 h. Prends quelques minutes pour réviser aujourd’hui.",
    url: "https://widgerestimable93.github.io/9emePRO/"
  }
};

function applyCors(req, res) {
  if (req.get("origin") !== ORIGIN) return false;
  res.set("Access-Control-Allow-Origin", ORIGIN);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return true;
}

function respond(res, status, payload) {
  return res.status(status).json(payload);
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (_) {}
  }
  return {};
}

function subscriptionId(endpoint) {
  return createHash("sha256").update(endpoint).digest("hex");
}

exports.pushApi = onRequest({ region: REGION }, async (req, res) => {
  if (!applyCors(req, res)) return respond(res, 403, { error: "Origin refusée." });
  if (req.method === "OPTIONS") return;

  if (req.method === "GET" && req.path.endsWith("/public-key")) {
    return respond(res, 200, { publicKey: WEB_PUSH_PUBLIC_KEY.value() });
  }

  if (req.method !== "POST") return respond(res, 405, { error: "Méthode non autorisée." });

  const body = readBody(req);
  const app = APPS[body.app];
  const subscription = body.subscription;
  const action = body.action;

  if (action === "subscribe") {
    if (!app || !subscription || typeof subscription.endpoint !== "string"
        || !subscription.endpoint.startsWith("https://")
        || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return respond(res, 400, { error: "Abonnement Web Push invalide." });
    }
    const id = subscriptionId(subscription.endpoint);
    await db.collection("webPushSubscriptions").doc(id).set({
      app: body.app,
      subscription,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return respond(res, 200, { ok: true });
  }

  if (action === "unsubscribe") {
    if (typeof body.endpoint !== "string" || !body.endpoint.startsWith("https://")) {
      return respond(res, 400, { error: "Endpoint invalide." });
    }
    await db.collection("webPushSubscriptions").doc(subscriptionId(body.endpoint)).delete();
    return respond(res, 200, { ok: true });
  }

  return respond(res, 400, { error: "Action inconnue." });
});

exports.sendDailyReminders = onSchedule({
  schedule: "0 17 * * *",
  timeZone: "America/Port-au-Prince",
  region: REGION,
  secrets: [WEB_PUSH_PRIVATE_KEY],
  timeoutSeconds: 540
}, async () => {
  const publicKey = WEB_PUSH_PUBLIC_KEY.value();
  const privateKey = WEB_PUSH_PRIVATE_KEY.value();
  const subject = WEB_PUSH_SUBJECT.value();
  if (!publicKey || !privateKey || !subject) {
    throw new Error("Configure WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY et WEB_PUSH_SUBJECT.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const collection = db.collection("webPushSubscriptions");
  let cursor = null;
  while (true) {
    let query = collection.orderBy(admin.firestore.FieldPath.documentId()).limit(100);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) break;
    cursor = snapshot.docs[snapshot.docs.length - 1];

    await Promise.all(snapshot.docs.map(async (doc) => {
      const record = doc.data();
      const message = APPS[record.app];
      if (!message || !record.subscription) {
        await doc.ref.delete();
        return;
      }
      const payload = JSON.stringify({
        title: message.title,
        body: message.body,
        app: record.app,
        url: message.url
      });
      try {
        await webpush.sendNotification(record.subscription, payload, { TTL: 3600, urgency: "normal" });
      } catch (error) {
        const status = error && error.statusCode;
        if (status === 404 || status === 410) {
          await doc.ref.delete();
          return;
        }
        console.error("Échec d’envoi Web Push", { app: record.app, status });
      }
    }));
  }
});
