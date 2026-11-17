-- Trois rôles : ADMIN, AGENT (agent de casting), ACTEUR (freelance inscrit lui-même).
-- Les anciens comptes USER / CASTING_DIRECTOR deviennent des agents : rien ne change pour eux.
UPDATE users SET role = 'AGENT' WHERE role IN ('USER', 'CASTING_DIRECTOR');
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'AGENT';
ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('ADMIN', 'AGENT', 'ACTEUR'));

-- Connexion par Google / Facebook
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'LOCAL';
ALTER TABLE users ADD COLUMN provider_id   VARCHAR(160);
CREATE UNIQUE INDEX ux_users_provider ON users (auth_provider, provider_id) WHERE provider_id IS NOT NULL;

-- Une fiche acteur peut appartenir à un compte (le freelance la tient à jour lui-même)
ALTER TABLE actors ADD COLUMN user_id UUID UNIQUE REFERENCES users (id) ON DELETE SET NULL;
-- Origine de la fiche : saisie par l'agence, inscription du freelance ou import de fichier
ALTER TABLE actors ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'AGENCE';
ALTER TABLE actors ADD CONSTRAINT ck_actors_source CHECK (source IN ('AGENCE', 'INSCRIPTION', 'IMPORT'));
CREATE INDEX idx_actors_email_lower ON actors (lower(email));
