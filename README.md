# Pilotage — Prisme Ingénierie

Projet : AI Casting Platform · Début : 2026-11-15

Ouvrir `tableau-de-bord.html` dans un navigateur pour la vue interactive. Les données sont dans `data.json`.

## Cycle d'un prompt

1. **Vous** — Vous envoyez un prompt, même court ou approximatif.
2. **Cellule IA · reformulation** — Le prompt est reformulé : objectif, contexte, contraintes, livrables et critères d’acceptation. La version améliorée est archivée à côté de l’originale.
3. **Cellule IA · outillage** — Les bibliothèques et outils nécessaires sont installés et vérifiés (compilation, build) avant que les équipes commencent.
4. **Direction & PMO** — Le travail est découpé en tâches, chacune affectée à un département avec une priorité P0, P1 ou P2.
5. **Départements** — Backend, Frontend, DevOps, Produit, Juridique, Finance, RH ou Administratif réalisent leurs tâches.
6. **Tests & QA** — Chaque livrable technique est vérifié : compilation, tests, critères d’acceptation.
7. **Rapport** — Le journal du jour et ce tableau de bord sont mis à jour : fait, en cours, à faire, bloqué, décisions à prendre.

## Organisation

### Direction générale
- Karim Haddad — Directeur général (Direction)
- Sonia Mercier — Directrice de projet / PMO (Senior)
Missions : Arbitre les priorités et le périmètre ; Valide chaque livraison avant envoi au client ; Pilote le planning (PMO)

### Cellule IA
- Yasmine Trabelsi — Lead AI Engineer · prompts (Senior)
- Lucas Moreau — AI Ops · bibliothèques & outillage (Senior)
- Nadia Ben Salem — ML Engineer · recherche sémantique (Confirmée)
Missions : Reçoit chaque prompt du client en premier ; Reformule et adapte le prompt (contexte, contraintes, critères d’acceptation) ; Installe et vérifie les bibliothèques et outils nécessaires ; Conçoit la recherche IA du produit (LLM, embeddings)

### Produit & UX
- Élodie Martin — Product Owner (Senior)
- Omar Chérif — Business Analyst · métier du casting (Confirmé)
- Inès Garnier — UX/UI Designer (Confirmée)
Missions : Traduit le besoin en user stories ; Priorise le backlog avec le client ; Conçoit les écrans (UX/UI)

### Technique · Backend
- Marc Lefèvre — CTO / Architecte (Expert)
- Hichem Jaziri — Ingénieur Java Spring Boot (Senior)
- Claire Dubois — Ingénieure Java Spring Boot (Senior)
- Antoine Roux — Ingénieur Java Spring Boot (Confirmé)
Missions : API Spring Boot, sécurité JWT, base PostgreSQL ; Services métier, stockage MinIO ; Revue de code croisée

### Technique · Frontend
- Sarra Mansouri — Lead Angular (Senior)
- Julien Petit — Ingénieur Angular (Senior)
Missions : Application Angular 20 ; Composants, formulaires, état de session ; Accessibilité et responsive

### Technique · Tests & QA
- Amel Kacem — QA Lead (Senior)
- Thomas Girard — Ingénieur automatisation de tests (Confirmé)
Missions : Plan de tests et critères d’acceptation ; Tests automatisés (JUnit, Testcontainers, e2e) ; Recette avant chaque livraison

### Technique · DevOps & Sécurité
- Rami Saidi — Ingénieur DevOps / SRE (Senior)
- Laura Blanc — Ingénieure sécurité applicative (Senior)
Missions : Docker, CI/CD, environnements dev / prod ; Secrets, sauvegardes, monitoring ; Sécurité applicative

### Ressources humaines
- Fatma Zouari — Responsable RH (Senior)
Missions : Affecte les ingénieurs aux phases (plan de charge) ; Onboarding des nouveaux profils ; Suivi des compétences

### Administratif
- Céline Robert — Assistante de direction (Confirmée)
Missions : Compte rendu quotidien (ce journal) ; Archivage des documents du projet ; Organisation des points client

### Juridique
- Mehdi Amrani — Juriste contrats & PI (Senior)
- Aurélie Fontaine — DPO · RGPD (Senior)
Missions : Contrat de sous-traitance et propriété intellectuelle ; Licences des bibliothèques open source ; Conformité RGPD (données des acteurs)

### Finance
- Philippe Garnier — Directeur administratif et financier (Senior)
Missions : Budget en jours-homme par phase ; Coûts d’infrastructure et d’IA ; Facturation au client

### Relation client
- Leila Bouaziz — Account manager (Senior)
Missions : Interlocuteur unique du client ; Demande les validations (commit, périmètre, budget) ; Présente le rapport de fin de cycle
