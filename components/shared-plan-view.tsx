"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppIcon } from "@/components/app-icons";
import { MoneyInput } from "@/components/money-input";
import { ConfirmationDialog, ModalDialog } from "@/components/modal-dialog";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { DEFAULT_CATEGORY_NAMES } from "@/lib/financial-categories";
import { budgetPeriodForDate } from "@/lib/financial-date";
import { currencies, type Currency } from "@/lib/financial-types";
import { addSharedSavingsContribution, deleteSharedSavingsGoal, getSharedBudget, getSharedPlan, getSharedSavingsGoals, saveSharedBudget, saveSharedSavingsGoal, updateSharedPlanSettings } from "@/lib/shared-planning-repository";
import type { SharedBudgetCategory, SharedBudgetSummary, SharedPlan, SharedSavingsGoal } from "@/lib/shared-planning";
import { createClient } from "@/lib/supabase/client";

type SharedTab = "budgets" | "savings";
const today = () => new Date().toLocaleDateString("en-CA");

export function SharedPlanView({ tab }: { tab: SharedTab }) {
  const [plan, setPlan] = useState<SharedPlan>();
  const [budget, setBudget] = useState<SharedBudgetSummary>();
  const [goals, setGoals] = useState<SharedSavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sharedPlanId = plan?.householdId;
  const load = useCallback(async () => {
    try {
      const nextPlan = await getSharedPlan();
      const period = budgetPeriodForDate(nextPlan.budgetStartDay, today());
      const [nextBudget, nextGoals] = await Promise.all([getSharedBudget(nextPlan, period.key), getSharedSavingsGoals(nextPlan)]);
      setPlan(nextPlan); setBudget(nextBudget); setGoals(nextGoals); setError("");
    } catch { setError("AWN couldn’t load shared planning. Check your connection and try again."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!sharedPlanId) return;
    const supabase = createClient(); let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void load(), 250); };
    const channel = supabase.channel(`awn-shared-plan-${sharedPlanId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shared_plan_settings", filter: `household_id=eq.${sharedPlanId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_members", filter: `household_id=eq.${sharedPlanId}` }, refresh)
      .subscribe();
    return () => { clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [load, sharedPlanId]);

  if (loading) return <p className="loading-copy">Loading shared planning...</p>;
  if (error || !plan || !budget) return <section className="empty-panel"><h2>Shared planning needs attention</h2><p>{error}</p><button className="app-button" type="button" onClick={() => { setLoading(true); void load(); }}>Try again</button></section>;
  if (plan.memberCount < 2) return <SharedPlanEmpty tab={tab} />;
  return <div className="shared-plan-workspace">
    <SharedPlanHeader plan={plan} changed={load} />
    <p className="shared-privacy-note"><AppIcon name="plan" />Your accounts and transactions stay private. Only shared planning totals are visible here.</p>
    {tab === "budgets" ? <SharedBudget plan={plan} budget={budget} changed={load} /> : <SharedSavings plan={plan} goals={goals} changed={load} />}
  </div>;
}

function SharedPlanEmpty({ tab }: { tab: SharedTab }) {
  return <section className="empty-panel shared-plan-empty"><span className="empty-panel-mark" aria-hidden="true"><AppIcon name="plan" /></span><h2>Plan together with someone</h2><p>Create shared {tab === "budgets" ? "budgets" : "savings goals"} while keeping your accounts and transactions private.</p><Link className="app-button" href="/settings">Invite partner</Link></section>;
}

function SharedPlanHeader({ plan, changed }: { plan: SharedPlan; changed: () => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  return <><section className="content-panel shared-plan-header"><div><p className="app-eyebrow">Household plan</p><h2>{plan.name}</h2><p>{plan.currency} · Budget cycle starts day {plan.budgetStartDay}</p></div><button className="app-button app-button-secondary" type="button" onClick={() => setEditing(true)}>Plan settings</button></section>{editing && <SharedPlanSettingsDialog plan={plan} close={() => setEditing(false)} saved={async () => { setEditing(false); await changed(); }} />}</>;
}

function SharedPlanSettingsDialog({ plan, close, saved }: { plan: SharedPlan; close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(plan.name); const [currency, setCurrency] = useState<Currency>(plan.currency);
  const [startDay, setStartDay] = useState(plan.budgetStartDay); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async () => {
    if (!name.trim() || startDay < 1 || startDay > 28) return setError("Enter a plan name and a budget start day from 1 to 28.");
    setBusy(true); try { await updateSharedPlanSettings(plan, { name: name.trim(), currency, budgetStartDay: startDay }); await saved(); }
    catch { setError("AWN couldn’t update shared plan settings."); setBusy(false); }
  };
  return <ModalDialog title="Shared plan settings" eyebrow="Household plan" close={close} className="settings-dialog"><label className="form-field">Shared plan name<input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} /></label><label className="form-field">Base currency<select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{currencies.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label className="form-field">Budget cycle start day<input type="number" min="1" max="28" value={startDay} onChange={(event) => setStartDay(Number(event.target.value))} /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogActions busy={busy} close={close} save={submit} label="Save settings" /></ModalDialog>;
}

function SharedBudget({ plan, budget, changed }: { plan: SharedPlan; budget: SharedBudgetSummary; changed: () => Promise<void> }) {
  const { formatMoney } = useUserPreferences(); const [editing, setEditing] = useState(false);
  if (budget.overallBudget === null) return <><section className="empty-panel"><span className="empty-panel-mark" aria-hidden="true"><AppIcon name="plan" /></span><h2>No shared monthly budget yet</h2><p>Create an overall Household spending limit. Category allocations can stay empty.</p><button className="app-button" type="button" onClick={() => setEditing(true)}>Create shared budget</button></section>{editing && <SharedBudgetDialog plan={plan} budget={budget} close={() => setEditing(false)} saved={async () => { setEditing(false); await changed(); }} />}</>;
  const allocated = budget.categories.reduce((total, item) => total + item.allocated, 0);
  const unallocated = budget.overallBudget - allocated; const remaining = budget.overallBudget - budget.totalSpent;
  return <><section className="content-panel action-card plan-budget-overview"><div className="plan-budget-overview-header"><div><p className="app-eyebrow">Shared monthly budget</p><h2>Household spending plan</h2></div><button className="text-button" type="button" onClick={() => setEditing(true)}>Edit shared budget <AppIcon name="arrow" /></button></div><div className="plan-budget-primary"><span>Remaining</span><strong className={remaining < 0 ? "negative" : undefined}>{formatMoney(Math.abs(remaining), plan.currency)} <small>{remaining < 0 ? "over" : "remaining"}</small></strong><p>of {formatMoney(budget.overallBudget, plan.currency)} shared budget</p></div><div className="plan-budget-overview-footer"><div className="plan-budget-supporting"><span>Household spent<strong>{formatMoney(budget.totalSpent, plan.currency)}</strong></span><span>Allocated<strong>{formatMoney(allocated, plan.currency)}</strong></span><span>Unallocated<strong>{formatMoney(unallocated, plan.currency)}</strong></span><span>Last plan update<strong>{budget.updatedBy ?? "Household"}</strong></span></div></div></section><section className="plan-budget-section"><div className="plan-budget-section-heading"><div><p className="app-eyebrow">Aggregate spending only</p><h2>Shared category budgets</h2></div></div>{budget.categories.length ? <div className="plan-category-list">{budget.categories.map((category) => <SharedCategoryRow key={category.category} item={category} currency={plan.currency} />)}</div> : <p className="section-note">No category allocations yet. Your overall shared budget is still active.</p>}</section>{editing && <SharedBudgetDialog plan={plan} budget={budget} close={() => setEditing(false)} saved={async () => { setEditing(false); await changed(); }} />}</>;
}

function SharedCategoryRow({ item, currency }: { item: SharedBudgetCategory; currency: Currency }) {
  const { formatMoney } = useUserPreferences(); const remaining = item.allocated - item.spent;
  return <article className={remaining < 0 ? "is-over-budget" : undefined}><div className="plan-category-heading"><strong>{item.category}</strong></div><div className="plan-category-values"><span>Budget<strong>{formatMoney(item.allocated, currency)}</strong></span><span>Household spent<strong>{formatMoney(item.spent, currency)}</strong></span><span>{remaining < 0 ? "Over" : "Remaining"}<strong className={remaining < 0 ? "negative" : "positive"}>{formatMoney(Math.abs(remaining), currency)}</strong></span></div></article>;
}

type AllocationDraft = { category: string; amount: number };
function SharedBudgetDialog({ plan, budget, close, saved }: { plan: SharedPlan; budget: SharedBudgetSummary; close: () => void; saved: () => Promise<void> }) {
  const [overall, setOverall] = useState(budget.overallBudget ?? 0); const [allocations, setAllocations] = useState<AllocationDraft[]>(budget.categories.filter((item) => item.allocated > 0).map((item) => ({ category: item.category, amount: item.allocated })));
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const { formatMoney } = useUserPreferences();
  const allocated = allocations.reduce((total, item) => total + item.amount, 0);
  const submit = async () => {
    const names = allocations.map((item) => item.category.trim().toLowerCase());
    if (overall <= 0) return setError("Enter an overall shared budget above zero.");
    if (allocations.some((item) => !item.category.trim() || item.amount <= 0) || new Set(names).size !== names.length) return setError("Every allocation needs a unique category and an amount above zero.");
    setBusy(true); try { await saveSharedBudget(plan, budget.periodKey, overall, allocations.map((item) => ({ category: item.category.trim(), amount: item.amount }))); await saved(); }
    catch { setError("AWN couldn’t save this shared budget."); setBusy(false); }
  };
  return <ModalDialog title="Manage shared budget" eyebrow="Household plan" close={close} className="manage-budget-dialog"><div className="manage-budget-scroll"><label className="form-field">Overall shared budget<MoneyInput value={overall} onValueChange={setOverall} /></label><div className="budget-manager-summary"><span>Overall budget<strong>{formatMoney(overall, plan.currency)}</strong></span><span>Allocated<strong>{formatMoney(allocated, plan.currency)}</strong></span><span>Unallocated<strong>{formatMoney(overall - allocated, plan.currency)}</strong></span></div><section className="budget-manager-categories"><div className="editor-heading"><div><p className="app-eyebrow">Optional allocations</p><h3>Shared categories</h3></div><button className="text-button" type="button" onClick={() => setAllocations((items) => [...items, { category: DEFAULT_CATEGORY_NAMES.find((name) => !items.some((item) => item.category === name)) ?? "", amount: 0 }])}><AppIcon name="plus" />Add category</button></div>{allocations.map((item, index) => <div className="shared-allocation-editor" key={`${index}-${item.category}`}><label className="form-field">Category<input list="awn-shared-categories" value={item.category} maxLength={60} onChange={(event) => setAllocations((items) => items.map((entry, position) => position === index ? { ...entry, category: event.target.value } : entry))} /></label><label className="form-field">Monthly limit<MoneyInput value={item.amount} onValueChange={(amount) => setAllocations((items) => items.map((entry, position) => position === index ? { ...entry, amount } : entry))} /></label><button className="text-button is-danger" type="button" onClick={() => setAllocations((items) => items.filter((_, position) => position !== index))}>Remove</button></div>)}<datalist id="awn-shared-categories">{DEFAULT_CATEGORY_NAMES.map((name) => <option value={name} key={name} />)}</datalist>{!allocations.length && <p className="section-note">Zero category allocations is valid.</p>}</section>{error && <p className="form-message is-error" role="alert">{error}</p>}</div><DialogActions busy={busy} close={close} save={submit} label="Save shared budget" /></ModalDialog>;
}

function SharedSavings({ plan, goals, changed }: { plan: SharedPlan; goals: SharedSavingsGoal[]; changed: () => Promise<void> }) {
  const [editing, setEditing] = useState<SharedSavingsGoal | null>(); const [deleting, setDeleting] = useState<SharedSavingsGoal>(); const [contributing, setContributing] = useState<SharedSavingsGoal>(); const { formatMoney, formatDate } = useUserPreferences();
  if (!goals.length) return <><section className="empty-panel"><span className="empty-panel-mark" aria-hidden="true"><AppIcon name="plan" /></span><h2>No shared savings goals yet</h2><p>Start with one goal that matters to your Household.</p><button className="app-button" type="button" onClick={() => setEditing(null)}>Add shared savings goal</button></section>{editing === null && <SharedGoalDialog plan={plan} close={() => setEditing(undefined)} saved={async () => { setEditing(undefined); await changed(); }} />}</>;
  return <>{editing !== undefined && <SharedGoalDialog plan={plan} existing={editing ?? undefined} close={() => setEditing(undefined)} saved={async () => { setEditing(undefined); await changed(); }} />}{contributing && <SharedContributionDialog plan={plan} goal={contributing} close={() => setContributing(undefined)} saved={async () => { setContributing(undefined); await changed(); }} />}{deleting && <ConfirmationDialog eyebrow="Shared savings" title={`Delete ${deleting.name}?`} description="This removes the shared goal and its intentional shared contributions. Private finances are unchanged." confirmLabel="Delete goal" close={() => setDeleting(undefined)} confirm={async () => { await deleteSharedSavingsGoal(plan, deleting.id); setDeleting(undefined); await changed(); }} />}<section className="goal-card-grid">{goals.map((goal) => <article className="goal-card-item" key={goal.id}><div className="goal-card-heading"><span className="goal-symbol">{goal.name.slice(0,1).toUpperCase()}</span><small>Updated by {goal.updatedBy}</small></div><h2>{goal.name}</h2><div className="goal-amount"><strong>{formatMoney(goal.saved, plan.currency)}</strong><span>of {formatMoney(goal.target, plan.currency)}</span></div><div className="goal-footer"><span>{goal.target ? Math.round(goal.saved / goal.target * 100) : 0}% complete</span><span>{formatMoney(Math.max(0, goal.target - goal.saved), plan.currency)} remaining</span></div>{goal.targetDate && <small>Target {formatDate(goal.targetDate)}</small>}{goal.latestContribution && <p className="shared-contribution-note">{formatMoney(goal.latestContribution.amount, plan.currency)} added by {goal.latestContribution.addedBy}</p>}<div className="transaction-actions goal-actions"><button className="text-button" type="button" onClick={() => setContributing(goal)}>Add contribution</button><button className="text-button" type="button" onClick={() => setEditing(goal)}>Edit</button><button className="text-button" type="button" onClick={() => setDeleting(goal)}>Delete</button></div></article>)}<button className="add-item-card" type="button" onClick={() => setEditing(null)}><span><AppIcon name="plus" /></span><strong>Add shared savings goal</strong></button></section></>;
}

function SharedGoalDialog({ plan, existing, close, saved }: { plan: SharedPlan; existing?: SharedSavingsGoal; close: () => void; saved: () => Promise<void> }) {
  const [name, setName] = useState(existing?.name ?? ""); const [target, setTarget] = useState(existing?.target ?? 0); const [contribution, setContribution] = useState(existing?.contribution ?? 0); const [targetMonth, setTargetMonth] = useState(existing?.targetDate?.slice(0,7) ?? ""); const [priority, setPriority] = useState(existing?.priority ?? 1); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async () => { if (!name.trim() || target <= 0 || contribution < 0) return setError("Add a goal name and a target above zero."); setBusy(true); try { await saveSharedSavingsGoal(plan, { id: existing?.id, name: name.trim(), target, contribution, targetDate: targetMonth ? `${targetMonth}-01` : undefined, priority }); await saved(); } catch { setError("AWN couldn’t save this shared goal."); setBusy(false); } };
  return <ModalDialog title={existing ? `Edit ${existing.name}` : "Add shared savings goal"} eyebrow="Household savings" close={close} className="savings-goal-dialog"><div className="savings-goal-fields"><label className="form-field savings-goal-field-wide">Goal name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><label className="form-field">Target amount<MoneyInput value={target} onValueChange={setTarget} /></label><label className="form-field">Planned monthly contribution<MoneyInput value={contribution} onValueChange={setContribution} /></label><label className="form-field">Target month / year (optional)<input type="month" value={targetMonth} onChange={(event) => setTargetMonth(event.target.value)} /></label><label className="form-field">Priority<select value={priority} onChange={(event) => setPriority(Number(event.target.value))}>{[1,2,3,4,5].map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogActions busy={busy} close={close} save={submit} label={existing ? "Save changes" : "Add goal"} /></ModalDialog>;
}

function SharedContributionDialog({ plan, goal, close, saved }: { plan: SharedPlan; goal: SharedSavingsGoal; close: () => void; saved: () => Promise<void> }) {
  const [amount, setAmount] = useState(0); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async () => { if (amount <= 0) return setError("Enter a contribution above zero."); setBusy(true); try { await addSharedSavingsContribution(plan, goal.id, amount); await saved(); } catch { setError("AWN couldn’t add this contribution."); setBusy(false); } };
  return <ModalDialog title={`Add to ${goal.name}`} eyebrow="Shared contribution" close={close} className="settings-dialog"><p>This is intentional shared planning data. No bank account, card, or private transaction is attached.</p><label className="form-field">Contribution amount<MoneyInput value={amount} onValueChange={setAmount} /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogActions busy={busy} close={close} save={submit} label="Add contribution" /></ModalDialog>;
}

function DialogActions({ busy, close, save, label }: { busy: boolean; close: () => void; save: () => void; label: string }) {
  return <div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="app-button" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : label}</button></div>;
}
