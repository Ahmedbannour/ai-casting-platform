-- Cahier des charges v2 (19/11/2026) : six rôles, organisations typées, intention du réalisateur.
-- Les agents de casting d'avant la v2 deviennent des comptes « boîte de production ».
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role;
UPDATE users SET role = 'BOITE_PROD' WHERE role = 'AGENT';
ALTER TABLE users ADD CONSTRAINT ck_users_role
    CHECK (role IN ('ADMIN', 'BOITE_PROD', 'ACTEUR', 'MARQUE', 'AGENCE_MARKETING', 'REALISATEUR'));

-- Une organisation = une marque, une agence marketing ou une boîte de production.
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'BOITE_PROD';
ALTER TABLE agencies ADD CONSTRAINT ck_agencies_kind CHECK (kind IN ('MARQUE', 'AGENCE_MARKETING', 'BOITE_PROD'));

-- Intention du réalisateur, rôle par rôle : remplace la phrase de recherche tapée à la main.
ALTER TABLE casting_roles ADD COLUMN IF NOT EXISTS intention TEXT;
