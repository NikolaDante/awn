import { createClient } from "@/lib/supabase/client";
import { DEFAULT_USER_PREFERENCES, parseUserPreferences, preferencesRow, type UserPreferences } from "@/lib/user-preferences";

export async function loadUserPreferences(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("user_preferences").select("display_name,currency_placement,number_format,date_format").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? parseUserPreferences(data) : DEFAULT_USER_PREFERENCES;
}

export async function saveUserPreferences(userId: string, preferences: UserPreferences) {
  const supabase = createClient();
  const { data, error } = await supabase.from("user_preferences").upsert({ user_id: userId, ...preferencesRow(preferences), updated_at: new Date().toISOString() }, { onConflict: "user_id" }).select("display_name,currency_placement,number_format,date_format").single();
  if (error) throw error;
  return parseUserPreferences(data);
}
