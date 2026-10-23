-- Each ResumeIQ user's own account in the design editor (Reactive Resume), made on first use, and the
-- editor API key ResumeIQ uses to create and read that user's resumes. Server only: no policies, so
-- signed-in users can't read it (the service role bypasses RLS).
-- Run once. Safe to re-run.

create table if not exists public.editor_accounts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  rx_user_id text not null,                 -- the editor's user id
  api_key    text not null,                 -- editor API key owned by that editor user
  created_at timestamptz not null default now()
);

alter table public.editor_accounts enable row level security;

notify pgrst, 'reload schema';
