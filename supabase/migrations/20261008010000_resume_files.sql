-- Resume files users upload (their own PDF/Word files), attached exactly as uploaded when
-- applying. Files live in the private "resumes" storage bucket under <user id>/; this table
-- lists them. Each user can see and manage only their own.
-- Run once in the Supabase SQL editor. Safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760,
        array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create table if not exists public.resume_files (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,                 -- the user's label, e.g. "PM – consumer"
  file_name    text not null,                 -- original file name, used when attaching
  storage_path text not null unique,          -- "<user id>/<uuid>.<ext>" in the resumes bucket
  mime_type    text not null,
  size_bytes   integer not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists resume_files_user_idx on public.resume_files (user_id, created_at desc);
-- At most one default per user.
create unique index if not exists resume_files_one_default on public.resume_files (user_id) where is_default;

alter table public.resume_files enable row level security;
drop policy if exists "own resume files: read" on public.resume_files;
create policy "own resume files: read" on public.resume_files for select using (auth.uid() = user_id);
-- Writes go through the ResumeIQ server (service role), which checks the signed-in user.

notify pgrst, 'reload schema';
