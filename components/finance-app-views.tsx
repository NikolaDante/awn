"use client";

import Link from "next/link";
import { useState } from "react";
import { AppIcon } from "@/components/app-icons";
import { AnimatedMoney } from "@/components/animated-money";
import { AssetCreationWorkflow } from "@/components/cards-accounts-view";
import { useFinancialProfile } from "@/components/financial-provider";
import { ManageMonthlyBudgetDialog, type ManageBudgetOptions } from "@/components/manage-monthly-budget-dialog";
import { MoneyInput } from "@/components/money-input";
import { ConfirmationDialog, ModalDialog } from "@/components/modal-dialog";
import { SavingsGoalForm } from "@/components/savings-goal-form";
import { SharedPlanView } from "@/components/shared-plan-view";
import { AddTransactionButton, AllTransactionsDialog, TransactionDeleteDialog, TransactionForm } from "@/components/transactions-ui";
import { useModalDialog } from "@/components/use-modal-dialog";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { budgetCategoriesForMonth, budgetSummary, categoryBudgetPosition, dashboardBudgetHeroState, hasOverallBudget, monthlyBudgetPosition, overallBudgetForMonth } from "@/lib/financial-budget";
import { calculateActualSummary } from "@/lib/financial-calculations";
import { budgetPeriodForDate, budgetPeriodForKey, dateInBudgetPeriod, financialReferenceDate, financialReferenceMonth, financialReferencePeriod } from "@/lib/financial-date";
import { profileSavingsGoalStatus } from "@/lib/financial-goal-status";
import { deleteSavingsGoal, savingsGoalTotals, upsertSavingsGoal } from "@/lib/financial-savings";
import { transactionHistoryLabel } from "@/lib/financial-reference-guards";
import { type PlanAction, type PlanTab } from "@/lib/financial-navigation";
import { type CategoryBudget, type FinancialProfile, type SavingsGoal, type Transaction } from "@/lib/financial-types";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

type MonthSummary = {
  month: string;
  income: number;
  spent: number;
  budget: number | null;
  highestExpense: number;
  topCategory: string;
  categorySpending: Record<string, number>;
  transactionCount: number;
  categoryBudgets: CategoryBudget[];
  transactions: Transaction[];
};

function useProfileState() {
  const state = useFinancialProfile();
  if (!state.ready) return { ...state, content: <p className="loading-copy">Loading your finances...</p> };
  if (state.issue) return { ...state, content: <EmptyPanel title="Your saved plan needs attention" text={state.issue} /> };
  if (!state.profile?.onboarding.completed) return { ...state, content: <EmptyPanel title="Let’s set up your starting point" text="Add your income, accounts, budget, and goals to unlock your financial overview." action="Continue setup" href="/onboarding" /> };
  return { ...state, content: null };
}

function realMonths(profile: FinancialProfile): MonthSummary[] {
  const months = [...new Set(profile.transactions.map((item) => budgetPeriodForDate(profile.budgetStartDay, item.date).key))].sort().reverse();
  return months.map((month) => {
    const period = budgetPeriodForKey(profile.budgetStartDay, month);
    const categoryBudgets = budgetCategoriesForMonth(profile, month);
    const budget = hasOverallBudget(profile, month) ? overallBudgetForMonth(profile, month) ?? null : null;
    const actual = calculateActualSummary(profile, month);
    const transactions = profile.transactions.filter((item) => dateInBudgetPeriod(item.date, period));
    const expenses = transactions.filter((item): item is Extract<Transaction, { type: "expense" }> => item.type === "expense");
    const categories = Object.entries(actual.categorySpending).sort((a, b) => b[1] - a[1]);
    return { month, income: actual.income, spent: actual.expenses, budget, highestExpense: Math.max(0, ...expenses.map((item) => item.amount)), topCategory: categories[0]?.[0] ?? "No spending yet", categorySpending: actual.categorySpending, transactionCount: transactions.length, categoryBudgets, transactions };
  });
}

function historyFor(profile: FinancialProfile) {
  return realMonths(profile).filter((item) => budgetPeriodForKey(profile.budgetStartDay, item.month).end < financialReferencePeriod(profile).start);
}

function Status({ value, label }: { value: "good" | "watch" | "over" | "neutral"; label: string }) {
  return <span className={`status-pill is-${value}`}>{label}</span>;
}

function Progress({ value, tone = "good", label }: { value: number; tone?: "good" | "watch" | "over"; label: string }) {
  return <div className="progress-wrap"><div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)}><span className={`is-${tone}`} style={{ width: `${clampPercent(value)}%` }} /></div></div>;
}

function EmptyPanel({ title, text, action, href, onAction }: { title: string; text: string; action?: string; href?: string; onAction?: () => void }) {
  return <section className="empty-panel"><span className="empty-panel-mark" aria-hidden="true">+</span><h2>{title}</h2><p>{text}</p>{action && href && <Link className="app-button" href={href}>{action}</Link>}{action && onAction && <button className="app-button" type="button" onClick={onAction}>{action}</button>}</section>;
}

function TransactionRow({ item, profile }: { item: Transaction; profile: FinancialProfile }) {
  const { formatMoney, formatDate } = useUserPreferences();
  const title = item.note || transactionHistoryLabel(item);
  const detail = item.type === "expense" ? item.category : item.type === "income" ? "Income" : item.type === "transfer" ? "Transfer" : "Credit card";
  const accountName = (id: string | undefined) => id ? profile.accounts.find((account) => account.id === id)?.name ?? "Former account" : "Unlinked";
  const cardName = (id: string | undefined) => id ? profile.creditCards.find((card) => card.id === id)?.name ?? "Former credit card" : "Unlinked";
  const debitName = (id: string | undefined) => id ? profile.debitCards?.find((card) => card.id === id)?.name ?? "Former debit card" : "Unlinked";
  const endpoint = (kind: string | undefined, id: string | undefined) => kind === "cash" ? "Cash" : kind === "account" ? accountName(id) : kind === "debit" ? debitName(id) : kind === "credit" ? cardName(id) : "Unlinked";
  const accountLabel = item.type === "income" ? `To ${item.destinationKind ? endpoint(item.destinationKind, item.destinationId) : accountName(item.destinationAccountId)}` : item.type === "expense" ? item.sourceKind ? endpoint(item.sourceKind, item.sourceId) : item.cardId ? cardName(item.cardId) : accountName(item.accountId) : item.type === "transfer" ? `${endpoint(item.sourceKind ?? "account", item.sourceId ?? item.sourceAccountId)} to ${endpoint(item.destinationKind ?? "account", item.destinationId ?? item.destinationAccountId)}` : `${accountName(item.payingAccountId)} to ${cardName(item.receivingCardId)}`;
  const dateLabel = formatDate(item.date);
  const sign = item.type === "income" ? "+" : item.type === "expense" ? "-" : "";
  return <article className="activity-row"><span className={`activity-icon is-${item.type}`}><AppIcon name={item.type === "income" ? "income" : item.type === "expense" ? "expense" : "transfer"} /></span><div><strong>{title}</strong><small><span>{detail}</span><span>{accountLabel}</span><span>{dateLabel}</span></small></div><b className={item.type === "income" ? "positive" : item.type === "expense" ? "negative" : "neutral"}>{sign}{formatMoney(item.amount, profile.currency)}</b></article>;
}

export function DashboardView() {
  const state = useProfileState();
  const { formatMoney } = useUserPreferences();
  const [transactionsOpen, setTransactionsOpen] = useState(false);
  const [assetWorkflowOpen, setAssetWorkflowOpen] = useState(false);
  const [budgetWorkflowOpen, setBudgetWorkflowOpen] = useState(false);
  const [goalWorkflowOpen, setGoalWorkflowOpen] = useState(false);
  if (state.content || !state.profile) return state.content;
  const profile = state.profile;
  const month = financialReferenceMonth(profile);
  const actual = calculateActualSummary(profile, month);
  const period = financialReferencePeriod(profile);
  const available = sum(Object.values(actual.accounts).filter((amount) => amount > 0)) + actual.cash;
  const owed = sum(Object.values(actual.cards));
  const budget = budgetSummary(profile, month, actual.expenses);
  const budgetHero = dashboardBudgetHeroState(budget);
  const { saved: totalSaved, target: totalTarget } = savingsGoalTotals(profile);
  const goals = [...profile.savingsGoals].sort((a, b) => a.priority - b.priority);
  const recent = [...profile.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const monthTransactions = profile.transactions.filter((item) => dateInBudgetPeriod(item.date, period)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  return <>{transactionsOpen && <AllTransactionsDialog close={() => setTransactionsOpen(false)} transactions={monthTransactions} profile={profile} />}
    {assetWorkflowOpen && <AssetCreationWorkflow close={() => setAssetWorkflowOpen(false)} />}
    {budgetWorkflowOpen && <ManageMonthlyBudgetDialog profile={profile} close={() => setBudgetWorkflowOpen(false)} />}
    {goalWorkflowOpen && <SavingsGoalDialog profile={profile} close={() => setGoalWorkflowOpen(false)} />}
    <section className="hero-balance"><div><p className="app-eyebrow">Money available</p><h2><AnimatedMoney value={available} currency={profile.currency} /></h2><p>Accounts plus cash you own. Credit debt stays separate.</p></div><div className="hero-balance-side"><span className={budgetHero.statusLabel === null ? "is-no-budget" : undefined}>{budgetHero.label}<strong className={budget.kind === "over" ? "negative" : ""}>{budgetHero.valueLabel ?? formatMoney(budgetHero.amount ?? 0, profile.currency)}</strong></span>{budgetHero.statusLabel && <Status value={budget.tone} label={budgetHero.statusLabel} />}</div></section>
    <section className="metric-grid" aria-label="Budget-period summary">
      <Metric label="Income this period" value={formatMoney(actual.income, profile.currency)} detail={period.label} tone="green" icon="income" />
      <Metric label="Spent this period" value={formatMoney(actual.expenses, profile.currency)} detail={period.label} tone="coral" icon="expense" />
      <Metric label="Financial position" value={formatMoney(actual.currentPosition, profile.currency)} detail="Opening position + income − expenses" icon="transactions" />
      <Metric label="Credit card balance" value={formatMoney(owed, profile.currency)} detail="Total currently owed" tone="blue" icon="wallet" />
    </section>
    <section className="dashboard-grid">
      <div className="content-panel savings-overview"><div className="panel-heading"><div><p className="app-eyebrow">Savings</p><h2>Your goals</h2></div><Link className="panel-text-action" href="/plan?tab=savings">View goals <AppIcon name="arrow" /></Link></div>{goals.length ? <><div className="savings-total"><strong>{formatMoney(totalSaved, profile.currency)}</strong><span>saved of {formatMoney(totalTarget, profile.currency)}</span></div><Progress value={totalTarget ? totalSaved / totalTarget * 100 : 0} label="Total savings progress" /><div className="dashboard-goal-list">{goals.map((goal) => { const percent = Math.round(goal.target ? goal.saved / goal.target * 100 : 0); return <div className="dashboard-goal-row" key={goal.id}><span><strong>{goal.name}</strong><small>{formatMoney(goal.saved, profile.currency)} of {formatMoney(goal.target, profile.currency)}</small></span><b>{percent}%</b></div>; })}</div></> : <EmptyPanel title="No savings goals yet" text="Start with one goal that matters to you." action="Add savings goal" onAction={() => setGoalWorkflowOpen(true)} />}</div>
      <div className="content-panel"><div className="panel-heading"><div><p className="app-eyebrow">Recent activity</p><h2>Latest transactions</h2></div><button className="text-button panel-text-action" type="button" onClick={() => setTransactionsOpen(true)}>View all <AppIcon name="arrow" /></button></div>{recent.length ? <div className="activity-list">{recent.map((item) => <TransactionRow key={item.id} item={item} profile={profile} />)}</div> : <EmptyPanel title="No transactions yet" text="Add your first income or expense to start your monthly picture." />}</div>
    </section>
    <section className="quick-actions"><div><p className="app-eyebrow">Quick actions</p><h2>What would you like to do?</h2></div><div className="quick-action-list"><AddTransactionButton /><button className="quick-action" type="button" onClick={() => setAssetWorkflowOpen(true)}><AppIcon name="wallet" />Add account/card</button><button className="quick-action" type="button" onClick={() => setBudgetWorkflowOpen(true)}><AppIcon name="plan" />{budget.kind === "none" ? "Add budget" : "Edit budget"}</button><button className="quick-action" type="button" onClick={() => setGoalWorkflowOpen(true)}><AppIcon name="plus" />Add savings goal</button></div></section>
  </>;
}

function Metric({ label, value, detail, tone = "default", icon, valueClassName }: { label: string; value: string; detail: string; tone?: "default" | "green" | "coral" | "blue"; icon?: "income" | "expense" | "transactions" | "wallet"; valueClassName?: string }) {
  return <article className={`metric-card is-${tone}`}><span className="metric-heading">{icon && <AppIcon name={icon} />}{label}</span><strong className={valueClassName}>{value}</strong><small>{detail}</small></article>;
}

export function HistoryView() {
  const state = useProfileState();
  if (state.content || !state.profile) return state.content;
  const profile = state.profile;
  const months = historyFor(profile);
  return <><div className="section-intro"><p>Look back at each month without turning your finances into a spreadsheet.</p></div>{months.length ? <div className="month-card-list">{months.map((month, index) => <MonthCard key={month.month} month={month} profile={profile} open={index === 0} />)}</div> : <EmptyPanel title="No previous months yet" text="Completed months will appear here as you keep recording your finances." />}</>;
}

function MonthCard({ month, profile, open = false }: { month: MonthSummary; profile: FinancialProfile; open?: boolean }) {
  const { formatMoney } = useUserPreferences();
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [transactionsDialogOpen, setTransactionsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction>();
  const [deleting, setDeleting] = useState<Transaction>();
  const budgetPosition = monthlyBudgetPosition(month.budget, month.spent);
  const budgetTone = budgetPosition.tone === "over" ? "negative" : budgetPosition.tone === "neutral" ? "neutral" : "positive";
  const budgetCopy = budgetPosition.difference === null ? "Not recorded" : formatMoney(budgetPosition.difference, profile.currency);
  const historyPeriod = budgetPeriodForKey(profile.budgetStartDay, month.month);
  const days = Math.round((Date.parse(`${historyPeriod.end}T12:00:00Z`) - Date.parse(`${historyPeriod.start}T12:00:00Z`)) / 86400000) + 1;
  const highestExpense = [...month.transactions].filter((item) => item.type === "expense").sort((a, b) => b.amount - a.amount)[0];
  const highestExpenseTitle = highestExpense ? transactionTitle(highestExpense) : "No expenses recorded";
  const transactionCopy = `${month.transactionCount} ${month.transactionCount === 1 ? "transaction" : "transactions"}`;
  const topCategories = historyPreviewCategories(month);
  const categoryOverCount = historyCategories(month).filter((category) => { const position = categoryBudgetPosition(category.limit, category.spent); return position.kind === "over" || position.kind === "unbudgeted"; }).length;
  const showCategoryWarning = categoryOverCount > 0;
  return <>
    {categoryDialogOpen && <HistoryCategoriesDialog month={month} profile={profile} close={() => setCategoryDialogOpen(false)} />}
    {editing && <TransactionForm editing={editing} close={() => setEditing(undefined)} />}
    {transactionsDialogOpen && <AllTransactionsDialog transactions={month.transactions} profile={profile} readOnly={false} close={() => setTransactionsDialogOpen(false)} edit={(item) => { setTransactionsDialogOpen(false); setEditing(item); }} remove={setDeleting} />}
    {deleting && <TransactionDeleteDialog transaction={deleting} close={() => setDeleting(undefined)} />}
    <details className="month-card history-month-card" open={open}><summary><div><p className="app-eyebrow">Budget-period summary</p><h2>{budgetPeriodForKey(profile.budgetStartDay, month.month).label}</h2></div><div className="month-card-metrics"><span>Income<strong>{formatMoney(month.income, profile.currency)}</strong></span><span>Spent<strong>{formatMoney(month.spent, profile.currency)}</strong></span><span>Net<strong className={month.income - month.spent >= 0 ? "positive" : "negative"}>{month.income - month.spent >= 0 ? "+" : ""}{formatMoney(month.income - month.spent, profile.currency)}</strong></span><span>{budgetPosition.metricLabel}<strong className={budgetTone}>{budgetCopy}</strong></span></div><div className="history-status-stack"><Status value={budgetPosition.tone} label={budgetPosition.statusLabel} />{showCategoryWarning && <span className="status-pill is-watch category-over-warning">{categoryOverCount} {categoryOverCount === 1 ? "category" : "categories"} over</span>}</div><span className="details-toggle" aria-hidden="true">+</span></summary>
      <div className="month-detail-grid"><Metric label="Highest expense" value={formatMoney(month.highestExpense, profile.currency)} detail={highestExpenseTitle} /><Metric label="Daily average" value={formatMoney(Math.round(month.spent / days), profile.currency)} detail={`Average across ${transactionCopy}`} /><Metric label="Top category" value={month.topCategory} detail="Highest total spending" /><Metric label="Budget difference" value={budgetPosition.difference === null ? "Not recorded" : formatMoney(budgetPosition.difference, profile.currency)} detail={budgetPosition.statusLabel} valueClassName={budgetPosition.tone === "over" ? "negative" : budgetPosition.tone === "good" ? "positive" : "neutral"} /></div>
      {topCategories.length > 0 && <div className="category-mini-list">{topCategories.map((category) => { const overBudget = category.spent > category.limit; return <div className={overBudget ? "is-over-budget" : undefined} key={category.id}><span>{category.name}</span><Progress value={month.spent ? category.spent / month.spent * 100 : 0} tone={overBudget ? "over" : "good"} label={`${category.name} share of spending`} /><strong className={overBudget ? "negative" : undefined}>{overBudget ? "-" : ""}{formatMoney(category.spent, profile.currency)}</strong></div>; })}</div>}
      <div className="history-detail-actions"><button className="app-button app-button-secondary" type="button" onClick={() => setCategoryDialogOpen(true)}>View all category expenses</button><button className="app-button" type="button" onClick={() => setTransactionsDialogOpen(true)}>View all transactions</button></div>
    </details>
  </>;
}

function transactionTitle(item: Transaction) {
  return item.note || transactionHistoryLabel(item);
}

function historyCategories(month: MonthSummary) {
  const budgets = new Map(month.categoryBudgets.map((category) => [category.name, category]));
  return [...new Set([...month.categoryBudgets.map((category) => category.name), ...Object.keys(month.categorySpending)])]
    .map((name) => ({ id: budgets.get(name)?.id ?? `unbudgeted-${name}`, name, limit: budgets.get(name)?.limit ?? 0, spent: month.categorySpending[name] ?? 0 }))
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
}

function historyPreviewCategories(month: MonthSummary) {
  const categories = historyCategories(month).filter((category) => category.spent > 0);
  const overBudget = categories.filter((category) => category.spent > category.limit).sort((a, b) => (b.spent - b.limit) - (a.spent - a.limit) || b.spent - a.spent);
  const withinBudget = categories.filter((category) => category.spent <= category.limit).sort((a, b) => b.spent - a.spent);
  return [...overBudget, ...withinBudget].slice(0, 4);
}

function HistoryCategoriesDialog({ month, profile, close }: { month: MonthSummary; profile: FinancialProfile; close: () => void }) {
  const { formatMoney } = useUserPreferences();
  const categories = historyCategories(month);
  const dialogRef = useModalDialog<HTMLElement>(close);
  return <div className="dialog-backdrop history-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }} onWheel={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }} onTouchMove={(event) => { if (event.target === event.currentTarget) event.preventDefault(); }}><section className="confirm-dialog history-category-dialog" role="dialog" aria-modal="true" aria-labelledby={`history-categories-${month.month}`} tabIndex={-1} ref={dialogRef}><div className="repeat-card-heading history-dialog-header"><div><p className="app-eyebrow">{budgetPeriodForKey(profile.budgetStartDay, month.month).label}</p><h2 id={`history-categories-${month.month}`}>All category expenses</h2></div><button className="icon-button" onClick={close} type="button" aria-label="Close category expenses"><AppIcon name="close" /></button></div><div className="history-category-list history-dialog-scroll" tabIndex={0}>{categories.map((category) => { const position = categoryBudgetPosition(category.limit, category.spent); return <article key={category.id}><div className="history-category-heading"><strong>{category.name}</strong><Status value={position.tone} label={position.statusLabel} /></div><div className="history-category-values"><span>Budget<strong>{formatMoney(category.limit, profile.currency)}</strong></span><span>Spent<strong>{formatMoney(category.spent, profile.currency)}</strong></span><span>{position.differenceLabel}<strong className={position.kind === "over" || position.kind === "unbudgeted" ? "negative" : position.kind === "no-budget" ? "neutral" : "positive"}>{formatMoney(position.difference, profile.currency)}</strong></span></div>{position.percent !== null && <Progress value={position.percent} tone={position.tone === "neutral" ? "good" : position.tone} label={`${category.name} budget used`} />}</article>; })}</div></section></div>;
}

function AddItemCard({ label, href, onClick }: { label: string; href?: string; onClick?: () => void }) {
  const content = <><span><AppIcon name="plus" /></span><strong>{label}</strong></>;
  return href ? <Link href={href} className="add-item-card">{content}</Link> : <button type="button" className="add-item-card" onClick={onClick}>{content}</button>;
}

type PlannedCategory = CategoryBudget & { spent: number };

export function PlanView({ initialTab = "budgets", initialAction }: { initialTab?: PlanTab; initialAction?: PlanAction }) {
  const state = useProfileState();
  const [tab, setTab] = useState<PlanTab>(initialTab);
  const [scope, setScope] = useState<"private" | "household">("private");
  const [manageBudget, setManageBudget] = useState<ManageBudgetOptions | undefined>(initialAction === "edit-budget" ? {} : undefined);
  const [addingGoal, setAddingGoal] = useState(initialAction === "add-goal");
  const [allCategoriesOpen, setAllCategoriesOpen] = useState(false);
  if (state.content || !state.profile) return state.content;
  const profile = state.profile;
  const activeMonth = financialReferenceMonth(profile);
  const categoryBudgets = budgetCategoriesForMonth(profile, activeMonth);
  const actual = calculateActualSummary(profile, activeMonth);
  const categorySpending = actual.categorySpending;
  const spent = actual.expenses;
  const monthlyBudget = overallBudgetForMonth(profile, activeMonth) ?? 0;
  const hasMonthlyBudget = hasOverallBudget(profile, activeMonth);
  const budgetMap = new Map(categoryBudgets.map((category) => [category.name, category]));
  const categories = [...new Set([...categoryBudgets.map((category) => category.name), ...Object.keys(categorySpending)])].map((name) => ({ id: budgetMap.get(name)?.id ?? `unbudgeted-${name}`, name, limit: budgetMap.get(name)?.limit ?? 0, month: activeMonth, spent: categorySpending[name] ?? 0 }));
  return <><div className="plan-controls"><div className="segmented-control plan-tabs" role="tablist" aria-label="Plan section"><button role="tab" aria-selected={tab === "budgets"} onClick={() => setTab("budgets")}>Monthly budgets</button><button role="tab" aria-selected={tab === "savings"} onClick={() => setTab("savings")}>Savings goals</button></div><div className="segmented-control plan-scope-tabs" role="tablist" aria-label="Plan privacy"><button role="tab" aria-selected={scope === "private"} onClick={() => setScope("private")}>Private</button><button role="tab" aria-selected={scope === "household"} onClick={() => setScope("household")}>Household</button></div></div>
    {scope === "household" ? <SharedPlanView tab={tab} /> : tab === "budgets" ? <MonthlyBudgetPlanner month={activeMonth} profile={profile} categories={categories} allocatedCount={categoryBudgets.length} budget={monthlyBudget} spent={spent} hasBudget={hasMonthlyBudget} manage={(options) => setManageBudget(options ?? {})} viewAll={() => setAllCategoriesOpen(true)} /> : <SavingsGoals profile={profile} goals={profile.savingsGoals} add={() => setAddingGoal(true)} />}
    {scope === "private" && manageBudget !== undefined && <ManageMonthlyBudgetDialog profile={profile} options={manageBudget} close={() => setManageBudget(undefined)} />}
    {scope === "private" && allCategoriesOpen && categoryBudgets.length > 0 && <AllPlanCategoriesDialog categories={categories} profile={profile} edit={(category) => { setAllCategoriesOpen(false); setManageBudget({ categoryId: category.id, categoryName: category.name, focusCategories: true }); }} close={() => setAllCategoriesOpen(false)} />}
    {scope === "private" && addingGoal && <SavingsGoalDialog profile={profile} close={() => setAddingGoal(false)} />}
  </>;
}

function orderedPlanCategories(categories: PlannedCategory[]) {
  return [...categories].sort((a, b) => Number(b.spent > b.limit) - Number(a.spent > a.limit) || b.spent - a.spent || a.name.localeCompare(b.name));
}

function MonthlyBudgetPlanner({ month, profile, categories, allocatedCount, budget, spent, hasBudget, manage, viewAll }: { month: string; profile: FinancialProfile; categories: PlannedCategory[]; allocatedCount: number; budget: number; spent: number; hasBudget: boolean; manage: (options?: ManageBudgetOptions) => void; viewAll: () => void }) {
  const { formatMoney } = useUserPreferences();
  if (!hasBudget) return <EmptyPanel title="No monthly budget yet" text="Create an overall spending limit for this budget period. Category allocations can stay empty." action="Create budget" onAction={() => manage()} />;
  const summary = budgetSummary(profile, month, spent);
  const remaining = summary.remaining ?? 0;
  const percent = summary.percent ?? 0;
  const ordered = orderedPlanCategories(categories);
  const attention = ordered.filter((category) => category.spent > category.limit);
  const inlineCategories = ordered.filter((category) => category.spent <= category.limit).slice(0, Math.max(0, 4 - attention.length));
  const status = summary.tone === "neutral" ? "good" : summary.tone;
  return <div className="plan-budget-workspace">
    <section className="content-panel action-card plan-budget-overview">
      <div className="plan-budget-overview-header"><div><p className="app-eyebrow">{budgetPeriodForKey(profile.budgetStartDay, month).label}</p><h2>Monthly spending plan</h2></div><button className="text-button" type="button" onClick={() => manage()}>Edit monthly budget <AppIcon name="arrow" /></button></div>
      <div className="plan-budget-primary"><span>Remaining</span><strong className={remaining < 0 ? "negative" : undefined}>{formatMoney(Math.abs(remaining), profile.currency)} <small>{remaining < 0 ? "over" : "remaining"}</small></strong><p>of {formatMoney(budget, profile.currency)} monthly budget</p></div>
      <Progress value={percent} tone={status} label={`${budgetPeriodForKey(profile.budgetStartDay, month).label} budget used`} />
      <div className="plan-budget-overview-footer"><strong>{Math.round(percent)}% used</strong><div className="plan-budget-supporting"><span>Spent<strong>{formatMoney(spent, profile.currency)}</strong></span><span>Allocated<strong>{formatMoney(summary.allocated, profile.currency)}</strong></span><span>Unallocated<strong className={(summary.unallocated ?? 0) < 0 ? "negative" : undefined}>{formatMoney(Math.abs(summary.unallocated ?? 0), profile.currency)}{(summary.unallocated ?? 0) < 0 ? " over" : ""}</strong></span><span>Status<Status value={status} label={summary.statusLabel} /></span></div></div>
    </section>
    {attention.length > 0 && <section className="plan-budget-section"><div className="plan-budget-section-heading"><div><p className="app-eyebrow">Needs attention</p><h2>Categories over budget</h2></div></div><div className="plan-category-list is-attention">{attention.map((category) => <PlanCategoryRow key={category.id} category={category} profile={profile} edit={() => manage({ categoryId: category.id, categoryName: category.name, focusCategories: true })} />)}</div></section>}
    <section className="plan-budget-section"><div className="plan-budget-section-heading"><div><p className="app-eyebrow">Category budgets</p><h2>Your spending room</h2></div>{allocatedCount > 0 ? <button className="text-button" type="button" onClick={viewAll}>View all category budgets <AppIcon name="arrow" /></button> : <button className="text-button" type="button" onClick={() => manage({ focusCategories: true })}>Add category budgets <AppIcon name="arrow" /></button>}</div>{inlineCategories.length ? <div className="plan-category-list">{inlineCategories.map((category) => <PlanCategoryRow key={category.id} category={category} profile={profile} edit={() => manage({ categoryId: category.id, categoryName: category.name, focusCategories: true })} />)}</div> : <p className="section-note">No category allocations yet. Your overall budget is still active.</p>}</section>
  </div>;
}

function PlanCategoryRow({ category, profile, edit }: { category: PlannedCategory; profile: FinancialProfile; edit?: () => void }) {
  const { formatMoney } = useUserPreferences();
  const position = categoryBudgetPosition(category.limit, category.spent);
  return <article className={position.kind === "over" || position.kind === "unbudgeted" ? "is-over-budget" : undefined}><div className="plan-category-heading"><strong>{category.name}</strong><div><Status value={position.tone} label={position.statusLabel} />{edit && <button className="text-button" type="button" onClick={edit}>Edit</button>}</div></div><div className="plan-category-values"><span>Budget<strong>{formatMoney(category.limit, profile.currency)}</strong></span><span>Spent<strong>{formatMoney(category.spent, profile.currency)}</strong></span><span>{position.differenceLabel}<strong className={position.kind === "over" || position.kind === "unbudgeted" ? "negative" : position.kind === "no-budget" ? "neutral" : "positive"}>{formatMoney(position.difference, profile.currency)}</strong></span><b>{position.percent === null ? position.statusLabel : `${Math.round(position.percent)}%`}</b></div>{position.percent !== null && <Progress value={position.percent} tone={position.tone === "neutral" ? "good" : position.tone} label={`${category.name} budget used`} />}</article>;
}

function AllPlanCategoriesDialog({ categories, profile, edit, close }: { categories: PlannedCategory[]; profile: FinancialProfile; edit?: (category: CategoryBudget) => void; close: () => void }) {
  return <ModalDialog title="All category budgets" eyebrow="Monthly plan" close={close} closeLabel="Close category budgets" className="plan-categories-dialog"><div className="plan-category-list plan-category-dialog-list history-dialog-scroll" tabIndex={0}>{orderedPlanCategories(categories).map((category) => <PlanCategoryRow key={category.id} category={category} profile={profile} edit={edit ? () => edit(category) : undefined} />)}</div></ModalDialog>;
}

function SavingsGoals({ profile, goals, add }: { profile: FinancialProfile; goals: SavingsGoal[]; add: () => void }) {
  const { formatMoney, formatDate } = useUserPreferences();
  const [editing, setEditing] = useState<SavingsGoal>();
  const [progress, setProgress] = useState<SavingsGoal>();
  const [deleting, setDeleting] = useState<SavingsGoal>();
  if (!goals.length) return <EmptyPanel title="No savings goals yet" text="Start with one goal that matters to you." action="Add savings goal" onAction={add} />;
  return <>{editing && <SavingsGoalDialog profile={profile} existing={editing} close={() => setEditing(undefined)} />}{progress && <SavingsProgressDialog goal={progress} close={() => setProgress(undefined)} />}{deleting && <SavingsGoalDeleteDialog goal={deleting} close={() => setDeleting(undefined)} />}
    <section className="goal-card-grid">{goals.map((goal) => { const percent = goal.target ? goal.saved / goal.target * 100 : 0; const remaining = Math.max(0, goal.target - goal.saved); const status = profileSavingsGoalStatus(profile, goal, financialReferenceDate(profile)); return <article className="goal-card-item" key={goal.id}><div className="goal-card-heading"><span className="goal-symbol">{goal.name.slice(0, 1).toUpperCase()}</span><Status value={status.tone} label={status.label} /></div><h2>{goal.name}</h2><div className="goal-amount"><strong>{formatMoney(goal.saved, profile.currency)}</strong><span>of {formatMoney(goal.target, profile.currency)}</span></div><Progress value={percent} tone={status.kind === "behind" ? "watch" : "good"} label={`${goal.name} savings progress`} /><div className="goal-footer"><span>{Math.round(percent)}% complete</span><span>{formatMoney(remaining, profile.currency)} remaining</span></div>{goal.targetDate && <small>Target {formatDate(goal.targetDate)}</small>}<div className="transaction-actions goal-actions"><button className="text-button" type="button" onClick={() => setProgress(goal)}>Update progress</button><button className="text-button" type="button" onClick={() => setEditing(goal)}>Edit</button><button className="text-button" type="button" onClick={() => setDeleting(goal)}>Delete</button></div></article>; })}<AddItemCard label="Add savings goal" onClick={add} /></section></>;
}

function SavingsGoalDialog({ profile, existing, close }: { profile: FinancialProfile; existing?: SavingsGoal; close: () => void }) {
  const { save } = useFinancialProfile();
  const persist = async (goal: SavingsGoal) => { const saved = await save(upsertSavingsGoal(profile, goal)); if (saved) close(); return saved; };
  return <ModalDialog title={existing ? `Edit ${existing.name}` : "Add savings goal"} eyebrow="Savings goals" close={close} closeLabel="Close savings goal form" className="savings-goal-dialog"><SavingsGoalForm profile={profile} existing={existing} onCancel={close} onSave={persist} /></ModalDialog>;
}

function SavingsGoalDeleteDialog({ goal, close }: { goal: SavingsGoal; close: () => void }) {
  const { profile, save } = useFinancialProfile();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const remove = async () => { setBusy(true); if (await save(deleteSavingsGoal(profile, goal.id))) { close(); return; } setError("We couldn’t delete this goal. Check your connection and try again."); setBusy(false); };
  return <ConfirmationDialog eyebrow="Savings goals" title={`Delete ${goal.name}?`} description="This removes only the goal and its planning progress. Accounts, cash, and transactions will not change." confirmLabel="Delete goal" close={close} confirm={remove} error={error} busy={busy} />;
}

function SavingsProgressDialog({ goal, close }: { goal: SavingsGoal; close: () => void }) {
  const { profile, save } = useFinancialProfile();
  const { formatMoney } = useUserPreferences();
  const [saved, setSaved] = useState(goal.saved);
  const [error, setError] = useState("");
  if (!profile) return null;
  const submit = async () => { if (saved < 0 || saved > goal.target) return setError(`Enter an amount between ${formatMoney(0, profile.currency)} and ${formatMoney(goal.target, profile.currency)}.`); if (await save({ ...profile, savingsGoals: profile.savingsGoals.map((item) => item.id === goal.id ? { ...item, saved } : item) })) close(); };
  return <ModalDialog title={`Update ${goal.name}`} eyebrow="Savings goals" close={close} closeLabel="Close savings progress" className="savings-editor"><p>Change the amount saved toward this goal.</p><label className="form-field">Amount saved<MoneyInput value={saved} onValueChange={(value) => { setSaved(value); setError(""); }} aria-invalid={!!error} /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<div className="confirm-dialog-actions"><button type="button" className="app-button app-button-secondary" onClick={close}>Cancel</button><button type="button" className="app-button" onClick={submit}>Save progress</button></div></ModalDialog>;
}

export function InsightsView() {
  const state = useProfileState();
  const { formatMoney } = useUserPreferences();
  if (state.content || !state.profile) return state.content;
  const profile = state.profile;
  const month = financialReferenceMonth(profile);
  const categoryBudgets = budgetCategoriesForMonth(profile, month);
  const actual = calculateActualSummary(profile, month);
  const categorySpending = actual.categorySpending;
  const spent = actual.expenses;
  const budget = budgetSummary(profile, month, spent);
  const budgetMap = new Map(categoryBudgets.map((category) => [category.name, category]));
  const categories = [...new Set([...categoryBudgets.map((category) => category.name), ...Object.keys(categorySpending)])].map((name) => { const category = budgetMap.get(name); const spentForCategory = categorySpending[name] ?? 0; return { id: category?.id ?? `unbudgeted-${name}`, name, limit: category?.limit ?? 0, month, spent: spentForCategory, remaining: (category?.limit ?? 0) - spentForCategory }; });
  const orderedCategories = [...categories].sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name));
  const overBudget = categories.filter((category) => category.remaining < 0).sort((a, b) => a.remaining - b.remaining);
  const mostRoom = [...categories].filter((category) => category.limit > 0).sort((a, b) => b.remaining - a.remaining)[0];
  const topCategory = orderedCategories.find((category) => category.spent > 0);
  const secondCategory = orderedCategories[1];
  const concentration = spent ? Math.round(((topCategory?.spent ?? 0) + (secondCategory?.spent ?? 0)) / spent * 100) : 0;
  const goals = profile.savingsGoals;
  const goalsByProgress = [...goals].sort((a, b) => (b.target ? b.saved / b.target : 0) - (a.target ? a.saved / a.target : 0));
  const closestGoal = goalsByProgress[0];
  const behindGoal = profile.savingsGoals.find((goal) => profileSavingsGoalStatus(profile, goal, financialReferenceDate(profile)).kind === "behind");
  const totalSaved = sum(goals.map((goal) => goal.saved));
  const totalTarget = sum(goals.map((goal) => goal.target));
  const owed = sum(Object.values(actual.cards));
  const hasExpenses = spent > 0;
  const summary = budget.kind === "none" && !hasExpenses && !goals.length ? "Add a budget and a few transactions to unlock meaningful insights." : budget.kind === "none" ? "Add a monthly budget to compare your spending with a real plan." : !hasExpenses ? "Your budget is ready. Add a few expenses to reveal useful patterns." : budget.kind === "over" ? `You are ${formatMoney(Math.abs(budget.remaining ?? 0), profile.currency)} over budget this month.` : overBudget.length ? `You are under budget overall, but ${overBudget.length} ${overBudget.length === 1 ? "category needs" : "categories need"} attention.` : "Your recorded spending is within the overall monthly budget.";
  const strongestProgress = closestGoal?.target ? Math.round(closestGoal.saved / closestGoal.target * 100) : 0;
  const pressure = overBudget[0];
  const signals = [
    { icon: "plan" as const, eyebrow: "Budget health", title: budget.kind === "none" ? "No monthly budget yet" : budget.statusLabel, detail: budget.kind === "none" ? "Create a budget before AWN evaluates budget health" : `${formatMoney(Math.abs(budget.remaining ?? 0), profile.currency)} ${budget.kind === "over" ? "over" : "remaining"}`, tone: budget.tone },
    { icon: "expense" as const, eyebrow: "Spending pressure", title: !hasExpenses ? "No expenses recorded yet" : pressure ? `${pressure.name} is ${formatMoney(Math.abs(pressure.remaining), profile.currency)} over` : `${topCategory?.name} leads this month`, detail: !hasExpenses ? "Add a few expenses to reveal category pressure" : pressure ? "This is the clearest category pressure" : `${formatMoney(topCategory?.spent ?? 0, profile.currency)} recorded`, tone: pressure ? "over" as const : "neutral" as const },
    { icon: "insights" as const, eyebrow: "Savings progress", title: closestGoal ? `${closestGoal.name} is ${strongestProgress}% complete` : "No savings goal yet", detail: closestGoal ? `${formatMoney(Math.max(0, closestGoal.target - closestGoal.saved), profile.currency)} left to reach it` : "Add a goal when you are ready", tone: "neutral" as const },
    { icon: "card" as const, eyebrow: "Credit watch", title: owed ? `${formatMoney(owed, profile.currency)} currently owed` : "No credit balance recorded", detail: owed ? "Keep this separate from money you own" : "AWN has no credit debt to evaluate", tone: owed ? "watch" as const : "neutral" as const },
  ];
  const spendingPatterns = hasExpenses ? [
    `${topCategory?.name} is your largest spending category this month.`,
    pressure ? `${pressure.name} is above plan by ${formatMoney(Math.abs(pressure.remaining), profile.currency)}.` : "No category is currently above plan.",
    mostRoom ? `${mostRoom.name} has the most room left at ${formatMoney(Math.max(0, mostRoom.remaining), profile.currency)}.` : "Add category budgets to see where you have room.",
    `${concentration}% of recorded spending is concentrated in your top two categories.`,
  ] : ["Add a few expenses before AWN describes your spending patterns."];
  const budgetSignals = [...overBudget, ...orderedCategories.filter((category) => category.remaining >= 0)].slice(0, 4);
  return <>
    <section className="content-panel insights-summary-card"><div><p className="app-eyebrow">This month at a glance</p><h2>{summary}</h2><p>Focus on the few signals supported by the financial data you have recorded.</p></div><div className="insights-summary-details"><span><strong>{budget.remaining === null ? "No budget" : formatMoney(Math.abs(budget.remaining), profile.currency)}</strong>{budget.kind === "none" ? "needed for comparison" : budget.kind === "over" ? "over budget" : "remaining this month"}</span><span><strong>{budget.percent === null ? "—" : `${Math.round(budget.percent)}%`}</strong>{budget.percent === null ? "budget usage unavailable" : "of budget used"}</span><span><strong>{actual.expenseCount}</strong>{actual.expenseCount === 1 ? "expense recorded" : "expenses recorded"}</span><span><strong>{goals.length}</strong>{goals.length === 1 ? "savings goal" : "savings goals"}</span></div></section>
    <section className="insights-key-grid" aria-label="Key money insights">{signals.map((signal) => <article className="insight-key-card" key={signal.eyebrow}><span className={`insight-key-icon is-${signal.tone}`}><AppIcon name={signal.icon} /></span><p className="app-eyebrow">{signal.eyebrow}</p><h2>{signal.title}</h2><p>{signal.detail}</p></article>)}</section>
    <section className="insights-analysis-grid">
      <div className="content-panel insights-pattern-panel"><div className="panel-heading"><div><p className="app-eyebrow">Spending patterns</p><h2>What stands out</h2></div></div><div className="insight-observation-list">{spendingPatterns.map((observation, index) => <article key={observation}><span>0{index + 1}</span><p>{observation}</p></article>)}</div></div>
      <div className="content-panel action-card insights-budget-panel"><div className="panel-heading"><div><p className="app-eyebrow">Budget signals</p><h2>Where the plan needs focus</h2></div><Link href="/plan">View budget plan <AppIcon name="arrow" /></Link></div>{budgetSignals.length ? <div className="insight-budget-list">{budgetSignals.map((category) => { const position = categoryBudgetPosition(category.limit, category.spent); return <article key={category.id}><div><strong>{category.name}</strong><span className={position.kind === "over" || position.kind === "unbudgeted" ? "negative" : position.kind === "no-budget" ? "neutral" : "positive"}>{position.kind === "no-budget" ? "No budget" : `${formatMoney(position.difference, profile.currency)} ${position.differenceLabel.toLowerCase()}`}</span></div>{position.percent !== null && <Progress value={position.percent} tone={position.tone === "neutral" ? "good" : position.tone} label={`${category.name} budget signal`} />}</article>; })}</div> : <p className="section-note">Add category allocations or expenses before AWN evaluates category pressure.</p>}</div>
    </section>
    <section className="insights-bottom-grid">
      <div className="content-panel action-card insights-savings-panel"><div className="panel-heading"><div><p className="app-eyebrow">Savings signals</p><h2>Goals worth noticing</h2></div><Link href="/plan?tab=savings">Review savings goals <AppIcon name="arrow" /></Link></div><div className="insight-savings-summary"><div><span>Total saved</span><strong>{formatMoney(totalSaved, profile.currency)}</strong><small>of {formatMoney(totalTarget, profile.currency)} across {goals.length} {goals.length === 1 ? "goal" : "goals"}</small></div><div className="insight-savings-notes"><span>Closest to completion<strong>{closestGoal?.name ?? "No goal yet"}{closestGoal ? ` · ${strongestProgress}%` : ""}</strong></span><span>Needs more attention<strong>{behindGoal?.name ?? "Not enough goal data"}</strong></span></div></div></div>
      <div className="content-panel action-card insights-next-panel"><div className="panel-heading"><div><p className="app-eyebrow">Suggested next steps</p><h2>Small actions with a clear purpose</h2></div></div><div className="insight-next-list"><Link href="/plan">Review {pressure?.name ?? "your budget"}<AppIcon name="arrow" /></Link><Link href="/transactions">Check this month&apos;s expenses<AppIcon name="arrow" /></Link>{owed > 0 && <Link href="/cards-accounts">Check your credit card balance<AppIcon name="arrow" /></Link>}<Link href="/plan?tab=savings">Plan the next savings contribution<AppIcon name="arrow" /></Link></div></div>
    </section>
  </>;
}
