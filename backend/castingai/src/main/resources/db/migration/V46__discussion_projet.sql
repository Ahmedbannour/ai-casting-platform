-- P3 · Discussion du projet : commentaires et @mentions, à la place des appels de synchronisation
create table demande_comments (
    id          uuid primary key,
    request_id  uuid not null references ad_requests(id) on delete cascade,
    author_id   uuid references users(id) on delete set null,
    body        varchar(2000) not null,
    mentions    varchar(1000),
    created_at  timestamp not null default now()
);
create index idx_demande_comments_request on demande_comments(request_id, created_at);
