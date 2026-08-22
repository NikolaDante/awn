import { redirect } from "next/navigation";
import { authenticatedUserId } from "@/lib/auth/routing";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUserId() {
  const userId = await optionalAuthenticatedUserId();
  if (!userId) redirect("/auth/sign-in");
  return userId;
}

export async function optionalAuthenticatedUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return authenticatedUserId(data);
}
