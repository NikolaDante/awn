import { mutateLedger, UNBUDGETED_CATEGORY } from "../financial-ledger.ts";
import { newLocalId, type Account, type DebitCard, type FinancialProfile, type Transaction } from "../financial-types.ts";
import { matchesSmsBankAlias, smsBankAliases } from "./coordinator.ts";
import type { FinancialImportRecord, SmsImportBank, SmsImportConversion, SmsImportProposal, SmsImportReviewItem, SmsImportStatus } from "./types.ts";

const encode = (kind: string, id?: string | null) => kind === "cash" ? "cash:" : id ? `${kind}:${id}` : "";
export const decodeSmsEndpoint = (value: string) => { const [kind, ...rest] = value.split(":"); return { kind, id: rest.join(":") || undefined }; };

function bankLabel(bank: SmsImportBank) {
  return smsBankAliases(bank)[0];
}

function accountMatch(profile: FinancialProfile, proposal: SmsImportProposal) {
  const bank = proposal.bank;
  if (!bank || !proposal.accountLastFour) return { match: null as Account | null, reason: "Choose the matching account." };
  const suffixMatches = profile.accounts.filter((item) => item.type !== "cash" && item.lastFour === proposal.accountLastFour);
  const bankMatches = suffixMatches.filter((item) => matchesSmsBankAlias(bank, item.name));
  if (!bankMatches.length) return { match: null as Account | null, reason: `No matching ${bankLabel(bank)} account was found.` };
  const currencyMatches = proposal.currency ? bankMatches.filter((item) => (item.currency ?? profile.currency) === proposal.currency) : bankMatches;
  if (!currencyMatches.length && bankMatches.length === 1) {
    const match = bankMatches[0];
    return { match, reason: `The SMS uses ${proposal.currency}, but the matched instrument uses ${match.currency ?? profile.currency}. AWN does not convert currencies.` };
  }
  if (currencyMatches.length === 1) return { match: currencyMatches[0], reason: null };
  return { match: null as Account | null, reason: `More than one matching ${bankLabel(bank)} account was found.` };
}

function debitMatch(profile: FinancialProfile, proposal: SmsImportProposal) {
  const bank = proposal.bank;
  if (!bank || !proposal.cardLastFour) return { match: null as DebitCard | null, reason: "Choose the matching debit card." };
  const suffixMatches = (profile.debitCards ?? []).filter((item) => item.lastFour === proposal.cardLastFour);
  const bankMatches = suffixMatches.filter((item) => matchesSmsBankAlias(bank, item.name));
  if (!bankMatches.length) return { match: null as DebitCard | null, reason: `No matching ${bankLabel(bank)} debit card was found.` };
  const currencyMatches = proposal.currency ? bankMatches.filter((item) => item.currency === proposal.currency) : bankMatches;
  if (!currencyMatches.length && bankMatches.length === 1) {
    const match = bankMatches[0];
    return { match, reason: `The SMS uses ${proposal.currency}, but the matched instrument uses ${match.currency}. AWN does not convert currencies.` };
  }
  const linkedMatches = currencyMatches.filter((item) => item.linkedAccountId && profile.accounts.some((account) => account.id === item.linkedAccountId));
  if (linkedMatches.length === 1) return { match: linkedMatches[0], reason: null };
  if (linkedMatches.length > 1 || currencyMatches.length > 1) return { match: null as DebitCard | null, reason: `More than one matching ${bankLabel(bank)} debit card was found.` };
  if (currencyMatches.length === 1) return { match: currencyMatches[0], reason: "Link this debit card to an account or choose another card." };
  return { match: null as DebitCard | null, reason: `No matching ${bankLabel(bank)} debit card was found.` };
}

export function matchSmsProposal(profile: FinancialProfile, proposal: SmsImportProposal): SmsImportProposal {
  if (proposal.status === "unsupported" || !proposal.bank) return proposal;
  let matchedAccountId: string | null = null; let matchedCardId: string | null = null; let matchReason: string | null = null;
  if (proposal.accountLastFour) {
    const result = accountMatch(profile, proposal);
    matchedAccountId = result.match?.id ?? null;
    matchReason = result.reason;
  }
  if (proposal.bankMessageType === "debit_card_purchase") {
    const result = debitMatch(profile, proposal);
    matchedCardId = result.match?.id ?? null;
    matchReason = result.reason;
  }
  const intrinsicallyAmbiguous = proposal.bankMessageType === "outward_remittance" || proposal.bankMessageType === "inward_remittance";
  const requiredMatchMissing = proposal.bankMessageType === "debit_card_purchase" ? !matchedCardId : !matchedAccountId;
  const needsReview = intrinsicallyAmbiguous || requiredMatchMissing || Boolean(matchReason);
  return { ...proposal, matchedAccountId, matchedCardId, needsReview, reviewReason: matchReason ?? proposal.reviewReason, status: needsReview ? "needs-review" : "ready" };
}

function initialReviewItem(proposal: SmsImportProposal): SmsImportReviewItem {
  const source = proposal.bankMessageType === "debit_card_purchase" ? encode("debit", proposal.matchedCardId) : proposal.bankMessageType === "outward_remittance" || proposal.bankMessageType === "atm_cash_withdrawal" ? encode("account", proposal.matchedAccountId) : "";
  const destination = proposal.bankMessageType === "salary_credit" || proposal.bankMessageType === "inward_remittance" ? encode("account", proposal.matchedAccountId) : proposal.bankMessageType === "atm_cash_withdrawal" ? encode("cash") : "";
  return { proposal, included: proposal.status !== "duplicate", transactionType: proposal.proposedTransactionType, category: proposal.suggestedCategory ?? UNBUDGETED_CATEGORY, incomeCategory: proposal.suggestedCategory ?? "Miscellaneous Income", source, destination, note: proposal.title };
}

type ResolvedEndpoint = { kind: "cash" | "account" | "debit" | "credit"; id?: string; currency: FinancialProfile["currency"] };

function resolveEndpoint(profile: FinancialProfile, value: string): ResolvedEndpoint | null {
  const endpoint = decodeSmsEndpoint(value);
  if (endpoint.kind === "cash" && !endpoint.id) return { kind: "cash", currency: profile.currency };
  if (endpoint.kind === "account" && endpoint.id) {
    const account = profile.accounts.find((item) => item.id === endpoint.id && item.type !== "cash");
    return account ? { kind: "account", id: account.id, currency: account.currency ?? profile.currency } : null;
  }
  if (endpoint.kind === "debit" && endpoint.id) {
    const card = profile.debitCards?.find((item) => item.id === endpoint.id);
    return card ? { kind: "debit", id: card.id, currency: card.currency } : null;
  }
  if (endpoint.kind === "credit" && endpoint.id) {
    const card = profile.creditCards.find((item) => item.id === endpoint.id);
    return card ? { kind: "credit", id: card.id, currency: card.currency ?? profile.currency } : null;
  }
  return null;
}

function allowedTransactionType(proposal: SmsImportProposal, type: SmsImportReviewItem["transactionType"]) {
  if (proposal.bankMessageType === "salary_credit") return type === "income";
  if (proposal.bankMessageType === "debit_card_purchase") return type === "expense";
  if (proposal.bankMessageType === "atm_cash_withdrawal") return type === "transfer";
  if (proposal.bankMessageType === "outward_remittance") return type === "expense" || type === "transfer";
  if (proposal.bankMessageType === "inward_remittance") return type === "income" || type === "transfer";
  return false;
}

function transactionFromReview(item: SmsImportReviewItem, id: string, now: string): Transaction | null {
  const proposal = item.proposal;
  if (!proposal.bank || !item.transactionType || !proposal.amount || !proposal.date) return null;
  const base = { id, amount: proposal.amount, date: proposal.date, note: item.note.trim() || proposal.title, import: { origin: "sms" as const, bank: proposal.bank, messageType: proposal.bankMessageType, fingerprint: proposal.fingerprint, observedBalanceAfter: proposal.observedBalanceAfter ?? undefined }, createdAt: now, updatedAt: now };
  if (item.transactionType === "income") { const destination = decodeSmsEndpoint(item.destination); return { ...base, type: "income", incomeSourceName: item.incomeCategory.trim() || "Miscellaneous Income", destinationKind: destination.kind as "cash" | "account", destinationId: destination.id }; }
  if (item.transactionType === "expense") { const source = decodeSmsEndpoint(item.source); return { ...base, type: "expense", category: item.category.trim() || UNBUDGETED_CATEGORY, sourceKind: source.kind as "cash" | "account" | "debit" | "credit", sourceId: source.id }; }
  const source = decodeSmsEndpoint(item.source); const destination = decodeSmsEndpoint(item.destination);
  return { ...base, type: "transfer", sourceKind: source.kind as "cash" | "account", sourceId: source.id, destinationKind: destination.kind as "cash" | "account" | "credit", destinationId: destination.id };
}

export type SmsProposalReadiness = { status: SmsImportStatus; error: string | null };

export function smsProposalReadiness(profile: FinancialProfile, item: SmsImportReviewItem): SmsProposalReadiness {
  const proposal = item.proposal;
  if (proposal.status === "duplicate") return { status: "duplicate", error: proposal.reviewReason ?? "This bank message was already imported." };
  if (proposal.status === "unsupported" || !proposal.bank || proposal.parseErrors.length) return { status: "unsupported", error: proposal.reviewReason ?? "This bank or message format isn't supported yet." };
  if (!Number.isSafeInteger(proposal.amount) || (proposal.amount ?? 0) <= 0) return { status: "needs-review", error: "Enter an amount above zero." };
  if (!proposal.currency) return { status: "needs-review", error: "Choose a valid currency." };
  if (!proposal.date || !/^\d{4}-\d{2}-\d{2}$/.test(proposal.date)) return { status: "needs-review", error: "Choose a valid date." };
  if (!item.transactionType || !allowedTransactionType(proposal, item.transactionType)) return { status: "needs-review", error: proposal.bankMessageType === "outward_remittance" ? "Choose Expense or Transfer." : proposal.bankMessageType === "inward_remittance" ? "Choose Income or Transfer." : "Choose a valid transaction type." };

  const source = item.source ? resolveEndpoint(profile, item.source) : null;
  const destination = item.destination ? resolveEndpoint(profile, item.destination) : null;
  if (item.transactionType === "income") {
    if (!destination) return { status: "needs-review", error: "Choose where the income was received." };
    if (destination.kind !== "cash" && destination.kind !== "account") return { status: "needs-review", error: "Choose a valid income destination." };
    if (!item.incomeCategory.trim()) return { status: "needs-review", error: "Choose an income category." };
  }
  if (item.transactionType === "expense") {
    if (!source) return { status: "needs-review", error: "Choose how the expense was paid." };
    if (!item.category.trim()) return { status: "needs-review", error: "Choose an expense category." };
    if (proposal.bankMessageType === "debit_card_purchase" && source.kind !== "debit") return { status: "needs-review", error: "Choose the matching debit card." };
    if (source.kind === "debit") {
      const card = profile.debitCards?.find((candidate) => candidate.id === source.id);
      if (!card?.linkedAccountId || !profile.accounts.some((account) => account.id === card.linkedAccountId)) return { status: "needs-review", error: "Link this debit card to an account or choose another source." };
    }
  }
  if (item.transactionType === "transfer") {
    if (!source || !destination) return { status: "needs-review", error: "Choose both transfer balances." };
    if (item.source === item.destination) return { status: "needs-review", error: "Choose different transfer balances." };
    if (source.kind !== "cash" && source.kind !== "account") return { status: "needs-review", error: "Choose a valid transfer source." };
    if (destination.kind !== "cash" && destination.kind !== "account" && destination.kind !== "credit") return { status: "needs-review", error: "Choose a valid transfer destination." };
    if (proposal.bankMessageType === "atm_cash_withdrawal" && (source.kind !== "account" || destination.kind !== "cash")) return { status: "needs-review", error: "Choose the debited account and Cash for this withdrawal." };
  }

  const endpoints = item.transactionType === "income" ? [destination!] : item.transactionType === "expense" ? [source!] : [source!, destination!];
  if (endpoints.some((endpoint) => endpoint.currency !== proposal.currency)) return { status: "needs-review", error: `Choose instruments using ${proposal.currency}. AWN does not convert currencies.` };

  const previewTransaction = transactionFromReview(item, `sms-readiness-${proposal.id}`, `${proposal.date}T00:00:00.000Z`);
  if (!previewTransaction) return { status: "needs-review", error: "Complete the required transaction details." };
  const ledgerResult = mutateLedger(profile, { kind: "add", transaction: previewTransaction });
  if (!ledgerResult.ok) return { status: "needs-review", error: ledgerResult.error };
  return { status: "ready", error: null };
}

export function prepareSmsReview(profile: FinancialProfile, proposals: SmsImportProposal[], importedFingerprints: ReadonlySet<string>) {
  const batch = new Set<string>();
  return proposals.map((raw) => {
    let proposal = matchSmsProposal(profile, raw);
    if (importedFingerprints.has(proposal.fingerprint) || batch.has(proposal.fingerprint)) proposal = { ...proposal, status: "duplicate", needsReview: false, reviewReason: "This bank message was already imported." };
    batch.add(proposal.fingerprint);
    let item = initialReviewItem(proposal);
    if (proposal.status !== "duplicate" && proposal.status !== "unsupported") {
      const readiness = smsProposalReadiness(profile, item);
      proposal = { ...proposal, status: readiness.status, needsReview: readiness.status === "needs-review", reviewReason: readiness.error };
      item = { ...item, proposal };
    }
    return item;
  });
}

export function smsReviewError(profile: FinancialProfile, item: SmsImportReviewItem) {
  return smsProposalReadiness(profile, item).error;
}

export function smsReviewResolved(profile: FinancialProfile, item: SmsImportReviewItem) {
  return smsProposalReadiness(profile, item).status === "ready";
}

export function smsReviewToTransaction(profile: FinancialProfile, item: SmsImportReviewItem, now = new Date().toISOString()): SmsImportConversion {
  if (!item.included) return { ok: false, error: "This message is excluded." };
  const readiness = smsProposalReadiness(profile, item);
  if (readiness.status !== "ready") return { ok: false, error: readiness.error ?? "Resolve this transaction before importing." };
  const transaction = transactionFromReview(item, newLocalId(), now);
  if (!transaction || !item.proposal.bank) return { ok: false, error: "Complete the required transaction details." };
  return { ok: true, transaction, record: { fingerprint: item.proposal.fingerprint, bank: item.proposal.bank, messageType: item.proposal.bankMessageType, transactionId: transaction.id, observedBalanceAfter: item.proposal.observedBalanceAfter ?? undefined } };
}

export function applySmsImportBatch(profile: FinancialProfile, items: SmsImportReviewItem[]) {
  let candidate = profile; const records: FinancialImportRecord[] = [];
  for (const item of items.filter((entry) => entry.included)) {
    const converted = smsReviewToTransaction(candidate, item);
    if (!converted.ok) return { ok: false as const, error: converted.error };
    const result = mutateLedger(candidate, { kind: "add", transaction: converted.transaction });
    if (!result.ok) return { ok: false as const, error: result.error };
    candidate = result.profile; records.push(converted.record);
  }
  if (!records.length) return { ok: false as const, error: "Include at least one ready transaction." };
  return { ok: true as const, profile: candidate, records };
}
