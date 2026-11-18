-- T-117 : vivier a grande echelle (filtre et tri par taille)
create index if not exists idx_actors_height on actors (height);
