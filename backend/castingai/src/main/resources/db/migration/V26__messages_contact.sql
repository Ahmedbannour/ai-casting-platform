-- Messages envoyés depuis le formulaire de contact de la vitrine publique, lus dans l'Administration.
create table if not exists contact_messages (
    id           uuid primary key,
    name         varchar(120) not null,
    email        varchar(160) not null,
    organisation varchar(160),
    profile      varchar(10)  not null check (profile in ('AGENCE', 'ACTEUR', 'AUTRE')),
    message      varchar(2000) not null,
    ip           varchar(64),
    created_at   timestamp not null default now(),
    read_at      timestamp
);
create index if not exists idx_contact_messages_created on contact_messages (created_at desc);
