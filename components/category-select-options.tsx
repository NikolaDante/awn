import { categoryOptionGroups } from "@/lib/financial-categories";
import type { FinancialProfile } from "@/lib/financial-types";

export const CUSTOM_CATEGORY_VALUE = "__awn_custom_category__";

export function CategorySelectOptions({ profile, excludedNames = [], currentName = "", includeCustomAction = false }: { profile: FinancialProfile; excludedNames?: string[]; currentName?: string; includeCustomAction?: boolean }) {
  const groups = categoryOptionGroups(profile, excludedNames, currentName);
  return <>{groups.map((group) => <optgroup key={group.key} label={group.label}>{group.categories.map((category) => <option key={category.key} value={category.name}>{category.name}</option>)}</optgroup>)}{includeCustomAction && <option value={CUSTOM_CATEGORY_VALUE}>+ Add custom category</option>}</>;
}
