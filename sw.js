// baccPRO — Service Worker (fonctionnement hors-ligne)
// Stratégie :
//  • index.html      : cache d'abord (démarrage instantané, même sans réseau) + mise à jour en arrière-plan
//  • questions.json  : réseau d'abord (5 s max) puis cache → toujours à jour quand internet est là
//  • autres fichiers : cache d'abord + mise à jour en arrière-plan
//  • Apps Script, Google Sign-In, APK : jamais interceptés
const VERSION = 'baccpro-v1';
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-512-maskable.png', './questions.json', './conditions.html', './google-sign-in.js'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      // add() un par un : un fichier absent ne fait pas échouer toute l'installation
      return Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'script.google.com' || url.hostname.endsWith('googleusercontent.com') ||
      url.hostname === 'accounts.google.com' || url.hostname.endsWith('gstatic.com') && url.hostname !== 'fonts.gstatic.com') return;
  if (/\.apk$/i.test(url.pathname)) return;

  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/questions.json')) { e.respondWith(networkFirst(req, 5000)); return; }
    // Toute ouverture de page dans le scope (start_url de l'APK, avec ou sans « / » final,
    // avec ou sans paramètres) reçoit l'application depuis le cache, même sans réseau.
    if (req.mode === 'navigate' && !url.pathname.endsWith('/conditions.html')) { e.respondWith(appShell(req)); return; }
    e.respondWith(staleWhileRevalidate(req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req));
  }
});

async function appShell(req) {
  const cache = await caches.open(VERSION);
  const cached = (await cache.match('./index.html', { ignoreSearch: true })) || (await cache.match('./', { ignoreSearch: true }));
  const net = fetch(req).then(function (r) { if (r && r.ok) cache.put('./index.html', r.clone()); return r; }).catch(function () { return null; });
  if (cached) return cached;
  return (await net) || new Response('Hors-ligne : ouvre l\'application une fois avec internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

async function networkFirst(req, ms) {
  const cache = await caches.open(VERSION);
  try {
    const r = await Promise.race([fetch(req), new Promise(function (_, rej) { setTimeout(rej, ms); })]);
    if (r && r.ok) cache.put(req, r.clone());
    return r;
  } catch (_) {
    const c = await cache.match(req, { ignoreSearch: true });
    return c || new Response('[]', { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then(function (r) { if (r && (r.ok || r.type === 'opaque')) cache.put(req, r.clone()); return r; }).catch(function () { return null; });
  if (cached) return cached;
  return (await net) || new Response('', { status: 504 });
}
