-- Applications sent through Easy Apply: one row per submission attempt, for the tracker.
-- Written by the server (service role); each user can read only their own.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.applications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  job_id        text not null,              -- ResumeIQ job id ("gh-airbnb-8189782")
  source        text not null,              -- greenhouse
  company       text,
  title         text,
  apply_url     text,
  status        text not null,              -- submitted | code_required | failed
  details       jsonb,                      -- what the page reported (errors, unfilled fields)
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists applications_user_idx on public.applications (user_id, created_at desc);

alter table public.applications enable row level security;

drop policy if exists "own applications: read" on public.applications;
create policy "own applications: read" on public.applications
  for select using (auth.uid() = user_id);
