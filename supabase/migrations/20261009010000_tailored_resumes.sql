-- Tailored resumes: one design-editor (Reactive Resume) resume per user and job, kept across visits,
-- and the PDF saved from it for applying to that job.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- The editor resume a user is tailoring for a job. Reopened on later visits so their editor work stays.
create table if not exists public.tailor_sessions (
  user_id      uuid not null references auth.users (id) on delete cascade,
  job_id       text not null,                 -- ResumeIQ job id, e.g. "lever:9eed…"
  rx_resume_id text not null,                 -- the resume in the design editor
  content_hash text,                          -- ResumeIQ's resume content the editor copy was last built from
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, job_id)
);

alter table public.tailor_sessions enable row level security;
drop policy if exists "own tailor sessions: read" on public.tailor_sessions;
create policy "own tailor sessions: read" on public.tailor_sessions for select using (auth.uid() = user_id);
-- Writes go through the ResumeIQ server (service role), which checks the signed-in user.

-- Resume files saved from the editor for a job ("Use this resume for applying"), next to uploads.
alter table public.resume_files add column if not exists source text not null default 'upload';
alter table public.resume_files add column if not exists job_id text;
alter table public.resume_files add column if not exists rx_resume_id text;
alter table public.resume_files drop constraint if exists resume_files_source_check;
alter table public.resume_files add constraint resume_files_source_check check (source in ('upload', 'tailored'));
-- One tailored resume per user and job (saving again replaces it).
create unique index if not exists resume_files_one_tailored_per_job on public.resume_files (user_id, job_id) where source = 'tailored';

notify pgrst, 'reload schema';
