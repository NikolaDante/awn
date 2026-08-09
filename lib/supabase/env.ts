export type SupabaseEnvironment = { url: string; publishableKey: string };
export type SupabaseEnvironmentInput = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
};

// Keep these references explicit: Next.js replaces NEXT_PUBLIC_* values in browser bundles at build time.
const defaultEnvironment: SupabaseEnvironmentInput = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

export function getSupabaseEnvironment(environment: SupabaseEnvironmentInput = defaultEnvironment): SupabaseEnvironment {
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const missing = [
    !url && "NEXT_PUBLIC_SUPABASE_URL",
    !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);
  if (missing.length) throw new Error(`AWN Supabase configuration is incomplete. Set: ${missing.join(", ")}.`);
  return { url: url!, publishableKey: publishableKey! };
}
