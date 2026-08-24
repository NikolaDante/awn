import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { invitationLink, parseHouseholdMembers, parseHouseholdSummaries, parseInvitationPreview, sharedHouseholdError } from "../lib/shared-households.ts";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = source("supabase/migrations/20260824010000_shared_households.sql");
const repairMigration = source("supabase/migrations/20260824020000_shared_households_repairs.sql");
const acceptanceRepairMigration = source("supabase/migrations/20260824030000_shared_households_acceptance_repair.sql");
const transferRepairMigration = source("supabase/migrations/20260824040000_shared_household_transfer_personal_repair.sql");
const provider = source("components/financial-provider.tsx");
const navigation = source("components/app-navigation.tsx");
const switcher = source("components/household-switcher.tsx");
const settings = source("components/settings-view.tsx");
const invite = source("components/household-invitation-view.tsx");

function sqlFunction(name: string) {
  const match = migration.match(new RegExp(`create (?:or replace )?function public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`, "i"));
  assert.ok(match, `Missing ${name}`);
  return match[0];
}

test("active Household parsing retains role, onboarding, and selected metadata", () => {
  assert.deepEqual(parseHouseholdSummaries([{ household_id: "personal", household_name: "My Household", member_role: "owner", member_count: 1, is_personal: true, onboarding_completed: false, is_active: false }, { household_id: "shared", household_name: "Nikola & Ana", member_role: "member", member_count: 2, is_personal: true, onboarding_completed: true, is_active: true }]), [
    { id: "personal", name: "My Household", role: "owner", memberCount: 1, isPersonal: true, onboardingCompleted: false, isActive: false },
    { id: "shared", name: "Nikola & Ana", role: "member", memberCount: 2, isPersonal: true, onboardingCompleted: true, isActive: true },
  ]);
});

test("member summaries expose only the narrow shared identity fields", () => {
  assert.deepEqual(parseHouseholdMembers([{ user_id: "a", display_name: "Ana", email: "ana@example.com", role: "member", is_current_user: true, currency_placement: "private" }]), [{ userId: "a", displayName: "Ana", email: "ana@example.com", role: "member", isCurrentUser: true }]);
});

test("stable invitation links never use immutable deployment origins", () => {
  assert.equal(invitationLink("secure token"), "https://awn-preview-awn4.vercel.app/invite/secure%20token");
});

test("invitation preview parsing contains no financial fields", () => {
  assert.deepEqual(parseInvitationPreview([{ household_name: "Shared", invited_by: "Nikola", invitation_status: "pending", expires_at: "2026-08-31T00:00:00Z", is_authenticated: true, email_matches: false, balance: 999 }]), { householdName: "Shared", invitedBy: "Nikola", status: "pending", expiresAt: "2026-08-31T00:00:00Z", authenticated: true, emailMatches: false });
});

test("invitation model stores a unique hash, constrained states, and seven-day expiry", () => {
  assert.match(migration, /create table public\.household_invitations/);
  assert.match(migration, /token_hash text not null unique check \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /status in \('pending', 'accepted', 'declined', 'revoked', 'expired'\)/);
  assert.match(sqlFunction("awn_create_household_invitation"), /gen_random_bytes\(32\)[\s\S]*digest\(v_token, 'sha256'\)[\s\S]*interval '7 days'/);
  const table = migration.match(/create table public\.household_invitations[\s\S]*?\n\);/)?.[0] ?? "";
  assert.doesNotMatch(table, /invitation_token|plaintext_token|raw_token/);
  assert.match(repairMigration, /extensions\.gen_random_bytes\(32\)[\s\S]*extensions\.digest\(v_token, 'sha256'\)/);
});

test("invite creation blocks self, existing members, duplicate pending email, invalid email, and full Households", () => {
  const create = sqlFunction("awn_create_household_invitation");
  for (const code of ["invalid_invitation_email", "cannot_invite_self", "already_household_member", "duplicate_pending_invitation", "household_member_limit"]) assert.match(create, new RegExp(code));
  assert.match(create, /auth\.users/);
  assert.match(create, /pg_advisory_xact_lock/);
});

test("acceptance is Auth-email-bound, capacity-locked, idempotent, and changes no financial row", () => {
  const accept = sqlFunction("awn_accept_household_invitation");
  assert.match(accept, /auth\.uid\(\)/);
  assert.match(accept, /auth\.users[\s\S]*invitation_email_mismatch/);
  assert.match(accept, /pg_advisory_xact_lock[\s\S]*count\(\*\)[\s\S]*>= 2/);
  assert.match(accept, /on conflict \(household_id, user_id\) do nothing/);
  assert.match(acceptanceRepairMigration, /on conflict on constraint household_members_pkey do nothing/);
  assert.match(accept, /private\.awn_ensure_personal_household\(v_user_id\)/);
  assert.doesNotMatch(accept, /update public\.(financial_profiles|accounts|transactions|budget_categories|savings_goals)|insert into public\.(financial_profiles|accounts|transactions|budget_categories|savings_goals)/);
});

test("declined, revoked, expired, and accepted invitations cannot be reused", () => {
  assert.match(sqlFunction("awn_decline_household_invitation"), /status <> 'pending'[\s\S]*invitation_not_pending/);
  assert.match(sqlFunction("awn_revoke_household_invitation"), /status = 'pending'/);
  assert.match(sqlFunction("awn_accept_household_invitation"), /status <> 'pending'[\s\S]*invitation_not_pending/);
  assert.match(sqlFunction("awn_accept_household_invitation"), /expires_at <= now\(\)[\s\S]*invitation_expired/);
});

test("active preference is membership-validated with owned-first fallback", () => {
  const resolve = sqlFunction("awn_resolve_active_household"); const fallback = migration.match(/create or replace function private\.awn_fallback_household[\s\S]*?\n\$\$;/)?.[0] ?? "";
  assert.match(migration, /add column active_household_id uuid references public\.households/);
  assert.match(resolve, /private\.awn_is_household_member\(p_requested_household_id, v_user_id\)/);
  assert.match(resolve, /private\.awn_is_household_member\(preferences\.active_household_id, v_user_id\)/);
  assert.match(fallback, /membership\.role = 'owner'[\s\S]*if v_household_id is null/);
  assert.match(resolve, /on conflict \(user_id\) do update[\s\S]*active_household_id/);
});

test("membership management preserves an owner and personal fallback", () => {
  assert.match(sqlFunction("awn_remove_household_member"), /membership\.role = 'member'/);
  assert.match(sqlFunction("awn_leave_household"), /owner_transfer_required[\s\S]*private\.awn_fallback_household/);
  const transfer = sqlFunction("awn_transfer_household_ownership");
  assert.match(transfer, /case when membership\.user_id = v_user_id then 'member' else 'owner' end/);
  assert.match(transfer, /count\(\*\)[\s\S]*role = 'owner'\) <> 1/);
  assert.match(transferRepairMigration, /update public\.households[\s\S]*set is_personal = false/);
  assert.match(transferRepairMigration, /grant execute on function public\.awn_transfer_household_ownership\(uuid, uuid\) to authenticated/);
});

test("direct invitation and membership mutation stay unavailable", () => {
  assert.match(migration, /revoke all on table public\.household_invitations from public, anon, authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on table public\.household_invitations/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete) on table public\.household_members/i);
  for (const name of ["awn_create_household_invitation", "awn_accept_household_invitation", "awn_remove_household_member", "awn_leave_household", "awn_transfer_household_ownership"]) assert.match(migration, new RegExp(`grant execute on function public\\.${name}`));
});

test("switching clears the previous snapshot before the requested Household loads", () => {
  const start = provider.indexOf("const switchHousehold"); const end = provider.indexOf("useEffect(() =>", start); const switching = provider.slice(start, end);
  assert.match(switching, /setReady\(false\)/);
  assert.match(switching, /cloudRef\.current = null[\s\S]*setProfile\(null\)[\s\S]*loadCloudFinancialProfile\(ownerId, householdId, false\)/);
});

test("realtime follows only the active Household and debounces canonical refetch", () => {
  assert.match(provider, /channel\(`awn-household-\$\{activeHouseholdId\}`\)/);
  assert.match(provider, /table: "financial_profiles", filter: `household_id=eq\.\$\{activeHouseholdId\}`/);
  assert.match(provider, /table: "household_members", filter: `household_id=eq\.\$\{activeHouseholdId\}`/);
  assert.match(provider, /}, 300\)/);
  assert.match(provider, /removeChannel\(channel\)/);
});

test("desktop and phone use one accessible Household switcher", () => {
  assert.match(navigation, /<HouseholdSwitcher \/>/);
  assert.match(navigation, /<HouseholdSwitcher mobile/);
  assert.match(switcher, /type="button"[\s\S]*aria-label=[\s\S]*aria-expanded/);
  assert.match(switcher, /role="menuitemradio"[\s\S]*aria-checked/);
  assert.match(switcher, /!isPersonal \|\| memberCount > 1/);
  assert.match(switcher, /!household\.isPersonal \|\| household\.memberCount > 1/);
  assert.match(switcher, /Manage household/);
});

test("Settings shows only role-appropriate sharing controls", () => {
  assert.match(settings, /memberRole === "owner"[\s\S]*Invite member/);
  assert.match(settings, /Transfer ownership/);
  assert.match(settings, /Remove member/);
  assert.match(settings, /Leave household/);
  assert.match(settings, /This shared plan already has two members/);
  assert.match(settings, /aria-label="Invitation link"[\s\S]*readOnly/);
});

test("invitation auth return supports password and Google through the existing next path", () => {
  assert.match(invite, /\/auth\/sign-in\?next=/);
  assert.match(invite, /\/auth\/sign-up\?next=/);
  assert.match(source("components/auth-forms.tsx"), /socialAuthCallbackUrl\(window\.location\.origin, next, provider\)/);
  assert.match(source("app/auth/callback/route.ts"), /safeReturnPath\(request\.nextUrl\.searchParams\.get\("next"\)\)/);
  assert.match(source("lib/auth/routing.ts"), /pathname\.startsWith\("\/invite\/"\)/);
});

test("shared error copy distinguishes every security and membership denial", () => {
  assert.match(sharedHouseholdError("invitation_email_mismatch"), /another email/);
  assert.match(sharedHouseholdError("household_member_limit"), /two members/);
  assert.match(sharedHouseholdError("owner_transfer_required"), /Transfer ownership/);
});

test("Phase 4A documentation records no merge, manual link delivery, and deferred deletion", () => {
  const documentation = source("docs/SHARED-HOUSEHOLDS.md");
  assert.match(documentation, /never moves, copies, merges/);
  assert.match(documentation, /seven days/);
  assert.match(documentation, /automatic transactional email is deferred/);
  assert.match(documentation, /Household deletion is not included/);
});
