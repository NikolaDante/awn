"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FinancialItemForm, type FinancialItem, type FinancialItemKind } from "@/components/financial-item-form";
import { useFinancialProfile } from "@/components/financial-provider";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { SavingsGoalForm } from "@/components/savings-goal-form";
import { replaceBudgetSnapshot } from "@/lib/financial-budget";
import { formatMoney } from "@/lib/financial-calculations";
import { financialReferenceMonth } from "@/lib/financial-date";
import { countryCurrencies, suggestedCurrency } from "@/lib/financial-institutions";
import { hasLinkedAccountActivity, hasLinkedCardActivity, removalGuardMessage } from "@/lib/financial-reference-guards";
import { budgetAllocation, formatBudgetCycle, formatTargetMonth, normalizeBudgetStartDayInput, onboardingSteps, parseBudgetStartDayInput, removeOnboardingItem, requestedOnboardingStep, upsertOnboardingItem } from "@/lib/onboarding";
import { currencies, newLocalId, type Account, type CategoryBudget, type CreditCard, type Currency, type DebitCard, type FinancialProfile, type SavingsGoal } from "@/lib/financial-types";

const suggestedCategories = ["Housing", "Utilities", "Groceries", "Transport", "Dining", "Shopping", "Health", "Entertainment", "Family", "Other"];
type Errors = Record<string, string>;
type ItemEditor = { kind: FinancialItemKind; item?: FinancialItem };

export function OnboardingFlow() {
  const router = useRouter();
  const { profile, ready, issue, save } = useFinancialProfile();
  const [draft, setDraft] = useState<FinancialProfile | null>(null);
  const [budgetStartDayInput, setBudgetStartDayInput] = useState("1");
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const [itemEditor, setItemEditor] = useState<ItemEditor>();
  const [goalEditor, setGoalEditor] = useState<SavingsGoal | null>();
  const [categoryEditor, setCategoryEditor] = useState<CategoryBudget | null>();
  const [submitting, setSubmitting] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!ready || issue || draft) return;
    queueMicrotask(() => {
      const existing = profile ?? createProfileDefaults();
      const normalized = { ...existing, country: existing.country ?? "United Arab Emirates", budgetStartDay: existing.budgetStartDay ?? 1, debitCards: existing.debitCards ?? [] };
      const requested = requestedOnboardingStep(new URLSearchParams(window.location.search).get("step"), normalized.onboarding.currentStep);
      setDraft(normalized);
      setBudgetStartDayInput(String(normalized.budgetStartDay ?? 1));
      setStep(requested);
    });
  }, [ready, issue, profile, draft]);

  useEffect(() => {
    if (!draft) return;
    save({ ...draft, onboarding: { ...draft.onboarding, currentStep: step } });
  }, [draft, step, save]);

  useEffect(() => { heading.current?.focus(); }, [step]);

  if (issue) return <main className="onboarding-page"><section className="onboarding-card"><h1>Your saved plan needs attention.</h1><p>{issue}</p><Link className="app-button app-button-light" href="/dashboard">Return to dashboard</Link></section></main>;
  if (!ready || !draft) return <main className="onboarding-page"><p className="loading-copy">Loading your setup…</p></main>;

  const change = (patch: Partial<FinancialProfile>) => { setErrors({}); setDraft((current) => current ? { ...current, ...patch } : current); };
  const closeEditors = () => { setItemEditor(undefined); setGoalEditor(undefined); setCategoryEditor(undefined); };
  const go = (next: number) => { setErrors({}); setNotice(""); closeEditors(); setStep(Math.max(0, Math.min(6, next))); };
  const validateStep = () => {
    const next: Errors = {};
    if (step === 1) {
      if (!draft.country?.trim()) next.country = "Please choose a country.";
      const budgetStartDay = parseBudgetStartDayInput(budgetStartDayInput);
      if (!budgetStartDay) next.budgetStartDay = "Choose a budget start day from 1 to 28.";
      else if (draft.budgetStartDay !== budgetStartDay) setDraft((current) => current ? { ...current, budgetStartDay } : current);
    }
    if (step === 4 && !budgetAllocation(draft).total) next.monthlyBudget = "Enter a monthly budget above zero, or choose Skip for now.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };
  const continueStep = () => { if (validateStep()) go(step + 1); };
  const complete = () => {
    if (submitting) return;
    setSubmitting(true);
    const completed = { ...draft, onboarding: { currentStep: 6, completed: true } };
    if (save(completed)) router.replace("/dashboard"); else setSubmitting(false);
  };
  const editorOpen = Boolean(itemEditor || goalEditor !== undefined || categoryEditor !== undefined);

  return <main className="onboarding-page">
    <header className="onboarding-header"><Link className="app-wordmark onboarding-brand" href="/" aria-label="Return to AWN homepage"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></Link><span className="onboarding-security">Manual setup · no banking login required</span></header>
    <section className={`onboarding-card${step === 0 ? " is-welcome" : ""}`}>
      {step > 0 && <Progress step={step} />}
      <p className="app-eyebrow">{step === 0 ? "Welcome to AWN" : step === 6 ? "Review & start" : `Step ${step} of 6`}</p>
      <h1 tabIndex={-1} ref={heading}>{stepTitle(step)}</h1>
      <p className="onboarding-intro">{stepIntro(step)}</p>
      {notice && <p className="form-message is-warning" role="status">{notice}</p>}
      {step === 0 && <Welcome />}
      {step === 1 && <BasicsStep draft={draft} change={change} errors={errors} budgetStartDayInput={budgetStartDayInput} setBudgetStartDayInput={setBudgetStartDayInput} />}
      {step === 2 && <AccountsStep draft={draft} change={change} editor={itemEditor} setEditor={setItemEditor} notice={setNotice} />}
      {step === 3 && <HowAwnWorks />}
      {step === 4 && <BudgetStep draft={draft} change={change} error={errors.monthlyBudget} editor={categoryEditor} setEditor={setCategoryEditor} />}
      {step === 5 && <SavingsStep draft={draft} change={change} editor={goalEditor} setEditor={setGoalEditor} />}
      {step === 6 && <ReviewStep draft={draft} edit={go} />}
      {!editorOpen && <FlowActions step={step} draft={draft} submitting={submitting} back={() => go(step - 1)} continueStep={continueStep} skip={() => go(step + 1)} complete={complete} />}
    </section>
  </main>;
}

function createProfileDefaults() {
  const now = new Date().toISOString();
  return { version: 2, country: "United Arab Emirates", currency: "AED", budgetStartDay: 1, incomeSources: [], accounts: [], debitCards: [], creditCards: [], categoryBudgets: [], savingsGoals: [], onboarding: { currentStep: 0, completed: false }, createdAt: now, updatedAt: now, transactions: [] } satisfies FinancialProfile;
}

function stepTitle(step: number) {
  return ["Let’s set up your money", "Your basics", "Accounts, cards & cash", "How AWN works", "Your monthly budget", "What are you saving for?", "You’re ready to start"][step];
}

function stepIntro(step: number) {
  return ["A few simple details will help AWN build your financial overview.", "Set the context AWN will use for your plan.", "Add what you use today. Every item here is optional.", "Three simple ideas keep your financial picture accurate.", "Start with one overall spending amount, then allocate only the categories you want.", "Add a goal now, or come back to it later.", "Take a quick look before we build your dashboard."][step];
}

function Progress({ step }: { step: number }) {
  return <div className="onboarding-progress"><div className="progress-labels" aria-label={`Step ${step} of 6`}>{onboardingSteps.map((name, index) => <span className={index + 1 === step ? "is-active" : index + 1 < step ? "is-complete" : ""} key={name}>{name}</span>)}</div><div className="progress-track"><span style={{ width: `${step / 6 * 100}%` }} /></div><p>Step {step} of 6</p></div>;
}

function Welcome() {
  return <div className="welcome-content"><aside className="onboarding-info"><strong>Automatic bank linking is coming soon.</strong><p>For now, you can add your accounts and cards manually.</p></aside><div className="privacy-list"><strong>AWN never needs your:</strong><span>Full card number</span><span>PIN or CVV</span><span>Bank password</span><span>Banking login</span></div></div>;
}

function BasicsStep({ draft, change, errors, budgetStartDayInput, setBudgetStartDayInput }: { draft: FinancialProfile; change: (patch: Partial<FinancialProfile>) => void; errors: Errors; budgetStartDayInput: string; setBudgetStartDayInput: (value: string) => void }) {
  const countries = draft.country && !(draft.country in countryCurrencies) ? [draft.country, ...Object.keys(countryCurrencies)] : Object.keys(countryCurrencies);
  const hasAmounts = draft.accounts.some((item) => item.balance !== 0) || draft.creditCards.some((item) => item.limit || item.owed) || draft.categoryBudgets.some((item) => item.limit) || draft.savingsGoals.some((item) => item.target || item.saved);
  const updateCountry = (country: string) => change({ country, ...(!hasAmounts && suggestedCurrency(country) ? { currency: suggestedCurrency(country) as Currency } : {}) });
  const previewDay = parseBudgetStartDayInput(budgetStartDayInput);
  const updateBudgetStartDay = (value: string) => {
    const normalized = normalizeBudgetStartDayInput(value);
    if (normalized !== null) setBudgetStartDayInput(normalized);
  };
  const commitBudgetStartDay = () => {
    const value = parseBudgetStartDayInput(budgetStartDayInput);
    if (value) change({ budgetStartDay: value });
  };
  return <div className="step-content basics-grid"><FormField label="Country" error={errors.country}><select value={draft.country} onChange={(event) => updateCountry(event.target.value)}>{countries.map((country) => <option key={country}>{country}</option>)}</select></FormField><FormField label="Currency" hint={hasAmounts ? "Existing amounts keep their current base currency." : "Suggested from your country; you can change it."}><select value={draft.currency} disabled={hasAmounts} onChange={(event) => change({ currency: event.target.value as Currency })}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></FormField><FormField label="When would you like your monthly budget to start?" error={errors.budgetStartDay} hint="Choose a day from 1 to 28 so every month has a valid start date." className="field-wide"><input type="text" inputMode="numeric" pattern="[0-9]*" value={budgetStartDayInput} onChange={(event) => updateBudgetStartDay(event.target.value)} onBlur={commitBudgetStartDay} /></FormField><aside className="onboarding-info field-wide"><strong>Budget around your real month.</strong>{previewDay ? <p>Some people budget from the 1st. Others start on payday. With day {previewDay}, your current cycle is {formatBudgetCycle(previewDay)}.</p> : <p>Some people budget from the 1st. Others start on payday. Enter a day from 1 to 28 to preview your current cycle.</p>}</aside></div>;
}

function AccountsStep({ draft, change, editor, setEditor, notice }: { draft: FinancialProfile; change: (patch: Partial<FinancialProfile>) => void; editor?: ItemEditor; setEditor: (editor?: ItemEditor) => void; notice: (message: string) => void }) {
  const debitCards = draft.debitCards ?? [];
  const persist = (item: FinancialItem) => {
    if (editor?.kind === "account") change({ accounts: upsertOnboardingItem(draft.accounts, item as Account) });
    if (editor?.kind === "debit") change({ debitCards: upsertOnboardingItem(debitCards, item as DebitCard) });
    if (editor?.kind === "credit") change({ creditCards: upsertOnboardingItem(draft.creditCards, item as CreditCard) });
    setEditor(undefined);
  };
  const removeAccount = (account: Account) => {
    if (hasLinkedAccountActivity(draft, account.id)) return notice(removalGuardMessage("account"));
    if (debitCards.some((card) => card.linkedAccountId === account.id)) return notice("Remove or unlink this account’s debit card first.");
    change({ accounts: removeOnboardingItem(draft.accounts, account.id) });
  };
  const removeCredit = (card: CreditCard) => hasLinkedCardActivity(draft, card.id) ? notice(removalGuardMessage("credit-card")) : change({ creditCards: removeOnboardingItem(draft.creditCards, card.id) });
  if (editor) return <div className="step-content"><div className="inline-editor-heading"><p className="app-eyebrow">{editor.item ? "Edit" : "Add"} {editor.kind === "account" ? "account" : `${editor.kind} card`}</p><h2>{editor.item ? editor.item.name : "Add manual details"}</h2></div><FinancialItemForm kind={editor.kind} existing={editor.item} profile={draft} onCancel={() => setEditor(undefined)} onSave={persist} /></div>;
  return <div className="step-content"><div className="onboarding-add-grid"><button type="button" onClick={() => setEditor({ kind: "account" })}>+ Add account</button><button type="button" onClick={() => setEditor({ kind: "debit" })}>+ Add debit card</button><button type="button" onClick={() => setEditor({ kind: "credit" })}>+ Add credit card</button></div><aside className="onboarding-info"><strong>Automatic bank linking is coming soon.</strong><p>For now, add your accounts and cards manually. AWN only needs the details required to build your financial overview.</p></aside><SummaryGroup title="Accounts" empty="No accounts added yet.">{draft.accounts.map((account) => <SummaryRow key={account.id} title={account.name} detail={`${account.type} · ${formatMoney(account.balance, account.currency ?? draft.currency)}${account.lastFour ? ` · •••• ${account.lastFour}` : ""}`} edit={() => setEditor({ kind: "account", item: account })} remove={() => removeAccount(account)} />)}</SummaryGroup><SummaryGroup title="Debit cards" empty="No debit cards added yet.">{debitCards.map((card) => <SummaryRow key={card.id} title={card.name} detail={`${card.purpose || "Debit card"}${card.lastFour ? ` · •••• ${card.lastFour}` : ""}${card.linkedAccountId ? ` · Linked to ${draft.accounts.find((account) => account.id === card.linkedAccountId)?.name ?? "account"}` : " · Not linked"}`} edit={() => setEditor({ kind: "debit", item: card })} remove={() => change({ debitCards: removeOnboardingItem(debitCards, card.id) })} />)}</SummaryGroup><SummaryGroup title="Credit cards" empty="No credit cards added yet.">{draft.creditCards.map((card) => <SummaryRow key={card.id} title={card.name} detail={`${formatMoney(card.owed, card.currency ?? draft.currency)} owed${card.lastFour ? ` · •••• ${card.lastFour}` : ""}`} edit={() => setEditor({ kind: "credit", item: card })} remove={() => removeCredit(card)} />)}</SummaryGroup><div className="cash-concept"><span>Cash</span><p>You’ll also be able to track cash alongside your accounts and cards. Full cash-ledger behavior arrives in Phase 2.</p></div></div>;
}

function HowAwnWorks() {
  const concepts = [{ title: "Income", description: "Money coming into your finances.", examples: "Salary · Refund · Part-time income", note: "Income increases the balance where the money arrives." }, { title: "Expense", description: "Money you spend.", examples: "Rent · Groceries · Fuel", note: "Purchases count toward spending and budgets." }, { title: "Transfer", description: "Money moved between your own balances.", examples: "Account → Account · Account → Savings · Account → Credit Card", note: "Paying your credit card is a transfer, not another expense. The purchase was already counted when it happened." }];
  return <div className="step-content concept-grid">{concepts.map((concept, index) => <article key={concept.title}><span>0{index + 1}</span><h2>{concept.title}</h2><p>{concept.description}</p><small>{concept.examples}</small><strong>{concept.note}</strong></article>)}</div>;
}

function BudgetStep({ draft, change, error, editor, setEditor }: { draft: FinancialProfile; change: (patch: Partial<FinancialProfile>) => void; error?: string; editor: CategoryBudget | null | undefined; setEditor: (editor: CategoryBudget | null | undefined) => void }) {
  const month = financialReferenceMonth(draft);
  const allocation = budgetAllocation(draft, month);
  const updateCategories = (categories: CategoryBudget[]) => change({ categoryBudgets: replaceBudgetSnapshot(draft, month, categories).categoryBudgets });
  const persist = (category: CategoryBudget) => { updateCategories(upsertOnboardingItem(allocation.categories, category)); setEditor(undefined); };
  return <div className="step-content"><FormField label="What would you like to spend this month?" error={error} hint="This is your overall monthly spending budget."><MoneyInput value={allocation.total} onValueChange={(value) => change({ monthlyBudget: value > 0 ? value : undefined })} placeholder="0.00" /></FormField>{allocation.total > 0 && <><div className="allocation-summary"><span>Total monthly budget<strong>{formatMoney(allocation.total, draft.currency)}</strong></span><span>Allocated<strong>{formatMoney(allocation.allocated, draft.currency)}</strong></span><span>Unallocated<strong className={allocation.unallocated < 0 ? "negative" : ""}>{formatMoney(allocation.unallocated, draft.currency)}</strong></span></div>{allocation.unallocated < 0 && <p className="form-message is-warning" role="status">Category allocations exceed your overall budget by {formatMoney(Math.abs(allocation.unallocated), draft.currency)}.</p>}{editor !== undefined ? <CategoryBudgetForm existing={editor ?? undefined} categories={allocation.categories} onCancel={() => setEditor(undefined)} onSave={persist} /> : <><div className="editor-heading"><h2>Category budgets <small>Optional</small></h2><button type="button" className="text-button" onClick={() => setEditor(null)}>+ Add category</button></div><SummaryGroup empty="No category budgets added. Your overall budget is still saved.">{allocation.categories.map((category) => <SummaryRow key={category.id} title={category.name} detail={formatMoney(category.limit, draft.currency)} edit={() => setEditor(category)} remove={() => updateCategories(removeOnboardingItem(allocation.categories, category.id))} />)}</SummaryGroup></>}</>}</div>;
}

function CategoryBudgetForm({ existing, categories, onCancel, onSave }: { existing?: CategoryBudget; categories: CategoryBudget[]; onCancel: () => void; onSave: (category: CategoryBudget) => void }) {
  const [name, setName] = useState(existing?.name ?? suggestedCategories.find((suggestion) => !categories.some((category) => category.name === suggestion)) ?? "Other");
  const [limit, setLimit] = useState(existing?.limit ?? 0);
  const [errors, setErrors] = useState<Errors>({});
  const submit = () => {
    const next: Errors = {};
    if (!name.trim()) next.name = "Please choose a category.";
    if (categories.some((category) => category.id !== existing?.id && category.name.toLowerCase() === name.trim().toLowerCase())) next.name = "That category already has a budget.";
    if (limit <= 0) next.limit = "Monthly limit must be above zero.";
    setErrors(next);
    if (!Object.keys(next).length) onSave({ id: existing?.id ?? newLocalId(), name: name.trim(), limit, month: existing?.month });
  };
  return <div className="inline-form"><div className="field-row"><FormField label="Category" error={errors.name}><select value={name} onChange={(event) => setName(event.target.value)}>{suggestedCategories.map((category) => <option key={category}>{category}</option>)}</select></FormField><FormField label="Monthly limit" error={errors.limit}><MoneyInput value={limit} onValueChange={setLimit} placeholder="0.00" /></FormField></div><div className="confirm-dialog-actions"><button type="button" className="app-button app-button-secondary" onClick={onCancel}>Cancel</button><button type="button" className="app-button" onClick={submit}>{existing ? "Save changes" : "Add category"}</button></div></div>;
}

function SavingsStep({ draft, change, editor, setEditor }: { draft: FinancialProfile; change: (patch: Partial<FinancialProfile>) => void; editor: SavingsGoal | null | undefined; setEditor: (editor: SavingsGoal | null | undefined) => void }) {
  const persist = (goal: SavingsGoal) => { change({ savingsGoals: upsertOnboardingItem(draft.savingsGoals, goal) }); setEditor(undefined); };
  if (editor !== undefined) return <div className="step-content"><SavingsGoalForm profile={draft} existing={editor ?? undefined} onCancel={() => setEditor(undefined)} onSave={persist} /></div>;
  return <div className="step-content"><div className="editor-heading"><h2>Savings goals <small>Optional</small></h2><button type="button" className="text-button" onClick={() => setEditor(null)}>+ Add savings goal</button></div><SummaryGroup empty="No savings goals yet. You can add one whenever it feels useful.">{[...draft.savingsGoals].sort((a, b) => a.priority - b.priority).map((goal) => <SummaryRow key={goal.id} title={goal.name} detail={`${formatMoney(goal.saved, draft.currency)} of ${formatMoney(goal.target, draft.currency)} · ${formatMoney(goal.contribution, draft.currency)}/month · ${formatTargetMonth(goal.targetDate)} · Priority ${goal.priority}`} edit={() => setEditor(goal)} remove={() => change({ savingsGoals: removeOnboardingItem(draft.savingsGoals, goal.id) })} />)}</SummaryGroup></div>;
}

function ReviewStep({ draft, edit }: { draft: FinancialProfile; edit: (step: number) => void }) {
  const allocation = budgetAllocation(draft);
  const accountBalance = draft.accounts.reduce((total, account) => total + account.balance, 0);
  const totalSaved = draft.savingsGoals.reduce((total, goal) => total + goal.saved, 0);
  const totalTarget = draft.savingsGoals.reduce((total, goal) => total + goal.target, 0);
  const contributions = draft.savingsGoals.reduce((total, goal) => total + goal.contribution, 0);
  return <div className="step-content review-grid"><ReviewCard title="Money setup" action="Edit" edit={() => edit(2)}><span>Accounts<strong>{draft.accounts.length}</strong></span><span>Debit cards<strong>{draft.debitCards?.length ?? 0}</strong></span><span>Credit cards<strong>{draft.creditCards.length}</strong></span><span>Starting account balances<strong>{formatMoney(accountBalance, draft.currency)}</strong></span></ReviewCard><ReviewCard title="Budget cycle" action="Edit" edit={() => edit(1)}><span>Start day<strong>Day {draft.budgetStartDay ?? 1}</strong></span><span>Current cycle<strong>{formatBudgetCycle(draft.budgetStartDay ?? 1)}</strong></span></ReviewCard><ReviewCard title="Monthly plan" action={allocation.total ? "Edit" : "Add"} edit={() => edit(4)}>{allocation.total ? <><span>Overall budget<strong>{formatMoney(allocation.total, draft.currency)}</strong></span><span>Allocated<strong>{formatMoney(allocation.allocated, draft.currency)}</strong></span><span>Unallocated<strong>{formatMoney(allocation.unallocated, draft.currency)}</strong></span><span>Category budgets<strong>{allocation.categories.length}</strong></span></> : <p>No monthly budget yet.</p>}</ReviewCard><ReviewCard title="Savings goals" action={draft.savingsGoals.length ? "Edit" : "Add"} edit={() => edit(5)}>{draft.savingsGoals.length ? <><span>Goals<strong>{draft.savingsGoals.length}</strong></span><span>Currently saved<strong>{formatMoney(totalSaved, draft.currency)}</strong></span><span>Combined target<strong>{formatMoney(totalTarget, draft.currency)}</strong></span><span>Monthly contributions<strong>{formatMoney(contributions, draft.currency)}</strong></span></> : <p>No savings goals yet.</p>}</ReviewCard></div>;
}

function ReviewCard({ title, action, edit, children }: { title: string; action: string; edit: () => void; children: React.ReactNode }) {
  return <article className="review-card"><div><h2>{title}</h2><button type="button" className="text-button" onClick={edit}>{action}</button></div><div className="review-values">{children}</div></article>;
}

function SummaryGroup({ title, empty, children }: { title?: string; empty: string; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <section className="summary-group">{title && <h2>{title}</h2>}{hasChildren ? <div className="summary-rows">{children}</div> : <p className="empty-summary">{empty}</p>}</section>;
}

function SummaryRow({ title, detail, edit, remove }: { title: string; detail: string; edit: () => void; remove: () => void }) {
  return <article className="summary-row"><div><strong>{title}</strong><small>{detail}</small></div><div className="summary-row-actions"><button type="button" className="text-button summary-row-action" onClick={edit}>Edit</button><button type="button" className="text-button is-danger summary-row-action" onClick={remove}>Remove</button></div></article>;
}

function FlowActions({ step, draft, submitting, back, continueStep, skip, complete }: { step: number; draft: FinancialProfile; submitting: boolean; back: () => void; continueStep: () => void; skip: () => void; complete: () => void }) {
  const optionalEmpty = step === 2 && !draft.accounts.length && !(draft.debitCards?.length) && !draft.creditCards.length || step === 4 && !budgetAllocation(draft).total || step === 5 && !draft.savingsGoals.length;
  return <div className="onboarding-actions">{step > 0 && <button type="button" className="app-button app-button-secondary" onClick={back}>Back</button>}{optionalEmpty && <button type="button" className="text-button" onClick={skip}>Skip for now</button>}{step === 0 ? <button type="button" className="app-button" onClick={continueStep}>Get started</button> : step < 6 ? <button type="button" className="app-button" onClick={continueStep}>Continue</button> : <button type="button" className="app-button" disabled={submitting} onClick={complete}>{submitting ? "Building your dashboard…" : "Finish setup"}</button>}</div>;
}
