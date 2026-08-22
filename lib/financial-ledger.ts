import type { Amount, ExpenseTransaction, FinancialProfile, Transaction } from "./financial-types.ts";

export const UNBUDGETED_CATEGORY = "Other (Unbudgeted)";

export type LedgerBalances = { cash: Amount; accounts: Record<string, Amount>; cards: Record<string, Amount>; availableCredit: Record<string, Amount> };
export type LedgerValidation = { valid: true; balances: LedgerBalances } | { valid: false; error: string };
export type LedgerMutation = { kind: "add"; transaction: Transaction } | { kind: "edit"; transaction: Transaction } | { kind: "delete"; id: string };
export type LedgerMutationResult = { ok: true; profile: FinancialProfile; balances: LedgerBalances } | { ok: false; error: string };

export const orderTransactions = (transactions: Transaction[]) => [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

export function transferValidationMessage(source: string, destination: string) {
  if (!source) return "Choose where the transfer is coming from.";
  if (!destination) return "Choose where the transfer is going.";
  if (source === destination) return "Choose different From and To balances.";
  return null;
}

export function normalizeTransaction(profile: FinancialProfile, transaction: Transaction): Transaction {
  if (transaction.type === "income") return transaction.destinationKind || !transaction.destinationAccountId ? transaction : { ...transaction, destinationKind: "account", destinationId: transaction.destinationAccountId };
  if (transaction.type === "expense") {
    const category = transaction.category.trim() || UNBUDGETED_CATEGORY;
    if (transaction.sourceKind) return { ...transaction, category };
    if (transaction.accountId) return { ...transaction, category, sourceKind: "account", sourceId: transaction.accountId };
    if (transaction.cardId) return { ...transaction, category, sourceKind: "credit", sourceId: transaction.cardId };
    return { ...transaction, category };
  }
  if (transaction.type === "transfer") {
    if (transaction.sourceKind && transaction.destinationKind) return transaction;
    return { ...transaction, sourceKind: "account", sourceId: transaction.sourceAccountId, destinationKind: "account", destinationId: transaction.destinationAccountId };
  }
  const accountExists = profile.accounts.some((item) => item.id === transaction.payingAccountId);
  const cardExists = profile.creditCards.some((item) => item.id === transaction.receivingCardId);
  if (!accountExists || !cardExists) return transaction;
  return { id: transaction.id, type: "transfer", amount: transaction.amount, date: transaction.date, note: transaction.note, createdAt: transaction.createdAt, updatedAt: transaction.updatedAt, sourceKind: "account", sourceId: transaction.payingAccountId, destinationKind: "credit", destinationId: transaction.receivingCardId };
}

export function normalizeLedgerProfile(profile: FinancialProfile): FinancialProfile {
  return { ...profile, cashBalance: profile.cashBalance ?? 0, transactions: profile.transactions.map((item) => normalizeTransaction(profile, item)) };
}

function initialBalances(profile: FinancialProfile): LedgerBalances {
  const accounts: Record<string, Amount> = {};
  const cards: Record<string, Amount> = {};
  const availableCredit: Record<string, Amount> = {};
  profile.accounts.forEach((account) => { accounts[account.id] = account.balance; });
  profile.creditCards.forEach((card) => { cards[card.id] = card.owed; availableCredit[card.id] = card.limit - card.owed; });
  return { cash: profile.cashBalance ?? 0, accounts, cards, availableCredit };
}

function debitAccount(profile: FinancialProfile, id: string | undefined) {
  return profile.debitCards?.find((card) => card.id === id)?.linkedAccountId;
}

function assetKey(profile: FinancialProfile, kind: string | undefined, id: string | undefined) {
  if (kind === "cash") return "cash";
  if (kind === "account" && id && profile.accounts.some((item) => item.id === id)) return `account:${id}`;
  if (kind === "debit") {
    const linked = debitAccount(profile, id);
    if (linked && profile.accounts.some((item) => item.id === linked)) return `account:${linked}`;
  }
  return null;
}

function changeAsset(state: LedgerBalances, key: string, amount: Amount) {
  if (key === "cash") state.cash += amount;
  else state.accounts[key.slice(8)] += amount;
}

function assetBalance(state: LedgerBalances, key: string) { return key === "cash" ? state.cash : state.accounts[key.slice(8)]; }
function assetLabel(profile: FinancialProfile, key: string) { return key === "cash" ? "Cash" : profile.accounts.find((item) => item.id === key.slice(8))?.name ?? "Account"; }
function money(profile: FinancialProfile, amount: Amount) { return new Intl.NumberFormat("en", { style: "currency", currency: profile.currency, minimumFractionDigits: 2 }).format(amount / 100); }

function boundsError(profile: FinancialProfile, state: LedgerBalances) {
  if (state.cash < 0) return "Cash cannot go below zero.";
  for (const account of profile.accounts) if (state.accounts[account.id] < 0) return `${account.name} cannot go below zero.`;
  for (const card of profile.creditCards) {
    const owed = state.cards[card.id];
    if (owed < 0) return `That repayment is higher than the amount owed on ${card.name}.`;
    if (owed > card.limit) return `That expense is higher than the available credit on ${card.name}.`;
    state.availableCredit[card.id] = card.limit - owed;
  }
  return null;
}

function applyOne(profile: FinancialProfile, state: LedgerBalances, raw: Transaction) {
  const transaction = normalizeTransaction(profile, raw);
  if (!Number.isSafeInteger(transaction.amount) || transaction.amount <= 0) return "Enter an amount above zero.";
  if (transaction.type === "income") {
    const destination = assetKey(profile, transaction.destinationKind, transaction.destinationId);
    if (!destination) {
      if (!transaction.destinationKind && !transaction.destinationAccountId) return null; // legacy unlinked income
      return "Choose where the income was received.";
    }
    changeAsset(state, destination, transaction.amount);
  } else if (transaction.type === "expense") {
    if (transaction.sourceKind === "credit") {
      if (!transaction.sourceId || state.cards[transaction.sourceId] === undefined) return "Choose a valid credit card.";
      const card = profile.creditCards.find((item) => item.id === transaction.sourceId)!;
      const available = card.limit - state.cards[transaction.sourceId];
      if (transaction.amount > available) return `${card.name} has ${money(profile, available)} available credit. This expense requires ${money(profile, transaction.amount)}.`;
      state.cards[transaction.sourceId] += transaction.amount;
    } else {
      const source = assetKey(profile, transaction.sourceKind, transaction.sourceId);
      if (!source) {
        if (!transaction.sourceKind && !transaction.accountId && !transaction.cardId) return null; // legacy unlinked expense
        return transaction.sourceKind === "debit" ? "Link this debit card to an account before using it." : "Choose how this expense was paid.";
      }
      const available = assetBalance(state, source);
      if (transaction.amount > available) return `${assetLabel(profile, source)} has ${money(profile, available)} available. This transaction requires ${money(profile, transaction.amount)}.`;
      changeAsset(state, source, -transaction.amount);
    }
  } else if (transaction.type === "transfer") {
    const endpointError = transferValidationMessage(transaction.sourceKind ? `${transaction.sourceKind}:${transaction.sourceId ?? ""}` : "", transaction.destinationKind ? `${transaction.destinationKind}:${transaction.destinationId ?? ""}` : "");
    if (endpointError) return endpointError;
    const source = assetKey(profile, transaction.sourceKind, transaction.sourceId);
    const destination = transaction.destinationKind === "credit" && transaction.destinationId && state.cards[transaction.destinationId] !== undefined ? `credit:${transaction.destinationId}` : assetKey(profile, transaction.destinationKind, transaction.destinationId);
    if (!source || !destination) return "Choose valid transfer endpoints.";
    if (source === destination) return "Choose different From and To balances.";
    const available = assetBalance(state, source);
    if (transaction.amount > available) return `${assetLabel(profile, source)} has ${money(profile, available)} available. This transaction requires ${money(profile, transaction.amount)}.`;
    if (destination.startsWith("credit:")) {
      const card = profile.creditCards.find((item) => item.id === destination.slice(7))!;
      const owed = state.cards[card.id];
      if (transaction.amount > owed) return `${card.name} currently has ${money(profile, owed)} outstanding. This repayment is ${money(profile, transaction.amount)}.`;
    }
    changeAsset(state, source, -transaction.amount);
    if (destination.startsWith("credit:")) state.cards[destination.slice(7)] -= transaction.amount;
    else changeAsset(state, destination, transaction.amount);
  } else {
    if (state.accounts[transaction.payingAccountId] === undefined || state.cards[transaction.receivingCardId] === undefined) return null;
    state.accounts[transaction.payingAccountId] -= transaction.amount;
    state.cards[transaction.receivingCardId] -= transaction.amount;
  }
  return boundsError(profile, state);
}

export function validateLedger(profile: FinancialProfile, transactions = profile.transactions): LedgerValidation {
  const normalized = normalizeLedgerProfile(profile);
  const balances = initialBalances(normalized);
  const openingError = boundsError(normalized, balances);
  if (openingError) return { valid: false, error: openingError };
  for (const transaction of orderTransactions(transactions)) {
    const error = applyOne(normalized, balances, transaction);
    if (error) return { valid: false, error };
  }
  return { valid: true, balances };
}

export function ledgerBalancesAt(profile: FinancialProfile, beforeDate?: string): LedgerBalances {
  const normalized = normalizeLedgerProfile(profile);
  const transactions = beforeDate ? normalized.transactions.filter((item) => item.date < beforeDate) : normalized.transactions;
  const result = validateLedger(normalized, transactions);
  return result.valid ? result.balances : initialBalances(normalized);
}

export function mutateLedger(profile: FinancialProfile, mutation: LedgerMutation): LedgerMutationResult {
  const normalized = normalizeLedgerProfile(profile);
  let transactions: Transaction[];
  if (mutation.kind === "add") transactions = [...normalized.transactions, normalizeTransaction(normalized, mutation.transaction)];
  else if (mutation.kind === "edit") {
    if (!normalized.transactions.some((item) => item.id === mutation.transaction.id)) return { ok: false, error: "That transaction no longer exists." };
    transactions = normalized.transactions.map((item) => item.id === mutation.transaction.id ? normalizeTransaction(normalized, { ...mutation.transaction, createdAt: item.createdAt }) : item);
  } else {
    if (!normalized.transactions.some((item) => item.id === mutation.id)) return { ok: false, error: "That transaction no longer exists." };
    transactions = normalized.transactions.filter((item) => item.id !== mutation.id);
  }
  const validation = validateLedger(normalized, transactions);
  if (!validation.valid) return { ok: false, error: validation.error };
  return { ok: true, profile: { ...normalized, transactions }, balances: validation.balances };
}

export function setCurrentCashBalance(profile: FinancialProfile, currentCash: Amount): LedgerMutationResult {
  if (!Number.isSafeInteger(currentCash) || currentCash < 0) return { ok: false, error: "Cash balance cannot be below zero." };
  const normalized = normalizeLedgerProfile(profile);
  const current = ledgerBalancesAt(normalized).cash;
  const candidate = { ...normalized, cashBalance: (normalized.cashBalance ?? 0) + currentCash - current };
  const validation = validateLedger(candidate);
  if (!validation.valid) return { ok: false, error: validation.error };
  return { ok: true, profile: candidate, balances: validation.balances };
}

export function periodCategories(profile: FinancialProfile, transactions: Transaction[]) {
  const spending: Record<string, Amount> = {};
  transactions.filter((item): item is ExpenseTransaction => item.type === "expense").forEach((item) => {
    const category = item.category.trim() || UNBUDGETED_CATEGORY;
    spending[category] = (spending[category] ?? 0) + item.amount;
  });
  return spending;
}
