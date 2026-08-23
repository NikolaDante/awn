import { mutateLedger, UNBUDGETED_CATEGORY } from "../financial-ledger.ts";
import { newLocalId, type Account, type DebitCard, type FinancialProfile, type Transaction } from "../financial-types.ts";
import type { FinancialImportRecord, SmsImportConversion, SmsImportProposal, SmsImportReviewItem } from "./types.ts";

const bankAlias = (name: string) => /(^|\b)fab(\b|$)|first\s+abu\s+dhabi/i.test(name);
const encode = (kind: string, id?: string | null) => `${kind}:${id ?? ""}`;
export const decodeSmsEndpoint = (value: string) => { const [kind, ...rest] = value.split(":"); return { kind, id: rest.join(":") || undefined }; };

function preferredUnique<T extends { name: string }>(matches: T[]) {
  if (matches.length === 1) return { match: matches[0], reason: null };
  const fabMatches = matches.filter((item) => bankAlias(item.name));
  if (fabMatches.length === 1) return { match: fabMatches[0], reason: null };
  return { match: null, reason: matches.length ? "More than one matching FAB instrument was found." : "No matching FAB instrument was found." };
}

function accountMatch(profile: FinancialProfile, lastFour: string | null) {
  if (!lastFour) return { match: null as Account | null, reason: "Choose the matching account." };
  return preferredUnique(profile.accounts.filter((item) => item.type !== "cash" && item.lastFour === lastFour));
}

function debitMatch(profile: FinancialProfile, lastFour: string | null) {
  if (!lastFour) return { match: null as DebitCard | null, reason: "Choose the matching debit card." };
  return preferredUnique((profile.debitCards ?? []).filter((item) => item.lastFour === lastFour));
}

function instrumentCurrency(profile: FinancialProfile, proposal: SmsImportProposal) {
  if (proposal.matchedCardId) return profile.debitCards?.find((item) => item.id === proposal.matchedCardId)?.currency;
  if (proposal.matchedAccountId) return profile.accounts.find((item) => item.id === proposal.matchedAccountId)?.currency ?? profile.currency;
  return null;
}

export function matchSmsProposal(profile: FinancialProfile, proposal: SmsImportProposal): SmsImportProposal {
  if (proposal.status === "unsupported") return proposal;
  let matchedAccountId: string | null = null; let matchedCardId: string | null = null; let matchReason: string | null = null;
  if (proposal.accountLastFour) {
    const result = accountMatch(profile, proposal.accountLastFour);
    matchedAccountId = result.match?.id ?? null;
    matchReason = result.reason;
  }
  if (proposal.bankMessageType === "debit_card_purchase") {
    const result = debitMatch(profile, proposal.cardLastFour);
    matchedCardId = result.match?.id ?? null;
    matchReason = result.reason;
    if (result.match && !result.match.linkedAccountId) matchReason = "Link this debit card to an account or choose another card.";
  }
  const candidate = { ...proposal, matchedAccountId, matchedCardId };
  const selectedCurrency = instrumentCurrency(profile, candidate);
  if (selectedCurrency && proposal.currency && selectedCurrency !== proposal.currency) matchReason = `The SMS uses ${proposal.currency}, but the matched instrument uses ${selectedCurrency}. AWN does not convert currencies.`;
  const intrinsicallyAmbiguous = proposal.bankMessageType === "outward_remittance" || proposal.bankMessageType === "inward_remittance";
  const requiredMatchMissing = proposal.bankMessageType === "debit_card_purchase" ? !matchedCardId : !matchedAccountId;
  const needsReview = intrinsicallyAmbiguous || requiredMatchMissing || Boolean(matchReason);
  return { ...candidate, needsReview, reviewReason: matchReason ?? proposal.reviewReason, status: needsReview ? "needs-review" : "ready" };
}

function initialReviewItem(proposal: SmsImportProposal): SmsImportReviewItem {
  const source = proposal.bankMessageType === "debit_card_purchase" ? encode("debit", proposal.matchedCardId) : proposal.bankMessageType === "outward_remittance" || proposal.bankMessageType === "atm_cash_withdrawal" ? encode("account", proposal.matchedAccountId) : "";
  const destination = proposal.bankMessageType === "salary_credit" || proposal.bankMessageType === "inward_remittance" ? encode("account", proposal.matchedAccountId) : proposal.bankMessageType === "atm_cash_withdrawal" ? encode("cash") : "";
  return { proposal, included: proposal.status !== "duplicate" && proposal.status !== "unsupported", transactionType: proposal.proposedTransactionType, category: proposal.suggestedCategory ?? UNBUDGETED_CATEGORY, incomeCategory: proposal.suggestedCategory ?? "Miscellaneous Income", source, destination, note: proposal.title };
}

export function prepareSmsReview(profile: FinancialProfile, proposals: SmsImportProposal[], importedFingerprints: ReadonlySet<string>) {
  const batch = new Set<string>();
  return proposals.map((raw) => {
    let proposal = matchSmsProposal(profile, raw);
    if (importedFingerprints.has(proposal.fingerprint) || batch.has(proposal.fingerprint)) proposal = { ...proposal, status: "duplicate", needsReview: false, reviewReason: "This FAB message was already imported." };
    batch.add(proposal.fingerprint);
    return initialReviewItem(proposal);
  });
}

function endpointCurrency(profile: FinancialProfile, value: string) {
  const endpoint = decodeSmsEndpoint(value);
  if (endpoint.kind === "cash") return profile.currency;
  if (endpoint.kind === "account") return profile.accounts.find((item) => item.id === endpoint.id)?.currency ?? profile.currency;
  if (endpoint.kind === "debit") return profile.debitCards?.find((item) => item.id === endpoint.id)?.currency;
  if (endpoint.kind === "credit") return profile.creditCards.find((item) => item.id === endpoint.id)?.currency ?? profile.currency;
  return null;
}

export function smsReviewError(profile: FinancialProfile, item: SmsImportReviewItem) {
  if (!item.included) return null;
  const proposal = item.proposal;
  if (proposal.status === "duplicate" || proposal.status === "unsupported" || proposal.parseErrors.length || !proposal.amount || !proposal.currency || !proposal.date) return proposal.reviewReason ?? "Exclude this unsupported message.";
  if (!item.transactionType) return proposal.bankMessageType === "outward_remittance" ? "Choose Expense or Transfer." : "Choose Income or Transfer.";
  if (item.transactionType === "income" && !item.destination) return "Choose where the income was received.";
  if (item.transactionType === "expense" && !item.source) return "Choose how the expense was paid.";
  if (item.transactionType === "expense" && !item.category.trim()) return "Choose an expense category.";
  if (item.transactionType === "transfer" && (!item.source || !item.destination)) return "Choose both transfer balances.";
  if (item.transactionType === "transfer" && item.source === item.destination) return "Choose different transfer balances.";
  const relevantEndpoints = item.transactionType === "income" ? [item.destination] : item.transactionType === "expense" ? [item.source] : [item.source, item.destination];
  const currencies = relevantEndpoints.map((endpoint) => endpointCurrency(profile, endpoint));
  if (currencies.some((currency) => !currency)) return "Choose a valid account or card.";
  if (currencies.some((currency) => currency !== proposal.currency)) return `Choose instruments using ${proposal.currency}. AWN does not convert currencies.`;
  if (item.transactionType === "expense" && decodeSmsEndpoint(item.source).kind === "debit") {
    const card = profile.debitCards?.find((candidate) => candidate.id === decodeSmsEndpoint(item.source).id);
    if (!card?.linkedAccountId) return "Link this debit card to an account or choose another source.";
  }
  return null;
}

export function smsReviewResolved(profile: FinancialProfile, item: SmsImportReviewItem) {
  return smsReviewError(profile, item) === null;
}

export function smsReviewToTransaction(profile: FinancialProfile, item: SmsImportReviewItem, now = new Date().toISOString()): SmsImportConversion {
  const proposal = item.proposal;
  const error = smsReviewError(profile, item);
  if (error || !item.included || !item.transactionType || !proposal.amount || !proposal.date) return { ok: false, error: error ?? "This message is excluded." };
  const id = newLocalId();
  const base = { id, amount: proposal.amount, date: proposal.date, note: item.note.trim() || proposal.title, import: { origin: "sms" as const, bank: "fab" as const, messageType: proposal.bankMessageType, fingerprint: proposal.fingerprint, observedBalanceAfter: proposal.observedBalanceAfter ?? undefined }, createdAt: now, updatedAt: now };
  let transaction: Transaction;
  if (item.transactionType === "income") { const destination = decodeSmsEndpoint(item.destination); transaction = { ...base, type: "income", incomeSourceName: item.incomeCategory.trim() || "Miscellaneous Income", destinationKind: destination.kind as "cash" | "account", destinationId: destination.id }; }
  else if (item.transactionType === "expense") { const source = decodeSmsEndpoint(item.source); transaction = { ...base, type: "expense", category: item.category.trim() || UNBUDGETED_CATEGORY, sourceKind: source.kind as "cash" | "account" | "debit" | "credit", sourceId: source.id }; }
  else { const source = decodeSmsEndpoint(item.source); const destination = decodeSmsEndpoint(item.destination); transaction = { ...base, type: "transfer", sourceKind: source.kind as "cash" | "account", sourceId: source.id, destinationKind: destination.kind as "cash" | "account" | "credit", destinationId: destination.id }; }
  return { ok: true, transaction, record: { fingerprint: proposal.fingerprint, bank: "fab", messageType: proposal.bankMessageType, transactionId: id, observedBalanceAfter: proposal.observedBalanceAfter ?? undefined } };
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
