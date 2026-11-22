-- Le chef de room invite aussi une personne pas encore inscrite : un lien qui la fait entrer dans la room.
ALTER TABLE pro_invitations ADD COLUMN project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE pro_invitations ALTER COLUMN production_id DROP NOT NULL;
ALTER TABLE pro_invitations DROP CONSTRAINT IF EXISTS pro_invitations_kind_check;
ALTER TABLE pro_invitations ADD CONSTRAINT pro_invitations_kind_check
    CHECK (kind IN ('MARQUE', 'AGENCE_MARKETING', 'ASSISTANT_PROD', 'REALISATEUR'));
CREATE INDEX ix_pro_invitations_project ON pro_invitations(project_id);
