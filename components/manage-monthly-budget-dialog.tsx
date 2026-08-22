"use client";

import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/app-icons";
import { CategoryBudgetForm } from "@/components/category-budget-form";
import { useFinancialProfile } from "@/components/financial-provider";
import { ModalDialog } from "@/components/modal-dialog";
import { MoneyInput } from "@/components/money-input";
import { budgetCategoriesForMonth, budgetDraftAllocation, overallBudgetForMonth, replaceManagedBudgetSnapshot } from "@/lib/financial-budget";
import { formatMoney } from "@/lib/financial-calculations";
import { financialReferenceMonth } from "@/lib/financial-date";
import { newLocalId, type CategoryBudget, type FinancialProfile } from "@/lib/financial-types";

export type ManageBudgetOptions = { focusCategories?: boolean; categoryId?: string; categoryName?: string };

export function ManageMonthlyBudgetDialog({ profile, close, options = {} }: { profile: FinancialProfile; close: () => void; options?: ManageBudgetOptions }) {
  const { save } = useFinancialProfile();
  const month = financialReferenceMonth(profile);
  const initialCategories = budgetCategoriesForMonth(profile, month);
  const initialEditor = () => {
    const existing = options.categoryId ? initialCategories.find((category) => category.id === options.categoryId) : undefined;
    if (existing) return existing;
    if (options.categoryName) return { id: newLocalId(), name: options.categoryName, limit: 0, month } satisfies CategoryBudget;
    return undefined;
  };
  const [overall, setOverall] = useState(overallBudgetForMonth(profile, month) ?? 0);
  const [categories, setCategories] = useState<CategoryBudget[]>(initialCategories);
  const [editor, setEditor] = useState<CategoryBudget | null | undefined>(initialEditor);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const categorySection = useRef<HTMLElement>(null);
  const allocation = budgetDraftAllocation(overall, categories);

  useEffect(() => {
    if (options.focusCategories || options.categoryId || options.categoryName) categorySection.current?.scrollIntoView({ block: "nearest" });
  }, [options.categoryId, options.categoryName, options.focusCategories]);

  const upsert = (category: CategoryBudget) => {
    setCategories((current) => current.some((item) => item.id === category.id) ? current.map((item) => item.id === category.id ? category : item) : [...current, category]);
    setEditor(undefined);
    setError("");
  };
  const submit = async () => {
    if (overall <= 0) return setError("Enter an overall monthly budget above zero.");
    const names = categories.map((category) => category.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) return setError("Each category can only have one allocation.");
    if (categories.some((category) => !category.name.trim() || category.limit <= 0)) return setError("Every category allocation needs a name and a monthly limit above zero.");
    setBusy(true);
    setError("");
    if (await save(replaceManagedBudgetSnapshot(profile, month, overall, categories))) { close(); return; }
    setBusy(false);
    setError("We couldn’t save this monthly budget. Check your connection and try again.");
  };

  return <ModalDialog title="Manage monthly budget" eyebrow="Monthly plan" close={close} closeLabel="Close monthly budget manager" className="manage-budget-dialog">
    <div className="manage-budget-scroll">
      <label className="form-field">Overall monthly budget<MoneyInput value={overall} onValueChange={(value) => { setOverall(value); setError(""); }} placeholder="0.00" aria-invalid={!!error && overall <= 0} /></label>
      <p className="form-help">This is your total spending limit. Category allocations are optional and stay unchanged unless you edit them below.</p>
      <div className="budget-manager-summary" aria-label="Budget allocation summary"><span>Overall budget<strong>{formatMoney(overall, profile.currency)}</strong></span><span>Allocated<strong>{formatMoney(allocation.allocated, profile.currency)}</strong></span><span>Unallocated<strong className={allocation.unallocated < 0 ? "negative" : undefined}>{formatMoney(allocation.unallocated, profile.currency)}</strong></span></div>
      {allocation.unallocated < 0 && <p className="form-message is-warning" role="status">Category allocations exceed your overall monthly budget by {formatMoney(Math.abs(allocation.unallocated), profile.currency)}. The overall budget will not increase automatically.</p>}
      <section className="budget-manager-categories" ref={categorySection} aria-labelledby="budget-category-title">
        <div className="editor-heading"><div><p className="app-eyebrow">Optional allocations</p><h3 id="budget-category-title">Category allocations</h3></div>{editor === undefined && <button type="button" className="text-button panel-text-action" onClick={() => setEditor(null)} data-modal-initial-focus={options.focusCategories || undefined}><AppIcon name="plus" />Add category budget</button>}</div>
        {editor !== undefined ? <CategoryBudgetForm existing={editor ?? undefined} categories={categories} profile={profile} onCancel={() => setEditor(undefined)} onSave={upsert} /> : categories.length ? <div className="budget-allocation-list">{categories.map((category) => <article className="budget-allocation-row" key={category.id}><div><strong>{category.name}</strong><span>{formatMoney(category.limit, profile.currency)} monthly limit</span></div><div><button type="button" className="text-button" onClick={() => setEditor(category)}>Edit</button><button type="button" className="text-button is-danger" onClick={() => setCategories((current) => current.filter((item) => item.id !== category.id))}>Remove</button></div></article>)}</div> : <p className="section-note">No category allocations yet. Saving only the overall monthly budget is valid.</p>}
      </section>
      {error && <p className="form-message is-error" role="alert">{error}</p>}
    </div>
    <div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="app-button" type="button" onClick={submit} disabled={busy}>{busy ? "Saving…" : "Save monthly budget"}</button></div>
  </ModalDialog>;
}
