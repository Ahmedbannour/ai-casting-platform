-- Cahier v2, sprint 2 (T-158, T-159) · Demande de publicité, ses versions (V0, V1, V2…) et son journal.
CREATE TABLE ad_requests (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_org_id  UUID REFERENCES agencies(id) ON DELETE SET NULL,
    created_by    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agency_org_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
    title         VARCHAR(160) NOT NULL,
    product       VARCHAR(160),
    objective     TEXT,
    target        TEXT,
    key_message   TEXT,
    air_date      DATE,
    status        VARCHAR(20) NOT NULL DEFAULT 'BROUILLON'
                  CHECK (status IN ('BROUILLON','V0_ENVOYEE','V1_EN_COURS','V1_LIVREE','V2_EN_COURS','V2_LIVREE','CASTING','PPM','ACTEURS_VALIDES','CLOTUREE','ANNULEE')),
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    updated_at    TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ix_ad_requests_brand ON ad_requests(brand_org_id);
CREATE INDEX ix_ad_requests_agency ON ad_requests(agency_org_id);
CREATE INDEX ix_ad_requests_creator ON ad_requests(created_by);

CREATE TABLE ad_versions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id   UUID NOT NULL REFERENCES ad_requests(id) ON DELETE CASCADE,
    kind         VARCHAR(4) NOT NULL CHECK (kind IN ('V0','V1','V2')),
    label        VARCHAR(10) NOT NULL,
    author_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    body         TEXT,
    file_key     VARCHAR(300),
    file_name    VARCHAR(255),
    file_type    VARCHAR(120),
    file_size    BIGINT,
    status       VARCHAR(12) NOT NULL DEFAULT 'BROUILLON' CHECK (status IN ('BROUILLON','LIVREE','A_REVISER')),
    created_at   TIMESTAMP NOT NULL DEFAULT now(),
    delivered_at TIMESTAMP
);
CREATE INDEX ix_ad_versions_request ON ad_versions(request_id);

CREATE TABLE ad_events (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES ad_requests(id) ON DELETE CASCADE,
    actor_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    type       VARCHAR(30) NOT NULL,
    message    VARCHAR(400) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ix_ad_events_request ON ad_events(request_id, created_at);
