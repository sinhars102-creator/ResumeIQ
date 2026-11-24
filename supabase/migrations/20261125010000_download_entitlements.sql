-- Resume LLM downloads: what a user has paid for, and each completed PDF download counted against it.
--   dl1          ₹79   one download, no expiry
--   dl10         ₹399  10 downloads within 30 days
--   dlunlimited  ₹799  unlimited downloads within 30 days
-- Server only (service role): users can read their own rows, never write them.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.download_entitlements (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  plan            text not null check (plan in ('dl1', 'dl10', 'dlunlimited')),
  payment_id      text not null unique,            -- Razorpay payment id: one purchase = one row, even if the page retries
  order_id        text,
  amount_paise    integer not null,
  downloads_total integer,                         -- null = unlimited
  downloads_used  integer not null default 0,
  expires_at      timestamptz,                     -- null = never
  created_at      timestamptz not null default now()
);
create index if not exists download_entitlements_user on public.download_entitlements (user_id, created_at desc);

create table if not exists public.download_log (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  entitlement_id uuid not null references public.download_entitlements (id) on delete cascade,
  download_id    text not null,                    -- sent by the page once per finished PDF, so a retry doesn't count twice
  created_at     timestamptz not null default now(),
  unique (user_id, download_id)
);

alter table public.download_entitlements enable row level security;
alter table public.download_log enable row level security;
drop policy if exists "own entitlements: read" on public.download_entitlements;
create policy "own entitlements: read" on public.download_entitlements for select using (auth.uid() = user_id);
drop policy if exists "own download log: read" on public.download_log;
create policy "own download log: read" on public.download_log for select using (auth.uid() = user_id);

notify pgrst, 'reload schema';
