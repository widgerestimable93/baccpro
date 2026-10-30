# Mode hors ligne

Après une connexion réussie, baccPRO demande au serveur Apps Script toutes les questions et les enregistre localement. Le cache est rafraîchi après une semaine, ou au prochain rétablissement du réseau si la copie est plus ancienne. Les quiz utilisent cette copie lorsqu’Internet ne répond pas.

## Mise à jour Apps Script requise

Le site hébergé sur GitHub Pages ne contient pas le code principal Apps Script. Pour activer le téléchargement complet, ajoute `getOfflineQuestions` depuis [`apps-script/OfflineQuestions.gs`](../apps-script/OfflineQuestions.gs) au projet Apps Script, puis ajoute cette entrée dans l’objet `API_WHITELIST` du fichier serveur principal :

```js
getOfflineQuestions: getOfflineQuestions,
```

Enregistre et déploie une nouvelle version de la même application Web Apps Script, en conservant son URL `/exec` actuelle.

Le téléchargement exige une session valide. Le cache local contient les questions, les choix, les explications et les indices de réponse corrects nécessaires pour corriger un quiz hors ligne. Le profil minimal du compte est aussi conservé pour réouvrir le tableau de bord hors réseau. Les scores faits hors ligne ne sont pas envoyés au serveur.
