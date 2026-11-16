-- Performance pour des milliers d'acteurs : index des filtres, des jointures et de la recherche texte.

-- Recherche « contient » rapide (ILIKE '%...%') sur les noms et la ville
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Filtres stricts du tableau de bord et de la recherche IA
CREATE INDEX IF NOT EXISTS idx_actors_gender_birth ON actors (gender, birth_date);
CREATE INDEX IF NOT EXISTS idx_actors_birth_date   ON actors (birth_date);

-- Recherche texte dans les noms et la ville
CREATE INDEX IF NOT EXISTS idx_actors_first_name_trgm ON actors USING gin (lower(first_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_actors_last_name_trgm  ON actors USING gin (lower(last_name)  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_actors_city_trgm       ON actors USING gin (lower(city)       gin_trgm_ops);

-- Jointures vers les sous-tables (chargement groupé des fiches)
CREATE INDEX IF NOT EXISTS idx_actor_skills_actor        ON actor_skills (actor_id);
CREATE INDEX IF NOT EXISTS idx_actor_languages_actor     ON actor_languages (actor_id);
CREATE INDEX IF NOT EXISTS idx_actor_experiences_actor   ON actor_experiences (actor_id);
CREATE INDEX IF NOT EXISTS idx_actor_availabilities_actor ON actor_availabilities (actor_id);

-- Critères « parle la langue » / « a la compétence »
CREATE INDEX IF NOT EXISTS idx_actor_languages_name_trgm ON actor_languages USING gin (lower(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_actor_skills_name_trgm    ON actor_skills    USING gin (lower(name) gin_trgm_ops);
