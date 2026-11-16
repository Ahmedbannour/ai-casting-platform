-- MVP (décision D-002) · Rôles d'un projet (le profil recherché). API au sprint S4.
CREATE TABLE casting_roles (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          VARCHAR(120) NOT NULL,
    description   TEXT,
    gender        VARCHAR(10),
    min_age       INT CHECK (min_age IS NULL OR min_age BETWEEN 0 AND 120),
    max_age       INT CHECK (max_age IS NULL OR max_age BETWEEN 0 AND 120),
    languages     TEXT,
    skills        TEXT,
    city          VARCHAR(100),
    shoot_start   DATE,
    shoot_end     DATE,
    importance    VARCHAR(12) NOT NULL DEFAULT 'SECONDAIRE' CHECK (importance IN ('PRINCIPAL', 'SECONDAIRE', 'FIGURATION')),
    position      INT NOT NULL DEFAULT 0,
    filled        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_role_ages CHECK (min_age IS NULL OR max_age IS NULL OR min_age <= max_age),
    CONSTRAINT chk_role_shoot CHECK (shoot_end IS NULL OR shoot_start IS NULL OR shoot_end >= shoot_start)
);
CREATE INDEX idx_casting_roles_project ON casting_roles(project_id, position);
