-- Jobs repository: every role pulled from every source, keyed by where it came from.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.

create extension if not exists pg_trgm;

create table if not exists public.jobs (
  id               text primary key,               -- "<source>:<source_job_id>"
  source           text not null,                  -- linkedin | greenhouse | lever | ashby | workable | adzuna
  source_job_id    text not null,                  -- the role's id at the source
  source_board     text,                           -- company board slug for career-page sources
  source_url       text,                           -- the posting at the source
  source_query     text[] not null default '{}',   -- searches that found it (search-based sources)
  company          text not null,
  title            text not null,
  location         text,
  is_india         boolean not null default false,
  salary           text,
  description      text,
  posted_at        timestamptz,
  raw              jsonb,                          -- the source's own record, for re-processing later
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  closed_at        timestamptz,                    -- set when the role disappears from its board
  search_text      tsvector generated always as (
                     setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                     setweight(to_tsvector('simple', coalesce(company, '')), 'B')
                   ) stored,
  unique (source, source_job_id)
);

create index if not exists jobs_open_idx on public.jobs (last_seen_at desc) where closed_at is null;
create index if not exists jobs_source_board_idx on public.jobs (source, source_board);
create index if not exists jobs_india_idx on public.jobs (is_india) where closed_at is null;
create index if not exists jobs_search_idx on public.jobs using gin (search_text);
create index if not exists jobs_title_trgm_idx on public.jobs using gin (title gin_trgm_ops);

-- One row per collection run per source, so we can see what each run pulled.
create table if not exists public.job_ingest_runs (
  id           bigint generated always as identity primary key,
  source       text not null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running',    -- running | ok | partial | failed
  fetched      integer not null default 0,
  upserted     integer not null default 0,
  closed       integer not null default 0,
  details      jsonb
);

-- Only the server (service role key) touches these tables; the browser never does.
alter table public.jobs enable row level security;
alter table public.job_ingest_runs enable row level security;
