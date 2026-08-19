import type { FinancialProfile } from "@/lib/financial-types";

export const QA_PROFILE_MARKER = "qa-2026-salary";
export const QA_REFERENCE_MONTH = "2026-03";

export function calendarMonth() {
  return new Date().toLocaleDateString("en-CA").slice(0, 7);
}

export function financialReferenceMonth(profile: FinancialProfile) {
  const isDevelopmentFixture = process.env.NODE_ENV !== "production" && profile.incomeSources.some((source) => source.id === QA_PROFILE_MARKER);
  return isDevelopmentFixture ? QA_REFERENCE_MONTH : calendarMonth();
}

export function financialReferenceDate(profile: FinancialProfile) {
  const month = financialReferenceMonth(profile);
  return month === QA_REFERENCE_MONTH && process.env.NODE_ENV !== "production" ? `${month}-31` : new Date().toLocaleDateString("en-CA");
}
