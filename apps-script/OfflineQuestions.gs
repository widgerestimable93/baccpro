// Export complet des questions pour préparer le cache hors ligne.
// Ajouter aussi `getOfflineQuestions: getOfflineQuestions,` à API_WHITELIST
// dans le fichier Apps Script principal pour exposer cette fonction au site.
function getOfflineQuestions(params) {
  try {
    params = params || {};
    var token = clean(params.token);
    if (!token) return err('Connexion requise pour télécharger les questions.', 'AUTH');

    var session = validateSession(token);
    if (!session || !session.success || !session.user) {
      return err('Session invalide. Reconnecte-toi puis réessaie.', 'AUTH');
    }

    var allQuestions = readQuestionsAll();
    if (!allQuestions || !allQuestions.length) {
      return err('Aucune question disponible pour le cache hors ligne.');
    }

    return _buildQuizResponse(allQuestions, 0);
  } catch (e) {
    Logger.log('[getOfflineQuestions] error: ' + e.message);
    return err('Impossible de télécharger toutes les questions : ' + e.message);
  }
}
