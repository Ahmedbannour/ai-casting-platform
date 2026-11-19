-- T-127 · Supprime les données créées par la recette automatique (et rien d'autre).
-- Cibles : comptes « recette.*@exemple.tn », leurs fiches, leurs messages de contact,
-- et les organisations « Recette … » restées sans membre.
-- Lancé à la fin de chaque recette (test-plateforme.js) ; peut aussi être lancé à la main :
--   docker exec -i casting-postgres psql -U casting_user -d casting_db -v ON_ERROR_STOP=1 < pilotage/tests/nettoyer-recette.sql
begin;
create temp table cible_users on commit drop as
  select id from users where email like 'recette.%@exemple.tn';
create temp table cible_actors on commit drop as
  select id from actors where user_id in (select id from cible_users) or email like 'recette.%@exemple.tn';
delete from actors where id in (select id from cible_actors);
delete from users where id in (select id from cible_users);
delete from contact_messages where email like 'recette.%@exemple.tn';
delete from agencies a where a.name like 'Recette %' and not exists (select 1 from users u where u.agency_id = a.id);
commit;
