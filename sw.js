// ════════════════════════════════════════════════════════
// baccPRO — Service Worker (application + questions hors ligne)
//
// Stratégie :
//  - App shell (HTML/CSS/JS/icônes) → cache-first, avec mise à
//    jour silencieuse en arrière-plan (stale-while-revalidate).
//  - Appels API (script.google.com) → réseau uniquement.
//    Le frontend conserve séparément les questions synchronisées
//    après connexion et peut les utiliser pour un quiz hors ligne.
//    Connexion, compte et synchronisation des scores exigent encore
//    le réseau. En cas d'échec API, on renvoie une erreur JSON.
// ════════════════════════════════════════════════════════

const CACHE_NAME = 'baccpro-shell-v5';

// Fichiers de l'app shell à précharger à l'installation.
// Chemins relatifs : fonctionne quel que soit le sous-dossier
// GitHub Pages (racine ou /nom-du-repo/).
const APP_SHELL = [
  './',
  './index.html',
  './google-sign-in.js',
  './push-config.js',
  './baccpro-push-client.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((err) => {
            // Un fichier manquant ne doit pas bloquer toute l'installation
            console.warn('[SW] Précache raté pour', url, err);
          })
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Les notifications push sont affichées par le service worker même si la PWA
// n'a plus de page ouverte (Android/Chrome et PWA installée sur iOS compatible).
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'baccPRO — rappel de révision';
  const options = {
    body: payload.body || 'C’est l’heure de reprendre tes révisions !',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'baccpro-daily-17h',
    renotify: true,
    silent: false,
    vibrate: [200, 100, 200],
    data: { url: payload.url || './' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || './',
    self.registration.scope
  ).href;
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne gère que les requêtes GET — les POST (API) passent tel quel
  if (req.method !== 'GET') return;

  const url = req.url;

  // ── Appels vers le backend Apps Script : réseau uniquement ──
  if (url.includes('script.google.com') || url.includes('googleapis.com')) {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(
            JSON.stringify({
              success: false,
              offline: true,
              message: 'Hors ligne — cette action nécessite une connexion internet.',
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          )
      )
    );
    return;
  }

  // ── App shell : cache-first + rafraîchissement en arrière-plan ──
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached); // hors ligne → on retombe sur le cache

      // Sert le cache immédiatement si dispo, sinon attend le réseau
      return cached || networkFetch;
    })
  );
});
