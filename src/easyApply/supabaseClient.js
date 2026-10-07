/**
 * Browser Supabase client for sign-in and the applicant profile. Uses the public anon key;
 * row-level security limits each user to their own profile. Null when not configured.
 */
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey) : null;

const PROFILE_COLUMNS = [
  "first_name", "last_name", "preferred_name", "email", "phone", "linkedin_url", "website_url", "city", "country",
  "current_ctc_lpa", "expected_ctc_lpa", "notice_period_days", "authorized_to_work", "needs_sponsorship",
  "highest_education", "resume", "saved_answers",
];

export async function loadProfile(userId) {
  const { data, error } = await supabase.from("applicant_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Create or update the signed-in user's profile with the given fields. */
export async function saveProfile(userId, patch) {
  const row = { user_id: userId };
  for (const key of PROFILE_COLUMNS) if (patch[key] !== undefined) row[key] = patch[key];
  const { data, error } = await supabase.from("applicant_profiles").upsert(row, { onConflict: "user_id" }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
