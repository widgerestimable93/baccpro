const { createHash } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { defineSecret, defineString } = require('firebase-functions/params');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');
const webpush = require('web-push');

initializeApp();
const db = getFirestore();
const vapidPublicKey = defineString('BACCPRO_VAPID_PUBLIC_KEY');
const vapidPrivateKey = defineSecret('BACCPRO_VAPID_PRIVATE_KEY');
const PUSH_COLLECTION = 'baccproDailyPushSubscriptions';

function subscriptionId(endpoint) {
  return createHash('sha256').update(endpoint).digest('hex');
}

exports.getDailyPushConfig = onCall({ enforceAppCheck: true }, async () => ({
  vapidPublicKey: vapidPublicKey.value(),
}));

exports.registerDailyPush = onCall({ enforceAppCheck: true }, async (request) => {
  const subscription = request.data && request.data.subscription;
  const endpoint = subscription && subscription.endpoint;
  const keys = subscription && subscription.keys;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') ||
      !keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
    throw new HttpsError('invalid-argument', 'Abonnement Push invalide.');
  }

  await db.collection(PUSH_COLLECTION).doc(subscriptionId(endpoint)).set({
    subscription,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { enabled: true };
});

exports.unregisterDailyPush = onCall({ enforceAppCheck: true }, async (request) => {
  const endpoint = request.data && request.data.endpoint;
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://')) {
    throw new HttpsError('invalid-argument', 'Abonnement Push invalide.');
  }
  await db.collection(PUSH_COLLECTION).doc(subscriptionId(endpoint)).delete();
  return { enabled: false };
});

exports.sendDailyReminder = onSchedule({
  schedule: '0 17 * * *',
  timeZone: 'America/Port-au-Prince',
  secrets: [vapidPrivateKey],
  retryCount: 2,
}, async () => {
  webpush.setVapidDetails(
    'https://widgerestimable93.github.io/baccpro/',
    vapidPublicKey.value(),
    vapidPrivateKey.value()
  );

  const subscriptions = await db.collection(PUSH_COLLECTION).get();
  const message = JSON.stringify({
    title: '🔥 baccPRO — C’est l’heure de réviser !',
    body: 'Fais un quiz aujourd’hui pour garder ton élan.',
    url: './',
  });

  const results = await Promise.allSettled(subscriptions.docs.map(async (doc) => {
    try {
      await webpush.sendNotification(doc.get('subscription'), message, { TTL: 3600 });
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await doc.ref.delete();
        return;
      }
      throw error;
    }
  }));

  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) logger.error('Certains rappels baccPRO n’ont pas été envoyés.', {
    failedCount: failed.length,
    subscriptionCount: subscriptions.size,
  });
});
