-- Le producer (boîte de production) crée les projets et invite la marque et l'agence marketing.
-- Nouveau rôle : assistante de production, rattachée à la boîte, avec les autorisations que le producer lui donne.

ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role;
ALTER TABLE users ADD CONSTRAINT ck_users_role
    CHECK (role IN ('ADMIN', 'BOITE_PROD', 'ASSISTANT_PROD', 'ACTEUR', 'MARQUE', 'AGENCE_MARKETING', 'REALISATEUR'));

-- Autorisations de l'assistante, séparées par des virgules : PROJETS, INVITATIONS, EQUIPE, ROOM, CASTING.
ALTER TABLE users ADD COLUMN assistant_perms VARCHAR(200);

-- Invitation par lien à usage unique (14 jours) : marque ou agence pour une publicité, assistante pour la boîte.
CREATE TABLE pro_invitations (
    id            UUID PRIMARY KEY,
    token_hash    VARCHAR(64) NOT NULL UNIQUE,
    email         VARCHAR(160) NOT NULL,
    kind          VARCHAR(20) NOT NULL CHECK (kind IN ('MARQUE', 'AGENCE_MARKETING', 'ASSISTANT_PROD')),
    request_id    UUID REFERENCES ad_requests(id) ON DELETE CASCADE,
    production_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    perms         VARCHAR(200),
    created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT now(),
    expires_at    TIMESTAMP NOT NULL,
    used_at       TIMESTAMP,
    revoked_at    TIMESTAMP
);
CREATE INDEX ix_pro_invitations_production ON pro_invitations(production_id);
CREATE INDEX ix_pro_invitations_request ON pro_invitations(request_id);
