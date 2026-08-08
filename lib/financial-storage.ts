import { currencies, FINANCIAL_PROFILE_VERSION, type FinancialProfile } from "@/lib/financial-types";

export const FINANCIAL_STORAGE_KEY = "awn.financial-profile.v1";
type LoadResult = { profile: FinancialProfile | null; issue: string | null };

function isProfile(value: unknown): value is FinancialProfile {
  if (!value || typeof value !== "object") return false;
  const profile = value as Record<string, unknown>;
  const isObject = (item: unknown) => !!item && typeof item === "object";
  const isMoney = (item: unknown) => typeof item === "number" && Number.isSafeInteger(item);
  const isDay = (item: unknown) => typeof item === "number" && Number.isInteger(item) && item >= 1 && item <= 31;
  const named = (item: unknown) => isObject(item) && typeof (item as Record<string, unknown>).id === "string" && typeof (item as Record<string, unknown>).name === "string";
  return profile.version === FINANCIAL_PROFILE_VERSION && currencies.includes(profile.currency as (typeof currencies)[number]) && Array.isArray(profile.incomeSources) && profile.incomeSources.every((item) => named(item) && isMoney((item as Record<string, unknown>).amount) && isDay((item as Record<string, unknown>).day)) && Array.isArray(profile.accounts) && profile.accounts.every((item) => named(item) && isMoney((item as Record<string, unknown>).balance)) && Array.isArray(profile.creditCards) && profile.creditCards.every((item) => named(item) && isMoney((item as Record<string, unknown>).limit) && isMoney((item as Record<string, unknown>).owed) && isDay((item as Record<string, unknown>).dueDay)) && Array.isArray(profile.categoryBudgets) && profile.categoryBudgets.every((item) => named(item) && isMoney((item as Record<string, unknown>).limit)) && Array.isArray(profile.savingsGoals) && profile.savingsGoals.every((item) => named(item) && isMoney((item as Record<string, unknown>).target) && isMoney((item as Record<string, unknown>).saved) && isMoney((item as Record<string, unknown>).contribution)) && isObject(profile.onboarding) && typeof (profile.onboarding as Record<string, unknown>).completed === "boolean" && typeof (profile.onboarding as Record<string, unknown>).currentStep === "number";
}

export function loadFinancialProfile(): LoadResult {
  if (typeof window === "undefined") return { profile: null, issue: null };
  try {
    const raw = window.localStorage.getItem(FINANCIAL_STORAGE_KEY);
    if (!raw) return { profile: null, issue: null };
    const parsed: unknown = JSON.parse(raw);
    return isProfile(parsed) ? { profile: parsed, issue: null } : { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." };
  } catch { return { profile: null, issue: "Your saved plan cannot be read. You can reset it and start again." }; }
}

export function saveFinancialProfile(profile: FinancialProfile) {
  if (typeof window === "undefined") return false;
  try { window.localStorage.setItem(FINANCIAL_STORAGE_KEY, JSON.stringify(profile)); return true; } catch { return false; }
}

export function resetFinancialProfile() { if (typeof window !== "undefined") window.localStorage.removeItem(FINANCIAL_STORAGE_KEY); }
