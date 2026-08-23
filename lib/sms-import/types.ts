import type { Amount, Currency, Transaction } from "../financial-types.ts";

export type SmsImportBank = "fab";
export type SmsImportMessageType = "salary_credit" | "debit_card_purchase" | "outward_remittance" | "inward_remittance" | "atm_cash_withdrawal" | "unsupported";
export type SmsImportConfidence = "high" | "medium" | "low";
export type SmsImportStatus = "ready" | "needs-review" | "duplicate" | "unsupported";

export type SmsImportProposal = {
  id: string;
  bank: SmsImportBank;
  bankMessageType: SmsImportMessageType;
  proposedTransactionType: "income" | "expense" | "transfer" | null;
  amount: Amount | null;
  currency: Currency | null;
  date: string | null;
  time: string | null;
  accountLastFour: string | null;
  cardLastFour: string | null;
  merchantRaw: string | null;
  merchant: string | null;
  direction: "debit" | "credit" | null;
  observedBalanceAfter: Amount | null;
  suggestedCategory: string | null;
  matchedAccountId: string | null;
  matchedCardId: string | null;
  confidence: SmsImportConfidence;
  needsReview: boolean;
  reviewReason: string | null;
  normalizedText: string;
  fingerprint: string;
  parseErrors: string[];
  title: string;
  rawText: string;
  status: SmsImportStatus;
};

export type SmsImportReviewItem = {
  proposal: SmsImportProposal;
  included: boolean;
  transactionType: "income" | "expense" | "transfer" | null;
  category: string;
  incomeCategory: string;
  source: string;
  destination: string;
  note: string;
};

export type FinancialImportRecord = {
  fingerprint: string;
  bank: SmsImportBank;
  messageType: SmsImportMessageType;
  transactionId: string;
  observedBalanceAfter?: Amount;
};

export type SmsImportConversion = { ok: true; transaction: Transaction; record: FinancialImportRecord } | { ok: false; error: string };
