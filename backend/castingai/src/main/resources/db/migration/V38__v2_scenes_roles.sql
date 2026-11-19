-- Cahier v2, sprint 4 (T-163) · V2 du réalisateur et du 1er AD : scènes et fiches de rôle (intention + critères).
-- À la publication, un projet de casting et ses rôles sont créés automatiquement.
CREATE TABLE ad_scenes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID NOT NULL REFERENCES ad_requests(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    title       VARCHAR(160) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ix_ad_scenes_request ON ad_scenes(request_id, position);
CREATE TABLE ad_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES ad_requests(id) ON DELETE CASCADE,
    character_id    UUID REFERENCES ad_characters(id) ON DELETE SET NULL,
    position        INT NOT NULL DEFAULT 0,
    name            VARCHAR(120) NOT NULL,
    intention       TEXT,
    gender          VARCHAR(10) CHECK (gender IN ('Femme','Homme')),
    min_age         INT CHECK (min_age BETWEEN 0 AND 100),
    max_age         INT CHECK (max_age BETWEEN 0 AND 100),
    appearance      TEXT,
    importance      VARCHAR(12) NOT NULL DEFAULT 'SECONDAIRE' CHECK (importance IN ('PRINCIPAL','SECONDAIRE','FIGURATION')),
    casting_role_id UUID REFERENCES casting_roles(id) ON DELETE SET NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ix_ad_roles_request ON ad_roles(request_id, position);
ALTER TABLE ad_requests ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE ad_requests ADD COLUMN v2_published_at TIMESTAMP;
