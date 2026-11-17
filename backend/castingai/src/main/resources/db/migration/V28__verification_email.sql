-- T-113 · Vérification de l'adresse e-mail (D-013, sans envoi d'e-mail) : l'administrateur crée un lien
-- à usage unique et le transmet ; en l'ouvrant, la personne prouve que l'adresse est bien la sienne.
alter table users add column if not exists email_verified_at timestamp;
-- Déjà vérifiées : connexions Google / Facebook (le fournisseur garantit l'adresse) et administrateurs existants.
update users set email_verified_at = coalesce(email_verified_at, created_at) where auth_provider <> 'LOCAL' or role = 'ADMIN';

create table if not exists email_verifications (
    id          uuid primary key,
    user_id     uuid not null references users(id) on delete cascade,
    token_hash  varchar(64) not null unique,
    created_by  uuid references users(id) on delete set null,
    created_at  timestamp not null default now(),
    expires_at  timestamp not null,
    used_at     timestamp,
    revoked_at  timestamp
);
create index if not exists idx_email_verifications_user on email_verifications (user_id);
