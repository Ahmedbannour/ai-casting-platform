-- Cahier v2, sprint 3 (T-160) · Analyse de la V0 pour l'agence : résumé, points manquants, questions suggérées.
ALTER TABLE ad_requests ADD COLUMN ai_summary   TEXT;
ALTER TABLE ad_requests ADD COLUMN ai_missing   TEXT;
ALTER TABLE ad_requests ADD COLUMN ai_questions TEXT;
ALTER TABLE ad_requests ADD COLUMN ai_source    VARCHAR(10) CHECK (ai_source IN ('IA','REGLES'));
ALTER TABLE ad_requests ADD COLUMN ai_at        TIMESTAMP;
