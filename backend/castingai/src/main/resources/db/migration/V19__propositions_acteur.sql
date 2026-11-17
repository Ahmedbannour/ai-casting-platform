-- T-095 · L'agent propose un rôle ou convoque à une audition ; l'acteur répond depuis son espace.
create table if not exists role_offers (
    id            uuid primary key,
    entry_id      uuid not null references shortlist_entries(id) on delete cascade,
    kind          varchar(12) not null check (kind in ('PROPOSITION', 'AUDITION')),
    message       varchar(1000),
    audition_date date,
    status        varchar(10) not null default 'ENVOYEE' check (status in ('ENVOYEE', 'ACCEPTEE', 'DECLINEE', 'ANNULEE')),
    sent_by       uuid references users(id) on delete set null,
    created_at    timestamp not null default now(),
    answered_at   timestamp,
    answer_note   varchar(500)
);
create index if not exists idx_role_offers_entry on role_offers (entry_id, created_at desc);
-- Une seule proposition en attente par candidat
create unique index if not exists uq_role_offers_pending on role_offers (entry_id) where status = 'ENVOYEE';
