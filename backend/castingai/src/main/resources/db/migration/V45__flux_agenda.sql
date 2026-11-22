-- Flux d'agenda personnel (iCalendar) : Google Agenda et Outlook s'y abonnent et récupèrent les auditions tout seuls.
-- Le jeton secret est le seul accès au flux ; un nouveau jeton coupe l'ancien abonnement.
CREATE TABLE calendar_feeds (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
