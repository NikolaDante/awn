import type { Amount, Currency } from "./financial-types.ts";

export const currencyPlacements = ["before", "after"] as const;
export const numberFormats = ["comma-dot", "dot-comma", "space-comma"] as const;
export const dateFormats = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

export type CurrencyPlacement = (typeof currencyPlacements)[number];
export type NumberFormat = (typeof numberFormats)[number];
export type DateFormat = (typeof dateFormats)[number];
export type UserPreferences = {
  displayName: string;
  currencyPlacement: CurrencyPlacement;
  numberFormat: NumberFormat;
  dateFormat: DateFormat;
};

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  displayName: "",
  currencyPlacement: "before",
  numberFormat: "comma-dot",
  dateFormat: "DD/MM/YYYY",
};

type PreferenceRow = {
  display_name?: unknown;
  currency_placement?: unknown;
  number_format?: unknown;
  date_format?: unknown;
};

export function parseUserPreferences(value: unknown): UserPreferences {
  const row = value as PreferenceRow | null;
  if (!row) return DEFAULT_USER_PREFERENCES;
  return {
    displayName: typeof row.display_name === "string" ? row.display_name : "",
    currencyPlacement: currencyPlacements.includes(row.currency_placement as CurrencyPlacement) ? row.currency_placement as CurrencyPlacement : "before",
    numberFormat: numberFormats.includes(row.number_format as NumberFormat) ? row.number_format as NumberFormat : "comma-dot",
    dateFormat: dateFormats.includes(row.date_format as DateFormat) ? row.date_format as DateFormat : "DD/MM/YYYY",
  };
}

export function preferencesRow(preferences: UserPreferences) {
  return {
    display_name: preferences.displayName,
    currency_placement: preferences.currencyPlacement,
    number_format: preferences.numberFormat,
    date_format: preferences.dateFormat,
  };
}

export function formatPreferenceNumber(amount: Amount, numberFormat: NumberFormat) {
  const locale = numberFormat === "comma-dot" ? "en-US" : numberFormat === "dot-comma" ? "de-DE" : "fr-FR";
  const formatted = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount / 100);
  return numberFormat === "space-comma" ? formatted.replace(/[\u00a0\u202f]/g, " ") : formatted;
}

export function formatMoneyPreference(amount: Amount, currency: Currency, preferences: Pick<UserPreferences, "currencyPlacement" | "numberFormat"> = DEFAULT_USER_PREFERENCES) {
  const number = formatPreferenceNumber(amount, preferences.numberFormat);
  return preferences.currencyPlacement === "after" ? `${number} ${currency}` : `${currency} ${number}`;
}

export function formatDatePreference(value: string, format: DateFormat = DEFAULT_USER_PREFERENCES.dateFormat) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  if (format === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (format === "YYYY-MM-DD") return value;
  return `${day}/${month}/${year}`;
}

export function validDisplayName(value: string) {
  const trimmed = value.trim();
  return trimmed.length <= 60 ? trimmed : null;
}
