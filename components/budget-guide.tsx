"use client";

import { useMemo, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { budgetTemplateAmounts, suggestedBudgetBucket, BUDGET_TEMPLATES, type BudgetBucket, type BudgetGuideCategory, type BudgetTemplateKey } from "@/lib/budget-guide";
import { DEFAULT_CATEGORY_NAMES } from "@/lib/financial-categories";
import type { Currency } from "@/lib/financial-types";

export type BudgetGuideGoal = { id: string; name: string; amount: number };
export type BudgetGuideResult = { overall: number; categories: BudgetGuideCategory[]; goals: BudgetGuideGoal[] };

export function BudgetGuide({ currency, goals, household = false, back, cancel, accept }: {
  currency: Currency;
  goals: Array<{ id: string; name: string }>;
  household?: boolean;
  back: () => void;
  cancel: () => void;
  accept: (result: BudgetGuideResult) => void;
}) {
  const { formatMoney } = useUserPreferences();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(0);
  const [template, setTemplate] = useState<BudgetTemplateKey>("balanced");
  const [custom, setCustom] = useState({ essentials: 50, lifestyle: 30, savings: 20 });
  const [categories, setCategories] = useState<BudgetGuideCategory[]>([]);
  const [goalDrafts, setGoalDrafts] = useState<BudgetGuideGoal[]>(goals.map((goal) => ({ ...goal, amount: 0 })));
  const [decideLater, setDecideLater] = useState(true);
  const [error, setError] = useState("");
  const buckets = useMemo(() => budgetTemplateAmounts(amount, template, custom), [amount, custom, template]);
  const categoryTotal = categories.reduce((sum, item) => sum + item.amount, 0);
  const essentialTotal = categories.filter((item) => item.bucket === "essentials").reduce((sum, item) => sum + item.amount, 0);
  const lifestyleTotal = categories.filter((item) => item.bucket === "lifestyle").reduce((sum, item) => sum + item.amount, 0);
  const savingsTotal = goalDrafts.reduce((sum, item) => sum + item.amount, 0);

  const nextFromTemplate = () => {
    if (amount <= 0) return setError("Enter a planning amount above zero.");
    if (!buckets) return setError("Custom percentages must total exactly 100%.");
    setCategories([]);
    setError(""); setStep(1);
  };
  const finish = () => {
    if (!buckets) return;
    if (categoryTotal > buckets.spending) return setError("Category suggestions cannot exceed the spending budget.");
    if (!decideLater && savingsTotal > buckets.savings) return setError("Savings goal allocations cannot exceed the savings target.");
    accept({ overall: buckets.spending, categories: categories.filter((item) => item.amount > 0 && item.category.trim()), goals: decideLater ? [] : goalDrafts.filter((goal) => goal.amount > 0) });
  };
  const updateCategory = (index: number, update: Partial<BudgetGuideCategory>) => setCategories((items) => items.map((item, position) => position === index ? { ...item, ...update } : item));
  const addCategory = () => setCategories((items) => [...items, { category: DEFAULT_CATEGORY_NAMES.find((name) => !items.some((item) => item.category === name)) ?? "", bucket: "essentials", amount: 0 }]);
  const addSuggestedCategory = (category: string) => setCategories((items) => items.some((item) => item.category === category) ? items : [...items, { category, bucket: suggestedBudgetBucket(category), amount: 0 }]);

  return <div className="budget-guide">
    <div className="budget-guide-progress" aria-label={`Budget guide step ${step + 1} of 4`}><span style={{ width: `${(step + 1) * 25}%` }} /></div>
    {step === 0 && <section className="budget-guide-step"><p className="app-eyebrow">Step 1 of 4</p><h3>Choose a planning starting point</h3><p className="form-help">Use an amount you are comfortable planning with. {household ? "AWN never asks for your partner’s income." : "You can revise every suggestion before saving."}</p><label className="form-field">Monthly planning amount<MoneyInput value={amount} onValueChange={(value) => { setAmount(value); setError(""); }} /></label><div className="budget-template-grid">{Object.entries(BUDGET_TEMPLATES).map(([key, value]) => <button type="button" className={template === key ? "is-selected" : ""} onClick={() => setTemplate(key as BudgetTemplateKey)} key={key}><strong>{value.label}</strong><span>{value.essentials}% essentials · {value.lifestyle}% lifestyle · {value.savings}% savings</span></button>)}<button type="button" className={template === "custom" ? "is-selected" : ""} onClick={() => setTemplate("custom")}><strong>Custom</strong><span>Choose percentages that total 100%</span></button></div>{template === "custom" && <div className="budget-custom-percentages">{(["essentials", "lifestyle", "savings"] as const).map((key) => <label className="form-field" key={key}>{key[0].toUpperCase() + key.slice(1)} %<input type="number" min="0" max="100" value={custom[key]} onChange={(event) => setCustom((value) => ({ ...value, [key]: Number(event.target.value) }))} /></label>)}</div>}{buckets && <div className="budget-guide-buckets"><span>Essentials<strong>{formatMoney(buckets.essentials, currency)}</strong></span><span>Lifestyle<strong>{formatMoney(buckets.lifestyle, currency)}</strong></span><span>Savings<strong>{formatMoney(buckets.savings, currency)}</strong></span><span>Spending budget<strong>{formatMoney(buckets.spending, currency)}</strong></span></div>}</section>}
    {step === 1 && buckets && <section className="budget-guide-step"><p className="app-eyebrow">Step 2 of 4</p><h3>Choose category allocations</h3><p className="form-help">These are starting guidelines. Adjust them to fit your life. AWN never chooses category amounts for you, and unallocated spending room is valid.</p><div className="budget-guide-suggestions"><div><strong>Essentials suggestions</strong>{["Rent", "Utilities", "Phone", "Internet", "Groceries", "Fuel", "Public Transport", "Insurance", "Medical", "Pharmacy", "Car Maintenance", "Home Services"].map((name) => <button type="button" onClick={() => addSuggestedCategory(name)} disabled={categories.some((item) => item.category === name)} key={name}>{name}</button>)}</div><div><strong>Lifestyle suggestions</strong>{["Dining Out", "Delivery", "Coffee & Snacks", "Clothing", "Electronics", "Gifts", "General Shopping", "Going Out", "Movies & Events", "Games", "Hobbies", "Flights"].map((name) => <button type="button" onClick={() => addSuggestedCategory(name)} disabled={categories.some((item) => item.category === name)} key={name}>{name}</button>)}</div></div><div className="budget-guide-category-list">{categories.map((item, index) => <div className="budget-guide-category" key={`${index}-${item.category}`}><label className="form-field">Category<input list="awn-guide-categories" value={item.category} onChange={(event) => updateCategory(index, { category: event.target.value, bucket: suggestedBudgetBucket(event.target.value) })} /></label><label className="form-field">Bucket<select value={item.bucket} onChange={(event) => updateCategory(index, { bucket: event.target.value as BudgetBucket })}><option value="essentials">Essentials</option><option value="lifestyle">Lifestyle</option></select></label><label className="form-field">Your allocation<MoneyInput value={item.amount} onValueChange={(value) => updateCategory(index, { amount: value })} /></label><button className="text-button is-danger" type="button" onClick={() => setCategories((items) => items.filter((_, position) => position !== index))}>Remove</button></div>)}</div><datalist id="awn-guide-categories">{DEFAULT_CATEGORY_NAMES.map((name) => <option value={name} key={name} />)}</datalist><button className="text-button" type="button" onClick={addCategory}>Add another category</button><div className="budget-guide-bucket-progress"><span>Essentials target<strong>{formatMoney(buckets.essentials, currency)}</strong><small>{formatMoney(essentialTotal, currency)} allocated · {formatMoney(buckets.essentials - essentialTotal, currency)} still available</small></span><span>Lifestyle target<strong>{formatMoney(buckets.lifestyle, currency)}</strong><small>{formatMoney(lifestyleTotal, currency)} allocated · {formatMoney(buckets.lifestyle - lifestyleTotal, currency)} still available</small></span></div><div className="budget-guide-totals"><span>Spending budget <strong>{formatMoney(buckets.spending, currency)}</strong></span><span>Category allocations <strong>{formatMoney(categoryTotal, currency)}</strong></span><span>Unallocated <strong>{formatMoney(buckets.spending - categoryTotal, currency)}</strong></span></div></section>}
    {step === 2 && buckets && <section className="budget-guide-step"><p className="app-eyebrow">Step 3 of 4</p><h3>Savings guidance</h3><p className="form-help">Savings stays outside the spending budget. This plans goal contributions only; it never moves money.</p><div className="segmented-control" aria-label="Savings guidance"><button type="button" className={!decideLater ? "is-active" : ""} onClick={() => setDecideLater(false)}>Allocate to savings goals</button><button type="button" className={decideLater ? "is-active" : ""} onClick={() => setDecideLater(true)}>Decide later</button></div>{!decideLater && (goalDrafts.length ? <div className="budget-guide-goals">{goalDrafts.map((goal, index) => <label className="form-field" key={goal.id}>{goal.name}<MoneyInput value={goal.amount} onValueChange={(amount) => setGoalDrafts((items) => items.map((item, position) => position === index ? { ...item, amount } : item))} /></label>)}</div> : <p className="section-note">No {household ? "shared" : "private"} savings goals yet. You can decide later.</p>)}<div className="budget-guide-totals"><span>Savings target <strong>{formatMoney(buckets.savings, currency)}</strong></span><span>Planned for goals <strong>{formatMoney(decideLater ? 0 : savingsTotal, currency)}</strong></span></div></section>}
    {step === 3 && buckets && <section className="budget-guide-step"><p className="app-eyebrow">Step 4 of 4</p><h3>Review your draft</h3><p className="form-help">Nothing has been saved yet. Saving applies the accepted spending budget, categories, and any goal guidance.</p><div className="budget-guide-review"><span>Planning amount<strong>{formatMoney(amount, currency)}</strong></span><span>Spending budget<strong>{formatMoney(buckets.spending, currency)}</strong></span><span>Savings target<strong>{formatMoney(buckets.savings, currency)}</strong></span><span>Category allocations<strong>{formatMoney(categoryTotal, currency)}</strong></span></div></section>}
    {error && <p className="form-message is-error" role="alert">{error}</p>}
    <div className="confirm-dialog-actions budget-guide-actions"><button className="app-button app-button-secondary" type="button" onClick={step === 0 ? back : () => { setError(""); setStep((value) => value - 1); }}>Back</button><button className="text-button" type="button" onClick={cancel}>Cancel</button>{step < 3 ? <button className="app-button" type="button" onClick={() => step === 0 ? nextFromTemplate() : setStep((value) => value + 1)}>Continue</button> : <button className="app-button" type="button" onClick={finish}>Use this plan</button>}</div>
  </div>;
}
