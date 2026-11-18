-- T-116 : agenda des auditions (heure, lieu, rappel la veille)
alter table role_offers add column if not exists audition_time time;
alter table role_offers add column if not exists audition_place varchar(200);
alter table shortlist_entries add column if not exists audition_time time;
alter table shortlist_entries add column if not exists audition_place varchar(200);
alter table shortlist_entries add column if not exists reminded_on date;
create index if not exists idx_shortlist_audition_date on shortlist_entries (audition_date) where audition_date is not null;
