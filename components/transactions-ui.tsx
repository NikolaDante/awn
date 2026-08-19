"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AppIcon } from "@/components/app-icons";
import { useFinancialProfile } from "@/components/financial-provider";
import { MoneyInput } from "@/components/money-input";
import { useModalDialog } from "@/components/use-modal-dialog";
import { budgetCategoriesForMonth, categoryBudgetPosition } from "@/lib/financial-budget";
import { calculateActualSummary, cardLedgerValid, formatMoney, isValidDate } from "@/lib/financial-calculations";
import { financialReferenceDate, financialReferenceMonth } from "@/lib/financial-date";
import { transactionHistoryLabel } from "@/lib/financial-reference-guards";
import { filterTransactions, type TransactionFilters } from "@/lib/financial-transaction-filters";
import { newLocalId, type FinancialProfile, type Transaction } from "@/lib/financial-types";

const monthLabel = (month: string) => new Date(`${month}-15T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const initialFilters: TransactionFilters = { type: "all", title: "", category: "", account: "", date: "" };

export function TransactionForm({ editing, close }: { editing?: Transaction; close: () => void }) {
  const { profile, save } = useFinancialProfile();
  const dialogRef = useModalDialog<HTMLElement>(close);
  const activeCategories = profile ? budgetCategoriesForMonth(profile, financialReferenceMonth(profile)) : [];
  const [type, setType] = useState<Transaction["type"]>(editing?.type ?? "expense");
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [date, setDate] = useState(editing?.date ?? (profile ? financialReferenceDate(profile) : new Date().toLocaleDateString("en-CA")));
  const [note, setNote] = useState(editing?.note ?? "");
  const [category, setCategory] = useState(editing?.type === "expense" ? editing.category : activeCategories[0]?.name ?? "Other");
  const [accountId, setAccountId] = useState(editing?.type === "expense" ? editing.accountId ?? "" : "");
  const [cardId, setCardId] = useState(editing?.type === "expense" ? editing.cardId ?? "" : "");
  const [sourceId, setSourceId] = useState(editing?.type === "income" ? editing.incomeSourceId ?? "" : "");
  const [destination, setDestination] = useState(editing?.type === "income" ? editing.destinationAccountId ?? "" : "");
  const [source, setSource] = useState(editing?.type === "transfer" ? editing.sourceAccountId : "");
  const [target, setTarget] = useState(editing?.type === "transfer" ? editing.destinationAccountId : "");
  const [paying, setPaying] = useState(editing?.type === "card-payment" ? editing.payingAccountId : "");
  const [receiving, setReceiving] = useState(editing?.type === "card-payment" ? editing.receivingCardId : "");
  const [error, setError] = useState("");
  if (!profile) return null;

  const select = (label: string, value: string, set: (value: string) => void, options: { id: string; name: string }[], empty = "Unlinked") => <label className="form-field">{label}<select value={value} onChange={(event) => set(event.target.value)}><option value="">{empty}</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
  const submit = () => {
    if (amount <= 0) return setError("Enter an amount above zero.");
    if (!isValidDate(date)) return setError("Use today or an earlier date.");
    if (type === "expense" && !category.trim()) return setError("Choose a category for this expense.");
    if (type === "transfer" && (!source || !target || source === target)) return setError("Choose two different accounts for the transfer.");
    if (type === "card-payment" && (!paying || !receiving)) return setError("Choose the paying account and receiving card.");
    const now = new Date().toISOString();
    const base = { id: editing?.id ?? newLocalId(), amount, date, note: note.trim() || undefined, createdAt: editing?.createdAt ?? now, updatedAt: now };
    let transaction: Transaction;
    if (type === "income") transaction = { ...base, type, incomeSourceId: sourceId || undefined, incomeSourceName: profile.incomeSources.find((item) => item.id === sourceId)?.name, destinationAccountId: destination || undefined };
    else if (type === "expense") transaction = { ...base, type, category: category.trim(), accountId: accountId || undefined, cardId: cardId || undefined };
    else if (type === "transfer") transaction = { ...base, type, sourceAccountId: source, destinationAccountId: target };
    else transaction = { ...base, type, payingAccountId: paying, receivingCardId: receiving };
    const next = { ...profile, transactions: editing ? profile.transactions.map((item) => item.id === editing.id ? transaction : item) : [...profile.transactions, transaction] };
    if (!cardLedgerValid(next, next.transactions)) return setError("That card payment would be higher than the amount owed at that point. Check the date and amount.");
    if (save(next)) close();
  };

  return createPortal(<div className="dialog-backdrop app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} tabIndex={-1} className="confirm-dialog transaction-form" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
    <div className="repeat-card-heading transaction-form-header"><div><p className="app-eyebrow">Transaction</p><h2 id="transaction-title">{editing ? "Edit transaction" : "Add transaction"}</h2></div><button className="dialog-close-button" onClick={close} type="button" aria-label="Close transaction form"><AppIcon name="close" /></button></div>
    <div className="transaction-type segmented-control" role="group" aria-label="Transaction type">{(["income", "expense", "transfer", "card-payment"] as const).map((option) => <button type="button" key={option} className={type === option ? "is-selected" : undefined} aria-pressed={type === option} onClick={() => setType(option)}>{option === "card-payment" ? "Card payment" : option[0].toUpperCase() + option.slice(1)}</button>)}</div>
    <div className="transaction-form-body"><div className="transaction-fields"><label className="form-field">Amount<MoneyInput value={amount} onValueChange={setAmount} placeholder="0.00" /></label><label className="form-field">Date<input type="date" max={new Date().toLocaleDateString("en-CA")} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      {type === "income" && <>{select("Income source", sourceId, setSourceId, profile.incomeSources)}{select("Destination account", destination, setDestination, profile.accounts)}</>}
      {type === "expense" && <>{select("Category", category, setCategory, [...activeCategories.map((item) => ({ id: item.name, name: item.name })), { id: "Other", name: "Other (unbudgeted)" }], "Choose a category")}{select("Paying account", accountId, (value) => { setAccountId(value); if (value) setCardId(""); }, profile.accounts)}{select("Paying card", cardId, (value) => { setCardId(value); if (value) setAccountId(""); }, profile.creditCards)}</>}
      {type === "transfer" && <>{select("From account", source, setSource, profile.accounts, "Choose source")}{select("To account", target, setTarget, profile.accounts, "Choose destination")}</>}
      {type === "card-payment" && <>{select("Paying account", paying, setPaying, profile.accounts, "Choose account")}{select("Receiving card", receiving, setReceiving, profile.creditCards, "Choose card")}</>}
      <label className="form-field transaction-field-wide">Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short note" /></label></div>{error && <p className="form-message is-error" role="alert">{error}</p>}</div>
    <div className="confirm-dialog-actions"><button type="button" className="app-button app-button-secondary" onClick={close}>Cancel</button><button type="button" className="app-button" onClick={submit}>{editing ? "Save changes" : "Add transaction"}</button></div>
  </section></div>, document.body);
}

export function AddTransactionButton() {
  const [open, setOpen] = useState(false);
  return <>{open && <TransactionForm close={() => setOpen(false)} />}<button type="button" className="app-button" onClick={() => setOpen(true)}><AppIcon name="plus" />Add transaction</button></>;
}

export function TransactionsView() {
  const { profile, ready, save } = useFinancialProfile();
  const [editing, setEditing] = useState<Transaction>();
  const [form, setForm] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  if (!ready) return <p className="loading-copy">Loading your activity...</p>;
  if (!profile) return <p className="loading-copy">Start your plan before adding activity.</p>;
  const month = financialReferenceMonth(profile);
  const categoryBudgets = budgetCategoriesForMonth(profile, month);
  const actual = calculateActualSummary(profile, month);
  const currentMonthTransactions = profile.transactions.filter((item) => item.date.startsWith(month)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const categories = categoryBudgets.map((category) => ({ ...category, spent: actual.categorySpending[category.name] ?? 0 })).sort((a, b) => b.spent - a.spent);
  const topCategories = categories.slice(0, 5);
  const topCategory = categories[0]?.spent ? categories[0].name : "No spending yet";
  const recentExpenses = currentMonthTransactions.filter((item) => item.type === "expense").slice(0, 8);
  const spendingBudget = categoryBudgets.reduce((total, category) => total + category.limit, 0);
  const difference = spendingBudget - actual.expenses;
  const netStatus = actual.moneyLeft < 0 ? "Over budget" : difference >= 0 ? "Under budget" : "On track";
  const remove = (item: Transaction) => { if (!window.confirm("Remove this transaction? Its balance impact will be recalculated.")) return; const next = profile.transactions.filter((entry) => entry.id !== item.id); if (cardLedgerValid(profile, next)) save({ ...profile, transactions: next }); };
  return <>{form && <TransactionForm editing={editing} close={() => { setForm(false); setEditing(undefined); }} />}{allOpen && <AllTransactionsDialog close={() => setAllOpen(false)} transactions={currentMonthTransactions} profile={profile} readOnly={false} edit={(item) => { setAllOpen(false); setEditing(item); setForm(true); }} remove={remove} />}{categoriesOpen && <AllCategoriesDialog close={() => setCategoriesOpen(false)} categories={categories} profile={profile} />}
    <section className="transactions-hero" aria-label={`${monthLabel(month)} financial position`}><div className="transactions-hero-main"><div className="transactions-hero-heading"><div><p className="app-eyebrow">Actual net</p><span>{monthLabel(month)}</span></div><span className={`status-pill is-${actual.moneyLeft < 0 ? "over" : difference <= spendingBudget * .15 ? "watch" : "good"}`}>{netStatus}</span></div><strong className="transactions-hero-value">{formatMoney(actual.moneyLeft, profile.currency)}</strong><div className="transactions-hero-details"><span>Month<strong>{monthLabel(month)}</strong></span><span>Budget<strong>{formatMoney(spendingBudget, profile.currency)}</strong></span><span>Difference<strong className={difference < 0 ? "negative" : "positive"}>{formatMoney(Math.abs(difference), profile.currency)}</strong></span></div></div><div className="transactions-hero-summaries" aria-label="Monthly totals"><TransactionHeroSummary kind="income" label="Total income" helper="Cash coming in" value={formatMoney(actual.income, profile.currency)} /><TransactionHeroSummary kind="expense" label="Total expenses" helper="Cash going out" value={formatMoney(actual.expenses, profile.currency)} /></div></section>
    <section className="metric-grid transaction-metrics" aria-label="Current month transaction summary"><TransactionMetric label="Average expense" value={formatMoney(actual.averageExpense, profile.currency)} detail="Average value per expense" icon="transactions" /><TransactionMetric label="Top spending category" value={topCategory} detail={categories[0]?.spent ? `${formatMoney(categories[0].spent, profile.currency)} spent` : "No expenses recorded"} icon="wallet" /></section>
    <section className="transactions-detail-grid"><div className="content-panel action-card recent-expenses-panel"><div className="panel-heading"><div><p className="app-eyebrow">Recent expenses</p><h2>Latest spending</h2></div><button className="text-button" type="button" onClick={() => setAllOpen(true)}>View all <AppIcon name="arrow" /></button></div>{recentExpenses.length ? <div className="transaction-list compact-transaction-list">{recentExpenses.map((item) => <TransactionListRow key={item.id} item={item} profile={profile} />)}</div> : <section className="empty-panel transactions-empty-panel"><span className="empty-panel-mark" aria-hidden="true">+</span><h2>No expenses yet this month.</h2><p>Add your first expense when you&apos;re ready.</p><button className="app-button" type="button" onClick={() => setForm(true)}><AppIcon name="plus" />Add transaction</button></section>}</div><div className="content-panel action-card category-panel"><div className="panel-heading"><div><p className="app-eyebrow">Category budgets</p><h2>This month</h2></div><button className="text-button" type="button" onClick={() => setCategoriesOpen(true)}>View all <AppIcon name="arrow" /></button></div>{topCategories.length ? <CategoryBudgetList categories={topCategories} profile={profile} /> : <section className="empty-panel transactions-empty-panel"><span className="empty-panel-mark" aria-hidden="true">+</span><h2>No category spending</h2><p>Add an expense to see category budget progress.</p></section>}</div></section>
  </>;
}

function TransactionMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: "transactions" | "wallet" }) { return <article className="metric-card"><span className="metric-heading"><AppIcon name={icon} />{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function TransactionHeroSummary({ kind, label, helper, value }: { kind: "income" | "expense"; label: string; helper: string; value: string }) { return <article className={`transactions-hero-summary is-${kind}`}><span><AppIcon name={kind} />{label}</span><strong>{value}</strong><small>{helper}</small></article>; }

function CategoryBudgetList({ categories, profile }: { categories: Array<{ id: string; name: string; limit: number; spent: number }>; profile: FinancialProfile }) { return <div className="category-progress-list">{categories.map((category) => { const position = categoryBudgetPosition(category.limit, category.spent); return <article key={category.id}><div className="category-progress-heading"><strong>{category.name}</strong><span className={`status-pill is-${position.tone}`}>{position.statusLabel}</span></div>{position.percent !== null && <div className="progress-track"><span className={`is-${position.tone}`} style={{ width: `${Math.min(100, position.percent)}%` }} /></div>}<div className="category-progress-values"><span>Spent<strong>{formatMoney(category.spent, profile.currency)}</strong></span><span>{position.differenceLabel}<strong className={position.kind === "over" || position.kind === "unbudgeted" ? "negative" : position.kind === "no-budget" ? "neutral" : "positive"}>{formatMoney(position.difference, profile.currency)}</strong></span><b>{position.percent === null ? position.statusLabel : `${Math.round(position.percent)}%`}</b></div></article>; })}</div>; }

function AllCategoriesDialog({ close, categories, profile }: { close: () => void; categories: Array<{ id: string; name: string; limit: number; spent: number }>; profile: FinancialProfile }) {
  const dialogRef = useModalDialog<HTMLElement>(close);
  return <div className="dialog-backdrop app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} tabIndex={-1} className="confirm-dialog category-budget-dialog" role="dialog" aria-modal="true" aria-labelledby="all-categories-title"><div className="repeat-card-heading"><div><p className="app-eyebrow">This month</p><h2 id="all-categories-title">All category budgets</h2></div><button className="dialog-close-button" onClick={close} type="button" aria-label="Close category budgets"><AppIcon name="close" /></button></div><CategoryBudgetList categories={categories} profile={profile} /></section></div>;
}

function transactionAccountLabel(profile: FinancialProfile, item: Transaction) {
  const accountName = (id: string | undefined) => id ? profile.accounts.find((account) => account.id === id)?.name ?? "Former account" : "Unlinked";
  const cardName = (id: string | undefined) => id ? profile.creditCards.find((card) => card.id === id)?.name ?? "Former credit card" : "Unlinked";
  if (item.type === "income") return item.destinationAccountId ? `To ${accountName(item.destinationAccountId)}` : "No account linked";
  if (item.type === "expense") return item.cardId ? cardName(item.cardId) : accountName(item.accountId);
  if (item.type === "transfer") return `${accountName(item.sourceAccountId)} to ${accountName(item.destinationAccountId)}`;
  return `${accountName(item.payingAccountId)} to ${cardName(item.receivingCardId)}`;
}

function transactionDetails(profile: FinancialProfile, item: Transaction) {
  return { title: item.note || transactionHistoryLabel(item), category: item.type === "expense" ? item.category : item.type === "income" ? "Income" : item.type === "transfer" ? "Transfer" : "Card payment", account: transactionAccountLabel(profile, item) };
}

function TransactionListRow({ item, profile, actions, showIcon = true }: { item: Transaction; profile: FinancialProfile; actions?: ReactNode; showIcon?: boolean }) {
  const detail = transactionDetails(profile, item);
  const date = new Date(`${item.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return <article className={`transaction-item transaction-row-card${showIcon ? "" : " without-icon"}`}>{showIcon && <span className={`activity-icon is-${item.type}`}><AppIcon name={item.type === "income" ? "income" : item.type === "expense" ? "expense" : "transfer"} /></span>}<div><strong>{detail.title}</strong><small><span>{detail.category}</span><span>{detail.account}</span><span>{date}</span></small></div><b className={item.type === "income" ? "positive" : item.type === "expense" ? "negative" : "neutral"}>{item.type === "income" ? "+" : item.type === "expense" ? "-" : ""}{formatMoney(item.amount, profile.currency)}</b>{actions}</article>;
}

export function AllTransactionsDialog({ close, transactions, profile, readOnly = true, edit, remove }: { close: () => void; transactions: Transaction[]; profile: FinancialProfile; readOnly?: boolean; edit?: (item: Transaction) => void; remove?: (item: Transaction) => void }) {
  const dialogRef = useModalDialog<HTMLElement>(close);
  const [filters, setFilters] = useState(initialFilters);
  const details = (item: Transaction) => transactionDetails(profile, item);
  const categories = [...new Set(transactions.map((item) => details(item).category))].sort();
  const accounts = [...new Set(transactions.map((item) => details(item).account))].sort();
  const visible = filterTransactions(transactions, filters, details);
  const update = (patch: Partial<TransactionFilters>) => setFilters((current) => ({ ...current, ...patch }));
  return <div className="dialog-backdrop app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} tabIndex={-1} className="confirm-dialog all-transactions-dialog" role="dialog" aria-modal="true" aria-labelledby="all-transactions-title"><div className="repeat-card-heading"><div><p className="app-eyebrow">Current month</p><h2 id="all-transactions-title">All transactions</h2></div><button className="dialog-close-button" onClick={close} type="button" aria-label="Close transactions"><AppIcon name="close" /></button></div><div className="ledger-controls transaction-dialog-filters"><input aria-label="Search transaction titles" placeholder="Search title" value={filters.title} onChange={(event) => update({ title: event.target.value })} /><select aria-label="Filter transaction type" value={filters.type} onChange={(event) => update({ type: event.target.value })}><option value="all">All activity</option><option value="income">Income</option><option value="expense">Expenses</option><option value="transfer">Transfers</option><option value="card-payment">Card payments</option></select><select aria-label="Filter transaction category" value={filters.category} onChange={(event) => update({ category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><select aria-label="Filter transaction account or card" value={filters.account} onChange={(event) => update({ account: event.target.value })}><option value="">All accounts/cards</option>{accounts.map((account) => <option key={account}>{account}</option>)}</select><input type="date" aria-label="Filter transaction date" value={filters.date} onChange={(event) => update({ date: event.target.value })} /></div><div className="all-transactions-scroll">{visible.length ? <div className="transaction-list all-transaction-list">{visible.map((item) => <TransactionListRow key={item.id} item={item} profile={profile} showIcon={false} actions={readOnly || !edit || !remove ? undefined : <div className="transaction-actions"><button className="text-button" type="button" onClick={() => edit(item)} aria-label={`Edit ${item.type} on ${item.date}`}>Edit</button><button className="text-button" type="button" onClick={() => remove(item)} aria-label={`Delete ${item.type} on ${item.date}`}>Delete</button></div>} />)}</div> : <section className="empty-panel transactions-empty-panel"><span className="empty-panel-mark" aria-hidden="true">+</span><h2>No transactions found</h2><p>Try a different filter.</p></section>}</div></section></div>;
}
