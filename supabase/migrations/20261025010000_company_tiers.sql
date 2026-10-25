-- Company tiers: 1 = the most wanted employers, 2 = large established employers; everyone else has
-- no tier (treated as 3). Loaded from server/seed/top-companies.csv by `npm run seed:companies`.
-- Run once. Safe to re-run.

alter table public.companies add column if not exists tier smallint;
alter table public.companies add column if not exists category text;
alter table public.companies drop constraint if exists companies_tier_check;
alter table public.companies add constraint companies_tier_check check (tier is null or tier between 1 and 3);
create index if not exists companies_tier_idx on public.companies (tier) where tier is not null;

notify pgrst, 'reload schema';
