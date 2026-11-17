-- T-112 · Mot de passe oublié (D-011) : l'administrateur crée un lien à usage unique, valable 1 heure,
-- et le transmet lui-même. Seule l'empreinte SHA-256 du jeton est gardée.
create table if not exists password_resets (
    id          uuid primary key,
    user_id     uuid not null references users(id) on delete cascade,
    token_hash  varchar(64) not null unique,
    created_by  uuid references users(id) on delete set null,
    created_at  timestamp not null default now(),
    expires_at  timestamp not null,
    used_at     timestamp,
    revoked_at  timestamp
);
create index if not exists idx_password_resets_user on password_resets (user_id);
