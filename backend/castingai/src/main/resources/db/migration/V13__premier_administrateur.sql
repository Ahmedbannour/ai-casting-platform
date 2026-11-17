-- Une agence sans administrateur ne pourrait plus ajouter d'agents ni importer d'acteurs :
-- si aucun compte n'est ADMIN, le plus ancien compte de l'agence (hors acteurs) le devient.
UPDATE users SET role = 'ADMIN'
WHERE id = (SELECT id FROM users WHERE role <> 'ACTEUR' ORDER BY created_at LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'ADMIN');
