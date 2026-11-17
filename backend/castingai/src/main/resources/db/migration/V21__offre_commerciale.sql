-- T-098 · Offre commerciale par agence : forfait, montant mensuel et devise.
-- Le revenu mensuel récurrent (MRR) = somme des montants des contrats actifs.
alter table agencies add column if not exists plan varchar(20);
alter table agencies add column if not exists monthly_amount numeric(12, 2);
alter table agencies add column if not exists currency varchar(3) not null default 'TND';
alter table agencies add constraint agencies_plan_chk check (plan is null or plan in ('ESSENTIEL', 'PRO', 'STUDIO', 'SUR_MESURE'));
alter table agencies add constraint agencies_amount_chk check (monthly_amount is null or monthly_amount >= 0);
