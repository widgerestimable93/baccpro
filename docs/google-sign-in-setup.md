# Connexion Google de baccPRO

Cette intégration utilise le client OAuth Web existant. Dans l’APK, la page de connexion Google s’ouvre dans le navigateur externe; Google ne prend pas en charge la connexion OAuth intégrée dans une WebView Android. Le retour dans l’APK transporte un ticket à usage unique vérifié avec PKCE.

## Préparer Apps Script

1. Ouvre le projet Apps Script qui sert l’API baccPRO.
2. Dans **Paramètres du projet > Propriétés du script**, ajoute `GOOGLE_OAUTH_CLIENT_SECRET` avec le secret du client OAuth Web. Garde ce secret dans Apps Script; ne le colle pas dans GitHub ni dans l’application Android.
3. Crée un fichier Apps Script nommé `GoogleAuth.gs` et colle le contenu de `apps-script/GoogleAuth.gs`.
4. Dans `Code.gs`, ajoute ces deux entrées à `API_WHITELIST` :

   ```js
   googleAuthRedeem: googleAuthRedeem,
   googleAuthStart:  googleAuthStart,
   ```

5. Enregistre puis modifie le déploiement Web App existant en sélectionnant une **nouvelle version**. Conserve son accès et son URL actuels.

## Préparer le client OAuth Web

Dans Google Cloud Console, ouvre le client **baccPRO Web** et ajoute exactement cet URI de redirection autorisé :

```text
https://script.google.com/macros/d/1wfAQp6KR2RuBYX3EVeL2cni8gV6tD_3DZV29Jirieydglsou9yBRTkpO/usercallback
```

L’origine JavaScript du site reste :

```text
https://widgerestimable93.github.io
```

L’URI de redirection doit correspondre exactement. Le code ne demande que `openid`, `email` et `profile`. Si l’écran de consentement est en mode **Test**, ajoute les adresses Google des personnes qui doivent essayer la connexion comme utilisateurs test.

## Retour de l’intégration

La page GitHub appelle `googleAuthStart` puis échange un ticket temporaire avec `googleAuthRedeem`. Le code Apps Script valide l’adresse avec le point d’accès Google `userinfo`, associe l’adresse vérifiée à un compte baccPRO existant ou crée un compte, puis génère le jeton de session baccPRO. Les jetons Google et le secret OAuth ne sont jamais renvoyés à la page.

Pour l’APK, l’application garde le vérificateur PKCE dans son stockage WebView et le transmet à Apps Script dans un corps HTTP POST après le retour par le lien `baccpro://`. Le vérificateur n’est pas placé dans l’URL.

