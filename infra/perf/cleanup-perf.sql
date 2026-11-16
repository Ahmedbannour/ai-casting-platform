-- Retire les acteurs du test de charge (photos, langues et compétences partent en cascade).
DELETE FROM actors WHERE email LIKE 'perf+%@test.local';
ANALYZE;
