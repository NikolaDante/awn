import type { FinancialProfile, Transaction } from "@/lib/financial-types";

export type FinancialReferenceKind = "account" | "credit-card";

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" ? value as Record<string, unknown> : null;

function transactionReferencesAccount(transaction: unknown, accountId: string) {
  const value = record(transaction);
  if (!value || typeof value.type !== "string") return true;
  if (value.type === "income") return value.destinationAccountId !== undefined && (typeof value.destinationAccountId !== "string" || value.destinationAccountId === accountId);
  if (value.type === "expense") return value.accountId !== undefined && (typeof value.accountId !== "string" || value.accountId === accountId);
  if (value.type === "transfer") return typeof value.sourceAccountId !== "string" || typeof value.destinationAccountId !== "string" || value.sourceAccountId === accountId || value.destinationAccountId === accountId;
  if (value.type === "card-payment") return typeof value.payingAccountId !== "string" || value.payingAccountId === accountId;
  return true;
}

function transactionReferencesCard(transaction: unknown, cardId: string) {
  const value = record(transaction);
  if (!value || typeof value.type !== "string") return true;
  if (value.type === "expense") return value.cardId !== undefined && (typeof value.cardId !== "string" || value.cardId === cardId);
  if (value.type === "card-payment") return typeof value.receivingCardId !== "string" || value.receivingCardId === cardId;
  if (["income", "transfer"].includes(value.type)) return false;
  return true;
}

export function hasLinkedAccountActivity(profile: FinancialProfile, accountId: string) {
  return profile.transactions.some((transaction) => transactionReferencesAccount(transaction, accountId));
}

export function hasLinkedCardActivity(profile: FinancialProfile, cardId: string) {
  return profile.transactions.some((transaction) => transactionReferencesCard(transaction, cardId));
}

export function removedFinancialReference(previous: FinancialProfile, candidate: FinancialProfile): FinancialReferenceKind | null {
  const remainingAccounts = new Set(candidate.accounts.map((account) => account.id));
  for (const account of previous.accounts) if (!remainingAccounts.has(account.id) && hasLinkedAccountActivity(previous, account.id)) return "account";
  const remainingCards = new Set(candidate.creditCards.map((card) => card.id));
  for (const card of previous.creditCards) if (!remainingCards.has(card.id) && hasLinkedCardActivity(previous, card.id)) return "credit-card";
  return null;
}

export function removalGuardMessage(kind: FinancialReferenceKind) {
  return kind === "account"
    ? "This account has recorded transactions. Reassign or delete those transactions before removing it."
    : "This credit card has recorded transactions. Reassign or delete those transactions before removing it.";
}

export function transactionHistoryLabel(transaction: Transaction) {
  if (transaction.type === "income") return transaction.incomeSourceName || "Income";
  if (transaction.type === "expense") return transaction.category || "Uncategorised expense";
  if (transaction.type === "transfer") return "Account transfer";
  return "Credit-card payment";
}

const referenceName = (items: { id: string; name: string }[], id: string | undefined, missing: string) => id ? items.find((item) => item.id === id)?.name ?? missing : "Unlinked";

export function transactionHistoryDetail(profile: FinancialProfile, transaction: Transaction) {
  if (transaction.type === "income") return transaction.destinationAccountId ? `${transaction.date} · To ${referenceName(profile.accounts, transaction.destinationAccountId, "Former account")}` : `${transaction.date} · No account linked`;
  if (transaction.type === "expense") return `${transaction.date} · ${transaction.accountId ? referenceName(profile.accounts, transaction.accountId, "Former account") : transaction.cardId ? referenceName(profile.creditCards, transaction.cardId, "Former credit card") : "Unlinked"}`;
  if (transaction.type === "transfer") return `${transaction.date} · ${referenceName(profile.accounts, transaction.sourceAccountId, "Former account")} → ${referenceName(profile.accounts, transaction.destinationAccountId, "Former account")}`;
  return `${transaction.date} · ${referenceName(profile.accounts, transaction.payingAccountId, "Former account")} → ${referenceName(profile.creditCards, transaction.receivingCardId, "Former credit card")}`;
}
