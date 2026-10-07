-- "My jobs": roles a user saved from any page with the ResumeIQ Chrome extension (or the app).
-- The role itself lives in public.jobs (shared, no personal data); this links it to the user.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.user_jobs (
  user_id      uuid not null references auth.users (id) on delete cascade,
  job_id       text not null references public.jobs (id) on delete cascade,
  added_from   text,                                   -- the page it was saved from
  match_score  integer,                                -- last fit score shown to the user (0-100)
  match        jsonb,                                  -- { matched: [...], gaps: [...], summary }
  status       text not null default 'saved',          -- saved | applied | interviewing | offer | rejected
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, job_id)
);

create index if not exists user_jobs_recent_idx on public.user_jobs (user_id, created_at desc);

alter table public.user_jobs enable row level security;

drop policy if exists "own saved jobs: read" on public.user_jobs;
create policy "own saved jobs: read" on public.user_jobs for select using (auth.uid() = user_id);
drop policy if exists "own saved jobs: update" on public.user_jobs;
create policy "own saved jobs: update" on public.user_jobs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "own saved jobs: delete" on public.user_jobs;
create policy "own saved jobs: delete" on public.user_jobs for delete using (auth.uid() = user_id);

-- Roles saved by a user stay in public.jobs even outside the India-only scope (the collector's
-- clean-up skips pinned rows), so their "My jobs" entry isn't removed with them.
alter table public.jobs add column if not exists pinned boolean not null default false;
