-- Cahier v2, sprint 3 (T-161) · V1 de l'agence : révisions demandées par la marque, validation, choix de la boîte de production.
ALTER TABLE ad_versions ADD COLUMN review_comment TEXT;
ALTER TABLE ad_versions ADD COLUMN reviewed_at    TIMESTAMP;
ALTER TABLE ad_requests ADD COLUMN production_org_id UUID REFERENCES agencies(id) ON DELETE SET NULL;
ALTER TABLE ad_requests ADD COLUMN v1_validated_at  TIMESTAMP;
CREATE INDEX ix_ad_requests_production ON ad_requests(production_org_id);
