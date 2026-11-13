-- Where each user came from: one row per signed-in user, written once by the browser at the first
-- sign-in (first write wins – later sign-ins don't change it). Used to split signups, activation and
-- payments by channel, and gclid to send payments back to Google Ads as offline conversions.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.user_attribution (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  first_channel   text,          -- channel of the first visit on that browser (google_ads, direct, linkedin…)
  signup_channel  text,          -- channel of the visit in which they signed up
  first_touch     jsonb,         -- utm_*, click IDs, referrer domain, landing path, time
  signup_touch    jsonb,
  gclid           text,          -- Google Ads click ID (or gbraid/wbraid) when there was one
  is_internal     boolean not null default false,  -- our own / test accounts
  created_at      timestamptz not null default now()
);

create index if not exists user_attribution_signup_channel on public.user_attribution (signup_channel);

alter table public.user_attribution enable row level security;

drop policy if exists "own attribution: read" on public.user_attribution;
create policy "own attribution: read" on public.user_attribution
  for select using (auth.uid() = user_id);

drop policy if exists "own attribution: insert" on public.user_attribution;
create policy "own attribution: insert" on public.user_attribution
  for insert with check (auth.uid() = user_id);
-- No update or delete policy: the first write stands.
