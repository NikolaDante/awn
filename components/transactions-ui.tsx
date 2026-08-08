"use client";

import { useState } from "react";
import { useFinancialProfile } from "@/components/financial-provider";
import { calculateActualSummary, cardLedgerValid, formatMoney, isValidDate, moneyInput, parseMoney } from "@/lib/financial-calculations";
import { transactionHistoryDetail, transactionHistoryLabel } from "@/lib/financial-reference-guards";
import { newLocalId, type Transaction } from "@/lib/financial-types";

const today = () => new Date().toLocaleDateString("en-CA");
const monthOf = (date: string) => date.slice(0, 7);

export function TransactionForm({ editing, close }: { editing?: Transaction; close: () => void }) {
  const { profile, save } = useFinancialProfile();
  const [type, setType] = useState<Transaction["type"]>(editing?.type ?? "expense");
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [date, setDate] = useState(editing?.date ?? today());
  const [note, setNote] = useState(editing?.note ?? "");
  const [category, setCategory] = useState(editing?.type === "expense" ? editing.category : profile?.categoryBudgets[0]?.name ?? "Other");
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
  return <div className="dialog-backdrop"><section className="confirm-dialog transaction-form" role="dialog" aria-modal="true" aria-labelledby="transaction-title"><div className="repeat-card-heading"><h2 id="transaction-title">{editing ? "Edit transaction" : "Add transaction"}</h2><button className="icon-button" onClick={close} type="button" aria-label="Close">Close</button></div><div className="transaction-type" role="group" aria-label="Transaction type">{(["income", "expense", "transfer", "card-payment"] as const).map((option) => <button type="button" key={option} className={type === option ? "is-selected" : ""} aria-pressed={type === option} onClick={() => setType(option)}>{option === "card-payment" ? "Card payment" : option[0].toUpperCase() + option.slice(1)}</button>)}</div><div className="field-row"><label className="form-field">Amount<input inputMode="decimal" value={moneyInput(amount)} onChange={(event) => setAmount(parseMoney(event.target.value))} placeholder="0.00" /></label><label className="form-field">Date<input type="date" max={today()} value={date} onChange={(event) => setDate(event.target.value)} /></label></div>{type === "income" && <>{select("Income source", sourceId, setSourceId, profile.incomeSources)}{select("Destination account", destination, setDestination, profile.accounts)}</>}{type === "expense" && <>{select("Category", category, setCategory, [...profile.categoryBudgets.map((item) => ({ id: item.name, name: item.name })), { id: "Other", name: "Other (unbudgeted)" }], "Choose a category")}{select("Paying account", accountId, (value) => { setAccountId(value); if (value) setCardId(""); }, profile.accounts)}{select("Paying card", cardId, (value) => { setCardId(value); if (value) setAccountId(""); }, profile.creditCards)}</>}{type === "transfer" && <div className="field-row">{select("From account", source, setSource, profile.accounts, "Choose source")}{select("To account", target, setTarget, profile.accounts, "Choose destination")}</div>}{type === "card-payment" && <div className="field-row">{select("Paying account", paying, setPaying, profile.accounts, "Choose account")}{select("Receiving card", receiving, setReceiving, profile.creditCards, "Choose card")}</div>}<label className="form-field">Note (optional)<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="A short note" /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<div className="confirm-dialog-actions"><button type="button" className="app-button app-button-secondary" onClick={close}>Cancel</button><button type="button" className="app-button" onClick={submit}>{editing ? "Save changes" : "Add transaction"}</button></div></section></div>;
}

export function AddTransactionButton() {
  const [open, setOpen] = useState(false);
  return <>{open && <TransactionForm close={() => setOpen(false)} />}<button type="button" className="app-button" onClick={() => setOpen(true)}>Add transaction</button></>;
}

export function TransactionsView() {
  const { profile, ready, save } = useFinancialProfile();
  const [editing, setEditing] = useState<Transaction>();
  const [form, setForm] = useState(false);
  const [month, setMonth] = useState(monthOf(today()));
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  if (!ready) return <p className="loading-copy">Loading your activity…</p>;
  if (!profile) return <p className="loading-copy">Start your plan before adding activity.</p>;
  const actual = calculateActualSummary(profile, month);
  const visible = profile.transactions.filter((item) => item.date.startsWith(month) && (filter === "all" || item.type === filter) && `${item.note ?? ""} ${transactionHistoryLabel(item)} ${transactionHistoryDetail(profile, item)}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const remove = (item: Transaction) => { if (!window.confirm("Remove this transaction? Its balance impact will be recalculated.")) return; const next = profile.transactions.filter((entry) => entry.id !== item.id); if (cardLedgerValid(profile, next)) save({ ...profile, transactions: next }); };
  const shiftMonth = (offset: number) => { const next = new Date(`${month}-15T12:00:00`); next.setMonth(next.getMonth() + offset); const value = next.toLocaleDateString("en-CA").slice(0, 7); if (value <= monthOf(today())) setMonth(value); };
  return <>{form && <TransactionForm editing={editing} close={() => { setForm(false); setEditing(undefined); }} />}<div className="activity-summary"><strong>{formatMoney(actual.moneyLeft, profile.currency)}</strong><span>Money left this month</span><small>Income received minus expenses recorded this month.</small></div><div className="ledger-controls"><button className="filter-button" type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>←</button><strong>{month}</strong><button className="filter-button" type="button" aria-label="Next month" disabled={month === monthOf(today())} onClick={() => shiftMonth(1)}>→</button><select aria-label="Filter transactions" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All activity</option><option value="income">Income</option><option value="expense">Expenses</option><option value="transfer">Transfers</option><option value="card-payment">Card payments</option></select><input aria-label="Search transactions" placeholder="Search notes or names" value={search} onChange={(event) => setSearch(event.target.value)} /></div>{visible.length ? <div className="transaction-list">{visible.map((item) => <article className="transaction-item" key={item.id}><div><strong>{transactionHistoryLabel(item)}</strong><small>{transactionHistoryDetail(profile, item)}{item.note ? ` · ${item.note}` : ""}</small></div><b className={item.type === "income" ? "positive" : item.type === "expense" ? "negative" : "neutral"}>{item.type === "income" ? "+" : item.type === "expense" ? "−" : ""}{formatMoney(item.amount, profile.currency)}</b><div className="transaction-actions"><button className="text-button" type="button" onClick={() => { setEditing(item); setForm(true); }} aria-label={`Edit ${item.type} on ${item.date}`}>Edit</button><button className="text-button" type="button" onClick={() => remove(item)} aria-label={`Delete ${item.type} on ${item.date}`}>Delete</button></div></article>)}</div> : <div className="transactions-empty"><section className="empty-state"><span className="empty-mark" aria-hidden="true">◌</span><h2>No activity in {month}</h2><p>Your recorded income and expenses will appear here. It’s okay to start with one entry.</p><button className="app-button" type="button" onClick={() => setForm(true)}>Add transaction</button></section></div>}</>;
}
