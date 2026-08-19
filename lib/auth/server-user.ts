import { redirect } from "next/navigation";
import { authenticatedUserId } from "@/lib/auth/routing";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUserId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = authenticatedUserId(data);
  if (!userId) redirect("/auth/sign-in");
  return userId;
}
