-- Cahier v2, sprint 5 (T-165) · Type de figuration demandé par un rôle « figuration » : seuls les acteurs qui l'acceptent sont proposés.
ALTER TABLE casting_roles ADD COLUMN figuration_type VARCHAR(20) CHECK (figuration_type IN ('EXTRA','SILHOUETTE','FIGURANT_SPECIAL'));
