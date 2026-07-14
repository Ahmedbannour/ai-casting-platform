CREATE TABLE search_history (
                                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
                                query        TEXT NOT NULL,
                                results_count INTEGER DEFAULT 0,
                                created_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_search_history_user_id ON search_history(user_id);
CREATE INDEX idx_search_history_created ON search_history(created_at DESC);