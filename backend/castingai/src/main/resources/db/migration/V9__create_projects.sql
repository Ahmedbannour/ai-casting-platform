-- MVP (décision D-002) · Projets et équipe de projet.
CREATE TABLE projects (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        VARCHAR(160) NOT NULL,
    type         VARCHAR(20)  NOT NULL CHECK (type IN ('LONG_METRAGE', 'SERIE', 'COURT_METRAGE', 'PUBLICITE', 'THEATRE', 'AUTRE')),
    description  TEXT,
    start_date   DATE,
    end_date     DATE,
    status       VARCHAR(10)  NOT NULL DEFAULT 'EN_COURS' CHECK (status IN ('EN_COURS', 'TERMINE', 'ARCHIVE')),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_project_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_projects_owner_updated ON projects(owner_id, updated_at DESC);

-- Collègues invités sur un projet (US-04, sprint S6)
CREATE TABLE project_members (
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_members_user ON project_members(user_id);
