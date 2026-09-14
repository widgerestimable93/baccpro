// ════════════════════════════════════════════════════════
// baccPRO — Service Worker (mode "presque hors-ligne")
//
// Stratégie :
//  - App shell (HTML/CSS/JS/icônes) → cache-first, avec mise à
//    jour silencieuse en arrière-plan (stale-while-revalidate).
//  - Appels API (script.google.com) → réseau uniquement.
//    Impossible de faire fonctionner login/quiz/scores sans
//    connexion, puisqu'ils dépendent de Google Sheets en direct.
//    En cas d'échec réseau, on renvoie un JSON d'erreur clair
//    que le frontend peut détecter (offline: true).
// ════════════════════════════════════════════════════════

const CACHE_NAME = 'baccpro-shell-v1';

// Fichiers de l'app shell à précharger à l'installation.
// Chemins relatifs : fonctionne quel que soit le sous-dossier
// GitHub Pages (racine ou /nom-du-repo/).
const APP_SHELL = [
  './',
  './index.html',
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
