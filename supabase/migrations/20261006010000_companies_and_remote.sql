-- Company registry for career-board collection, and remote roles in the jobs table.
-- Run once in the Supabase SQL editor after 20261006000000_jobs_repository.sql. Safe to re-run.

-- Roles marked only "Remote" (no country) are kept alongside India roles.
alter table public.jobs add column if not exists remote_anywhere boolean not null default false;

-- Every company we know of, whether or not we've found a career board for it.
create table if not exists public.companies (
  id                 bigint generated always as identity primary key,
  name               text not null,
  name_key           text not null unique,           -- normalised name, for de-duplication
  ats                text,                           -- greenhouse | lever | ashby | workable (null until found)
  slug               text,                           -- board name at that service
  origin             text not null default 'curated',-- seed | curated | discovered
  status             text not null default 'unprobed',
                     -- unprobed | active (board with India roles) | no_india (board, no India roles)
                     -- | no_board (none found) | disabled
  india_open_roles   integer not null default 0,
  total_open_roles   integer not null default 0,
  last_probed_at     timestamptz,
  last_collected_at  timestamptz,
  created_at         timestamptz not null default now(),
  unique (ats, slug)
);

create index if not exists companies_status_idx on public.companies (status);

alter table public.companies enable row level security;
