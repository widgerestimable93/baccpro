// Configuration publique du service Push Cloudflare. Compléter après le
// déploiement du Worker et la création du widget Turnstile.
window.BACCPRO_PUSH_CONFIG = {
  workerUrl: '', // URL HTTPS du Worker Cloudflare, sans slash final.
  turnstileSiteKey: '', // Clé publique du widget Cloudflare Turnstile.
  vapidPublicKey: '', // Clé publique VAPID; jamais mettre la clé privée ici.
};
