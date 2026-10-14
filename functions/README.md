# Web Push quotidien à 17 h (heure d’Haïti)

Ce backend envoie un rappel aux abonnements PWA baccPRO et 9emePRO. Les abonnements sont enregistrés dans Firestore; une fonction planifiée envoie les notifications chaque jour à 17 h dans le fuseau `America/Port-au-Prince`.

## Préparer Firebase

1. Le projet configuré est `baccpro-app`. Active Firestore et le plan Firebase Blaze pour déployer des fonctions planifiées. La facturation Google Cloud doit être activée pour ce projet.
2. Installe les dépendances et Firebase CLI, puis connecte-toi avec le compte qui administre le projet.
3. Génère une paire VAPID avec `npx web-push generate-vapid-keys`.
4. Copie `.env.example` en `.env.baccpro-app` et renseigne la clé publique ainsi que l’adresse e-mail de contact VAPID.
5. Dans le dossier du dépôt, configure la clé privée sans l’ajouter à Git :

   ```sh
   firebase functions:secrets:set WEB_PUSH_PRIVATE_KEY --project baccpro-app
   ```

6. Depuis la racine du dépôt, installe les dépendances dans `functions`, puis déploie :

   ```sh
   cd functions
   npm install
   cd ..
   firebase deploy --only functions --project baccpro-app
   ```

L’API sera disponible à `https://us-central1-baccpro-app.cloudfunctions.net/pushApi`.

Les PWA demandent l’autorisation après une action volontaire de l’utilisateur. Sur iPhone/iPad, la PWA doit être ajoutée à l’écran d’accueil avant de pouvoir s’abonner aux notifications. Le système conserve la maîtrise du son et peut rendre une notification silencieuse.
