-- T-096 · Notifications dans l'application (cloche) : avis du réalisateur, réponse d'un acteur,
-- nouvelle proposition, consultation des coordonnées. Les échéances de contrat sont calculées à la volée.
create table if not exists notifications (
    id          uuid primary key,
    user_id     uuid not null references users(id) on delete cascade,
    kind        varchar(20) not null,
    title       varchar(160) not null,
    body        varchar(400),
    link        varchar(200),
    created_at  timestamp not null default now(),
    read_at     timestamp
);
create index if not exists idx_notifications_user on notifications (user_id, created_at desc);
