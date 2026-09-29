// Google sign-in for BaccPRO.
// Add this file as GoogleAuth.gs in the existing Apps Script project.
// Keep GOOGLE_OAUTH_CLIENT_SECRET in Script Properties; never place it here.

var GOOGLE_OAUTH_CLIENT_ID = '297231517263-i3j81lhmh7bn92t218bdt3r366fg0h2n.apps.googleusercontent.com';
var GOOGLE_OAUTH_RETURN_URL = 'https://widgerestimable93.github.io/baccpro/';
var GOOGLE_OAUTH_STATE_TTL_SECONDS = 600;
var GOOGLE_OAUTH_TICKET_TTL_SECONDS = 180;

function googleAuthStart(mode, clientState, codeChallenge) {
  try {
    var clientSecret = PropertiesService.getScriptProperties()
      .getProperty('GOOGLE_OAUTH_CLIENT_SECRET');
    if (!clientSecret) return err('La connexion Google n’est pas encore configurée.');

    var returnMode = mode === 'android' ? 'android' : 'web';
    var stateForApp = '';
    var challengeForApp = '';
    if (returnMode === 'android') {
      stateForApp = String(clientState || '');
      challengeForApp = String(codeChallenge || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(stateForApp) ||
          !/^[A-Za-z0-9_-]{43}$/.test(challengeForApp)) {
        return err('Impossible de démarrer la connexion Google sur cet appareil.');
      }
    }

    var stateToken = ScriptApp.newStateToken()
      .withMethod('googleOAuthCallback')
      .withTimeout(GOOGLE_OAUTH_STATE_TTL_SECONDS)
      .createToken();
    var transaction = {
      mode: returnMode,
      clientState: stateForApp,
      challenge: challengeForApp,
      createdAt: Date.now()
    };
    CacheService.getScriptCache().put(
      _googleOAuthStateKey_(stateToken),
      JSON.stringify(transaction),
      GOOGLE_OAUTH_STATE_TTL_SECONDS
    );

    var redirectUri = 'https://script.google.com/macros/d/' +
      ScriptApp.getScriptId() + '/usercallback';
    var query = {
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: stateToken,
      prompt: 'select_account'
    };
    var queryString = Object.keys(query).map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(query[key]);
    }).join('&');

    return ok({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + queryString });
  } catch (e) {
    Logger.log('[GOOGLE AUTH] Start failed: ' + e.message);
    return err('Impossible de démarrer la connexion Google.');
  }
}

// Called by Apps Script through the /usercallback endpoint.
function googleOAuthCallback(e) {
  var params = (e && e.parameter) || {};
  var stateToken = String(params.state || '');
  var rawTransaction = stateToken ? _takeGoogleOAuthCache_(
    _googleOAuthStateKey_(stateToken)
  ) : null;
  if (!rawTransaction) return _googleOAuthPage_('', 'Cette demande de connexion a expiré. Recommence depuis baccPRO.');

  var transaction;
  try {
    transaction = JSON.parse(rawTransaction);
  } catch (parseError) {
    return _googleOAuthPage_('', 'La connexion Google n’a pas abouti. Recommence depuis baccPRO.');
  }

  if (params.error || !params.code) {
    return _googleOAuthPage_('', 'La connexion Google a été annulée ou refusée. Tu peux réessayer depuis baccPRO.');
  }

  var properties = PropertiesService.getScriptProperties();
  var clientSecret = properties.getProperty('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientSecret) return _googleOAuthPage_('', 'La connexion Google n’est pas encore configurée.');

  try {
    var redirectUri = 'https://script.google.com/macros/d/' +
      ScriptApp.getScriptId() + '/usercallback';
    var tokenResponse = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
      method: 'post',
      payload: {
        code: String(params.code),
        client_id: GOOGLE_OAUTH_CLIENT_ID,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      },
      muteHttpExceptions: true
    });
    if (tokenResponse.getResponseCode() !== 200) {
      Logger.log('[GOOGLE AUTH] Token exchange was rejected. HTTP ' + tokenResponse.getResponseCode());
      return _googleOAuthPage_('', 'Google n’a pas pu confirmer la connexion. Vérifie la configuration puis réessaie.');
    }

    var tokenData = JSON.parse(tokenResponse.getContentText());
    if (!tokenData.access_token) {
      return _googleOAuthPage_('', 'Google n’a pas pu confirmer la connexion. Réessaie.');
    }

    var userInfoResponse = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'get',
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
      muteHttpExceptions: true
    });
    if (userInfoResponse.getResponseCode() !== 200) {
      Logger.log('[GOOGLE AUTH] User profile request was rejected. HTTP ' + userInfoResponse.getResponseCode());
      return _googleOAuthPage_('', 'Google n’a pas pu confirmer le compte. Réessaie.');
    }

    var profile = JSON.parse(userInfoResponse.getContentText());
    var verified = profile.email_verified === true || profile.email_verified === 'true';
    if (!profile.sub || !verified || !isValidEmail(normalizeEmail(profile.email || ''))) {
      return _googleOAuthPage_('', 'Ce compte Google ne fournit pas une adresse email vérifiée.');
    }

    var ticket = _createGoogleOAuthTicket_(
      normalizeEmail(profile.email),
      String(profile.sub),
      transaction
    );
    if (transaction.mode === 'android') {
      var androidHash = 'bp_google_android=' + encodeURIComponent(ticket) +
        '&state=' + encodeURIComponent(transaction.clientState);
      var androidUrl = GOOGLE_OAUTH_RETURN_URL + '#' + androidHash;
      return _googleOAuthPage_(androidUrl, 'Connexion Google confirmée. Appuie sur le bouton ci-dessous pour retourner dans baccPRO.');
    }

    var webUrl = GOOGLE_OAUTH_RETURN_URL + '#bp_google_web=' + encodeURIComponent(ticket);
    return _googleOAuthPage_(webUrl, 'Connexion Google confirmée. Appuie sur le bouton ci-dessous pour retourner dans baccPRO.');
  } catch (e2) {
    Logger.log('[GOOGLE AUTH] Callback failed: ' + e2.message);
    return _googleOAuthPage_('', 'Une erreur est survenue pendant la connexion Google. Réessaie.');
  }
}

// Web calls this through the existing JSONP bridge. Android sends the same
// function through doPost, so its PKCE verifier never appears in a URL.
function googleAuthRedeem(ticket, codeVerifier) {
  var normalizedTicket = String(ticket || '');
  if (!/^[a-f0-9]{64}$/.test(normalizedTicket)) {
    return err('Le lien de connexion est invalide ou a expiré. Recommence.');
  }

  var cacheKey = _googleOAuthTicketKey_(normalizedTicket);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return err('Connexion occupée. Réessaie dans quelques secondes.');

  var ticketData = null;
  try {
    var raw = CacheService.getScriptCache().get(cacheKey);
    if (!raw) return err('Le lien de connexion a expiré. Recommence.');
    var parsed = JSON.parse(raw);

    if (parsed.mode === 'android') {
      var verifier = String(codeVerifier || '');
      if (!/^[A-Za-z0-9_-]{43,128}$/.test(verifier) ||
          !_googleOAuthConstantTimeEqual_(_googleOAuthChallenge_(verifier), parsed.challenge || '')) {
        return err('La vérification de sécurité a échoué. Recommence la connexion Google.');
      }
    } else if (parsed.mode !== 'web') {
      return err('Le lien de connexion est invalide. Recommence.');
    }

    CacheService.getScriptCache().remove(cacheKey);
    ticketData = parsed;
  } catch (e) {
    Logger.log('[GOOGLE AUTH] Ticket validation failed: ' + e.message);
    return err('Le lien de connexion est invalide ou a expiré. Recommence.');
  } finally {
    lock.releaseLock();
  }

  if (!ticketData || !ticketData.email || !ticketData.sub) {
    return err('Le lien de connexion est invalide ou a expiré. Recommence.');
  }
  return _googleAuthLoginBaccPro_(ticketData.email);
}

function _googleAuthLoginBaccPro_(email) {
  var emailNorm = normalizeEmail(email || '');
  if (!isValidEmail(emailNorm)) return err('Adresse email Google invalide.');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return err('Le service est occupé. Réessaie dans quelques secondes.');
  try {
    var found = findUserByEmail(emailNorm);
    if (!found) {
      // Google has verified ownership of the email. The random password is
      // never shown, returned, or logged; the user signs in with Google.
      var randomPassword = Utilities.getUuid().replace(/-/g, '') +
        Utilities.getUuid().replace(/-/g, '');
      var created = register({ email: emailNorm, password: randomPassword, niveau: 'debutant' });
      if (created && created.success && created.token) return created;
      found = findUserByEmail(emailNorm);
      if (!found) return created || err('Impossible de créer le compte BaccPRO.');
    }

    var rowData = found.data;
    var lockedUntil = parseInt(clean(rowData[CFG.U.locked_until])) || 0;
    if (lockedUntil > nowMs()) return err('Ce compte est temporairement bloqué. Réessaie plus tard.', 'LOCKED');

    var sheet = getSheet(SHEETS.USERS);
    _safeSetValue(sheet, found.row, CFG.U.login_fails + 1, 0);
    _safeSetValue(sheet, found.row, CFG.U.locked_until + 1, 0);
    _safeSetValue(sheet, found.row, CFG.U.last_active + 1, fmtDate());
    invalidateUsersCache();

    var userId = clean(rowData[CFG.U.id]);
    _destroyAllUserSessions(userId);
    var token = _createSession(userId, emailNorm);
    if (!token) return err('Le compte est reconnu, mais la session n’a pas pu être créée.');
    try { _updateStreak(found.row, rowData); } catch (streakError) {}
    return ok({ user: userToPublic(rowData), token: token });
  } catch (e) {
    Logger.log('[GOOGLE AUTH] BaccPRO session failed: ' + e.message);
    return err('Impossible d’ouvrir la session BaccPRO. Réessaie.');
  } finally {
    lock.releaseLock();
  }
}

function _createGoogleOAuthTicket_(email, googleSub, transaction) {
  var ticket = Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');
  var record = {
    email: email,
    sub: googleSub,
    mode: transaction.mode === 'android' ? 'android' : 'web',
    clientState: transaction.clientState || '',
    challenge: transaction.challenge || '',
    createdAt: Date.now()
  };
  CacheService.getScriptCache().put(
    _googleOAuthTicketKey_(ticket),
    JSON.stringify(record),
    GOOGLE_OAUTH_TICKET_TTL_SECONDS
  );
  return ticket;
}

function _takeGoogleOAuthCache_(key) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return null;
  try {
    var cache = CacheService.getScriptCache();
    var value = cache.get(key);
    if (value) cache.remove(key);
    return value;
  } finally {
    lock.releaseLock();
  }
}

function _googleOAuthStateKey_(state) {
  return 'bp_google_state_' + _googleOAuthChallenge_(state);
}

function _googleOAuthTicketKey_(ticket) {
  return 'bp_google_ticket_' + ticket;
}

function _googleOAuthChallenge_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/, '');
}

function _googleOAuthConstantTimeEqual_(left, right) {
  left = String(left || '');
  right = String(right || '');
  if (left.length !== right.length) return false;
  var difference = 0;
  for (var i = 0; i < left.length; i++) {
    difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return difference === 0;
}

function _googleOAuthPage_(url, message) {
  var safeUrl = url ? _googleOAuthEscapeHtml_(url) : '';
  var link = safeUrl
    ? '<a class="continue" target="_top" rel="noopener" href="' + safeUrl + '">Continuer vers baccPRO</a>'
    : '';
  var html = '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>baccPRO — Connexion Google</title><style>' +
    'body{margin:0;background:#0a1628;color:#edf4ff;font:16px Arial,sans-serif;display:grid;min-height:100vh;place-items:center}' +
    '.card{max-width:420px;margin:24px;padding:30px;background:#12223a;border-radius:18px;text-align:center;box-shadow:0 16px 48px #0005}' +
    'h1{font-size:23px;margin:0 0 12px;color:#fff}.msg{color:#c8d7eb;line-height:1.6}.continue{display:inline-block;margin-top:18px;padding:13px 18px;border-radius:10px;background:#1e88e5;color:#fff;text-decoration:none;font-weight:700}' +
    '</style></head><body><main class="card"><h1>baccPRO</h1><p class="msg">' +
    _googleOAuthEscapeHtml_(message || 'La connexion n’a pas abouti.') +
    '</p>' + link + '</main></body></html>';
  return HtmlService.createHtmlOutput(html).setTitle('baccPRO — Connexion Google');
}

function _googleOAuthEscapeHtml_(value) {
  return String(value || '').replace(/[&<>"']/g, function(character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

