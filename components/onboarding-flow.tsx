"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CategoryBudgetForm } from "@/components/category-budget-form";
import { AppIcon } from "@/components/app-icons";
import { BudgetGuide, type BudgetGuideResult } from "@/components/budget-guide";
import { FinancialItemForm, type FinancialItem, type FinancialItemKind } from "@/components/financial-item-form";
import { useFinancialProfile } from "@/components/financial-provider";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { ConfirmationDialog } from "@/components/modal-dialog";
import { SavingsGoalForm } from "@/components/savings-goal-form";
import { replaceBudgetSnapshot, replaceOverallBudgetSnapshot, replaceManagedBudgetSnapshot } from "@/lib/financial-budget";
import { formatMoney } from "@/lib/financial-calculations";
import { financialReferenceMonth } from "@/lib/financial-date";
import { countryCurrencies, suggestedCurrency } from "@/lib/financial-institutions";
import { hasLinkedAccountActivity, hasLinkedCardActivity, removalGuardMessage } from "@/lib/financial-reference-guards";
import { budgetAllocation, formatBudgetCycle, formatTargetMonth, normalizeBudgetStartDayInput, onboardingSteps, parseBudgetStartDayInput, removeOnboardingItem, requestedOnboardingStep, upsertOnboardingItem } from "@/lib/onboarding";
import { currencies, newLocalId, type Account, type CategoryBudget, type CreditCard, type Currency, type DebitCard, type FinancialProfile, type SavingsGoal } from "@/lib/financial-types";

type Errors = Record<string, string>;
type ItemEditor = { kind: FinancialItemKind; item?: FinancialItem };
type PendingRemoval = { title: string; description: string; confirm: () => void };
type RequestRemoval = (removal: PendingRemoval) => void;

export function OnboardingFlow() {
  const router = useRouter();
  const { profile, ready, issue, retry, save } = useFinancialProfile();
  const [draft, setDraft] = useState<FinancialProfile | null>(null);
  const [budgetStartDayInput, setBudgetStartDayInput] = useState("1");
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState("");
  const [itemEditor, setItemEditor] = useState<ItemEditor>();
  const [goalEditor, setGoalEditor] = useState<SavingsGoal | null>();
  const [categoryEditor, setCategoryEditor] = useState<CategoryBudget | null>();
  const [budgetMode, setBudgetMode] = useState<"choice" | "manual" | "guide">("choice");
  const [submitting, setSubmitting] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval>();
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!ready || issue || draft) return;
    queueMicrotask(() => {
      const existing = profile ?? createProfileDefaults();
      const normalized = { ...existing, country: existing.country ?? "United Arab Emirates", budgetStartDay: existing.budgetStartDay ?? 1, debitCards: existing.debitCards ?? [] };
      const requested = requestedOnboardingStep(new URLSearchParams(window.location.search).get("step"), normalized.onboarding.currentStep);
      setDraft(normalized);
      setBudgetStartDayInput(String(normalized.budgetStartDay ?? 1));
      setBudgetMode(budgetAllocation(normalized).total > 0 ? "manual" : "choice");
      setStep(requested);
    });
  }, [ready, issue, profile, draft]);

  useEffect(() => {
    if (!draft) return;
    void save({ ...draft, onboarding: { ...draft.onboarding, currentStep: step } });
  }, [draft, step, save]);

  useEffect(() => { heading.current?.focus(); }, [step]);

  if (issue) return <main className="onboarding-page"><section className="onboarding-card"><h1>We couldn’t load your financial data.</h1><p>{issue}</p><button className="app-button app-button-light" type="button" onClick={retry}>Try again</button></section></main>;
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
  const complete = async () => {
    if (submitting) return;
    setSubmitting(true);
    const completed = { ...draft, onboarding: { currentStep: 6, completed: true } };
    if (await save(completed)) router.replace("/dashboard"); else setSubmitting(false);
  };
  const editorOpen = Boolean(itemEditor || goalEditor !== undefined || categoryEditor !== undefined || pendingRemoval || step === 4 && budgetMode === "guide");

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
      {step === 2 && <AccountsStep draft={draft} change={change} editor={itemEditor} setEditor={setItemEditor} notice={setNotice} requestRemoval={setPendingRemoval} />}
      {step === 3 && <HowAwnWorks />}
      {step === 4 && <BudgetStep draft={draft} change={change} error={errors.monthlyBudget} editor={categoryEditor} setEditor={setCategoryEditor} mode={budgetMode} setMode={setBudgetMode} />}
      {step === 5 && <SavingsStep draft={draft} change={change} editor={goalEditor} setEditor={setGoalEditor} requestRemoval={setPendingRemoval} />}
      {step === 6 && <ReviewStep draft={draft} edit={go} />}
      {!editorOpen && <FlowActions step={step} draft={draft} submitting={submitting} back={() => go(step - 1)} continueStep={continueStep} skip={() => go(step + 1)} complete={complete} />}
    </section>
    {pendingRemoval && <ConfirmationDialog eyebrow="Setup item" title={pendingRemoval.title} description={pendingRemoval.description} confirmLabel="Remove item" close={() => setPendingRemoval(undefined)} confirm={() => { pendingRemoval.confirm(); setPendingRemoval(undefined); }} />}
  </main>;
}

function createProfileDefaults() {
  const now = new Date().toISOString();
  return { version: 2, country: "United Arab Emirates", currency: "AED", budgetStartDay: 1, incomeSources: [], accounts: [], debitCards: [], creditCards: [], categoryBudgets: [], monthlyBudgets: [], savingsGoals: [], onboarding: { currentStep: 0, completed: false }, createdAt: now, updatedAt: now, transactions: [] } satisfies FinancialProfile;
}

function stepTitle(step: number) {
  return ["Let’s set up your money", "Your basics", "Accounts, cards & cash", "How AWN works", "Your monthly budget", "What are you saving for?", "You’re ready to start"][step];
}

function stepIntro(step: number) {
  return ["A few simple details will help AWN build your financial overview.", "Set the context AWN will use for your plan.", "Add what you use today. Every item here is optional.", "Three simple ideas keep your financial picture accurate.", "Build the spending plan yourself or start with AWN’s editable budget guide.", "Add a goal now, or come back to it later.", "Take a quick look before we build your dashboard."][step];
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
  return <div className="step-content basics-grid"><FormField label="Country" error={errors.country}><select value={draft.country} onChange={(event) => updateCountry(event.target.value)}>{countries.map((country) => <option key={country}>{country}</option>)}</select></FormField><FormField label="Currency" hint={hasAmounts ? "Existing amounts keep their current base currency." : "Suggested from your country; you can change it."}><select value={draft.currency} disabled={hasAmounts} onChange={(event) => change({ currency: event.target.value as Currency })}>{currencies.map((currency) => <option key={currency}>{currency}</option>)}</select></FormField><FormField label="What is your usual monthly income?" hint="This helps AWN suggest a starting budget. You can change it later." className="field-wide"><MoneyInput value={draft.usualMonthlyIncome ?? 0} onValueChange={(usualMonthlyIncome) => change({ usualMonthlyIncome: usualMonthlyIncome || undefined })} placeholder="Optional" /></FormField><FormField label="When would you like your monthly budget to start?" error={errors.budgetStartDay} hint="Choose a day from 1 to 28 so every month has a valid start date." className="field-wide"><input type="text" inputMode="numeric" pattern="[0-9]*" value={budgetStartDayInput} onChange={(event) => updateBudgetStartDay(event.target.value)} onBlur={commitBudgetStartDay} /></FormField><aside className="onboarding-info field-wide"><strong>Budget around your real month.</strong>{previewDay ? <p>Some people budget from the 1st. Others start on payday. With day {previewDay}, your current cycle is {formatBudgetCycle(previewDay)}.</p> : <p>Some people budget from the 1st. Others start on payday. Enter a day from 1 to 28 to preview your current cycle.</p>}</aside></div>;
}

function AccountsStep({ draft, change, editor, setEditor, notice, requestRemoval }: { draft: FinancialProfile; change: (patch: Partial<FinancialProfile>) => void; editor?: ItemEditor; setEditor: (editor?: ItemEditor) => void; notice: (message: string) => void; requestRemoval: RequestRemoval }) {
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
    requestRemoval({ title: `Remove ${account.name}?`, description: "This removes the saved account details and starting balance from your setup.", confirm: () => change({ accounts: removeOnboardingItem(draft.accounts, account.id) }) });
  };
  const removeDebit = (card: DebitCard) => requestRemoval({ title: `Remove ${card.name}?`, description: "This removes the saved debit card details from your setup.", confirm: () => change({ debitCards: removeOnboardingItem(debitCards, card.id) }) });
  const removeCredit = (card: CreditCard) => hasLinkedCardActivity(draft, card.id) ? notice(removalGuardMessage("credit-card")) : requestRemoval({ title: `Remove ${card.name}?`, description: "This removes the saved credit card details and opening balance from your setup.", confirm: () => change({ creditCards: removeOnboardingItem(draft.creditCards, card.id) }) });
  if (editor) return <div className="step-content"><div className="inline-editor-heading"><p className="app-eyebrow">{editor.item ? "Edit" : "Add"} {editor.kind === "account" ? "account" : `${editor.kind} card`}</p><h2>{editor.item ? editor.item.name : "Add manual details"}</h2></div><FinancialItemForm kind={editor.kind} existing={editor.item} profile={draft} onCancel={() => setEditor(undefined)} onSave={persist} /></div>;
  return <div className="step-content"><div className="onboarding-add-grid"><button type="button" onClick={() => setEditor({ kind: "account" })}>+ Add account</button><button type="button" onClick={() => setEditor({ kind: "debit" })}>+ Add debit card</button><button type="button" onClick={() => setEditor({ kind: "credit" })}>+ Add credit card</button></div><aside className="onboarding-info"><strong>Automatic bank linking is coming soon.</strong><p>For now, add your accounts and cards manually. AWN only needs the details required to build your financial overview.</p></aside><SummaryGroup title="Accounts" empty="No accounts added yet.">{draft.accounts.map((account) => <SummaryRow key={account.id} title={account.name} detail={`${account.type} · ${formatMoney(account.balance, account.currency ?? draft.currency)}${account.lastFour ? ` · •••• ${account.lastFour}` : ""}`} edit={() => setEditor({ kind: "account", item: account })} remove={() => removeAccount(account)} />)}</SummaryGroup><SummaryGroup title="Debit cards" empty="No debit cards added yet.">{debitCards.map((card) => <SummaryRow key={card.id} title={card.name} detail={`${card.purpose || "Debit card"}${card.lastFour ? ` · •••• ${card.lastFour}` : ""}${card.linkedAccountId ? ` · Linked to ${draft.accounts.find((account) => account.id === card.linkedAccountId)?.name ?? "account"}` : " · Not linked"}`} edit={() => setEditor({ kind: "debit", item: card })} remove={() => removeDebit(card)} />)}</SummaryGroup><SummaryGroup title="Credit cards" empty="No credit cards added yet.">{draft.creditCards.map((card) => <SummaryRow key={card.id} title={card.name} detail={`${formatMoney(card.owed, card.currency ?? draft.currency)} owed${card.lastFour ? ` · •••• ${card.lastFour}` : ""}`} edit={() => setEditor({ kind: "credit", item: card })} remove={() => removeCredit(card)} />)}</SummaryGroup><div className="cash-concept"><span>Cash</span><p>Cash starts at {formatMoney(draft.cashBalance ?? 0, draft.currency)}. You can edit its balance later in Cards &amp; Accounts and use it in transactions.</p></div></div>;
}

function HowAwnWorks() {
  const concepts = [{ title: "Income", description: "Money coming into your finances.", examples: "Salary · Refund · Part-time income", note: "Income increases the balance where the money arrives." }, { title: "Expense", description: "Money you spend.", examples: "Rent · Groceries · Fuel", note: "Purchases count toward spending and budgets." }, { title: "Transfer", description: "Money moved between your own balances.", examples: "Account → Account · Account → Savings · Account → Credit Card", note: "Paying your credit card is a transfer, not another expense. The purchase was already counted when it happened." }];
  return <div className="step-content concept-grid">{concepts.map((concept, index) => <article key={concept.title}><span>0{index + 1}</span><h2>{concept.title}</h2><p>{concept.description}</p><small>{concept.examples}</small><strong>{concept.note}</strong></article>)}</div>;
}

function BudgetStep({ draft, change, error, editor, setEditor, mode, setMode }: { draft: FinancialProfile; change: (patch: Partial<FinancialProfile>) => void; error?: string; editor: CategoryBudget | null | undefined; setEditor: (editor: CategoryBudget | null | undefined) => void; mode: "choice" | "manual" | "guide"; setMode: (mode: "choice" | "manual" | "guide") => void }) {
  const month = financialReferenceMonth(draft);
  const allocation = budgetAllocation(draft, month);
  const updateCategories = (categories: CategoryBudget[]) => change({ categoryBudgets: replaceBudgetSnapshot(draft, month, categories).categoryBudgets });
  const updateOverallBudget = (value: number) => { const next = replaceOverallBudgetSnapshot(draft, month, value); change({ monthlyBudget: next.monthlyBudget, monthlyBudgets: next.monthlyBudgets }); };
  const persist = (category: CategoryBudget) => { updateCategories(upsertOnboardingItem(allocation.categories, category)); setEditor(undefined); };
  const useGuide = (result: BudgetGuideResult) => {
    const categories = result.categories.map((item) => ({ id: newLocalId(), name: item.category, limit: item.amount, month }));
    const next = replaceManagedBudgetSnapshot(draft, month, result.overall, categories);
    const savingsGoals = next.savingsGoals.map((goal) => ({ ...goal, contribution: result.goals.find((item) => item.id === goal.id)?.amount ?? goal.contribution }));
    change({ monthlyBudget: next.monthlyBudget, monthlyBudgets: next.monthlyBudgets, categoryBudgets: next.categoryBudgets, savingsGoals, monthlySavingsGuidance: result.savingsGuidance });
    setMode("manual");
  };
  if (mode === "choice") return <div className="step-content"><div className="budget-path-choice onboarding-budget-path"><button type="button" onClick={() => setMode("manual")}><AppIcon name="plan" /><strong>Build it myself</strong><span>Set an overall spending limit and optional category allocations.</span></button><button type="button" onClick={() => setMode("guide")}><AppIcon name="insights" /><strong>Help me plan</strong><span>Use the same editable planning guide available in Plan.</span></button></div></div>;
  if (mode === "guide") return <div className="step-content onboarding-budget-guide"><BudgetGuide currency={draft.currency} goals={draft.savingsGoals} initialAmount={draft.usualMonthlyIncome ?? 0} back={() => setMode(allocation.total > 0 ? "manual" : "choice")} cancel={() => setMode("choice")} accept={useGuide} /></div>;
  return <div className="step-content"><button className="app-button app-button-secondary budget-guide-launch" type="button" onClick={() => setMode("guide")}>Use budget guide</button><FormField label="Overall monthly spending budget" error={error} hint="This is your canonical spending limit. Category allocations remain optional."><MoneyInput value={allocation.total} onValueChange={updateOverallBudget} placeholder="0.00" /></FormField>{allocation.total > 0 && <><div className="allocation-summary"><span>Total monthly budget<strong>{formatMoney(allocation.total, draft.currency)}</strong></span><span>Allocated<strong>{formatMoney(allocation.allocated, draft.currency)}</strong></span><span>Unallocated<strong className={allocation.unallocated < 0 ? "negative" : ""}>{formatMoney(allocation.unallocated, draft.currency)}</strong></span></div>{allocation.unallocated < 0 && <p className="form-message is-warning" role="status">Category allocations exceed your overall budget by {formatMoney(Math.abs(allocation.unallocated), draft.currency)}.</p>}{editor !== undefined ? <CategoryBudgetForm existing={editor ?? undefined} categories={allocation.categories} profile={draft} onCancel={() => setEditor(undefined)} onSave={persist} /> : <><div className="editor-heading"><h2>Category budgets <small>Optional</small></h2><button type="button" className="text-button" onClick={() => setEditor(null)}>+ Add category</button></div><SummaryGroup empty="No category budgets added. Your overall budget is still saved.">{allocation.categories.map((category) => <SummaryRow key={category.id} title={category.name} detail={formatMoney(category.limit, draft.currency)} edit={() => setEditor(category)} remove={() => updateCategories(removeOnboardingItem(allocation.categories, category.id))} />)}</SummaryGroup></>}</>}</div>;
}

function SavingsStep({ draft, change, editor, setEditor, requestRemoval }: { draft: FinancialProfile; change: (patch: Partial<FinancialProfile>) => void; editor: SavingsGoal | null | undefined; setEditor: (editor: SavingsGoal | null | undefined) => void; requestRemoval: RequestRemoval }) {
  const persist = (goal: SavingsGoal) => { change({ savingsGoals: upsertOnboardingItem(draft.savingsGoals, goal) }); setEditor(undefined); };
  if (editor !== undefined) return <div className="step-content"><SavingsGoalForm profile={draft} existing={editor ?? undefined} onCancel={() => setEditor(undefined)} onSave={persist} /></div>;
  return <div className="step-content"><div className="editor-heading"><h2>Savings goals <small>Optional</small></h2><button type="button" className="text-button" onClick={() => setEditor(null)}>+ Add savings goal</button></div><SummaryGroup empty="No savings goals yet. You can add one whenever it feels useful.">{[...draft.savingsGoals].sort((a, b) => a.priority - b.priority).map((goal) => <SummaryRow key={goal.id} title={goal.name} detail={`${formatMoney(goal.saved, draft.currency)} of ${formatMoney(goal.target, draft.currency)} · ${formatMoney(goal.contribution, draft.currency)}/month · ${formatTargetMonth(goal.targetDate)} · Priority ${goal.priority}`} edit={() => setEditor(goal)} remove={() => requestRemoval({ title: `Remove ${goal.name}?`, description: "This removes the saved goal and its planning progress from your setup.", confirm: () => change({ savingsGoals: removeOnboardingItem(draft.savingsGoals, goal.id) }) })} />)}</SummaryGroup></div>;
}

function ReviewStep({ draft, edit }: { draft: FinancialProfile; edit: (step: number) => void }) {
  const allocation = budgetAllocation(draft);
  const accountBalance = draft.accounts.reduce((total, account) => total + account.balance, 0);
  const totalSaved = draft.savingsGoals.reduce((total, goal) => total + goal.saved, 0);
  const totalTarget = draft.savingsGoals.reduce((total, goal) => total + goal.target, 0);
  const contributions = draft.savingsGoals.reduce((total, goal) => total + goal.contribution, 0);
  return <div className="step-content review-grid"><ReviewCard title="Money setup" action="Edit" edit={() => edit(2)}><span>Accounts<strong>{draft.accounts.length}</strong></span><span>Debit cards<strong>{draft.debitCards?.length ?? 0}</strong></span><span>Credit cards<strong>{draft.creditCards.length}</strong></span><span>Starting account balances<strong>{formatMoney(accountBalance, draft.currency)}</strong></span></ReviewCard><ReviewCard title="Planning basics" action="Edit" edit={() => edit(1)}>{draft.usualMonthlyIncome ? <span>Usual monthly income<strong>{formatMoney(draft.usualMonthlyIncome, draft.currency)}</strong></span> : <span>Usual monthly income<strong>Not set</strong></span>}<span>Budget start day<strong>Day {draft.budgetStartDay ?? 1}</strong></span><span>Current cycle<strong>{formatBudgetCycle(draft.budgetStartDay ?? 1)}</strong></span></ReviewCard><ReviewCard title="Monthly plan" action={allocation.total ? "Edit" : "Add"} edit={() => edit(4)}>{allocation.total ? <><span>Monthly spending budget<strong>{formatMoney(allocation.total, draft.currency)}</strong></span><span>Savings guidance <small>Planning only</small><strong>{formatMoney(draft.monthlySavingsGuidance ?? 0, draft.currency)}</strong></span><span>Allocated<strong>{formatMoney(allocation.allocated, draft.currency)}</strong></span><span>Unallocated<strong>{formatMoney(allocation.unallocated, draft.currency)}</strong></span><span>Category budgets<strong>{allocation.categories.length}</strong></span></> : <p>No monthly budget yet.</p>}</ReviewCard><ReviewCard title="Savings goals" action={draft.savingsGoals.length ? "Edit" : "Add"} edit={() => edit(5)}>{draft.savingsGoals.length ? <><span>Goals<strong>{draft.savingsGoals.length}</strong></span><span>Currently saved<strong>{formatMoney(totalSaved, draft.currency)}</strong></span><span>Combined target<strong>{formatMoney(totalTarget, draft.currency)}</strong></span><span>Monthly contributions<strong>{formatMoney(contributions, draft.currency)}</strong></span></> : <p>No savings goals yet.</p>}</ReviewCard></div>;
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
