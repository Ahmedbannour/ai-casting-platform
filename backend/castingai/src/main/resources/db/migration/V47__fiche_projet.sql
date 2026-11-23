-- P-083 · Fiche unique du projet : une valeur par champ, avec sa provenance et la proposition de l'IA en attente
create table project_sheet_values (
    request_id     uuid not null references ad_requests(id) on delete cascade,
    field_key      varchar(40) not null,
    value          text,
    source         varchar(10) not null default 'MANUEL' check (source in ('MANUEL', 'IA')),
    updated_by     uuid references users(id) on delete set null,
    updated_at     timestamp not null default now(),
    suggestion     text,
    suggestion_from uuid,
    suggestion_at  timestamp,
    primary key (request_id, field_key)
);

-- Fichiers et liens lus par l'IA pour remplir la fiche
create table project_sheet_sources (
    id          uuid primary key,
    request_id  uuid not null references ad_requests(id) on delete cascade,
    kind        varchar(10) not null check (kind in ('FICHIER', 'LIEN')),
    name        varchar(300) not null,
    url         varchar(1000),
    added_by    uuid references users(id) on delete set null,
    created_at  timestamp not null default now(),
    status      varchar(10) not null default 'LECTURE' check (status in ('LECTURE', 'FAIT', 'ECHEC')),
    engine      varchar(10),
    chars       int not null default 0,
    filled      int not null default 0,
    proposed    int not null default 0,
    message     varchar(1000)
);
create index idx_sheet_sources_request on project_sheet_sources(request_id, created_at desc);
