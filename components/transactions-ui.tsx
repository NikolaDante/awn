"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatedMoney } from "@/components/animated-money";
import { AppIcon } from "@/components/app-icons";
import { CategorySelectOptions } from "@/components/category-select-options";
import { useFinancialProfile } from "@/components/financial-provider";
import { MoneyInput } from "@/components/money-input";
import { ConfirmationDialog } from "@/components/modal-dialog";
import { useModalDialog } from "@/components/use-modal-dialog";
import { budgetCategoriesForMonth, budgetSummary, categoryBudgetPosition } from "@/lib/financial-budget";
import { calculateActualSummary, formatMoney, isValidDate } from "@/lib/financial-calculations";
import { dateInBudgetPeriod, financialReferenceDate, financialReferenceMonth, financialReferencePeriod } from "@/lib/financial-date";
import { mutateLedger, normalizeTransaction, transferValidationMessage, UNBUDGETED_CATEGORY } from "@/lib/financial-ledger";
import { transactionHistoryLabel } from "@/lib/financial-reference-guards";
import { filterTransactions, type TransactionFilters } from "@/lib/financial-transaction-filters";
import { newLocalId, type FinancialProfile, type Transaction } from "@/lib/financial-types";

const initialFilters: TransactionFilters = { type: "all", title: "", category: "", account: "", date: "" };
type UserTransactionType = "income" | "expense" | "transfer";
const decode = (value: string) => { const [kind, ...id] = value.split(":"); return { kind, id: id.join(":") || undefined }; };
const encode = (kind?: string, id?: string) => kind ? `${kind}:${id ?? ""}` : "";

export function TransactionForm({ editing, close }: { editing?: Transaction; close: () => void }) {
  const { profile, save } = useFinancialProfile();
  const dialogRef = useModalDialog<HTMLElement>(close);
  const normalizedEditing = profile && editing ? normalizeTransaction(profile, editing) : editing;
  const initialType: UserTransactionType = normalizedEditing?.type === "income" || normalizedEditing?.type === "transfer" ? normalizedEditing.type : "expense";
  const [type, setType] = useState<UserTransactionType>(initialType);
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [date, setDate] = useState(editing?.date ?? (profile ? financialReferenceDate(profile) : new Date().toLocaleDateString("en-CA")));
  const [note, setNote] = useState(editing?.note ?? "");
  const [category, setCategory] = useState(normalizedEditing?.type === "expense" ? normalizedEditing.category : "");
  const [paidFrom, setPaidFrom] = useState(normalizedEditing?.type === "expense" ? encode(normalizedEditing.sourceKind, normalizedEditing.sourceId) : "");
  const [sourceId, setSourceId] = useState(editing?.type === "income" ? editing.incomeSourceId ?? "" : "");
  const [destination, setDestination] = useState(normalizedEditing?.type === "income" ? encode(normalizedEditing.destinationKind, normalizedEditing.destinationId) : "");
  const [source, setSource] = useState(normalizedEditing?.type === "transfer" ? encode(normalizedEditing.sourceKind, normalizedEditing.sourceId) : "");
  const [target, setTarget] = useState(normalizedEditing?.type === "transfer" ? encode(normalizedEditing.destinationKind, normalizedEditing.destinationId) : "");
  const [error, setError] = useState("");
  if (!profile) return null;

  const balances = calculateActualSummary(profile, financialReferenceMonth(profile));
  const suffix = (lastFour?: string) => lastFour ? ` ••••${lastFour}` : "";
  const groupedOptions = (includeDebit: boolean, includeCredit: boolean) => <><optgroup label="Cash"><option value="cash:">Cash — {formatMoney(balances.cash, profile.currency)} available</option></optgroup><optgroup label="Accounts">{profile.accounts.map((item) => <option key={item.id} value={`account:${item.id}`}>{item.name} — {formatMoney(balances.accounts[item.id] ?? item.balance, item.currency ?? profile.currency)} available</option>)}</optgroup>{includeDebit && <optgroup label="Debit cards">{(profile.debitCards ?? []).map((item) => <option key={item.id} value={`debit:${item.id}`} disabled={!item.linkedAccountId}>{item.name}{suffix(item.lastFour)}{item.linkedAccountId ? "" : " — link an account first"}</option>)}</optgroup>}{includeCredit && <optgroup label="Credit cards">{profile.creditCards.map((item) => <option key={item.id} value={`credit:${item.id}`}>{item.name}{suffix(item.lastFour)} — {formatMoney(balances.availableCredit[item.id] ?? item.limit - item.owed, item.currency ?? profile.currency)} available</option>)}</optgroup>}</>;
  const submit = async () => {
    if (amount <= 0) return setError("Enter an amount above zero.");
    if (!isValidDate(date)) return setError("Use today or an earlier date.");
    if (type === "income" && !destination) return setError("Choose where the income was received.");
    if (type === "expense" && !paidFrom) return setError("Choose how this expense was paid.");
    if (type === "transfer") { const transferError = transferValidationMessage(source, target); if (transferError) return setError(transferError); }
    const now = new Date().toISOString();
    const base = { id: editing?.id ?? newLocalId(), amount, date, note: note.trim() || undefined, createdAt: editing?.createdAt ?? now, updatedAt: now };
    let transaction: Transaction;
    if (type === "income") { const endpoint = decode(destination); transaction = { ...base, type, incomeSourceId: sourceId || undefined, incomeSourceName: profile.incomeSources.find((item) => item.id === sourceId)?.name, destinationKind: endpoint.kind as "cash" | "account", destinationId: endpoint.id }; }
    else if (type === "expense") { const endpoint = decode(paidFrom); transaction = { ...base, type, category: category.trim() || UNBUDGETED_CATEGORY, sourceKind: endpoint.kind as "cash" | "account" | "debit" | "credit", sourceId: endpoint.id }; }
    else { const from = decode(source); const to = decode(target); transaction = { ...base, type, sourceKind: from.kind as "cash" | "account", sourceId: from.id, destinationKind: to.kind as "cash" | "account" | "credit", destinationId: to.id }; }
    const result = mutateLedger(profile, editing ? { kind: "edit", transaction } : { kind: "add", transaction });
    if (!result.ok) return setError(result.error);
    if (await save(result.profile)) close();
  };

  return createPortal(<div className="dialog-backdrop app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} tabIndex={-1} className="confirm-dialog transaction-form" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
    <div className="repeat-card-heading transaction-form-header"><div><p className="app-eyebrow">Transaction</p><h2 id="transaction-title">{editing ? "Edit transaction" : "Add transaction"}</h2></div><button className="dialog-close-button" onClick={close} type="button" aria-label="Close transaction form"><AppIcon name="close" /></button></div>
    <div className="transaction-type segmented-control" role="group" aria-label="Transaction type">{(["income", "expense", "transfer"] as const).map((option) => <button type="button" key={option} className={type === option ? "is-selected" : undefined} aria-pressed={type === option} onClick={() => { setType(option); setError(""); }}>{option[0].toUpperCase() + option.slice(1)}</button>)}</div>
    <div className="transaction-form-body"><div className="transaction-fields"><label className="form-field">Amount<MoneyInput value={amount} onValueChange={setAmount} placeholder="0.00" /></label><label className="form-field">Date<input type="date" max={new Date().toLocaleDateString("en-CA")} value={date} onChange={(event) => setDate(event.target.value)} /></label>
      {type === "income" && <><label className="form-field">Income source (optional)<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">No source selected</option>{profile.incomeSources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field">Received into<select value={destination} onChange={(event) => setDestination(event.target.value)}><option value="">Choose destination</option>{groupedOptions(false, false)}</select></label></>}
      {type === "expense" && <><label className="form-field">Category (optional)<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Choose a category</option>{category === UNBUDGETED_CATEGORY && <option value={category}>{category}</option>}<CategorySelectOptions profile={profile} currentName={category} /></select></label><label className="form-field">Paid from<select value={paidFrom} onChange={(event) => setPaidFrom(event.target.value)}><option value="">Choose source</option>{groupedOptions(true, true)}</select></label>{(profile.debitCards ?? []).some((item) => !item.linkedAccountId) && <p className="form-help transaction-field-wide">Unlinked debit cards are unavailable until they are linked to an account in Cards &amp; Accounts.</p>}</>}
      {type === "transfer" && <><label className="form-field">From<select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Choose source</option>{groupedOptions(false, false)}</select></label><label className="form-field">To<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Choose destination</option>{groupedOptions(false, true)}</select></label></>}
      <label className="form-field transaction-field-wide">Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short note" /></label></div>{error && <p className="form-message is-error" role="alert">{error}</p>}</div>
    <div className="confirm-dialog-actions"><button type="button" className="app-button app-button-secondary" onClick={close}>Cancel</button><button type="button" className="app-button" onClick={submit}>{editing ? "Save changes" : "Add transaction"}</button></div>
  </section></div>, document.body);
}

export function AddTransactionButton() {
  const [open, setOpen] = useState(false);
  return <>{open && <TransactionForm close={() => setOpen(false)} />}<button type="button" className="app-button" onClick={() => setOpen(true)}><AppIcon name="plus" />Add transaction</button></>;
}

export function TransactionsView() {
  const { profile, ready } = useFinancialProfile();
  const [editing, setEditing] = useState<Transaction>();
  const [form, setForm] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [deleting, setDeleting] = useState<Transaction>();
  if (!ready) return <p className="loading-copy">Loading your activity...</p>;
  if (!profile) return <p className="loading-copy">Start your plan before adding activity.</p>;
  const month = financialReferenceMonth(profile);
  const period = financialReferencePeriod(profile);
  const categoryBudgets = budgetCategoriesForMonth(profile, month);
  const actual = calculateActualSummary(profile, month);
  const currentMonthTransactions = profile.transactions.filter((item) => dateInBudgetPeriod(item.date, period)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const budgets = new Map(categoryBudgets.map((item) => [item.name, item]));
  const categories = [...new Set([...categoryBudgets.map((item) => item.name), ...Object.keys(actual.categorySpending)])].map((name) => ({ id: budgets.get(name)?.id ?? `unbudgeted-${name}`, name, limit: budgets.get(name)?.limit ?? 0, spent: actual.categorySpending[name] ?? 0 })).sort((a, b) => b.spent - a.spent);
  const topCategories = categories.slice(0, 5);
  const topCategory = categories[0]?.spent ? categories[0].name : "No spending yet";
  const recentExpenses = currentMonthTransactions.filter((item) => item.type === "expense").slice(0, 8);
  const budget = budgetSummary(profile, month, actual.expenses);
  return <>{form && <TransactionForm editing={editing} close={() => { setForm(false); setEditing(undefined); }} />}{allOpen && <AllTransactionsDialog close={() => setAllOpen(false)} transactions={currentMonthTransactions} profile={profile} readOnly={false} edit={(item) => { setAllOpen(false); setEditing(item); setForm(true); }} remove={setDeleting} />}{deleting && <TransactionDeleteDialog transaction={deleting} close={() => setDeleting(undefined)} />}{categoriesOpen && <AllCategoriesDialog close={() => setCategoriesOpen(false)} categories={categories} profile={profile} />}
    <section className="transactions-hero" aria-label={`${period.label} financial position`}><div className="transactions-hero-main"><div className="transactions-hero-heading"><div><p className="app-eyebrow">Current financial position</p><span>{period.label}</span></div><span className={`status-pill is-${budget.tone}`}>{budget.statusLabel}</span></div><AnimatedMoney className="transactions-hero-value" value={actual.currentPosition} currency={profile.currency} /><div className="transactions-hero-details"><span>Opening position<strong>{formatMoney(actual.openingPosition, profile.currency)}</strong></span><span>Budget<strong>{budget.budget === null ? "No budget" : formatMoney(budget.budget, profile.currency)}</strong></span><span>Budget difference<strong className={budget.kind === "over" ? "negative" : budget.kind === "none" ? "neutral" : "positive"}>{budget.remaining === null ? "Not available" : formatMoney(Math.abs(budget.remaining), profile.currency)}</strong></span></div></div><div className="transactions-hero-summaries" aria-label="Budget-period totals"><TransactionHeroSummary kind="income" label="Period income" helper="Cash coming in" value={formatMoney(actual.income, profile.currency)} /><TransactionHeroSummary kind="expense" label="Period expenses" helper="Cash going out" value={formatMoney(actual.expenses, profile.currency)} /></div></section>
    <section className="metric-grid transaction-metrics" aria-label="Current budget-period transaction summary"><TransactionMetric label="Average expense" value={formatMoney(actual.averageExpense, profile.currency)} detail="Average value per expense" icon="transactions" /><TransactionMetric label="Top spending category" value={topCategory} detail={categories[0]?.spent ? `${formatMoney(categories[0].spent, profile.currency)} spent` : "No expenses recorded"} icon="wallet" /></section>
    <section className="transactions-detail-grid"><div className="content-panel action-card recent-expenses-panel"><div className="panel-heading"><div><p className="app-eyebrow">Recent expenses</p><h2>Latest spending</h2></div><button className="text-button" type="button" onClick={() => setAllOpen(true)}>View all <AppIcon name="arrow" /></button></div>{recentExpenses.length ? <div className="transaction-list compact-transaction-list">{recentExpenses.map((item) => <TransactionListRow key={item.id} item={item} profile={profile} />)}</div> : <section className="empty-panel transactions-empty-panel"><span className="empty-panel-mark" aria-hidden="true">+</span><h2>No expenses yet this period.</h2><p>Add your first expense when you&apos;re ready.</p><button className="app-button" type="button" onClick={() => setForm(true)}><AppIcon name="plus" />Add transaction</button></section>}</div><div className="content-panel action-card category-panel"><div className="panel-heading"><div><p className="app-eyebrow">Category budgets</p><h2>This period</h2></div><button className="text-button" type="button" onClick={() => setCategoriesOpen(true)}>View all <AppIcon name="arrow" /></button></div>{topCategories.length ? <CategoryBudgetList categories={topCategories} profile={profile} /> : <section className="empty-panel transactions-empty-panel"><span className="empty-panel-mark" aria-hidden="true">+</span><h2>No category spending</h2><p>Add an expense to see category budget progress.</p></section>}</div></section>
  </>;
}

export function TransactionDeleteDialog({ transaction, close, afterDelete }: { transaction: Transaction; close: () => void; afterDelete?: () => void }) {
  const { profile, save } = useFinancialProfile();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!profile) return null;
  const remove = async () => {
    setBusy(true);
    setError("");
    const result = mutateLedger(profile, { kind: "delete", id: transaction.id });
    if (!result.ok) { setError(result.error); setBusy(false); return; }
    if (await save(result.profile)) { close(); afterDelete?.(); return; }
    setError("We couldn’t delete this transaction. Check your connection and try again.");
    setBusy(false);
  };
  return <ConfirmationDialog eyebrow="Transaction" title="Delete transaction?" description="This will reverse the transaction's financial effect and remove it from your history." confirmLabel="Delete transaction" close={close} confirm={remove} error={error} busy={busy} />;
}

function TransactionMetric({ label, value, detail, icon }: { label: string; value: string; detail: string; icon: "transactions" | "wallet" }) { return <article className="metric-card"><span className="metric-heading"><AppIcon name={icon} />{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function TransactionHeroSummary({ kind, label, helper, value }: { kind: "income" | "expense"; label: string; helper: string; value: string }) { return <article className={`transactions-hero-summary is-${kind}`}><span><AppIcon name={kind} />{label}</span><strong>{value}</strong><small>{helper}</small></article>; }

function CategoryBudgetList({ categories, profile }: { categories: Array<{ id: string; name: string; limit: number; spent: number }>; profile: FinancialProfile }) { return <div className="category-progress-list">{categories.map((category) => { const position = categoryBudgetPosition(category.limit, category.spent); return <article key={category.id}><div className="category-progress-heading"><strong>{category.name}</strong><span className={`status-pill is-${position.tone}`}>{position.statusLabel}</span></div>{position.percent !== null && <div className="progress-track"><span className={`is-${position.tone}`} style={{ width: `${Math.min(100, position.percent)}%` }} /></div>}<div className="category-progress-values"><span>Spent<strong>{formatMoney(category.spent, profile.currency)}</strong></span><span>{position.differenceLabel}<strong className={position.kind === "over" || position.kind === "unbudgeted" ? "negative" : position.kind === "no-budget" ? "neutral" : "positive"}>{formatMoney(position.difference, profile.currency)}</strong></span><b>{position.percent === null ? position.statusLabel : `${Math.round(position.percent)}%`}</b></div></article>; })}</div>; }

function AllCategoriesDialog({ close, categories, profile }: { close: () => void; categories: Array<{ id: string; name: string; limit: number; spent: number }>; profile: FinancialProfile }) {
  const dialogRef = useModalDialog<HTMLElement>(close);
  return <div className="dialog-backdrop app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} tabIndex={-1} className="confirm-dialog category-budget-dialog" role="dialog" aria-modal="true" aria-labelledby="all-categories-title"><div className="repeat-card-heading"><div><p className="app-eyebrow">This period</p><h2 id="all-categories-title">All category budgets</h2></div><button className="dialog-close-button" onClick={close} type="button" aria-label="Close category budgets"><AppIcon name="close" /></button></div><CategoryBudgetList categories={categories} profile={profile} /></section></div>;
}

function transactionAccountLabel(profile: FinancialProfile, item: Transaction) {
  const accountName = (id: string | undefined) => id ? profile.accounts.find((account) => account.id === id)?.name ?? "Former account" : "Unlinked";
  const cardName = (id: string | undefined) => id ? profile.creditCards.find((card) => card.id === id)?.name ?? "Former credit card" : "Unlinked";
  const debitName = (id: string | undefined) => id ? profile.debitCards?.find((card) => card.id === id)?.name ?? "Former debit card" : "Unlinked";
  const endpoint = (kind: string | undefined, id: string | undefined) => kind === "cash" ? "Cash" : kind === "account" ? accountName(id) : kind === "debit" ? debitName(id) : kind === "credit" ? cardName(id) : "Unlinked";
  if (item.type === "income") return item.destinationKind ? `To ${endpoint(item.destinationKind, item.destinationId)}` : item.destinationAccountId ? `To ${accountName(item.destinationAccountId)}` : "No destination linked";
  if (item.type === "expense") return item.sourceKind ? endpoint(item.sourceKind, item.sourceId) : item.cardId ? cardName(item.cardId) : accountName(item.accountId);
  if (item.type === "transfer") return `${endpoint(item.sourceKind ?? "account", item.sourceId ?? item.sourceAccountId)} to ${endpoint(item.destinationKind ?? "account", item.destinationId ?? item.destinationAccountId)}`;
  return `${accountName(item.payingAccountId)} to ${cardName(item.receivingCardId)}`;
}

function transactionDetails(profile: FinancialProfile, item: Transaction) {
  return { title: item.note || transactionHistoryLabel(item), category: item.type === "expense" ? item.category : item.type === "income" ? "Income" : "Transfer", account: transactionAccountLabel(profile, item) };
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
  return <div className="dialog-backdrop app-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={dialogRef} tabIndex={-1} className="confirm-dialog all-transactions-dialog" role="dialog" aria-modal="true" aria-labelledby="all-transactions-title"><div className="repeat-card-heading"><div><p className="app-eyebrow">Recorded activity</p><h2 id="all-transactions-title">All transactions</h2></div><button className="dialog-close-button" onClick={close} type="button" aria-label="Close transactions"><AppIcon name="close" /></button></div><div className="ledger-controls transaction-dialog-filters"><input aria-label="Search transaction titles" placeholder="Search title" value={filters.title} onChange={(event) => update({ title: event.target.value })} /><select aria-label="Filter transaction type" value={filters.type} onChange={(event) => update({ type: event.target.value })}><option value="all">All activity</option><option value="income">Income</option><option value="expense">Expenses</option><option value="transfer">Transfers</option></select><select aria-label="Filter transaction category" value={filters.category} onChange={(event) => update({ category: event.target.value })}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><select aria-label="Filter transaction account or card" value={filters.account} onChange={(event) => update({ account: event.target.value })}><option value="">All accounts/cards</option>{accounts.map((account) => <option key={account}>{account}</option>)}</select><input type="date" aria-label="Filter transaction date" value={filters.date} onChange={(event) => update({ date: event.target.value })} /></div><div className="all-transactions-scroll">{visible.length ? <div className="transaction-list all-transaction-list">{visible.map((item) => <TransactionListRow key={item.id} item={item} profile={profile} showIcon={false} actions={readOnly || !edit || !remove ? undefined : <div className="transaction-actions"><button className="text-button" type="button" onClick={() => edit(item)} aria-label={`Edit ${item.type} on ${item.date}`}>Edit</button><button className="text-button" type="button" onClick={() => remove(item)} aria-label={`Delete ${item.type} on ${item.date}`}>Delete</button></div>} />)}</div> : <section className="empty-panel transactions-empty-panel"><span className="empty-panel-mark" aria-hidden="true">+</span><h2>No transactions found</h2><p>Try a different filter.</p></section>}</div></section></div>;
}
