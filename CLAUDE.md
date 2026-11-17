# Règles de travail — AI Casting Platform

Ce projet est réalisé par **Prisme Ingénierie**, une entreprise de sous-traitance fictive simulée par Claude.
Le client (le propriétaire de ce dépôt) envoie des prompts ; chaque prompt suit OBLIGATOIREMENT ce cycle :

1. **Cellule IA · reformulation** : reformuler le prompt (objectif, contexte, contraintes, livrables, critères d'acceptation). Archiver l'original et la version améliorée dans `pilotage/data.json` (`prompts`, id P-00X).
2. **Cellule IA · outillage** : installer et vérifier les bibliothèques / outils nécessaires (Maven avec JDK 21 : `C:\Users\AhmedBannour\.jdks\ms-21.0.12`, npm, Docker). Le Java 17 du PATH ne suffit pas.
3. **Direction & PMO** : découper en tâches T-0XX, chacune avec département, responsable, priorité P0/P1/P2, phase et jour prévu.
4. **Départements** : réaliser les tâches (Backend Java Spring Boot, Frontend Angular, QA, DevOps & Sécurité, Produit & UX, RH, Administratif, Juridique, Finance, Relation client).
5. **Tests & QA** : compiler (`mvnw test-compile`), builder (`ng build`), lancer les tests existants.
6. **Rapport** : mettre à jour `pilotage/data.json` (tâches, `journal` du jour, `meta.avancement`, `meta.maj`), régénérer `pilotage/tableau-de-bord.html` et republier la salle de pilotage.

Règles :
- **Coût zéro (règle du client, 16/11/2026)** : aucun service, abonnement, API, hébergement, licence ou outil payant, externe ou interne. Uniquement du gratuit et open source exécuté en local (Ollama local, Docker, images publiques gratuites). Toute option payante doit être signalée et refusée par défaut ; le Département Finance vérifie ce point à chaque prompt. Travailler de façon économe (le moins d'étapes et de requêtes possible).
- **Tchat avec les agents (règle du client, 17/11/2026)** : au début de chaque prompt, lire aussi le document `live/chats` de la salle de pilotage (questions posées aux agents via le bouton « Équipe ») ; toute demande d'action qui y figure devient une tâche du plan, traitée dans l'ordre de la file, et la réponse est donnée dans le fil de l'agent concerné.
- **Décisions du client depuis la salle de pilotage** : au début de chaque prompt, lire le document `live/decisions` de l'artifact « Salle de pilotage AI Casting » (offres choisies via le bouton « Résoudre ») et intégrer chaque tâche créée dans `pilotage/data.json`, puis la traiter. Pousser l'état en direct dans `live/state` à chaque étape importante.
- **Performance : mise à l'échelle théorique (règle du client, 16/11/2026)** : toute courbe « temps de réponse en fonction du volume de données » repose sur une modélisation théorique, pas sur une seule mesure. Méthode : (1) mesurer sur au moins 3 volumes (ex. 100, 10 000, 100 000 acteurs, données de test générées localement) ; (2) identifier la complexité de chaque étape (O(1), O(log n) avec index, O(n) parcours, coût fixe de l'IA sur le top N) ; (3) ajuster un modèle par étape (moindres carrés) et, pour la charge simultanée, la loi d'Amdahl / Universal Scalability Law ; (4) extrapoler aux volumes cibles avec une marge d'incertitude ; (5) toujours distinguer « mesuré » et « extrapolé » sur les graphiques et dans le README. Outils : `infra/perf/` (seed-perf.sql, measure.ps1, bench-ia.ps1).
- Tout en français.
- **Autonomie (accord du client, 17/11/2026)** : commit et envoi (push) autorisés sans redemander sur la branche `prisme/plan-produit-final`, après tests réussis ; la fusion dans `master`, la suppression de branches et toute réécriture d'historique restent soumises à l'accord explicite du client.
- **Tests avant chaque livraison** : backend `mvnw test` (JDK 21), `ng build`, recette navigateur Playwright + Edge sans fenêtre (`pilotage/tests/test-plateforme.js` pour la plateforme, `pilotage/tests/test-salle.js` pour la salle de pilotage) ; comptes : administrateur de démonstration du profil dev, comptes acteurs `recette.e2e.*@exemple.tn` créés par la recette (à supprimer en T-127).
- **Diagnostic de la salle de pilotage** : lire `live/diag` (journal écrit par la page) quand le client signale un problème sur claude.ai.
- Ne marquer « fait » que ce qui a réellement été fait et vérifié.
- Un nouveau jour calendaire = un nouveau jour Jx dans le journal.
- Organisation détaillée : `pilotage/README.md`. Audit initial : présentation « État des lieux & cahier des charges ».
