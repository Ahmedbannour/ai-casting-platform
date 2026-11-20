-- Room de casting par projet : autorisations par membre, documents partagés par rôle, tâches, votes (swipe), rang du choix.

ALTER TABLE project_members
    ADD COLUMN can_swipe   BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN can_results BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN can_docs    BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN can_tasks   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN room_lead   BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE room_documents (
    id          UUID PRIMARY KEY,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    file_key    VARCHAR(400) NOT NULL,
    file_type   VARCHAR(120),
    file_size   BIGINT,
    audience    VARCHAR(200) NOT NULL DEFAULT 'MARQUE,AGENCE_MARKETING,REALISATEUR,BOITE_PROD',
    version     INT NOT NULL DEFAULT 1,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_room_documents_project ON room_documents(project_id);

CREATE TABLE room_tasks (
    id          UUID PRIMARY KEY,
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       VARCHAR(200) NOT NULL,
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    due_date    DATE,
    status      VARCHAR(12) NOT NULL DEFAULT 'A_FAIRE',
    position    INT NOT NULL DEFAULT 0,
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT now(),
    updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX idx_room_tasks_project ON room_tasks(project_id);

CREATE TABLE swipe_votes (
    id         UUID PRIMARY KEY,
    entry_id   UUID NOT NULL REFERENCES shortlist_entries(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vote       VARCHAR(8) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    CONSTRAINT uq_swipe_vote UNIQUE (entry_id, user_id)
);
CREATE INDEX idx_swipe_votes_entry ON swipe_votes(entry_id);

-- 1er choix, remplaçant, suppléant
ALTER TABLE shortlist_entries ADD COLUMN pick_rank SMALLINT;

-- Projets déjà nés d'une publicité : la marque et l'agence rejoignent la room.
INSERT INTO project_members (project_id, user_id, added_at)
SELECT DISTINCT r.project_id, u.id, now()
FROM ad_requests r
JOIN users u ON u.agency_id IN (r.brand_org_id, r.agency_org_id) AND u.enabled = TRUE
JOIN projects p ON p.id = r.project_id
WHERE r.project_id IS NOT NULL AND u.id <> p.owner_id
ON CONFLICT DO NOTHING;
-- Les membres de la production ont toutes les autorisations et dirigent la room.
UPDATE project_members m SET can_docs = TRUE, can_tasks = TRUE, room_lead = TRUE
FROM users u WHERE u.id = m.user_id AND u.role = 'BOITE_PROD';
