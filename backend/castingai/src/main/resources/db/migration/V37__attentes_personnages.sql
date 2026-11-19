-- Cahier v2, sprint 3 (T-162) · Attentes de la marque et de l'agence par personnage, saisies par la production,
-- puis transmises au réalisateur et au 1er AD.
CREATE TABLE ad_characters (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID NOT NULL REFERENCES ad_requests(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    name        VARCHAR(120) NOT NULL,
    story       TEXT,
    brand_wish  TEXT,
    agency_wish TEXT,
    notes       TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ix_ad_characters_request ON ad_characters(request_id, position);
ALTER TABLE ad_requests ADD COLUMN director_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ad_requests ADD COLUMN first_ad_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ad_requests ADD COLUMN expectations_sent_at TIMESTAMP;
