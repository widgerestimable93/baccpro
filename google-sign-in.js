(function () {
  'use strict';

  var PENDING_KEY = 'bp_google_oauth_pending';
  var APP_UA_MARKER = 'baccPROApp/1.0';

  function appApi() {
    return window.google && window.google.script && window.google.script.run;
  }

  function setGoogleError(message) {
    var node = document.getElementById('google-auth-error');
    if (!node) return;
    var authPage = document.getElementById('page-auth');
    if (authPage && !authPage.classList.contains('active') && typeof showPage === 'function') {
      showPage('auth', 'login');
    }
    node.textContent = message || 'La connexion Google a échoué. Réessaie.';
    node.classList.add('show');
  }

  function clearGoogleError() {
    var node = document.getElementById('google-auth-error');
    if (!node) return;
    node.textContent = '';
    node.classList.remove('show');
  }

  function base64Url(bytes) {
    var binary = '';
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function randomUrlSafe() {
    var bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  function sha256UrlSafe(value) {
    var data = new TextEncoder().encode(value);
    return window.crypto.subtle.digest('SHA-256', data).then(function (digest) {
      return base64Url(new Uint8Array(digest));
    });
  }

  function isAndroidApp() {
    return navigator.userAgent.indexOf(APP_UA_MARKER) !== -1;
  }

  function setButtonBusy(busy) {
    var button = document.getElementById('google-signin-button');
    if (!button) return;
    button.disabled = !!busy;
    button.style.opacity = busy ? '0.65' : '1';
    button.style.pointerEvents = busy ? 'none' : 'auto';
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  window.startGoogleLogin = function () {
    clearGoogleError();
    var api = appApi();
    if (!api) {
      setGoogleError('Le service de connexion est indisponible. Recharge la page.');
      return;
    }

    var mobile = isAndroidApp();
    var mode = mobile ? 'android' : 'web';
    var clientState = '';
    var codeVerifier = '';
    var codeChallenge = '';

    if (mobile) {
      if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues || !window.TextEncoder) {
        setGoogleError('Mets à jour Android System WebView pour utiliser la connexion Google.');
        return;
      }
      try {
        clientState = randomUrlSafe();
        codeVerifier = randomUrlSafe();
      } catch (error) {
        setGoogleError('Impossible de préparer la vérification sécurisée.');
        return;
      }
    }

    setButtonBusy(true);
    var finishStart = function (challenge) {
      codeChallenge = challenge || '';
      if (mobile) {
        try {
          localStorage.setItem(PENDING_KEY, JSON.stringify({
            state: clientState,
            verifier: codeVerifier,
            expiresAt: Date.now() + 10 * 60 * 1000
          }));
        } catch (storageError) {
          setButtonBusy(false);
          setGoogleError('Le stockage sécurisé du navigateur est indisponible.');
          return;
        }
      }

      api.withSuccessHandler(function (response) {
        if (!response || !response.success || !response.url) {
          if (mobile) localStorage.removeItem(PENDING_KEY);
          setButtonBusy(false);
          setGoogleError(response && response.message ? response.message : 'Impossible de démarrer la connexion Google.');
          return;
        }
        window.location.assign(response.url);
      }).withFailureHandler(function () {
        if (mobile) localStorage.removeItem(PENDING_KEY);
        setButtonBusy(false);
        setGoogleError('Erreur réseau. Vérifie ta connexion et réessaie.');
      }).googleAuthStart(mode, clientState, codeChallenge);
    };

    if (!mobile) {
      finishStart('');
      return;
    }
    sha256UrlSafe(codeVerifier).then(finishStart).catch(function () {
      localStorage.removeItem(PENDING_KEY);
      setButtonBusy(false);
      setGoogleError('Impossible de préparer la vérification sécurisée.');
    });
  };

  function showMobileReturn(ticket, state) {
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(3,10,20,.84);display:grid;place-items:center;padding:20px';
    var card = document.createElement('section');
    card.style.cssText = 'box-sizing:border-box;width:min(100%,420px);padding:26px;border-radius:18px;background:#12223a;color:#edf4ff;text-align:center;font:16px/1.5 Arial,sans-serif;box-shadow:0 18px 55px #0008';
    var title = document.createElement('h2');
    title.textContent = 'Compte Google confirmé';
    title.style.cssText = 'margin:0 0 10px;font-size:22px';
    var text = document.createElement('p');
    text.textContent = 'Retourne dans l’application baccPRO pour terminer la connexion.';
    text.style.cssText = 'margin:0 0 20px;color:#c8d7eb';
    var link = document.createElement('a');
    link.textContent = 'Ouvrir baccPRO';
    link.href = 'baccpro://oauth/callback?ticket=' + encodeURIComponent(ticket) + '&state=' + encodeURIComponent(state);
    link.style.cssText = 'display:block;padding:13px 18px;border-radius:10px;background:#1e88e5;color:#fff;text-decoration:none;font-weight:700';
    var note = document.createElement('p');
    note.textContent = 'Si rien ne se passe, ouvre baccPRO puis recommence la connexion.';
    note.style.cssText = 'margin:14px 0 0;font-size:13px;color:#9db3cc';
    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(link);
    card.appendChild(note);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  }

  function redeemWebTicket(ticket) {
    var api = appApi();
    if (!api) {
      setGoogleError('Le service de connexion est indisponible. Recharge la page.');
      return;
    }
    api.withSuccessHandler(function (response) {
      window.BaccproGoogleAuth.complete(response);
    }).withFailureHandler(function () {
      setGoogleError('Le retour Google a expiré. Recommence la connexion.');
    }).googleAuthRedeem(ticket, '');
  }

  window.BaccproGoogleAuth = {
    complete: function (response) {
      if (!response || !response.success || !response.user || !response.token) {
        this.fail(response && response.message ? response.message : 'La connexion Google a échoué. Réessaie.');
        return;
      }
      try { localStorage.removeItem(PENDING_KEY); } catch (storageError) {}
      App.user = response.user;
      saveToken(response.token);
      showToast('Bienvenue ! 👋', 'success');
      showPage('dashboard');
      setTimeout(function () {
        GUIDE.onLogin();
        BannerCtrl.showApkBanner();
      }, 600);
    },
    fail: function (message) {
      try { localStorage.removeItem(PENDING_KEY); } catch (storageError) {}
      setGoogleError(typeof message === 'string' ? message : 'La connexion Google a échoué. Réessaie.');
    }
  };

  function handleReturnFragment() {
    if (!window.location.hash || window.location.hash.length < 2) return;
    var params = new URLSearchParams(window.location.hash.substring(1));
    var webTicket = params.get('bp_google_web');
    var androidTicket = params.get('bp_google_android');
    var clientState = params.get('state');
    if (!webTicket && !androidTicket) return;

    // Keep the temporary ticket out of browser history before using it.
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
    if (webTicket && /^[a-f0-9]{64}$/.test(webTicket)) {
      redeemWebTicket(webTicket);
      return;
    }
    if (androidTicket && /^[a-f0-9]{64}$/.test(androidTicket) &&
        clientState && /^[A-Za-z0-9_-]{43}$/.test(clientState)) {
      showMobileReturn(androidTicket, clientState);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleReturnFragment);
  } else {
    handleReturnFragment();
  }
})();

