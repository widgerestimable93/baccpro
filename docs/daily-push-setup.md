# Rappels quotidiens baccPRO sans Firebase Blaze

## Fonctionnement

- L’APK Android programme son rappel local à 17 h, heure d’Haïti. Il n’a pas besoin d’un serveur pour ce rappel.
- La PWA utilise un Cloudflare Worker gratuit, une base D1 gratuite et une file Cloudflare Queues gratuite. Le Worker examine l’heure locale d’Haïti toutes les heures et envoie le rappel à 17 h.
- Cloudflare Turnstile gratuit protège l’inscription contre les robots. La clé secrète Turnstile et la clé privée VAPID sont des secrets du Worker.
- Le Push PWA demande une connexion réseau, une autorisation de notification et l’installation sur l’écran d’accueil sur iOS. Le son dépend des réglages de notifications du téléphone et du navigateur.

Cette configuration ne nécessite pas de passer le projet Firebase en Blaze. Le dépôt ne référence plus les fonctions Firebase planifiées. Cloudflare Free applique des quotas : 100 000 requêtes Worker par jour, 5 millions de lignes D1 lues et 100 000 écrites par jour, ainsi que 10 000 opérations de file par jour. Un rappel envoyé par la file utilise normalement trois opérations (écriture, lecture et suppression), soit environ 3 333 abonnements quotidiens avant les retries. Les dépassements des quotas gratuits bloquent les opérations jusqu’à la remise à zéro, ils ne basculent pas automatiquement au forfait payé.

## Déployer le service

Les commandes ci-dessous s’exécutent depuis la racine du dépôt avec Node.js et Wrangler. Elles publient le Worker sur le compte Cloudflare auquel Wrangler sera connecté.

1. Créer un compte Cloudflare et rester sur Workers Free. Ne pas choisir le forfait Workers Paid si le tableau de bord le propose.
2. Installer Wrangler ou utiliser `npx wrangler`, puis se connecter :

   ```powershell
   npx wrangler login
   ```

3. Créer la base D1, copier son identifiant dans `database_id` de
   `cloudflare/wrangler.toml` à la place de `REPLACE_WITH_D1_DATABASE_ID`,
   créer les deux files, puis appliquer le schéma :

   ```powershell
   npx wrangler d1 create baccpro-push
   npx wrangler queues create baccpro-daily-push
   npx wrangler queues create baccpro-daily-push-dead
   npx wrangler d1 execute baccpro-push --remote --file=cloudflare/schema.sql --config cloudflare/wrangler.toml
   ```

4. Générer une paire VAPID. Le script écrit la clé privée dans un fichier local ignoré par Git et n’affiche que la clé publique :

   ```powershell
   node cloudflare/generate-vapid-keys.mjs
   ```

   Copier la clé publique affichée par le script. Le fichier `.vapid-private-jwk.json` ne doit jamais être publié ni envoyé dans le chat. Enregistrer le secret dans Cloudflare :

   ```powershell
   Get-Content -Raw .vapid-private-jwk.json | npx wrangler secret put VAPID_PRIVATE_JWK --config cloudflare/wrangler.toml
   ```

5. Dans Turnstile, créer un widget gratuit en autorisant le nom d’hôte `widgerestimable93.github.io`. Mettre sa site key dans `push-config.js`, puis enregistrer la secret key comme secret Worker :

   ```powershell
   npx wrangler secret put TURNSTILE_SECRET --config cloudflare/wrangler.toml
   ```

6. Publier le Worker :

   ```powershell
   npx wrangler deploy --config cloudflare/wrangler.toml
   ```

7. Mettre l’URL `https://<worker>.<compte>.workers.dev` renvoyée par Wrangler dans `workerUrl` de `push-config.js`, puis mettre la clé publique VAPID générée dans `vapidPublicKey`. Garder `turnstileSiteKey` publique; ne jamais mettre `TURNSTILE_SECRET` ou la clé privée dans le site.
8. Publier le site GitHub Pages avec ces trois valeurs publiques configurées. Après déploiement, ouvrir baccPRO, choisir **Activer les notifications** et autoriser le navigateur.

## Tester la planification

Le Worker ne tente un envoi que lorsque l’heure planifiée, convertie par `America/Port-au-Prince`, vaut `17:00`. Pour vérifier rapidement en production, changer temporairement le test d’heure dans `cloudflare/worker.js` pour l’heure courante d’Haïti, déployer, vérifier la réception, puis remettre `17:00` et redéployer.

## iPhone et iPad

Sur iOS/iPadOS, ouvrir le site dans Safari, l’ajouter à l’écran d’accueil, lancer l’icône installée, puis accepter les notifications. La livraison en arrière-plan dépend de la version d’iOS, du réseau et des réglages système.
