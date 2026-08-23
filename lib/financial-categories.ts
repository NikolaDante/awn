import { UNBUDGETED_CATEGORY } from "./financial-ledger.ts";
import type { FinancialProfile } from "./financial-types.ts";

export type FinancialCategory = { key: string; name: string };
export type FinancialCategoryGroup = { key: string; label: string; categories: readonly FinancialCategory[] };

export const AWN_CATEGORY_CATALOG = [
  { key: "food-drink", label: "Food & Drink", categories: [
    { key: "food-groceries", name: "Groceries" },
    { key: "food-dining-out", name: "Dining Out" },
    { key: "food-delivery", name: "Delivery" },
    { key: "food-coffee-snacks", name: "Coffee & Snacks" },
    { key: "food-work-food", name: "Work Food" },
  ] },
  { key: "shopping", label: "Shopping", categories: [
    { key: "shopping-clothing", name: "Clothing" },
    { key: "shopping-electronics", name: "Electronics" },
    { key: "shopping-home-furniture", name: "Home & Furniture" },
    { key: "shopping-gifts", name: "Gifts" },
    { key: "shopping-general", name: "General Shopping" },
  ] },
  { key: "entertainment", label: "Entertainment", categories: [
    { key: "entertainment-going-out", name: "Going Out" },
    { key: "entertainment-movies-events", name: "Movies & Events" },
    { key: "entertainment-games", name: "Games" },
    { key: "entertainment-hobbies", name: "Hobbies" },
  ] },
  { key: "travel", label: "Travel", categories: [
    { key: "travel-flights", name: "Flights" },
    { key: "travel-accommodation", name: "Accommodation" },
    { key: "travel-car-rental", name: "Car Rental" },
    { key: "travel-food", name: "Travel Food" },
    { key: "travel-activities", name: "Activities" },
    { key: "travel-other", name: "Other Travel" },
  ] },
  { key: "transportation", label: "Transportation", categories: [
    { key: "transport-fuel", name: "Fuel" },
    { key: "transport-taxi-ride-hailing", name: "Taxi & Ride Hailing" },
    { key: "transport-parking", name: "Parking" },
    { key: "transport-public", name: "Public Transport" },
    { key: "transport-maintenance", name: "Car Maintenance" },
  ] },
  { key: "services", label: "Services", categories: [
    { key: "services-rent", name: "Rent" },
    { key: "services-utilities", name: "Utilities" },
    { key: "services-phone", name: "Phone" },
    { key: "services-internet", name: "Internet" },
    { key: "services-subscriptions", name: "Subscriptions" },
    { key: "services-education", name: "Education" },
    { key: "services-home", name: "Home Services" },
    { key: "services-personal-care", name: "Personal Care" },
    { key: "services-insurance", name: "Insurance" },
  ] },
  { key: "health", label: "Health", categories: [
    { key: "health-medical", name: "Medical" },
    { key: "health-pharmacy", name: "Pharmacy" },
    { key: "health-fitness", name: "Fitness" },
    { key: "health-wellness", name: "Wellness" },
  ] },
  { key: "other", label: "Other", categories: [] },
] as const satisfies readonly FinancialCategoryGroup[];

export const DEFAULT_CATEGORY_NAMES = AWN_CATEGORY_CATALOG.flatMap((group) => group.categories.map((category) => category.name));
const defaultCategoryNameSet = new Set<string>(DEFAULT_CATEGORY_NAMES);

export function isDefaultCategoryName(name: string) {
  return defaultCategoryNameSet.has(name);
}

export function profileCategoryNames(profile: FinancialProfile) {
  const stored = [
    ...(profile.customCategories ?? []),
    ...profile.categoryBudgets.map((category) => category.name),
    ...profile.transactions.flatMap((transaction) => transaction.type === "expense" ? [transaction.category] : []),
  ];
  return [...new Set(stored.map((name) => name.trim()).filter((name) => name && name !== UNBUDGETED_CATEGORY))].sort((a, b) => a.localeCompare(b));
}

export function categoryOptionGroups(profile: FinancialProfile, excludedNames: string[] = [], currentName = "") {
  const excluded = new Set(excludedNames.map((name) => name.toLowerCase()));
  const available = (name: string) => name === currentName || !excluded.has(name.toLowerCase());
  const defaults = AWN_CATEGORY_CATALOG.map((group) => ({ ...group, categories: group.categories.filter((category) => available(category.name)) })).filter((group) => group.categories.length);
  const knownNames = currentName && currentName !== UNBUDGETED_CATEGORY
    ? [...profileCategoryNames(profile), currentName]
    : profileCategoryNames(profile);
  const custom = [...new Set(knownNames)].filter((name) => !isDefaultCategoryName(name) && available(name));
  return custom.length ? [...defaults, { key: "custom", label: "Custom", categories: custom.map((name) => ({ key: `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name })) }] : defaults;
}

export function firstAvailableCategoryName(profile: FinancialProfile, excludedNames: string[] = []) {
  return categoryOptionGroups(profile, excludedNames)[0]?.categories[0]?.name ?? "";
}
