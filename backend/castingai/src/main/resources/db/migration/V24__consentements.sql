-- T-101 · Consentement daté et versionné aux conditions d'utilisation et à la politique de confidentialité.
-- Une ligne par document accepté ; une nouvelle version des textes demande un nouvel accord.
create table if not exists consents (
    id            uuid primary key,
    user_id       uuid not null references users(id) on delete cascade,
    document      varchar(20) not null check (document in ('CGU', 'CONFIDENTIALITE')),
    version       varchar(20) not null,
    accepted_at   timestamp   not null default now(),
    source        varchar(20) not null check (source in ('INSCRIPTION', 'CONNEXION')),
    age_statement varchar(10) not null check (age_statement in ('MAJEUR', 'MINEUR')),
    guardian_name varchar(120),
    check (age_statement = 'MAJEUR' or guardian_name is not null)
);
create index if not exists idx_consents_user on consents (user_id, document, version);
