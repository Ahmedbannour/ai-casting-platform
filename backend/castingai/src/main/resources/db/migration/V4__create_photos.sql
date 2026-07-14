CREATE TABLE actor_photos (
                              id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                              actor_id      UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
                              filename      VARCHAR(255) NOT NULL,
                              original_name VARCHAR(255) NOT NULL,
                              url           VARCHAR(512) NOT NULL,
                              thumbnail_url VARCHAR(512),
                              size          BIGINT,
                              is_main       BOOLEAN NOT NULL DEFAULT FALSE,
                              created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_actor_photos_actor_id ON actor_photos(actor_id);
CREATE INDEX idx_actor_photos_is_main  ON actor_photos(actor_id, is_main);