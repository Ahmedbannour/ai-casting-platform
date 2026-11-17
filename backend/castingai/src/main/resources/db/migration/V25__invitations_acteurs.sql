-- T-102 · Invitation des acteurs importés ou saisis par une agence.
-- L'agence génère un lien à usage unique ; l'acteur crée son compte, reprend sa fiche
-- et choisit : rester privé chez son agence ou rejoindre le vivier commun.
-- Le jeton n'est jamais stocké en clair : seule son empreinte SHA-256 est gardée.
create table if not exists actor_invitations (
    id          uuid primary key,
    actor_id    uuid not null references actors(id) on delete cascade,
    agency_id   uuid references agencies(id) on delete set null,
    token_hash  varchar(64) not null unique,
    created_by  uuid references users(id) on delete set null,
    created_at  timestamp not null default now(),
    expires_at  timestamp not null,
    used_at     timestamp,
    revoked_at  timestamp
);
create index if not exists idx_invitations_actor on actor_invitations (actor_id);

-- Agence d'origine d'une fiche passée au vivier : elle garde l'accès direct aux coordonnées.
alter table actors add column if not exists origin_agency_id uuid references agencies(id) on delete set null;

-- Un accord peut aussi être donné en acceptant une invitation.
alter table consents drop constraint if exists consents_source_check;
alter table consents add constraint consents_source_check check (source in ('INSCRIPTION', 'CONNEXION', 'INVITATION'));
