-- Applicant profiles for Easy Apply: one row per signed-in user (Supabase Auth), holding what
-- application forms ask for. Each user can read and write only their own row.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.applicant_profiles (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  first_name            text,
  last_name             text,
  preferred_name        text,
  email                 text,
  phone                 text,
  linkedin_url          text,
  website_url           text,
  city                  text,
  country               text default 'India',
  current_ctc_lpa       numeric,
  expected_ctc_lpa      numeric,
  notice_period_days    integer,
  authorized_to_work    jsonb not null default '{"India": true}', -- country → authorised
  needs_sponsorship     boolean not null default false,
  highest_education     text,
  resume                jsonb,                                    -- the parsed resume ResumeIQ works from
  saved_answers         jsonb not null default '{}',              -- normalised question → answer, reused across forms
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

alter table public.applicant_profiles enable row level security;

drop policy if exists "own profile: read" on public.applicant_profiles;
create policy "own profile: read" on public.applicant_profiles
  for select using (auth.uid() = user_id);

drop policy if exists "own profile: insert" on public.applicant_profiles;
create policy "own profile: insert" on public.applicant_profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists "own profile: update" on public.applicant_profiles;
create policy "own profile: update" on public.applicant_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own profile: delete" on public.applicant_profiles;
create policy "own profile: delete" on public.applicant_profiles
  for delete using (auth.uid() = user_id);

create or replace function public.touch_applicant_profile()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists applicant_profiles_touch on public.applicant_profiles;
create trigger applicant_profiles_touch
  before update on public.applicant_profiles
  for each row execute function public.touch_applicant_profile();
