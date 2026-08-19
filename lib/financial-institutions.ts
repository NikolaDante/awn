import type { Currency, DebitCard, FinancialProfile } from "@/lib/financial-types";

export const countryCurrencies = {
  "United Arab Emirates": "AED",
  Serbia: "RSD",
  "Saudi Arabia": "SAR",
  "United States": "USD",
  "United Kingdom": "GBP",
  "Euro Area": "EUR",
} as const satisfies Record<string, Currency>;

export const countryAliases: Record<string, string> = {
  ae: "United Arab Emirates",
  uae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  rs: "Serbia",
  serbia: "Serbia",
  sa: "Saudi Arabia",
  ksa: "Saudi Arabia",
  "saudi arabia": "Saudi Arabia",
  us: "United States",
  usa: "United States",
  "united states": "United States",
  uk: "United Kingdom",
  "united kingdom": "United Kingdom",
};

export function displayCountry(value?: string) {
  const clean = value?.trim();
  if (!clean) return "Country not set";
  return countryAliases[clean.toLowerCase()] ?? clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function suggestedCurrency(country: string) {
  return countryCurrencies[country as keyof typeof countryCurrencies];
}

export function debitAccountAvailable(profile: FinancialProfile, accountId: string, editingCardId?: string) {
  return !(profile.debitCards ?? []).some((card: DebitCard) => card.id !== editingCardId && card.linkedAccountId === accountId);
}
