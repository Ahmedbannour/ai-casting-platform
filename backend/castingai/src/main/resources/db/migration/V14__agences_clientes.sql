-- Agences clientes : chacune signe un contrat avec la plateforme pour accéder au vivier d'acteurs partagé.
CREATE TABLE agencies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(160) NOT NULL,
    city            VARCHAR(100),
    contact_email   VARCHAR(255),
    contract_start  DATE NOT NULL,
    contract_end    DATE,
    max_agents      INT,
    notes           TEXT,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_agencies_contract CHECK (contract_end IS NULL OR contract_end >= contract_start),
    CONSTRAINT ck_agencies_max_agents CHECK (max_agents IS NULL OR max_agents BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX ux_agencies_name ON agencies (lower(name));

-- Chaque agent appartient à une agence cliente (l'administrateur de la plateforme n'en a pas).
ALTER TABLE users ADD COLUMN agency_id UUID REFERENCES agencies (id) ON DELETE SET NULL;
CREATE INDEX idx_users_agency ON users (agency_id);

-- Index utiles aux statistiques de la plateforme
CREATE INDEX IF NOT EXISTS idx_actors_created_at ON actors (created_at);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects (created_at);
CREATE INDEX IF NOT EXISTS idx_search_history_created_at ON search_history (created_at);
CREATE INDEX IF NOT EXISTS idx_shortlist_entries_created_at ON shortlist_entries (created_at);
