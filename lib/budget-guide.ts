export type BudgetTemplateKey = "balanced" | "savings-first" | "flexible" | "custom";
export type BudgetBucket = "essentials" | "lifestyle";
export type BudgetGuideCategory = { category: string; bucket: BudgetBucket; amount: number };

export const BUDGET_TEMPLATES = {
  balanced: { label: "Balanced", essentials: 50, lifestyle: 30, savings: 20 },
  "savings-first": { label: "Savings First", essentials: 50, lifestyle: 20, savings: 30 },
  flexible: { label: "Flexible", essentials: 60, lifestyle: 30, savings: 10 },
} as const;

const lifestyleCategories = new Set([
  "Dining Out", "Delivery", "Coffee & Snacks", "Clothing", "Electronics", "Gifts",
  "General Shopping", "Going Out", "Movies & Events", "Games", "Hobbies", "Flights",
  "Accommodation", "Car Rental", "Travel Food", "Travel Activities", "Other Travel",
  "Subscriptions", "Personal Care", "Fitness", "Wellness",
]);

export function suggestedBudgetBucket(category: string): BudgetBucket {
  return lifestyleCategories.has(category) ? "lifestyle" : "essentials";
}

export function splitMinorUnits(total: number, percentages: number[]) {
  if (!Number.isSafeInteger(total) || total < 0 || percentages.some((value) => !Number.isFinite(value) || value < 0)) return [];
  const result = percentages.map((value) => Math.floor(total * value / 100));
  if (result.length) result[result.length - 1] += total - result.reduce((sum, value) => sum + value, 0);
  return result;
}

export function budgetTemplateAmounts(total: number, template: BudgetTemplateKey, custom = { essentials: 50, lifestyle: 30, savings: 20 }) {
  const percentages = template === "custom" ? custom : BUDGET_TEMPLATES[template];
  if (percentages.essentials + percentages.lifestyle + percentages.savings !== 100) return null;
  const [essentials, lifestyle, savings] = splitMinorUnits(total, [percentages.essentials, percentages.lifestyle, percentages.savings]);
  return { essentials, lifestyle, savings, spending: essentials + lifestyle, percentages };
}

export function responsibilitySplit(total: number, mode: "equal" | "custom", customFirst = 0) {
  if (mode === "custom") return [customFirst, total - customFirst] as const;
  const [first, second] = splitMinorUnits(total, [50, 50]);
  return [first, second] as const;
}
