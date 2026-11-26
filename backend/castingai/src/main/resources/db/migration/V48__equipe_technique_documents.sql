-- P-087 · Équipe technique du film (postes fixes, coordonnées, invitation par lien)
create table project_crew (
    request_id        uuid not null references ad_requests(id) on delete cascade,
    post_key          varchar(40) not null,
    full_name         varchar(160),
    phone             varchar(40),
    email             varchar(160),
    address           varchar(300),
    city              varchar(120),
    location          varchar(500),
    user_id           uuid references users(id) on delete set null,
    status            varchar(20) not null default 'A_POURVOIR',
    invite_hash       varchar(100),
    invite_expires_at timestamp,
    invited_by        uuid references users(id) on delete set null,
    invited_at        timestamp,
    updated_by        uuid references users(id) on delete set null,
    updated_at        timestamp not null default now(),
    primary key (request_id, post_key)
);
create index idx_project_crew_user on project_crew(user_id);
create unique index idx_project_crew_invite on project_crew(invite_hash) where invite_hash is not null;

-- P-087 · Documents du projet : le fichier est conservé pour être vu, téléchargé et partagé
alter table project_sheet_sources add column storage_key varchar(500), add column content_type varchar(120), add column size_bytes bigint;

create table sheet_shares (
    token_hash  varchar(100) primary key,
    source_id   uuid not null references project_sheet_sources(id) on delete cascade,
    created_by  uuid references users(id) on delete set null,
    expires_at  timestamp not null,
    created_at  timestamp not null default now()
);

-- P-087 · Nouveau rôle : membre de l'équipe technique d'un tournage
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role;
ALTER TABLE users ADD CONSTRAINT ck_users_role
    CHECK (role IN ('ADMIN', 'BOITE_PROD', 'ASSISTANT_PROD', 'ACTEUR', 'MARQUE', 'AGENCE_MARKETING', 'REALISATEUR', 'TECHNICIEN'));
