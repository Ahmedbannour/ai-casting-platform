-- Image de marque de la boîte de production : nom affiché, couleur principale, logo.
-- Appliquée à son équipe, à ses rooms et aux pages d'invitation de ses projets.
ALTER TABLE agencies ADD COLUMN brand_name  VARCHAR(160);
ALTER TABLE agencies ADD COLUMN brand_color VARCHAR(7);
ALTER TABLE agencies ADD COLUMN brand_logo_key  VARCHAR(400);
ALTER TABLE agencies ADD COLUMN brand_logo_type VARCHAR(60);
ALTER TABLE agencies ADD COLUMN brand_updated_at TIMESTAMP;
