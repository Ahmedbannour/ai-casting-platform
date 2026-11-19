-- T-157 · Inscription libre des professionnels (marque, agence marketing, réalisateur, boîte de production) :
-- le compte attend la validation de l'administrateur avant de pouvoir se connecter.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT FALSE;
