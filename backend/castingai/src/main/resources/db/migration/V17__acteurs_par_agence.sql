-- T-092 · Un espace par agence cliente.
-- Une fiche apportée par une agence lui reste privée ; agency_id null = vivier de la plateforme
-- (freelances inscrits, fiches de l'administrateur).
alter table actors add column if not exists agency_id uuid references agencies(id) on delete set null;
update actors a set agency_id = u.agency_id
  from users u
 where a.created_by = u.id and a.agency_id is null and a.user_id is null and u.agency_id is not null;
create index if not exists idx_actors_agency on actors (agency_id);
