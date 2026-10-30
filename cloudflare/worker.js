const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const ALLOWED_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'web.push.apple.com',
  'updates.push.services.mozilla.com',
]);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

function corsHeaders(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function checkOrigin(request, env) {
  return request.headers.get('Origin') === env.APP_ORIGIN;
}

function base64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(token, request, env) {
  if (typeof token !== 'string' || token.length < 10 || token.length > 2048) return false;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!response.ok) return false;
  const result = await response.json();
  return result.success === true && result.hostname === new URL(env.APP_ORIGIN).hostname &&
    result.action === 'subscribe';
}

function validSubscription(subscription) {
  if (!subscription || typeof subscription.endpoint !== 'string' ||
      typeof subscription.keys?.p256dh !== 'string' || typeof subscription.keys?.auth !== 'string') {
    return false;
  }
  try {
    const endpoint = new URL(subscription.endpoint);
    return endpoint.protocol === 'https:' && ALLOWED_PUSH_HOSTS.has(endpoint.hostname);
  } catch (_) {
    return false;
  }
}

async function route(request, env) {
  const origin = request.headers.get('Origin') || '';
  if (!checkOrigin(request, env)) return json({ error: 'Origine refusée.' }, 403);
  const headers = corsHeaders(origin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return json({ error: 'Méthode refusée.' }, 405, headers);

  const path = new URL(request.url).pathname;
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return json({ error: 'Corps JSON invalide.' }, 400, headers);
  }

  if (path === '/api/subscribe') {
    if (!await verifyTurnstile(body.turnstileToken, request, env)) {
      return json({ error: 'Vérification anti-abus refusée.' }, 403, headers);
    }
    const subscription = body.subscription;
    if (!validSubscription(subscription)) return json({ error: 'Abonnement Push invalide.' }, 400, headers);
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, endpoint, p256dh, auth, updated_at)
       VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh,
         auth = excluded.auth, updated_at = CURRENT_TIMESTAMP`
    ).bind(
      await sha256(subscription.endpoint),
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth
    ).run();
    return json({ enabled: true }, 200, headers);
  }

  if (path === '/api/unsubscribe') {
    if (typeof body.endpoint !== 'string') return json({ error: 'Endpoint invalide.' }, 400, headers);
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?1')
      .bind(await sha256(body.endpoint)).run();
    return json({ enabled: false }, 200, headers);
  }

  return json({ error: 'Route introuvable.' }, 404, headers);
}

function bytesFromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodePart(value) {
  return base64Url(new TextEncoder().encode(value));
}

async function createVapidToken(endpoint, env) {
  const privateJwk = JSON.parse(env.VAPID_PRIVATE_JWK);
  const key = await crypto.subtle.importKey(
    'jwk', privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const publicJwk = { kty: privateJwk.kty, crv: privateJwk.crv, x: privateJwk.x, y: privateJwk.y };
  const header = encodePart(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const payload = encodePart(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT,
  }));
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput)
  );
  return {
    token: `${signingInput}.${base64Url(new Uint8Array(signature))}`,
    publicJwk,
  };
}

async function sendEmptyPush(subscription, env) {
  const { token, publicJwk } = await createVapidToken(subscription.endpoint, env);
  const publicKey = new Uint8Array(65);
  publicKey[0] = 4;
  publicKey.set(bytesFromBase64Url(publicJwk.x), 1);
  publicKey.set(bytesFromBase64Url(publicJwk.y), 33);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${token}, k=${base64Url(publicKey)}`,
      ttl: '86400',
      urgency: 'normal',
    },
  });
}

async function sendDailyReminders(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, endpoint, p256dh, auth FROM push_subscriptions'
  ).all();
  for (let offset = 0; offset < results.length; offset += 100) {
    const batch = results.slice(offset, offset + 100).map((subscription) => ({ body: subscription }));
    await env.PUSH_QUEUE.sendBatch(batch);
  }
}

export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      console.error('Erreur API Push:', error?.message || 'inconnue');
      return json({ error: 'Erreur temporaire du service Push.' }, 500, corsHeaders(request.headers.get('Origin') || ''));
    }
  },

  async scheduled(controller, env, ctx) {
    const localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Port-au-Prince',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(controller.scheduledTime));
    if (localTime === '17:00') ctx.waitUntil(sendDailyReminders(env));
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      const subscription = message.body;
      try {
        const response = await sendEmptyPush(subscription, env);
        if (response.status === 404 || response.status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?1')
            .bind(subscription.id).run();
          message.ack();
        } else if (response.status === 429 || response.status >= 500) {
          message.retry({ delaySeconds: 60 });
        } else {
          if (!response.ok) console.error('Échec d’envoi Push, statut:', response.status);
          message.ack();
        }
      } catch (_) {
        message.retry({ delaySeconds: 60 });
      }
    }
  },
};
