import { decideInitialCloudState, LOCAL_CLOUD_MIGRATION_IDENTIFIER, parseCloudStateRow, type CloudFinancialState } from "@/lib/cloud-financial-core";
import { normalizeLedgerProfile } from "@/lib/financial-ledger";
import { normalizeBudgetSnapshots } from "@/lib/financial-budget";
import { financialReferenceMonth } from "@/lib/financial-date";
import { backupFinancialProfileForCloudMigration, loadFinancialProfile } from "@/lib/financial-storage";
import { isFinancialProfile } from "@/lib/financial-storage-core";
import type { FinancialProfile } from "@/lib/financial-types";
import type { FinancialImportRecord } from "@/lib/sms-import/types";
import { createClient } from "@/lib/supabase/client";

export type CloudFinancialLoadResult = CloudFinancialState & { issue: string | null; migratedLocalProfile: boolean };

type SaveRow = {
  household_id?: unknown;
  profile_data?: unknown;
  revision?: unknown;
  initialized_at?: unknown;
  migrated_at?: unknown;
};

export class CloudFinancialRepositoryError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

function repositoryError(error: { code?: string; message?: string } | null, fallback: string) {
  const message = error?.message ?? fallback;
  const known = ["revision_conflict", "household_access_denied", "invalid_financial_profile", "authentication_required", "import_duplicate", "invalid_import_record", "invalid_household_name", "shared_household_clear_blocked"]
    .find((code) => message.includes(code));
  return new CloudFinancialRepositoryError(known ?? error?.code ?? "cloud_unavailable", message);
}

function normalizeCloudProfile(profile: FinancialProfile) {
  const normalized = normalizeLedgerProfile({ ...profile, country: profile.country ?? "United Arab Emirates", budgetStartDay: profile.budgetStartDay ?? 1, cashBalance: profile.cashBalance ?? 0, debitCards: profile.debitCards ?? [], monthlyBudgets: profile.monthlyBudgets ?? [] });
  return normalizeBudgetSnapshots(normalized, financialReferenceMonth(normalized));
}

async function resolveState() {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("awn_resolve_private_household");
  if (error) throw repositoryError(error, "cloud_load_failed");
  const state = parseCloudStateRow(data);
  return state.profile ? { ...state, profile: normalizeCloudProfile(state.profile) } : state;
}

function parseSaveRow(data: unknown, householdName: string, memberRole: "owner" | "member", memberCount: number, isPersonal: boolean) {
  const row = (Array.isArray(data) ? data[0] : data) as SaveRow | null;
  if (!row || typeof row.household_id !== "string" || !Number.isSafeInteger(row.revision)
    || !isFinancialProfile(row.profile_data)) throw new CloudFinancialRepositoryError("invalid_cloud_financial_state", "invalid_cloud_financial_state");
  return {
    householdId: row.household_id,
    householdName,
    memberRole,
    memberCount,
    isPersonal,
    profile: normalizeCloudProfile(row.profile_data),
    revision: Number(row.revision),
    initializedAt: typeof row.initialized_at === "string" ? row.initialized_at : null,
    migratedAt: typeof row.migrated_at === "string" ? row.migrated_at : null,
  } satisfies CloudFinancialState;
}

export async function updateCloudHouseholdName(state: Pick<CloudFinancialState, "householdId">, name: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("awn_update_household_name", { p_household_id: state.householdId, p_name: name });
  if (error) throw repositoryError(error, "household_name_update_failed");
  const row = (Array.isArray(data) ? data[0] : data) as { household_id?: unknown; household_name?: unknown } | null;
  if (!row || row.household_id !== state.householdId || typeof row.household_name !== "string") throw new CloudFinancialRepositoryError("invalid_cloud_financial_state", "invalid_cloud_financial_state");
  return row.household_name;
}

export async function clearCloudFinancialData(state: CloudFinancialState) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("awn_clear_financial_data", { p_household_id: state.householdId });
  if (error) throw repositoryError(error, "financial_clear_failed");
  return parseSaveRow(data, state.householdName, state.memberRole, state.memberCount, state.isPersonal);
}

export async function saveCloudFinancialProfile(
  state: Pick<CloudFinancialState, "householdId" | "householdName" | "memberRole" | "memberCount" | "isPersonal" | "revision">,
  profile: FinancialProfile,
  migrationIdentifier?: string,
) {
  if (!isFinancialProfile(profile)) throw new CloudFinancialRepositoryError("invalid_financial_profile", "invalid_financial_profile");
  const supabase = createClient();
  const { data, error } = await supabase.rpc("awn_save_financial_state", {
    p_household_id: state.householdId,
    p_expected_revision: state.revision,
    p_profile_data: profile as unknown as Record<string, unknown>,
    p_migration_identifier: migrationIdentifier ?? null,
  });
  if (error) throw repositoryError(error, "cloud_save_failed");
  return parseSaveRow(data, state.householdName, state.memberRole, state.memberCount, state.isPersonal);
}

export async function loadFinancialImportFingerprints(householdId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.from("financial_import_fingerprints").select("fingerprint").eq("household_id", householdId);
  if (error) throw repositoryError(error, "import_fingerprints_load_failed");
  return new Set((data ?? []).flatMap((row) => typeof row.fingerprint === "string" ? [row.fingerprint] : []));
}

export async function saveCloudFinancialImport(
  state: Pick<CloudFinancialState, "householdId" | "householdName" | "memberRole" | "memberCount" | "isPersonal" | "revision">,
  profile: FinancialProfile,
  imports: FinancialImportRecord[],
) {
  if (!isFinancialProfile(profile)) throw new CloudFinancialRepositoryError("invalid_financial_profile", "invalid_financial_profile");
  const supabase = createClient();
  const { data, error } = await supabase.rpc("awn_import_financial_transactions", {
    p_household_id: state.householdId,
    p_expected_revision: state.revision,
    p_profile_data: profile as unknown as Record<string, unknown>,
    p_imports: imports as unknown as Record<string, unknown>[],
  });
  if (error) throw repositoryError(error, "cloud_import_failed");
  return parseSaveRow(data, state.householdName, state.memberRole, state.memberCount, state.isPersonal);
}

export async function loadCloudFinancialProfile(ownerId: string, allowLocalMigration = true): Promise<CloudFinancialLoadResult> {
  let cloud = await resolveState();
  if (cloud.profile) return { ...cloud, issue: null, migratedLocalProfile: false };
  if (!allowLocalMigration || !cloud.isPersonal || cloud.memberRole !== "owner") return { ...cloud, issue: null, migratedLocalProfile: false };
  const local = loadFinancialProfile(ownerId);
  const decision = decideInitialCloudState(cloud.profile, local.profile, local.issue);

  if (decision.kind === "invalid-local") return { ...cloud, issue: "AWN found a browser backup that could not be safely migrated. Your cloud data was left unchanged.", migratedLocalProfile: false };
  if (decision.kind === "empty") return { ...cloud, issue: null, migratedLocalProfile: false };

  backupFinancialProfileForCloudMigration(ownerId);
  try {
    cloud = await saveCloudFinancialProfile(cloud, decision.profile, LOCAL_CLOUD_MIGRATION_IDENTIFIER);
    return { ...cloud, issue: null, migratedLocalProfile: true };
  } catch (error) {
    if (error instanceof CloudFinancialRepositoryError && error.code === "revision_conflict") {
      cloud = await resolveState();
      if (cloud.profile) return { ...cloud, issue: null, migratedLocalProfile: false };
    }
    throw error;
  }
}

export function cloudFinancialIssue(error: unknown, action: "load" | "save") {
  if (error instanceof CloudFinancialRepositoryError && error.code === "revision_conflict") {
    return "Your financial data changed in another session. Reload and try again.";
  }
  if (error instanceof CloudFinancialRepositoryError && error.code === "household_access_denied") {
    return "You no longer have access to this Household.";
  }
  return action === "load"
    ? "We couldn’t load your financial data. Check your connection and try again."
    : "We couldn’t save that change to AWN Cloud. Check your connection and try again.";
}
