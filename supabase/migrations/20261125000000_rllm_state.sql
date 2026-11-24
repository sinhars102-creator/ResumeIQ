-- Resume LLM: each signed-in user's chats and edited resumes, kept on the server so their work follows them
-- to another phone or browser (it used to live only in the browser's localStorage).
-- One row per user holding the recent chats as JSON. Writes go through the ResumeIQ server (service role),
-- which checks the signed-in user; users can read only their own row.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.rllm_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  state      jsonb not null default '{"chats":[]}',
  updated_at timestamptz not null default now()
);

alter table public.rllm_state enable row level security;
drop policy if exists "own rllm state: read" on public.rllm_state;
create policy "own rllm state: read" on public.rllm_state for select using (auth.uid() = user_id);

notify pgrst, 'reload schema';
