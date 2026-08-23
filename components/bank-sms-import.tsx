"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppIcon } from "@/components/app-icons";
import { CategorySelectOptions } from "@/components/category-select-options";
import { useFinancialProfile } from "@/components/financial-provider";
import { ModalDialog } from "@/components/modal-dialog";
import { formatMoney } from "@/lib/financial-calculations";
import { loadFinancialImportFingerprints } from "@/lib/cloud-financial-repository";
import { parseBankSms } from "@/lib/sms-import/coordinator";
import { applySmsImportBatch, prepareSmsReview, smsReviewError } from "@/lib/sms-import/review";
import type { SmsImportReviewItem, SmsImportStatus } from "@/lib/sms-import/types";

const FAB_LABEL = "FAB — First Abu Dhabi Bank";
const incomeCategories = ["Salary", "Refund", "Miscellaneous Income"];

export function ImportBankSmsButton({ secondary = true }: { secondary?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>{open && <BankSmsImportDialog close={() => setOpen(false)} />}<button type="button" className={`app-button${secondary ? " app-button-secondary" : ""}`} onClick={() => setOpen(true)}><AppIcon name="transactions" />Import bank SMS</button></>;
}

function endpointOptions(profile: NonNullable<ReturnType<typeof useFinancialProfile>["profile"]>, mode: "source" | "expense" | "destination") {
  const suffix = (lastFour?: string) => lastFour ? ` ••••${lastFour}` : "";
  return <>
    <optgroup label="Cash"><option value="cash:">Cash</option></optgroup>
    <optgroup label="Accounts">{profile.accounts.filter((item) => item.type !== "cash").map((item) => <option value={`account:${item.id}`} key={item.id}>{item.name}{suffix(item.lastFour)}</option>)}</optgroup>
    {mode === "expense" && <optgroup label="Debit cards">{(profile.debitCards ?? []).map((item) => <option value={`debit:${item.id}`} key={item.id} disabled={!item.linkedAccountId}>{item.name}{suffix(item.lastFour)}{item.linkedAccountId ? "" : " — link an account first"}</option>)}</optgroup>}
    {(mode === "expense" || mode === "destination") && <optgroup label="Credit cards">{profile.creditCards.map((item) => <option value={`credit:${item.id}`} key={item.id}>{item.name}{suffix(item.lastFour)}</option>)}</optgroup>}
  </>;
}

function statusLabel(status: SmsImportStatus, resolved: boolean) {
  if (status === "duplicate") return "Already imported";
  if (status === "unsupported") return "Unsupported";
  return resolved ? "Ready" : "Needs review";
}

function ProposalEditor({ item, profile, update }: { item: SmsImportReviewItem; profile: NonNullable<ReturnType<typeof useFinancialProfile>["profile"]>; update: (patch: Partial<SmsImportReviewItem>) => void }) {
  const proposal = item.proposal;
  const remittance = proposal.bankMessageType === "outward_remittance" || proposal.bankMessageType === "inward_remittance";
  return <div className="sms-import-editor">
    {remittance && <label className="form-field">What was this payment?<select value={item.transactionType ?? ""} onChange={(event) => update({ transactionType: event.target.value as SmsImportReviewItem["transactionType"] })}><option value="">Choose classification</option>{proposal.bankMessageType === "outward_remittance" ? <><option value="expense">Expense</option><option value="transfer">Transfer</option></> : <><option value="income">Income</option><option value="transfer">Transfer</option></>}</select></label>}
    {item.transactionType === "income" && <><label className="form-field">Income category<select value={item.incomeCategory} onChange={(event) => update({ incomeCategory: event.target.value })}>{incomeCategories.map((name) => <option key={name}>{name}</option>)}</select></label><label className="form-field">Received into<select value={item.destination} onChange={(event) => update({ destination: event.target.value })}><option value="">Choose destination</option>{endpointOptions(profile, "source")}</select></label></>}
    {item.transactionType === "expense" && <><label className="form-field">Category<select value={item.category} onChange={(event) => update({ category: event.target.value })}><option value="Other (Unbudgeted)">Other (Unbudgeted)</option><CategorySelectOptions profile={profile} currentName={item.category} /></select></label><label className="form-field">Paid from<select value={item.source} onChange={(event) => update({ source: event.target.value })}><option value="">Choose source</option>{endpointOptions(profile, "expense")}</select></label></>}
    {item.transactionType === "transfer" && <><label className="form-field">From<select value={item.source} onChange={(event) => update({ source: event.target.value })}><option value="">Choose source</option>{endpointOptions(profile, "source")}</select></label><label className="form-field">To<select value={item.destination} onChange={(event) => update({ destination: event.target.value })}><option value="">Choose destination</option>{endpointOptions(profile, "destination")}</select></label></>}
    <label className="form-field sms-import-note">Title / note<input value={item.note} onChange={(event) => update({ note: event.target.value })} /></label>
  </div>;
}

function ProposalCard({ item, profile, expanded, toggle, update }: { item: SmsImportReviewItem; profile: NonNullable<ReturnType<typeof useFinancialProfile>["profile"]>; expanded: boolean; toggle: () => void; update: (patch: Partial<SmsImportReviewItem>) => void }) {
  const proposal = item.proposal; const error = smsReviewError(profile, item); const resolved = !error;
  const date = proposal.date ? new Date(`${proposal.date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Date unavailable";
  const instrument = proposal.matchedCardId ? profile.debitCards?.find((card) => card.id === proposal.matchedCardId)?.name : proposal.matchedAccountId ? profile.accounts.find((account) => account.id === proposal.matchedAccountId)?.name : null;
  return <article className={`sms-proposal is-${proposal.status}${item.included ? "" : " is-excluded"}`}>
    <div className="sms-proposal-main"><div><p className="sms-proposal-title">{proposal.title}</p><strong>{proposal.amount && proposal.currency ? formatMoney(proposal.amount, proposal.currency) : "Amount unavailable"}</strong><small>{item.transactionType ? `${item.transactionType[0].toUpperCase()}${item.transactionType.slice(1)}${item.transactionType === "expense" ? ` · ${item.category}` : item.transactionType === "income" ? ` · ${item.incomeCategory}` : ""}` : "Classification required"}</small><small>{instrument ?? (proposal.accountLastFour ? `Account ••••${proposal.accountLastFour}` : proposal.cardLastFour ? `Card ••••${proposal.cardLastFour}` : "No instrument matched")}</small><small>{date}{proposal.time ? ` · ${proposal.time}` : ""}</small></div><span className={`status-pill is-${resolved ? "positive" : proposal.status === "duplicate" ? "neutral" : "attention"}`}>{statusLabel(proposal.status, resolved)}</span></div>
    {proposal.status === "unsupported" && <pre className="sms-unsupported-preview">{proposal.rawText.slice(0, 240)}</pre>}
    {item.included && error && <p className="form-message is-error" role="status">{error}</p>}
    <div className="sms-proposal-actions"><button className="text-button" type="button" disabled={proposal.status === "duplicate" || proposal.status === "unsupported"} onClick={() => update({ included: !item.included })}>{item.included ? "Exclude" : proposal.status === "duplicate" || proposal.status === "unsupported" ? "Excluded" : "Include"}</button>{proposal.status !== "duplicate" && proposal.status !== "unsupported" && item.included && <button className="text-button" type="button" onClick={toggle}>{expanded ? "Close review" : resolved ? "Edit" : "Review"}</button>}</div>
    {expanded && item.included && <ProposalEditor item={item} profile={profile} update={update} />}
  </article>;
}

export function BankSmsImportDialog({ close }: { close: () => void }) {
  const router = useRouter(); const { profile, activeHouseholdId, importTransactions, saving } = useFinancialProfile();
  const [stage, setStage] = useState<"input" | "review" | "result">("input"); const [input, setInput] = useState(""); const [items, setItems] = useState<SmsImportReviewItem[]>([]); const [expanded, setExpanded] = useState<string | null>(null); const [fingerprints, setFingerprints] = useState<Set<string>>(new Set()); const [historyReady, setHistoryReady] = useState(false); const [error, setError] = useState(""); const [importedCount, setImportedCount] = useState(0);
  useEffect(() => { let active = true; if (!activeHouseholdId) return; loadFinancialImportFingerprints(activeHouseholdId).then((result) => { if (active) { setFingerprints(result); setHistoryReady(true); } }).catch(() => { if (active) { setError("AWN couldn’t load your SMS import history. Try again."); setHistoryReady(true); } }); return () => { active = false; }; }, [activeHouseholdId]);
  const summary = useMemo(() => ({ ready: items.filter((item) => item.proposal.status !== "duplicate" && item.proposal.status !== "unsupported" && smsReviewError(profile!, item) === null).length, review: items.filter((item) => item.included && smsReviewError(profile!, item) !== null).length, duplicate: items.filter((item) => item.proposal.status === "duplicate").length, unsupported: items.filter((item) => item.proposal.status === "unsupported").length }), [items, profile]);
  if (!profile) return null;
  const update = (id: string, patch: Partial<SmsImportReviewItem>) => setItems((current) => current.map((item) => item.proposal.id === id ? { ...item, ...patch } : item));
  const review = () => { setError(""); const parsed = parseBankSms("fab", input); if (!parsed.length) { setError("Paste at least one FAB transaction message."); return; } setItems(prepareSmsReview(profile, parsed, fingerprints)); setStage("review"); };
  const included = items.filter((item) => item.included); const unresolved = included.filter((item) => smsReviewError(profile, item) !== null).length;
  const performImport = async () => { setError(""); const result = applySmsImportBatch(profile, items); if (!result.ok) { setError(result.error); return; } if (!await importTransactions(result.profile, result.records)) { setError("AWN couldn’t import these transactions. Reload and review them again."); return; } setImportedCount(result.records.length); setStage("result"); };
  return <ModalDialog title={stage === "input" ? "Import bank SMS" : stage === "review" ? "Review import" : "Import complete"} eyebrow={stage === "result" ? "FAB SMS" : "Manual paste"} close={close} className="bank-sms-dialog" closeLabel="Close bank SMS import" closeOnBackdrop={!saving}>
    {stage === "input" && <><div className="sms-import-intro"><p>Paste one or more FAB transaction messages. AWN will review them before anything is added.</p><small>Manual paste only. AWN cannot access your SMS inbox.</small></div><label className="form-field">Bank<select value="fab" disabled><option value="fab">{FAB_LABEL}</option></select></label><p className="form-help">FAB supported · More banks coming soon.</p><label className="form-field">Paste FAB SMS messages<textarea className="sms-import-textarea" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Paste one or more FAB transaction messages" data-modal-initial-focus /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close}>Cancel</button><button className="app-button" type="button" onClick={review} disabled={!historyReady}>Review messages</button></div></>}
    {stage === "review" && <><div className="sms-import-summary"><strong>{items.length} {items.length === 1 ? "message" : "messages"} detected</strong><span>Ready<b>{summary.ready}</b></span><span>Needs review<b>{summary.review}</b></span><span>Duplicates<b>{summary.duplicate}</b></span><span>Unsupported<b>{summary.unsupported}</b></span></div><p className="form-help">Imported transactions affect AWN balances just like manually added transactions. FAB’s observed balance is retained for reconciliation only and never overwrites AWN.</p><div className="sms-proposal-list">{items.map((item) => <ProposalCard key={item.proposal.id} item={item} profile={profile} expanded={expanded === item.proposal.id} toggle={() => setExpanded(expanded === item.proposal.id ? null : item.proposal.id)} update={(patch) => update(item.proposal.id, patch)} />)}</div>{unresolved > 0 && <p className="form-message is-error" role="alert">Resolve {unresolved} {unresolved === 1 ? "transaction" : "transactions"} before importing, or exclude them.</p>}{error && <p className="form-message is-error" role="alert">{error}</p>}<div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={() => { setStage("input"); setError(""); }}>Back</button><button className="app-button" type="button" disabled={saving || !included.length || unresolved > 0} onClick={performImport}>{saving ? "Importing…" : `Import ${included.length} ${included.length === 1 ? "transaction" : "transactions"}`}</button></div></>}
    {stage === "result" && <div className="sms-import-result"><span className="empty-panel-mark" aria-hidden="true">✓</span><h3>Imported {importedCount} {importedCount === 1 ? "transaction" : "transactions"}</h3><p>Your FAB activity is now part of the same AWN ledger used across Dashboard, Transactions, Plan, and Insights.</p><div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close}>Done</button><button className="app-button" type="button" onClick={() => { close(); router.push("/transactions"); }}>View transactions</button></div></div>}
  </ModalDialog>;
}
