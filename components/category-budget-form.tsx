"use client";

import { useState } from "react";
import { CategorySelectOptions, CUSTOM_CATEGORY_VALUE } from "@/components/category-select-options";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { firstAvailableCategoryName } from "@/lib/financial-categories";
import { newLocalId, type CategoryBudget, type FinancialProfile } from "@/lib/financial-types";

type Errors = Record<string, string>;

export function CategoryBudgetForm({ existing, categories, profile, onCancel, onSave }: { existing?: CategoryBudget; categories: CategoryBudget[]; profile: FinancialProfile; onCancel: () => void; onSave: (category: CategoryBudget) => void }) {
  const excludedNames = categories.filter((category) => category.id !== existing?.id).map((category) => category.name);
  const [name, setName] = useState(existing?.name ?? firstAvailableCategoryName(profile, excludedNames));
  const [customName, setCustomName] = useState("");
  const [custom, setCustom] = useState(false);
  const [limit, setLimit] = useState(existing?.limit ?? 0);
  const [errors, setErrors] = useState<Errors>({});
  const selectedName = custom ? customName.trim() : name.trim();
  const submit = () => {
    const next: Errors = {};
    if (!selectedName) next.name = custom ? "Enter a custom category name." : "Please choose a category.";
    if (categories.some((category) => category.id !== existing?.id && category.name.toLowerCase() === selectedName.toLowerCase())) next.name = "That category already has a budget.";
    if (limit <= 0) next.limit = "Monthly limit must be above zero.";
    setErrors(next);
    if (!Object.keys(next).length) onSave({ id: existing?.id ?? newLocalId(), name: selectedName, limit, month: existing?.month });
  };
  return <div className="inline-form budget-allocation-form"><div className="field-row"><FormField label="Category" error={custom ? undefined : errors.name}><select value={custom ? CUSTOM_CATEGORY_VALUE : name} onChange={(event) => { const value = event.target.value; setErrors({}); if (value === CUSTOM_CATEGORY_VALUE) { setCustom(true); setCustomName(""); } else { setCustom(false); setName(value); } }}><option value="">Choose a category</option><CategorySelectOptions profile={profile} excludedNames={excludedNames} currentName={existing?.name} includeCustomAction /></select></FormField><FormField label="Monthly limit" error={errors.limit}><MoneyInput value={limit} onValueChange={(value) => { setLimit(value); setErrors({}); }} placeholder="0.00" /></FormField></div>{custom && <FormField label="Custom category name" error={errors.name}><input value={customName} onChange={(event) => { setCustomName(event.target.value); setErrors({}); }} placeholder="e.g. Pet care" autoFocus /></FormField>}<div className="confirm-dialog-actions"><button type="button" className="app-button app-button-secondary" onClick={onCancel}>Cancel</button><button type="button" className="app-button" onClick={submit}>{existing ? "Save allocation" : "Add category"}</button></div></div>;
}
