CREATE TABLE actors (
                        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        first_name    VARCHAR(100) NOT NULL,
                        last_name     VARCHAR(100) NOT NULL,
                        birth_date    DATE,
                        gender        VARCHAR(20),
                        city          VARCHAR(100),
                        country       VARCHAR(100),
                        phone         VARCHAR(30),
                        email         VARCHAR(255),
                        bio           TEXT,
                        height        INTEGER,
                        weight        INTEGER,
                        eye_color     VARCHAR(50),
                        hair_color    VARCHAR(50),
                        created_by    UUID REFERENCES users(id),
                        created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
                        updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE actor_skills (
                              id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                              actor_id  UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
                              name      VARCHAR(100) NOT NULL,
                              level     VARCHAR(50)
);

CREATE TABLE actor_languages (
                                 id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                 actor_id  UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
                                 name      VARCHAR(100) NOT NULL,
                                 level     VARCHAR(50)
);

CREATE TABLE actor_experiences (
                                   id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                   actor_id     UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
                                   title        VARCHAR(255) NOT NULL,
                                   production   VARCHAR(255),
                                   role         VARCHAR(255),
                                   year         INTEGER,
                                   description  TEXT
);

CREATE TABLE actor_availabilities (
                                      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                                      actor_id    UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
                                      from_date   DATE NOT NULL,
                                      to_date     DATE NOT NULL,
                                      note        VARCHAR(255)
);

CREATE INDEX idx_actors_last_name  ON actors(last_name);
CREATE INDEX idx_actors_city       ON actors(city);
CREATE INDEX idx_actors_created_by ON actors(created_by);