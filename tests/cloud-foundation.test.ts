import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { authenticatedUserId, isProtectedPath, safeReturnPath } from "../lib/auth/routing.ts";
import { getSupabaseEnvironment } from "../lib/supabase/env.ts";

const root = process.cwd();
const initialMigrationPath = join(root, "supabase/migrations/20260809000000_initial_financial_foundation.sql");
const repairMigrationPath = join(root, "supabase/migrations/20260809010000_create_missing_financial_profiles.sql");
const migration = readFileSync(initialMigrationPath, "utf8");
const profileRepair = readFileSync(repairMigrationPath, "utf8");
const ownedTables = ["financial_profiles", "income_sources", "accounts", "credit_cards", "budget_categories", "savings_goals", "transactions", "financial_migration_records", "financial_security_events"];
const mutableOwnerTables = ownedTables.filter((table) => table !== "financial_security_events");
const clientFinancialTables = ["financial_profiles", "income_sources", "accounts", "credit_cards", "budget_categories", "savings_goals", "transactions"];
function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sourceFiles(`${directory}/${entry.name}`) : /\.(ts|tsx)$/.test(entry.name) ? [join(root, directory, entry.name)] : []);
}

const appSources = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("lib"), join(root, "proxy.ts")].map((path) => readFileSync(path, "utf8")).join("\n");
function tableDefinition(table: string) {
  const definition = migration.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`))?.[1];
  assert.ok(definition, `Missing definition for ${table}`);
  return definition;
}

test("validates explicitly supplied public Supabase configuration without exposing a value", () => {
  const valid = { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" };
  assert.deepEqual(getSupabaseEnvironment(valid), { url: valid.NEXT_PUBLIC_SUPABASE_URL, publishableKey: valid.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY });
  assert.throws(() => getSupabaseEnvironment({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" }), /NEXT_PUBLIC_SUPABASE_URL/);
  assert.throws(() => getSupabaseEnvironment({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" }), /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  const privateValue = "never-show-this-value";
  let message = "";
  try { getSupabaseEnvironment({ NEXT_PUBLIC_SUPABASE_URL: privateValue }); } catch (error) { message = error instanceof Error ? error.message : String(error); }
  assert.match(message, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(message, new RegExp(privateValue));
});

test("uses statically named public variables for the browser default path", () => {
  const environmentSource = readFileSync(join(root, "lib/supabase/env.ts"), "utf8");
  assert.match(environmentSource, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(environmentSource, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(environmentSource, /process\.env\[[^\]]+\]|environment\[[^\]]+\]/);
});

test("keeps the audited initial migration immutable and repairs profile creation additively", () => {
  assert.equal(createHash("sha256").update(migration).digest("hex"), "f6a1bd82ea96836e41e05113e58b13e217a4b6a4ea78617b8641ebf25df53964");
  assert.doesNotMatch(migration, /create\s+(?:or\s+replace\s+)?function\s+public\.awn_create_financial_profile_for_auth_user/i);
  assert.doesNotMatch(migration, /(?:before|after)\s+insert\s+on\s+auth\.users/i);
  assert.ok(repairMigrationPath > initialMigrationPath);
});

test("creates exactly one row-level AFTER INSERT auth trigger for profile creation", () => {
  assert.match(profileRepair, /drop trigger if exists awn_create_financial_profile_after_auth_user_insert on auth\.users;/);
  const triggers = profileRepair.match(/create trigger awn_create_financial_profile_after_auth_user_insert\s+after insert on auth\.users\s+for each row\s+execute function public\.awn_create_financial_profile_for_auth_user\(\);/g) ?? [];
  assert.equal(triggers.length, 1);
  assert.doesNotMatch(profileRepair, /for each statement/i);
});

test("profile trigger derives ownership only from NEW.id and inserts required profile fields", () => {
  const functionBody = profileRepair.match(/create or replace function public\.awn_create_financial_profile_for_auth_user\(\)[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(functionBody, /insert into public\.financial_profiles \(user_id, currency\)\s+values \(new\.id, 'AED'\)/);
  assert.match(functionBody, /on conflict \(user_id\) do nothing/);
  assert.doesNotMatch(functionBody, /auth\.uid\(\)|raw_user_meta_data|email|user_metadata|do update/i);
  assert.match(functionBody, /^create or replace function public\.awn_create_financial_profile_for_auth_user\(\)/);
});

test("profile creation uses a narrow definer with controlled name resolution and privileges", () => {
  const executableSql = profileRepair.replace(/^--.*$/gm, "");
  assert.match(profileRepair, /create or replace function public\.awn_create_financial_profile_for_auth_user\(\)[\s\S]*?security definer\s+set search_path = ''/);
  assert.match(profileRepair, /alter function public\.awn_create_financial_profile_for_auth_user\(\) owner to postgres;/);
  assert.match(profileRepair, /revoke all on function public\.awn_create_financial_profile_for_auth_user\(\) from public, anon, authenticated;/);
  assert.doesNotMatch(executableSql, /insert into financial_profiles|from users|on auth_users/i);
});

test("ownership bypass remains limited to the postgres profile-bootstrap insert", () => {
  assert.match(profileRepair, /current_user = 'postgres'[\s\S]*?tg_op = 'INSERT'[\s\S]*?tg_table_schema = 'public'[\s\S]*?tg_table_name = 'financial_profiles'[\s\S]*?new\.user_id is not null/);
  assert.match(profileRepair, /raise exception 'An authenticated user is required'/);
  assert.match(profileRepair, /revoke all on function public\.awn_assign_authenticated_user_id\(\) from public, anon, authenticated;/);
});

test("backfill inserts only missing auth users and is idempotent", () => {
  const backfill = profileRepair.match(/insert into public\.financial_profiles \(user_id, currency\)\s+select existing_user\.id, 'AED'[\s\S]*?on conflict \(user_id\) do nothing;/)?.[0] ?? "";
  assert.match(backfill, /from auth\.users as existing_user/);
  assert.match(backfill, /where not exists \([\s\S]*?from public\.financial_profiles as existing_profile[\s\S]*?existing_profile\.user_id = existing_user\.id/);
  assert.doesNotMatch(backfill, /do update|\bupdate\b|\bdelete\b/i);
});

test("profile repair introduces no credential or secret material", () => {
  assert.doesNotMatch(profileRepair, /SUPABASE_SERVICE_ROLE_KEY|service_role|sb_secret_|postgres(?:ql)?:\/\//i);
});

test("classifies public authentication routes and protected financial routes", () => {
  for (const path of ["/", "/auth/sign-in", "/auth/sign-up", "/auth/forgot-password", "/auth/reset", "/auth/callback"]) assert.equal(isProtectedPath(path), false, path);
  for (const path of ["/dashboard", "/transactions", "/accounts", "/plan", "/onboarding"]) assert.equal(isProtectedPath(path), true, path);
});

test("allows local return paths and rejects external, encoded, and normalized bypasses", () => {
  assert.equal(safeReturnPath("/plan?month=2026-08"), "/plan?month=2026-08");
  for (const value of ["//other.example", "https://other.example", "/%2f%2fother.example", "/%252f%252fother.example", "/%5cother.example", "/..//other.example", "/%0d%0aLocation:evil"]) assert.equal(safeReturnPath(value), "/dashboard", value);
});

test("accepts only a verified claims subject as an authenticated identity", () => {
  assert.equal(authenticatedUserId({ claims: { sub: "user-id" } }), "user-id");
  assert.equal(authenticatedUserId({ claims: { sub: "" } }), null);
  assert.equal(authenticatedUserId(null), null);
});

test("migration stores money precisely and contains the required financial records", () => {
  for (const table of ownedTables) assert.match(migration, new RegExp(`create table public\\.${table}`));
  assert.match(migration, /amount_minor bigint not null check \(amount_minor > 0\)/);
  assert.match(migration, /expected_amount_minor bigint not null check \(expected_amount_minor > 0\)/);
  assert.doesNotMatch(migration, /\b(numeric|decimal|real|double precision)\b/i);
  assert.match(migration, /transaction_date date not null/);
  assert.match(migration, /local_entity_id text not null/);
  assert.match(migration, /revision bigint not null default 0 check \(revision >= 0\)/);
  assert.match(migration, /transactions_user_date_order_idx on public\.transactions \(user_id, transaction_date, created_at, id\)/);
});

test("every transaction reference uses a composite owner foreign key and preserves history", () => {
  const references = [
    ["income_source_id", "income_sources"], ["destination_account_id", "accounts"], ["category_id", "budget_categories"],
    ["expense_account_id", "accounts"], ["expense_card_id", "credit_cards"], ["source_account_id", "accounts"],
    ["paying_account_id", "accounts"], ["receiving_card_id", "credit_cards"],
  ];
  for (const [column, table] of references) assert.match(migration, new RegExp(`foreign key \\(user_id, ${column}\\) references public\\.${table}\\(user_id, id\\) on delete no action deferrable initially deferred`));
  for (const snapshot of ["income_source_name_snapshot", "destination_account_name_snapshot", "category_name_snapshot", "expense_account_name_snapshot", "expense_card_name_snapshot", "source_account_name_snapshot", "paying_account_name_snapshot", "receiving_card_name_snapshot"]) assert.match(migration, new RegExp(`${snapshot} text`));
  assert.match(migration, /constraint transactions_linked_snapshot_check check/);
  assert.doesNotMatch(migration, /references public\.(income_sources|accounts|credit_cards|budget_categories)\([^\n]+\) on delete cascade/);
  for (const table of ownedTables) assert.match(tableDefinition(table), /user_id uuid[^\n]+references auth\.users\(id\) on delete cascade/);
});

test("transaction constraints enforce each supported ledger shape", () => {
  assert.match(migration, /transaction_type in \('income', 'expense', 'transfer', 'card-payment'\)/);
  assert.match(migration, /constraint transactions_expense_payment_source_check check \(num_nonnulls\(expense_account_id, expense_card_id\) <= 1\)/);
  assert.match(migration, /transaction_type = 'transfer'[\s\S]*source_account_id <> destination_account_id[\s\S]*category_id is null/);
  assert.match(migration, /transaction_type = 'card-payment'[\s\S]*paying_account_id is not null and receiving_card_id is not null[\s\S]*category_id is null/);
  assert.match(migration, /transaction_type = 'expense'[\s\S]*category_name_snapshot is not null/);
});

test("idempotency and migration identifiers are non-null and unique per user", () => {
  assert.match(migration, /idempotency_key uuid not null default gen_random_uuid\(\)/);
  assert.match(migration, /unique \(user_id, idempotency_key\)/);
  assert.match(migration, /migration_identifier text not null check/);
  assert.match(migration, /unique \(user_id, migration_identifier\)/);
  assert.match(migration, /create unique index budget_categories_user_name_idx on public\.budget_categories \(user_id, lower\(name\)\)/);
});

test("every application table enables authenticated owner-only row-level security", () => {
  for (const table of ownedTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`on public\\.${table} for select to authenticated using \\(user_id = auth\\.uid\\(\\)\\)`));
  }
  assert.doesNotMatch(migration, /create policy[^;]+to (anon|public)/i);
  assert.doesNotMatch(migration, /create policy[^;]+using \(true\)/i);
});

test("write policies use the correct USING and WITH CHECK ownership clauses", () => {
  for (const table of mutableOwnerTables) {
    assert.match(migration, new RegExp(`on public\\.${table} for insert to authenticated with check \\(user_id = auth\\.uid\\(\\)\\)`));
    assert.match(migration, new RegExp(`on public\\.${table} for update to authenticated using \\(user_id = auth\\.uid\\(\\)\\) with check \\(user_id = auth\\.uid\\(\\)\\)`));
    assert.match(migration, new RegExp(`on public\\.${table} for delete to authenticated using \\(user_id = auth\\.uid\\(\\)\\)`));
  }
  assert.doesNotMatch(migration, /on public\.financial_security_events for (insert|update|delete)/);
});

test("ownership triggers reject reassignment on inserts and updates", () => {
  assert.match(migration, /if tg_op = 'UPDATE' and new\.user_id is distinct from old\.user_id then/);
  assert.match(migration, /if new\.user_id <> auth\.uid\(\) then raise exception/);
  for (const table of mutableOwnerTables) assert.match(migration, new RegExp(`before insert or update on public\\.${table}.*awn_assign_authenticated_user_id`));
});

test("privileges deny anonymous access and keep internal records off the client API", () => {
  const revoke = migration.match(/revoke all on table ([\s\S]*?) from public, anon, authenticated;/)?.[1] ?? "";
  for (const table of ownedTables) assert.match(revoke, new RegExp(`public\\.${table}`));
  const grant = migration.match(/grant select, insert, update, delete on table ([\s\S]*?) to authenticated;/)?.[1] ?? "";
  for (const table of clientFinancialTables) assert.match(grant, new RegExp(`public\\.${table}`));
  assert.doesNotMatch(grant, /financial_migration_records|financial_security_events/);
});

test("trigger functions are invoker-safe and not directly executable by client roles", () => {
  assert.doesNotMatch(migration, /security definer/i);
  for (const name of ["awn_assign_authenticated_user_id", "awn_set_updated_at"]) {
    assert.match(migration, new RegExp(`create function public\\.${name}\\(\\) returns trigger language plpgsql security invoker set search_path = pg_catalog`));
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(\\) from public, anon, authenticated`));
  }
});

test("application sources verify claims, preserve refreshed cookies, and avoid sensitive logging", () => {
  const proxySource = readFileSync(join(root, "lib/supabase/proxy.ts"), "utf8");
  assert.match(proxySource, /auth\.getClaims\(\)/);
  assert.doesNotMatch(proxySource, /auth\.getSession\(\)/);
  assert.match(proxySource, /request\.cookies\.set\(name, value\)/);
  assert.match(proxySource, /response\.cookies\.set\(name, value, options\)/);
  assert.match(proxySource, /redirectResponse\.cookies\.set\(cookie\)/);
  assert.doesNotMatch(appSources, /(SUPABASE_SERVICE_ROLE_KEY|service_role)/i);
  assert.doesNotMatch(appSources, /console\.(log|warn|error)\s*\(/);
});

test("authentication callbacks exchange once and redirect without callback parameters", () => {
  const callbackSource = readFileSync(join(root, "app/auth/callback/route.ts"), "utf8");
  const formSource = readFileSync(join(root, "components/auth-forms.tsx"), "utf8");
  assert.match(callbackSource, /exchangeCodeForSession\(code\)/);
  assert.match(callbackSource, /const destination = new URL\(next, request\.url\)/);
  assert.match(callbackSource, /destination\.pathname === "\/auth\/reset"[\s\S]*cookies\.set\("awn-recovery", "verified"/);
  assert.match(callbackSource, /return response/);
  assert.doesNotMatch(callbackSource, /searchParams\.set\("(code|token|email)"/);
  assert.match(formSource, /resetPasswordForEmail\(email, \{ redirectTo: callbackUrl\("\/auth\/callback\?next=\/auth\/reset"\) \}\)/);
});
