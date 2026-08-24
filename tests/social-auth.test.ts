import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { authenticatedHomeRoute } from "../lib/onboarding.ts";
import { createFinancialProfile } from "../lib/financial-types.ts";
import {
  enabledSocialAuthProviders,
  oauthCallbackFailureState,
  parseSocialAuthProvider,
  socialAuthCallbackUrl,
  socialAuthInitiationMessage,
  socialAuthQueryMessage,
  socialProviderEnabledInSettings,
} from "../lib/auth/social.ts";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");
const authForm = source("components/auth-forms.tsx");
const callback = source("app/auth/callback/route.ts");
const householdMigration = source("supabase/migrations/20260822000000_household_financial_persistence.sql");
const authOperations = source("docs/AUTH-OPERATIONS.md");

test("social buttons follow explicit public provider readiness flags", () => {
  assert.deepEqual(enabledSocialAuthProviders({}), []);
  assert.deepEqual(enabledSocialAuthProviders({ NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true" }).map((item) => item.provider), ["google"]);
  assert.deepEqual(enabledSocialAuthProviders({ NEXT_PUBLIC_AUTH_APPLE_ENABLED: "TRUE" }).map((item) => item.provider), ["apple"]);
  assert.deepEqual(enabledSocialAuthProviders({ NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true", NEXT_PUBLIC_AUTH_APPLE_ENABLED: "true" }).map((item) => item.provider), ["google", "apple"]);
});

test("OAuth providers use the exact Supabase provider values", () => {
  assert.equal(parseSocialAuthProvider("google"), "google");
  assert.equal(parseSocialAuthProvider("apple"), "apple");
  assert.equal(parseSocialAuthProvider("github"), null);
});

test("public Supabase settings defensively confirm provider readiness", () => {
  assert.equal(socialProviderEnabledInSettings({ external: { google: true, apple: false } }, "google"), true);
  assert.equal(socialProviderEnabledInSettings({ external: { google: true, apple: false } }, "apple"), false);
  assert.equal(socialProviderEnabledInSettings({ external: {} }, "google"), false);
  assert.equal(socialProviderEnabledInSettings(null, "apple"), false);
  assert.match(authForm, /fetch\(`\$\{url\}\/auth\/v1\/settings`/);
});

test("OAuth callback construction preserves only safe internal destinations", () => {
  const valid = new URL(socialAuthCallbackUrl("https://preview.example", "/plan?tab=savings", "google"));
  assert.equal(valid.origin, "https://preview.example");
  assert.equal(valid.pathname, "/auth/callback");
  assert.equal(valid.searchParams.get("next"), "/plan?tab=savings");
  assert.equal(valid.searchParams.get("provider"), "google");
  for (const unsafe of ["https://evil.example", "//evil.example", "%2F%2Fevil.example"]) {
    assert.equal(new URL(socialAuthCallbackUrl("https://preview.example", unsafe, "apple")).searchParams.get("next"), "/dashboard");
  }
});

test("provider cancellation and callback failures produce safe useful copy", () => {
  assert.equal(oauthCallbackFailureState("access_denied"), "cancelled");
  assert.equal(oauthCallbackFailureState("server_error"), "failed");
  assert.equal(socialAuthQueryMessage("cancelled", "google"), "Google sign-in was cancelled.");
  assert.equal(socialAuthQueryMessage("failed", "apple"), "We couldn’t complete Apple sign-in. Please try again.");
  assert.equal(socialAuthQueryMessage("failed", "unknown"), "We couldn’t complete Social sign-in. Please try again.");
});

test("provider initiation errors do not expose raw provider details", () => {
  assert.equal(socialAuthInitiationMessage("google", "Unsupported provider: provider is not enabled"), "Google sign-in isn’t available right now. Use email and password or try again later.");
  assert.equal(socialAuthInitiationMessage("apple", "sensitive upstream details"), "We couldn’t start Apple sign-in. Check your connection and try again.");
});

test("sign-in and sign-up share social OAuth while email and password remain", () => {
  assert.match(authForm, /signInWithOAuth\(\{ provider, options: \{ redirectTo:/);
  assert.match(authForm, /Continue with \$\{label\}/);
  assert.match(authForm, /socialProviders\.length > 0/);
  assert.match(authForm, /<span>or<\/span>/);
  assert.match(authForm, /Email address/);
  assert.match(authForm, /type="password"/);
  assert.doesNotMatch(authForm, /provider_token|provider_refresh_token|scopes:/);
});

test("the shared callback exchanges once and returns OAuth failures to sign-in", () => {
  assert.match(callback, /exchangeCodeForSession\(code\)/);
  assert.match(callback, /oauthCallbackFailureState\(oauthError\)/);
  assert.match(callback, /new URL\("\/auth\/sign-in", request\.url\)/);
  assert.match(callback, /signIn\.searchParams\.set\("oauth", state\)/);
  assert.match(callback, /safeReturnPath/);
  assert.doesNotMatch(callback, /error_description/);
});

test("social users use the existing onboarding and Dashboard destinations", () => {
  const profile = createFinancialProfile();
  assert.equal(authenticatedHomeRoute(profile), "/onboarding");
  profile.onboarding.completed = true;
  assert.equal(authenticatedHomeRoute(profile), "/dashboard");
  assert.match(source("components/auth-page-redirect.tsx"), /authenticatedHomeRoute\(profile\)/);
});

test("repeated social sign-in reuses personal initialization inside the active Household resolver", () => {
  assert.match(source("lib/cloud-financial-repository.ts"), /rpc\("awn_resolve_active_household"/);
  assert.match(householdMigration, /pg_advisory_xact_lock/);
  assert.match(householdMigration, /where household\.created_by = p_user_id and household\.is_personal/);
  assert.match(householdMigration, /on conflict \(household_id, user_id\) do update set role = 'owner'/);
  assert.match(householdMigration, /v_household_id := private\.awn_ensure_personal_household\(v_user_id\)/);
});

test("operations documentation keeps provider secrets server-side and records Apple rotation", () => {
  assert.match(authOperations, /https:\/\/bxzcssgbcgvhsaihsple\.supabase\.co\/auth\/v1\/callback/);
  assert.match(authOperations, /at least every 6 months/);
  assert.match(authOperations, /Never commit[^\n]+\.p8/);
  assert.match(authOperations, /private-relay email addresses are valid/);
  assert.match(source(".env.example"), /NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false/);
  assert.match(source(".env.example"), /NEXT_PUBLIC_AUTH_APPLE_ENABLED=false/);
});
