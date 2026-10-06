-- Searches users ask for. LinkedIn is collected only for these (demand-driven), and a
-- search collected recently is served from the jobs table instead of a paid live run.
-- Run once in the Supabase SQL editor after the earlier migrations. Safe to re-run.

create table if not exists public.search_demand (
  query_key          text primary key,               -- normalised search ("senior product manager")
  query              text not null,                  -- the latest wording a user typed
  ask_count          integer not null default 0,
  first_asked_at     timestamptz not null default now(),
  last_asked_at      timestamptz not null default now(),
  last_collected_at  timestamptz                     -- last time LinkedIn was searched for it
);

create index if not exists search_demand_recent_idx on public.search_demand (last_asked_at desc);

alter table public.search_demand enable row level security;

-- Count one ask atomically (concurrent users searching the same role don't lose counts).
create or replace function public.record_search_demand(p_key text, p_query text)
returns public.search_demand
language sql
security definer
set search_path = public
as $$
  insert into public.search_demand (query_key, query, ask_count)
  values (p_key, p_query, 1)
  on conflict (query_key) do update
    set ask_count = search_demand.ask_count + 1,
        last_asked_at = now(),
        query = excluded.query
  returning *;
$$;

-- Server only: callable with the service role key, not the browser's anon key.
revoke all on function public.record_search_demand(text, text) from public, anon, authenticated;
grant execute on function public.record_search_demand(text, text) to service_role;
