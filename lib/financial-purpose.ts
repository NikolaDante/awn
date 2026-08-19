import type { FinancialProfile } from "@/lib/financial-types";

export const FINANCIAL_PURPOSE_MAX_LENGTH = 30;

export function normalizeFinancialPurpose(value: unknown) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, FINANCIAL_PURPOSE_MAX_LENGTH).trim();
  return normalized || undefined;
}

export function normalizeFinancialPurposes(profile: FinancialProfile): FinancialProfile {
  return {
    ...profile,
    accounts: profile.accounts.map((account) => ({ ...account, purpose: normalizeFinancialPurpose(account.purpose) })),
    debitCards: profile.debitCards?.map((card) => ({ ...card, purpose: normalizeFinancialPurpose(card.purpose) })),
    creditCards: profile.creditCards.map((card) => ({ ...card, purpose: normalizeFinancialPurpose(card.purpose) })),
  };
}
