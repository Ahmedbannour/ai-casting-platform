-- Décisions du client sur les propositions de l'IA (glisser à droite / à gauche).
-- Ce sont les signaux d'apprentissage du futur classeur et de l'IA fédérée.
CREATE TABLE ai_feedback (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_id    UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
    query       TEXT NOT NULL,
    decision    VARCHAR(10) NOT NULL CHECK (decision IN ('RETENU', 'ECARTE', 'ANNULE')),
    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_feedback_actor ON ai_feedback(actor_id);
CREATE INDEX idx_ai_feedback_user_created ON ai_feedback(user_id, created_at DESC);
