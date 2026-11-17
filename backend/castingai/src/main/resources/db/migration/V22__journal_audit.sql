-- T-099 · Journal d'audit de l'administration : qui a fait quoi, sur quoi, et quand.
create table if not exists audit_log (
    id           uuid primary key,
    actor_id     uuid references users(id) on delete set null,
    actor_label  varchar(200) not null,
    action       varchar(30) not null,
    target       varchar(200),
    details      varchar(1000),
    created_at   timestamp not null default now()
);
create index if not exists idx_audit_log_created on audit_log (created_at desc);
