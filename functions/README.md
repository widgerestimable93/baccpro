# Web Push quotidien à 17 h, heure d’Haïti

Ce backend envoie un rappel aux abonnements PWA baccPRO et 9emePRO. Les abonnements sont stockés dans Firestore; une fonction planifiée envoie les notifications chaque jour à 17 h dans le fuseau `America/Port-au-Prince`.

## Préparer Firebase

1. Le projet configuré est `baccpro-app`. Connecte-toi avec un compte qui l’administre et active Firestore.
2. Les fonctions planifiées Firebase nécessitent le plan Blaze et les API Cloud Scheduler / Pub/Sub. Vérifie les options de facturation et configure une alerte de budget avant le déploiement.
3. Installe les dépendances dans `functions`, puis génère une paire VAPID :

   ```sh
   cd functions
   npm install
   npx web-push generate-vapid-keys
   ```

4. Copie `.env.example` vers `.env.baccpro-app` et ajoute la clé publique ainsi qu’une adresse e-mail de contact VAPID. Le fichier `.env.baccpro-app` est exclu de Git.
5. Depuis la racine du dépôt, enregistre la clé privée comme secret Firebase :

   ```sh
   firebase functions:secrets:set WEB_PUSH_PRIVATE_KEY --project baccpro-app
   ```

6. Déploie les fonctions depuis la racine du dépôt :

   ```sh
   firebase deploy --only functions --project baccpro-app
   ```

L’API sera disponible à `https://us-central1-baccpro-app.cloudfunctions.net/pushApi`.

Les PWA demandent l’autorisation après une action volontaire de l’utilisateur. Sur iPhone/iPad, la PWA doit être ajoutée à l’écran d’accueil avant de pouvoir s’abonner aux notifications. Le système conserve la maîtrise du son et peut rendre une notification silencieuse.
