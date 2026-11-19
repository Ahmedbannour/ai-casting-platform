-- Cahier v2 (19/11/2026) · À l'inscription, l'acteur dit s'il accepte la figuration et pour quels types :
-- EXTRA (figurant), SILHOUETTE, FIGURANT_SPECIAL, séparés par des virgules. Vide = refuse ; NULL = pas encore répondu.
ALTER TABLE actors ADD COLUMN IF NOT EXISTS figuration VARCHAR(60);
