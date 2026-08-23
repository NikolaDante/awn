import { isFinancialProfile } from "./financial-storage-core.ts";
import type { FinancialProfile } from "./financial-types.ts";

export const LOCAL_CLOUD_MIGRATION_IDENTIFIER = "authenticated-local-profile-v2";

export type CloudFinancialState = {
  householdId: string;
  householdName: string;
  memberRole: "owner" | "member";
  memberCount: number;
  profile: FinancialProfile | null;
  revision: number;
  initializedAt: string | null;
  migratedAt: string | null;
};

export type CloudStateRow = {
  household_id?: unknown;
  household_name?: unknown;
  member_role?: unknown;
  member_count?: unknown;
  profile_data?: unknown;
  revision?: unknown;
  initialized_at?: unknown;
  migrated_at?: unknown;
};

const optionalTimestamp = (value: unknown) => value === null || value === undefined || typeof value === "string";

export function parseCloudStateRow(value: unknown): CloudFinancialState {
  const row = (Array.isArray(value) ? value[0] : value) as CloudStateRow | null;
  if (!row || typeof row.household_id !== "string" || typeof row.household_name !== "string"
    || (row.member_role !== "owner" && row.member_role !== "member") || !Number.isSafeInteger(row.member_count) || Number(row.member_count) < 1
    || !Number.isSafeInteger(row.revision) || Number(row.revision) < 0
    || !optionalTimestamp(row.initialized_at) || !optionalTimestamp(row.migrated_at)) {
    throw new Error("invalid_cloud_financial_state");
  }

  if (row.profile_data !== null && row.profile_data !== undefined && !isFinancialProfile(row.profile_data)) {
    throw new Error("invalid_cloud_financial_profile");
  }

  return {
    householdId: row.household_id,
    householdName: row.household_name,
    memberRole: row.member_role,
    memberCount: Number(row.member_count),
    profile: (row.profile_data ?? null) as FinancialProfile | null,
    revision: Number(row.revision),
    initializedAt: (row.initialized_at ?? null) as string | null,
    migratedAt: (row.migrated_at ?? null) as string | null,
  };
}

export type InitialCloudDecision =
  | { kind: "cloud"; profile: FinancialProfile }
  | { kind: "migrate-local"; profile: FinancialProfile }
  | { kind: "empty" }
  | { kind: "invalid-local"; issue: string };

export function decideInitialCloudState(
  cloudProfile: FinancialProfile | null,
  localProfile: FinancialProfile | null,
  localIssue: string | null,
): InitialCloudDecision {
  if (cloudProfile) return { kind: "cloud", profile: cloudProfile };
  if (localIssue) return { kind: "invalid-local", issue: localIssue };
  if (localProfile) return { kind: "migrate-local", profile: localProfile };
  return { kind: "empty" };
}

export function cloudWinsOverLocal(cloudProfile: FinancialProfile | null) {
  return cloudProfile !== null;
}
