-- Applicant profile: voluntary self-identification and standing consent, filled once and reused
-- on every application. All optional; each user can read and write only their own row (RLS).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.applicant_profiles add column if not exists pronouns           text; -- e.g. "He/him"
alter table public.applicant_profiles add column if not exists gender             text; -- male | female | non_binary | decline
alter table public.applicant_profiles add column if not exists race_ethnicity     text; -- e.g. "Asian", or decline
alter table public.applicant_profiles add column if not exists veteran_status     text; -- not_veteran | veteran | decline
alter table public.applicant_profiles add column if not exists disability_status  text; -- no | yes | decline
-- The applicant's standing consent to confirm standard declarations (information is accurate,
-- privacy notices, terms) on their behalf. Off unless they turn it on.
alter table public.applicant_profiles add column if not exists auto_acknowledge   boolean not null default false;
