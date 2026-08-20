import type { FinancialProfile } from "@/lib/financial-types";

export const QA_PROFILE_MARKER = "qa-2026-salary";
export const QA_REFERENCE_MONTH = "2026-03";

export function calendarMonth() {
  return new Date().toLocaleDateString("en-CA").slice(0, 7);
}

function calendarDate() {
  return new Date().toLocaleDateString("en-CA");
}

const iso = (date: Date) => date.toISOString().slice(0, 10);
const atUtc = (value: string) => new Date(`${value}T12:00:00Z`);

export type BudgetPeriod = { key: string; start: string; end: string; label: string };

export function budgetPeriodForDate(startDay: number | undefined, date: string): BudgetPeriod {
  const day = Math.max(1, Math.min(28, Math.trunc(startDay ?? 1)));
  const reference = atUtc(date);
  let year = reference.getUTCFullYear();
  let month = reference.getUTCMonth();
  if (reference.getUTCDate() < day) {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  const start = new Date(Date.UTC(year, month, day, 12));
  const next = new Date(Date.UTC(year, month + 1, day, 12));
  const end = new Date(next.getTime() - 86400000);
  const key = `${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, "0")}`;
  const range = `${start.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })} – ${end.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`;
  return { key, start: iso(start), end: iso(end), label: day === 1 ? end.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : range };
}

export function budgetPeriodForKey(startDay: number | undefined, key: string): BudgetPeriod {
  return budgetPeriodForDate(startDay, `${key}-01`);
}

export function financialReferenceDate(profile: FinancialProfile) {
  const isDevelopmentFixture = process.env.NODE_ENV !== "production" && profile.incomeSources.some((source) => source.id === QA_PROFILE_MARKER);
  return isDevelopmentFixture ? `${QA_REFERENCE_MONTH}-31` : calendarDate();
}

export function financialReferencePeriod(profile: FinancialProfile) {
  return budgetPeriodForDate(profile.budgetStartDay, financialReferenceDate(profile));
}

/** Budget snapshot key retained under this name for v2 compatibility. */
export function financialReferenceMonth(profile: FinancialProfile) {
  return financialReferencePeriod(profile).key;
}

export function dateInBudgetPeriod(date: string, period: BudgetPeriod) {
  return date >= period.start && date <= period.end;
}
