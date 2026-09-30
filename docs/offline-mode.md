# Mode hors ligne

Après une connexion réussie, baccPRO télécharge les questions depuis Apps Script et les conserve dans le stockage local du navigateur/WebView. Le cache est actualisé chaque semaine et lorsqu’une connexion revient après une période hors ligne.

## Utilisation

1. Connecte-toi à baccPRO avec Internet.
2. Attends la fin de la synchronisation des questions (le premier téléchargement peut prendre un moment).
3. Les quiz peuvent ensuite démarrer depuis le cache si le réseau est indisponible.

La connexion Google et les autres actions qui contactent le serveur nécessitent Internet. Les scores d’un quiz commencé hors ligne ne sont pas envoyés au serveur.

## Serveur Apps Script

Le serveur expose `getOfflineQuestions` via `API_WHITELIST`. Son code source se trouve dans [`apps-script/OfflineQuestions.gs`](../apps-script/OfflineQuestions.gs). Lors d’une restauration du projet Apps Script, ajouter cette fonction à la liste autorisée puis déployer une nouvelle version de la même application Web en conservant l’URL `/exec`.

Le cache contient les questions, les choix, les explications et les réponses correctes nécessaires à la correction hors ligne. Il reste sur l’appareil de l’utilisateur et est supprimé avec les données locales de l’application.
