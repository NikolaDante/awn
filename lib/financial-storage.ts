import type { FinancialProfile } from "@/lib/financial-types";
import { FINANCIAL_STORAGE_KEY, LEGACY_FINANCIAL_STORAGE_KEY, isFinancialProfile, migrateLegacyProfile, resetFinancialStorage } from "@/lib/financial-storage-core";

export { FINANCIAL_STORAGE_KEY, LEGACY_FINANCIAL_STORAGE_KEY, isFinancialProfile, migrateLegacyProfile, resetFinancialStorage };
type LoadResult = { profile: FinancialProfile | null; issue: string | null };

export function loadFinancialProfile(): LoadResult {
  if (typeof window === "undefined") return { profile: null, issue: null };
  try {
    const raw = window.localStorage.getItem(FINANCIAL_STORAGE_KEY);
    if (raw) { const parsed: unknown = JSON.parse(raw); return isFinancialProfile(parsed) ? { profile: parsed as FinancialProfile, issue: null } : { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." }; }
    const legacyRaw = window.localStorage.getItem(LEGACY_FINANCIAL_STORAGE_KEY);
    if (!legacyRaw) return { profile: null, issue: null };
    const migrated = migrateLegacyProfile(JSON.parse(legacyRaw));
    if (!migrated) return { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." };
    window.localStorage.setItem(FINANCIAL_STORAGE_KEY, JSON.stringify(migrated));
    const verified: unknown = JSON.parse(window.localStorage.getItem(FINANCIAL_STORAGE_KEY) ?? "null");
    if (!isFinancialProfile(verified)) return { profile: null, issue: "AWN could not safely update your saved plan." };
    window.localStorage.removeItem(LEGACY_FINANCIAL_STORAGE_KEY);
    return { profile: verified as FinancialProfile, issue: null };
  } catch { return { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." }; }
}

export function saveFinancialProfile(profile: FinancialProfile) { if (typeof window === "undefined") return false; try { window.localStorage.setItem(FINANCIAL_STORAGE_KEY, JSON.stringify(profile)); return true; } catch { return false; } }
export function resetFinancialProfile() { if (typeof window !== "undefined") resetFinancialStorage(window.localStorage); }
