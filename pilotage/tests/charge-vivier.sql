-- T-117 : mesure du vivier à 100 000 fiches. Tout est annulé à la fin (ROLLBACK) : aucune donnée ne reste.
\timing off
BEGIN;
INSERT INTO actors (id, first_name, last_name, gender, birth_date, city, country, height, visibility, created_at, updated_at)
SELECT gen_random_uuid(), 'Prenom' || g, 'Nom' || (g % 9973), CASE WHEN g % 2 = 0 THEN 'Femme' ELSE 'Homme' END,
       DATE '1950-01-01' + (g * 37 % 25000), (ARRAY['Tunis','Sfax','Sousse','Paris','Lyon','Nabeul','Bizerte','Monastir'])[1 + g % 8], 'TN',
       150 + g % 50, 'VISIBLE', now(), now()
FROM generate_series(1, 100000) g;
INSERT INTO actor_languages (actor_id, name, level)
SELECT id, (ARRAY['Français','Arabe','Anglais','Italien','Espagnol','Allemand'])[1 + (abs(hashtext(id::text)) % 6)], 'Courant' FROM actors;
INSERT INTO actor_languages (actor_id, name, level)
SELECT id, 'Français', 'Courant' FROM actors WHERE abs(hashtext(id::text || 'f')) % 3 = 0;
INSERT INTO actor_skills (actor_id, name, level)
SELECT id, (ARRAY['Danse','Chant','Cascades','Doublage','Équitation','Natation','Arts martiaux','Improvisation'])[1 + (abs(hashtext(id::text || 's')) % 8)], 'Bon' FROM actors;
ANALYZE actors; ANALYZE actor_languages; ANALYZE actor_skills;
SELECT count(*) AS fiches FROM actors;
\timing on
-- 1. Liste sans filtre, page 1, tri par nom
SELECT a.id FROM actors a WHERE a.visibility='VISIBLE' ORDER BY a.last_name, a.id LIMIT 24;
SELECT count(*) FROM actors a WHERE a.visibility='VISIBLE';
-- 2. Page 2000 (pagination profonde)
SELECT a.id FROM actors a WHERE a.visibility='VISIBLE' ORDER BY a.last_name, a.id LIMIT 24 OFFSET 48000;
-- 3. Filtres combinés : femme, 20-35 ans, 165-180 cm, Tunis, français + anglais, danse
SELECT a.id FROM actors a WHERE a.visibility='VISIBLE' AND a.gender='Femme' AND lower(a.city) LIKE '%tunis%'
  AND a.birth_date <= CURRENT_DATE - interval '20 years' AND a.birth_date > CURRENT_DATE - interval '36 years'
  AND a.height BETWEEN 165 AND 180
  AND (SELECT count(DISTINCT lower(l.name)) FROM actor_languages l WHERE l.actor_id=a.id AND lower(l.name) IN ('français','anglais'))=2
  AND (SELECT count(DISTINCT lower(k.name)) FROM actor_skills k WHERE k.actor_id=a.id AND lower(k.name) IN ('danse'))=1
  ORDER BY a.last_name, a.id LIMIT 24;
SELECT count(*) FROM actors a WHERE a.visibility='VISIBLE' AND a.gender='Femme' AND lower(a.city) LIKE '%tunis%'
  AND a.birth_date <= CURRENT_DATE - interval '20 years' AND a.birth_date > CURRENT_DATE - interval '36 years'
  AND a.height BETWEEN 165 AND 180
  AND (SELECT count(DISTINCT lower(l.name)) FROM actor_languages l WHERE l.actor_id=a.id AND lower(l.name) IN ('français','anglais'))=2
  AND (SELECT count(DISTINCT lower(k.name)) FROM actor_skills k WHERE k.actor_id=a.id AND lower(k.name) IN ('danse'))=1;
-- 4. Recherche par nom
SELECT a.id FROM actors a WHERE a.visibility='VISIBLE' AND (lower(a.first_name) LIKE '%prenom4242%' OR lower(a.last_name) LIKE '%prenom4242%') ORDER BY a.last_name LIMIT 24;
-- 5. Suggestions (facettes)
SELECT n FROM (SELECT min(l.name) n, count(*) c FROM actor_languages l JOIN actors a ON a.id=l.actor_id WHERE a.visibility='VISIBLE' GROUP BY lower(l.name)) t ORDER BY c DESC LIMIT 40;
SELECT n FROM (SELECT min(k.name) n, count(*) c FROM actor_skills k JOIN actors a ON a.id=k.actor_id WHERE a.visibility='VISIBLE' GROUP BY lower(k.name)) t ORDER BY c DESC LIMIT 60;
ROLLBACK;
