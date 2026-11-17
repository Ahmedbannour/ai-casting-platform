-- Lien de partage d'une shortlist au réalisateur (sans compte), et ses avis sur chaque candidat.
CREATE TABLE role_shares (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id     UUID NOT NULL REFERENCES casting_roles (id) ON DELETE CASCADE,
    token       VARCHAR(64) NOT NULL UNIQUE,
    label       VARCHAR(120),
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMP NOT NULL,
    revoked_at  TIMESTAMP
);
CREATE INDEX idx_role_shares_role ON role_shares (role_id);

CREATE TABLE share_votes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id    UUID NOT NULL REFERENCES role_shares (id) ON DELETE CASCADE,
    entry_id    UUID NOT NULL REFERENCES shortlist_entries (id) ON DELETE CASCADE,
    voter_name  VARCHAR(80) NOT NULL,
    vote        VARCHAR(10) NOT NULL CHECK (vote IN ('OUI', 'PEUT_ETRE', 'NON')),
    comment     VARCHAR(1000),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT ux_share_votes UNIQUE (share_id, entry_id)
);
CREATE INDEX idx_share_votes_entry ON share_votes (entry_id);
