-- T-094 · Coordonnées protégées : chaque consultation du téléphone et de l'e-mail d'un acteur est tracée,
-- et l'acteur voit qui les a consultées.
create table if not exists contact_views (
    id         uuid primary key,
    actor_id   uuid not null references actors(id) on delete cascade,
    viewer_id  uuid references users(id) on delete set null,
    agency_id  uuid references agencies(id) on delete set null,
    viewed_at  timestamp not null default now()
);
create index if not exists idx_contact_views_actor on contact_views (actor_id, viewed_at desc);
