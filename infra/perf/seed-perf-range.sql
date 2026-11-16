-- Ajoute des acteurs fictifs numérotés de :debut à :fin (2 langues, 2 compétences, 4 photos chacun).
-- Usage : psql -v debut=1 -v fin=1000 -f seed-perf-range.sql
-- Repérables par leur e-mail perf+N@test.local ; à retirer avec cleanup-perf.sql.
INSERT INTO actors (id, first_name, last_name, birth_date, gender, city, country, email, bio,
                    height, weight, eye_color, hair_color, created_at, updated_at)
SELECT gen_random_uuid(),
       (ARRAY['Lina','Sami','Nour','Yanis','Emma','Hugo','Sara','Adam','Léa','Omar'])[1 + (g % 10)],
       'Perf' || g,
       CURRENT_DATE - ((18 + (g % 45)) * 365 + (g % 300)),
       CASE WHEN g % 2 = 0 THEN 'Femme' ELSE 'Homme' END,
       (ARRAY['Paris','Lyon','Marseille','Tunis','Nice','Lille','Bordeaux','Nantes'])[1 + (g % 8)],
       'France', 'perf+' || g || '@test.local', 'Profil de test de charge',
       150 + (g % 45), 50 + (g % 40), 'Marron',
       (ARRAY['Brun','Blond','Noir','Roux','Châtain'])[1 + (g % 5)], now(), now()
FROM generate_series(:debut, :fin) g;

INSERT INTO actor_languages (id, actor_id, name, level)
SELECT gen_random_uuid(), a.id, l, 'Courant'
FROM actors a,
     unnest(ARRAY['Français', (ARRAY['Anglais','Espagnol','Arabe','Italien'])[1 + abs(hashtext(a.id::text)) % 4]]) l
WHERE a.email LIKE 'perf+%' AND substring(a.email from 'perf\+(\d+)@')::int BETWEEN :debut AND :fin;

INSERT INTO actor_skills (id, actor_id, name, level)
SELECT gen_random_uuid(), a.id, s, 'Confirmé'
FROM actors a,
     unnest(ARRAY[(ARRAY['Danse','Chant','Comédie'])[1 + abs(hashtext(a.id::text)) % 3],
                  (ARRAY['Sport','Équitation','Escrime'])[1 + abs(hashtext(a.last_name)) % 3]]) s
WHERE a.email LIKE 'perf+%' AND substring(a.email from 'perf\+(\d+)@')::int BETWEEN :debut AND :fin;

INSERT INTO actor_photos (id, actor_id, filename, original_name, url, thumbnail_url, size, is_main, created_at)
SELECT gen_random_uuid(), a.id, 'perf_' || n || '.jpg', 'perf.jpg',
       'https://example.invalid/photo.jpg', 'https://example.invalid/thumb.jpg', 1000, n = 1, now()
FROM actors a, generate_series(1, 4) n
WHERE a.email LIKE 'perf+%' AND substring(a.email from 'perf\+(\d+)@')::int BETWEEN :debut AND :fin;

ANALYZE;
