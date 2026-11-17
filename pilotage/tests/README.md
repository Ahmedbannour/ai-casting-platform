# Tests de la salle de pilotage

Prérequis : Node, Microsoft Edge, `npm i playwright-core` dans un dossier de travail.

1. `cd pilotage; python -m http.server 8765 --bind 127.0.0.1`
2. `node pilotage/tests/test-salle.js`

Les réponses des agents (capacité « sample ») ne fonctionnent que sur claude.ai : hors de claude.ai, le test vérifie le message clair et le bouton « Réessayer ».
