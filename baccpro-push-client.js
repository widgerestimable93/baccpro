(function () {
  'use strict';

  var turnstilePromise;

  function getConfig() {
    var config = window.BACCPRO_PUSH_CONFIG;
    if (!config || !config.workerUrl || !config.turnstileSiteKey || !config.vapidPublicKey) {
      throw new Error('Le service Push gratuit n’est pas encore configuré.');
    }
    return config;
  }

  function loadTurnstile() {
    if (window.turnstile) return Promise.resolve(window.turnstile);
    if (turnstilePromise) return turnstilePromise;
    turnstilePromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = function () { resolve(window.turnstile); };
      script.onerror = function () { reject(new Error('Chargement de la vérification anti-abus impossible.')); };
      document.head.appendChild(script);
    });
    return turnstilePromise;
  }

  async function getTurnstileToken(siteKey) {
    var turnstile = await loadTurnstile();
    var container = document.createElement('div');
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-label', 'Vérification de sécurité');
    container.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:20px';
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#10243c;border-radius:14px;padding:18px;max-width:340px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.35);font:500 15px sans-serif';
    card.textContent = 'Vérification de sécurité pour activer le rappel.';
    var widgetContainer = document.createElement('div');
    widgetContainer.style.marginTop = '12px';
    card.appendChild(widgetContainer);
    container.appendChild(card);
    document.body.appendChild(container);
    return new Promise(function (resolve, reject) {
      var widgetId;
      var done = false;
      function finish(error, token) {
        if (done) return;
        done = true;
        try { if (widgetId !== undefined) turnstile.remove(widgetId); } catch (_) {}
        container.remove();
        if (error) reject(error); else resolve(token);
      }
      try {
        widgetId = turnstile.render(widgetContainer, {
          sitekey: siteKey,
          action: 'subscribe',
          execution: 'execute',
          appearance: 'interaction-only',
          callback: function (token) { finish(null, token); },
          'error-callback': function () { finish(new Error('Vérification anti-abus échouée.')); },
          'expired-callback': function () { finish(new Error('La vérification a expiré.')); },
        });
        turnstile.execute(widgetId);
      } catch (error) {
        finish(error);
      }
    });
  }

  function workerRequest(path, body) {
    var config = getConfig();
    return fetch(config.workerUrl.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async function (response) {
      var result = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(result.error || 'Le service Push a refusé la demande.');
      return result;
    });
  }

  function decodeApplicationServerKey(value) {
    var padding = '='.repeat((4 - value.length % 4) % 4);
    var base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = window.atob(base64);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
  }

  async function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Les notifications Push ne sont pas disponibles dans ce navigateur.');
    }
    if (Notification.permission !== 'granted') {
      throw new Error('Autorise d’abord les notifications.');
    }

    var config = getConfig();
    var registration = await navigator.serviceWorker.ready;
    var subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(config.vapidPublicKey),
      });
    }
    var turnstileToken = await getTurnstileToken(config.turnstileSiteKey);
    await workerRequest('/api/subscribe', {
      subscription: subscription.toJSON(),
      turnstileToken: turnstileToken,
    });
    localStorage.setItem('daily_push_registered', '1');
    return true;
  }

  async function unsubscribe() {
    if (!('serviceWorker' in navigator)) return false;
    var registration = await navigator.serviceWorker.ready;
    var subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      localStorage.removeItem('daily_push_registered');
      return false;
    }
    await workerRequest('/api/unsubscribe', { endpoint: subscription.endpoint });
    await subscription.unsubscribe();
    localStorage.removeItem('daily_push_registered');
    return true;
  }

  window.BaccproDailyPush = { subscribe: subscribe, unsubscribe: unsubscribe };
})();
