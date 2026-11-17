-- T-093 · Consentement de l'acteur : il choisit d'être visible des agences ou en pause.
-- En pause, il sort des recherches et des liens envoyés aux réalisateurs.
alter table actors add column if not exists visibility varchar(10) not null default 'VISIBLE';
alter table actors add column if not exists visibility_changed_at timestamp;
alter table actors add constraint actors_visibility_chk check (visibility in ('VISIBLE', 'PAUSE'));
create index if not exists idx_actors_visibility on actors (visibility);
