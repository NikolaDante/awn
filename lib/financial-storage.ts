import type { FinancialProfile } from "@/lib/financial-types";
import { normalizeBudgetSnapshots } from "@/lib/financial-budget";
import { financialReferenceMonth } from "@/lib/financial-date";
import { normalizeFinancialPurposes } from "@/lib/financial-purpose";
import { normalizeLedgerProfile } from "@/lib/financial-ledger";
import { cloudMigrationBackupKey, FINANCIAL_STORAGE_KEY, LEGACY_FINANCIAL_STORAGE_KEY, financialStorageKey, isFinancialProfile, migrateLegacyProfile, resetFinancialStorage } from "@/lib/financial-storage-core";

export { FINANCIAL_STORAGE_KEY, LEGACY_FINANCIAL_STORAGE_KEY, financialStorageKey, isFinancialProfile, migrateLegacyProfile, resetFinancialStorage };
type LoadResult = { profile: FinancialProfile | null; issue: string | null };

function normalizeSettings(profile: FinancialProfile): FinancialProfile {
  return normalizeLedgerProfile({ ...profile, country: profile.country ?? "United Arab Emirates", budgetStartDay: profile.budgetStartDay ?? 1, cashBalance: profile.cashBalance ?? 0, debitCards: profile.debitCards ?? [] });
}

export function loadFinancialProfile(ownerId: string): LoadResult {
  if (typeof window === "undefined") return { profile: null, issue: null };
  try {
    const key = financialStorageKey(ownerId);
    const unscoped = window.localStorage.getItem(FINANCIAL_STORAGE_KEY);
    const raw = window.localStorage.getItem(key) ?? unscoped;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!isFinancialProfile(parsed)) return { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." };
      const profile = normalizeSettings(normalizeFinancialPurposes(parsed as FinancialProfile));
      const normalized = normalizeBudgetSnapshots(profile, financialReferenceMonth(profile));
      window.localStorage.setItem(key, JSON.stringify(normalized));
      if (unscoped) window.localStorage.removeItem(FINANCIAL_STORAGE_KEY);
      return { profile: normalized, issue: null };
    }
    const legacyRaw = window.localStorage.getItem(LEGACY_FINANCIAL_STORAGE_KEY);
    if (!legacyRaw) return { profile: null, issue: null };
    const migrated = migrateLegacyProfile(JSON.parse(legacyRaw));
    if (!migrated) return { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." };
    window.localStorage.setItem(key, JSON.stringify(migrated));
    const verified: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (!isFinancialProfile(verified)) return { profile: null, issue: "AWN could not safely update your saved plan." };
    window.localStorage.removeItem(LEGACY_FINANCIAL_STORAGE_KEY);
    const profile = normalizeSettings(normalizeFinancialPurposes(verified as FinancialProfile));
    const normalized = normalizeBudgetSnapshots(profile, financialReferenceMonth(profile));
    window.localStorage.setItem(key, JSON.stringify(normalized));
    return { profile: normalized, issue: null };
  } catch { return { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." }; }
}

export function saveFinancialProfile(ownerId: string, profile: FinancialProfile) { if (typeof window === "undefined") return false; try { window.localStorage.setItem(financialStorageKey(ownerId), JSON.stringify(normalizeFinancialPurposes(profile))); return true; } catch { return false; } }
export function resetFinancialProfile(ownerId: string) { if (typeof window !== "undefined") resetFinancialStorage(window.localStorage, ownerId); }

export function backupFinancialProfileForCloudMigration(ownerId: string) {
  if (typeof window === "undefined") return false;
  try {
    const source = window.localStorage.getItem(financialStorageKey(ownerId))
      ?? window.localStorage.getItem(FINANCIAL_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_FINANCIAL_STORAGE_KEY);
    if (!source) return false;
    const key = cloudMigrationBackupKey(ownerId);
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, source);
    return window.localStorage.getItem(key) === source;
  } catch { return false; }
}
