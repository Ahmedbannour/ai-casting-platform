-- MVP (décision D-002) · Shortlists par rôle, historique des statuts, lien des décisions de cartes au rôle.
CREATE TABLE shortlist_entries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id        UUID NOT NULL REFERENCES casting_roles(id) ON DELETE CASCADE,
    actor_id       UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
    status         VARCHAR(16) NOT NULL DEFAULT 'PRESELECTIONNE'
                   CHECK (status IN ('PRESELECTIONNE', 'AUDITION', 'RAPPEL', 'CHOISI', 'REFUSE')),
    note           TEXT,
    audition_date  DATE,
    added_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_shortlist_role_actor UNIQUE (role_id, actor_id)
);
-- Un seul acteur « choisi » par rôle
CREATE UNIQUE INDEX uq_shortlist_one_chosen ON shortlist_entries(role_id) WHERE status = 'CHOISI';
CREATE INDEX idx_shortlist_actor ON shortlist_entries(actor_id);

CREATE TABLE shortlist_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id     UUID NOT NULL REFERENCES shortlist_entries(id) ON DELETE CASCADE,
    from_status  VARCHAR(16),
    to_status    VARCHAR(16) NOT NULL,
    user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    at           TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shortlist_events_entry ON shortlist_events(entry_id, at);

ALTER TABLE ai_feedback ADD COLUMN role_id UUID REFERENCES casting_roles(id) ON DELETE SET NULL;
