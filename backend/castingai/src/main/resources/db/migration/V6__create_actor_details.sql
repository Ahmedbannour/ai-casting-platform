CREATE TABLE actor_comments (
                                id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                actor_id   UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
                                user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
                                content    TEXT NOT NULL,
                                created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE actor_documents (
                                 id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                 actor_id      UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
                                 name          VARCHAR(255) NOT NULL,
                                 original_name VARCHAR(255) NOT NULL,
                                 type          VARCHAR(100),
                                 url           VARCHAR(512) NOT NULL,
                                 size          BIGINT,
                                 created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actor_comments_actor_id  ON actor_comments(actor_id);
CREATE INDEX idx_actor_documents_actor_id ON actor_documents(actor_id);