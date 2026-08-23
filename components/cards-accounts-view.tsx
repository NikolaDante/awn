"use client";

import { useId, useState } from "react";
import { AppIcon } from "@/components/app-icons";
import { PageHeader } from "@/components/application-ui";
import { FinancialItemForm, type FinancialItem } from "@/components/financial-item-form";
import { useFinancialProfile, type FinancialSave } from "@/components/financial-provider";
import { MoneyInput } from "@/components/money-input";
import { useModalDialog } from "@/components/use-modal-dialog";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { calculateActualSummary } from "@/lib/financial-calculations";
import { financialReferenceDate, financialReferenceMonth } from "@/lib/financial-date";
import { displayCountry } from "@/lib/financial-institutions";
import { hasLinkedAccountActivity, hasLinkedCardActivity, removalGuardMessage } from "@/lib/financial-reference-guards";
import { setCurrentCashBalance } from "@/lib/financial-ledger";
import { type Account, type CreditCard, type Currency, type DebitCard, type FinancialProfile } from "@/lib/financial-types";

type Editor = { kind: "account"; value?: Account } | { kind: "debit"; value?: DebitCard } | { kind: "credit"; value?: CreditCard };
type Detail = { kind: "debit"; value: DebitCard } | { kind: "credit"; value: CreditCard };
type DeleteTarget = { kind: "account" | "debit" | "credit"; id: string; label: string };
type ViewAll = "account" | "debit" | "credit";

const inlineItemLimit = 6;

const masked = (lastFour?: string) => lastFour ? `•••• •••• •••• ${lastFour}` : undefined;
const accountDigits = (lastFour?: string) => lastFour ? `Account •••• ${lastFour}` : undefined;
const cardCurrency = (currency: Currency | undefined, profile: FinancialProfile) => currency ?? profile.currency;

export function nextPaymentDueDate(dueDay: number, from = new Date()) {
  const recurringDay = Math.max(1, Math.min(31, Math.trunc(Number.isFinite(dueDay) ? dueDay : 1)));
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const dateInMonth = (year: number, month: number) => {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return new Date(year, month, Math.min(recurringDay, lastDay));
  };

  let dueDate = dateInMonth(today.getFullYear(), today.getMonth());
  if (dueDate < today) {
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    dueDate = dateInMonth(nextMonth.getFullYear(), nextMonth.getMonth());
  }

  return dueDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function displayBankName(value?: string) {
  const clean = value?.trim();
  if (!clean) return "Bank name not set";
  if (/^[a-z]{2,4}$/i.test(clean)) return clean.toUpperCase();
  const acronyms = new Set(["fab", "ei", "hsbc", "adcb", "enbd", "nbd"]);
  return clean.split(/\s+/).map((word) => acronyms.has(word.toLowerCase()) || /^[A-Z]{2,}$/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(" ");
}

export function AccountsCardsView({ initialAction }: { initialAction?: "add" }) {
  const { profile, ready, issue, save } = useFinancialProfile();
  const { formatMoney } = useUserPreferences();
  const [editor, setEditor] = useState<Editor>();
  const [detail, setDetail] = useState<Detail>();
  const [deleting, setDeleting] = useState<DeleteTarget>();
  const [choosingCard, setChoosingCard] = useState(false);
  const [choosingAsset, setChoosingAsset] = useState(initialAction === "add");
  const [viewAll, setViewAll] = useState<ViewAll>();
  const [deleteError, setDeleteError] = useState("");
  const [cashEditing, setCashEditing] = useState(false);

  const header = <PageHeader title="Cards & Accounts" eyebrow="Where your money lives"><button className="app-button app-button-secondary" type="button" onClick={() => setEditor({ kind: "account" })}><AppIcon name="plus" />Add account</button><button className="app-button" type="button" onClick={() => setChoosingCard(true)}><AppIcon name="plus" />Add card</button></PageHeader>;

  if (!ready) return <>{header}<p className="loading-copy">Loading your accounts...</p></>;
  if (issue) return <>{header}<section className="empty-panel"><h2>Your saved plan needs attention</h2><p>{issue}</p></section></>;
  if (!profile) return <>{header}<section className="empty-panel"><h2>No financial profile yet</h2><p>Complete your setup to start adding accounts and cards.</p></section></>;

  const actual = calculateActualSummary(profile, financialReferenceMonth(profile));
  const debitCards = profile.debitCards ?? [];
  const positiveBalance = profile.accounts.reduce((total, account) => total + Math.max(0, actual.accounts[account.id] ?? account.balance), 0);
  const linkedDebitCards = debitCards.filter((card) => profile.accounts.some((account) => account.id === card.linkedAccountId)).length;
  const totalOwed = profile.creditCards.reduce((total, card) => total + (actual.cards[card.id] ?? card.owed), 0);
  const totalAvailableCredit = profile.creditCards.reduce((total, card) => total + Math.max(0, actual.availableCredit[card.id] ?? card.limit - card.owed), 0);

  const remove = async () => {
    if (!deleting) return;
    let next = profile;
    if (deleting.kind === "account") {
      if (hasLinkedAccountActivity(profile, deleting.id)) return setDeleteError(removalGuardMessage("account"));
      next = { ...profile, accounts: profile.accounts.filter((item) => item.id !== deleting.id), debitCards: debitCards.map((card) => card.linkedAccountId === deleting.id ? { ...card, linkedAccountId: undefined } : card) };
    } else if (deleting.kind === "credit") {
      if (hasLinkedCardActivity(profile, deleting.id)) return setDeleteError(removalGuardMessage("credit-card"));
      next = { ...profile, creditCards: profile.creditCards.filter((item) => item.id !== deleting.id) };
    } else next = { ...profile, debitCards: debitCards.filter((item) => item.id !== deleting.id) };
    if (await save(next)) { setDeleting(undefined); setDeleteError(""); }
  };

  const requestDelete = (kind: DeleteTarget["kind"], id: string, label: string) => { setDeleteError(""); setDeleting({ kind, id, label }); };
  const editFromViewAll = (nextEditor: Editor) => { setViewAll(undefined); setEditor(nextEditor); };
  const deleteFromViewAll = (kind: DeleteTarget["kind"], id: string, label: string) => { setViewAll(undefined); requestDelete(kind, id, label); };

  const renderAccount = (account: Account, inViewAll = false) => <AccountCard key={account.id} account={account} balance={actual.accounts[account.id] ?? account.balance} profile={profile} edit={() => inViewAll ? editFromViewAll({ kind: "account", value: account }) : setEditor({ kind: "account", value: account })} remove={() => inViewAll ? deleteFromViewAll("account", account.id, account.name) : requestDelete("account", account.id, account.name)} />;
  const renderDebitCard = (card: DebitCard, inViewAll = false) => { const account = profile.accounts.find((item) => item.id === card.linkedAccountId); return <PaymentCard key={card.id} kind="debit" name={card.name} purpose={card.purpose} country={card.country} currency={card.currency} lastFour={card.lastFour} linkedFunds={account ? formatMoney(actual.accounts[account.id] ?? account.balance, card.currency) : undefined} open={() => { if (inViewAll) setViewAll(undefined); setDetail({ kind: "debit", value: card }); }} edit={() => inViewAll ? editFromViewAll({ kind: "debit", value: card }) : setEditor({ kind: "debit", value: card })} remove={() => inViewAll ? deleteFromViewAll("debit", card.id, card.name) : requestDelete("debit", card.id, card.name)} />; };
  const renderCreditCard = (card: CreditCard, inViewAll = false) => { const currency = cardCurrency(card.currency, profile); return <PaymentCard key={card.id} kind="credit" name={card.name} purpose={card.purpose} country={card.country} currency={currency} lastFour={card.lastFour} available={formatMoney(actual.availableCredit[card.id] ?? card.limit - card.owed, currency)} owed={formatMoney(actual.cards[card.id] ?? card.owed, currency)} open={() => { if (inViewAll) setViewAll(undefined); setDetail({ kind: "credit", value: card }); }} edit={() => inViewAll ? editFromViewAll({ kind: "credit", value: card }) : setEditor({ kind: "credit", value: card })} remove={() => inViewAll ? deleteFromViewAll("credit", card.id, card.name) : requestDelete("credit", card.id, card.name)} />; };

  return <>
    {header}
    <div className="accounts-section-list">
      <CashSection balance={actual.cash} profile={profile} edit={() => setCashEditing(true)} />
      <ExpandableSection title="Accounts" eyebrow="Accounts" metrics={[`${profile.accounts.length} ${profile.accounts.length === 1 ? "account" : "accounts"}`, `${formatMoney(positiveBalance, profile.currency)} total available`]}>
        <div className="account-info-grid">
          {profile.accounts.slice(0, inlineItemLimit).map((account) => renderAccount(account))}
          {!profile.accounts.length && <SectionEmpty title="No accounts saved" text="Add a current or savings account using only basic manual information." />}
        </div>
        <SectionActions addLabel="Add account" add={() => setEditor({ kind: "account" })} viewAllLabel={profile.accounts.length > inlineItemLimit ? "View all accounts" : undefined} viewAll={() => setViewAll("account")} />
      </ExpandableSection>

      <ExpandableSection title="Debit Cards" eyebrow="Debit cards" metrics={[`${debitCards.length} ${debitCards.length === 1 ? "card" : "cards"}`, `${linkedDebitCards} linked to ${linkedDebitCards === 1 ? "an account" : "accounts"}`]}>
        <div className="payment-card-grid">
          {debitCards.slice(0, inlineItemLimit).map((card) => renderDebitCard(card))}
          {!debitCards.length && <SectionEmpty title="No debit cards saved" text="Add only the last four digits and optionally link the card to an account." />}
        </div>
        <SectionActions addLabel="Add debit card" add={() => setEditor({ kind: "debit" })} viewAllLabel={debitCards.length > inlineItemLimit ? "View all debit cards" : undefined} viewAll={() => setViewAll("debit")} />
      </ExpandableSection>

      <ExpandableSection title="Credit Cards" eyebrow="Credit cards" metrics={[`${profile.creditCards.length} ${profile.creditCards.length === 1 ? "card" : "cards"}`, `${formatMoney(totalOwed, profile.currency)} owed`, `${formatMoney(totalAvailableCredit, profile.currency)} available credit`]}>
        <div className="payment-card-grid">
          {profile.creditCards.slice(0, inlineItemLimit).map((card) => renderCreditCard(card))}
          {!profile.creditCards.length && <SectionEmpty title="No credit cards saved" text="Add a credit limit and amount owed without storing sensitive card information." />}
        </div>
        <SectionActions addLabel="Add credit card" add={() => setEditor({ kind: "credit" })} viewAllLabel={profile.creditCards.length > inlineItemLimit ? "View all credit cards" : undefined} viewAll={() => setViewAll("credit")} />
      </ExpandableSection>
    </div>

    {choosingAsset && <AssetCreationWorkflow close={() => setChoosingAsset(false)} />}
    {choosingCard && <CardChoiceDialog close={() => setChoosingCard(false)} choose={(kind) => { setChoosingCard(false); setEditor({ kind }); }} />}
    {viewAll === "account" && <CollectionDialog title="All accounts" eyebrow={`${profile.accounts.length} accounts`} close={() => setViewAll(undefined)}><div className="account-info-grid collection-account-grid">{profile.accounts.map((account) => renderAccount(account, true))}</div></CollectionDialog>}
    {viewAll === "debit" && <CollectionDialog title="All debit cards" eyebrow={`${debitCards.length} debit cards`} close={() => setViewAll(undefined)}><div className="payment-card-grid collection-payment-grid">{debitCards.map((card) => renderDebitCard(card, true))}</div></CollectionDialog>}
    {viewAll === "credit" && <CollectionDialog title="All credit cards" eyebrow={`${profile.creditCards.length} credit cards`} close={() => setViewAll(undefined)}><div className="payment-card-grid collection-payment-grid">{profile.creditCards.map((card) => renderCreditCard(card, true))}</div></CollectionDialog>}
    {editor && <EditorDialog editor={editor} profile={profile} save={save} close={() => setEditor(undefined)} />}
    {detail && <CardDetailDialog detail={detail} profile={profile} accounts={actual.accounts} cards={actual.cards} availableCredit={actual.availableCredit} close={() => setDetail(undefined)} edit={() => { setEditor(detail.kind === "debit" ? { kind: "debit", value: detail.value } : { kind: "credit", value: detail.value }); setDetail(undefined); }} />}
    {deleting && <DeleteDialog target={deleting} error={deleteError} close={() => { setDeleting(undefined); setDeleteError(""); }} confirm={remove} />}
    {cashEditing && <CashBalanceDialog profile={profile} current={actual.cash} save={save} close={() => setCashEditing(false)} />}
  </>;
}

function CashSection({ balance, profile, edit }: { balance: number; profile: FinancialProfile; edit: () => void }) {
  const { formatMoney } = useUserPreferences();
  return <section className="accounts-section-row cash-section-row" aria-labelledby="cash-section-title"><div className="cash-section-content"><div><p className="app-eyebrow">Cash</p><h2 id="cash-section-title">Cash</h2></div><div className="cash-section-balance"><span>Cash balance</span><strong>{formatMoney(balance, profile.currency)}</strong></div><button className="app-button app-button-secondary" type="button" onClick={edit}><AppIcon name="edit" />Edit balance</button></div></section>;
}

function CashBalanceDialog({ profile, current, save, close }: { profile: FinancialProfile; current: number; save: FinancialSave; close: () => void }) {
  const [balance, setBalance] = useState(current);
  const [error, setError] = useState("");
  const submit = async () => { const result = setCurrentCashBalance(profile, balance); if (!result.ok) return setError(result.error); if (await save(result.profile)) close(); };
  return <DialogFrame title="Edit cash balance" eyebrow="Cash" close={close} className="cash-balance-dialog"><label className="form-field">Current cash balance<MoneyInput value={balance} allowNegative onValueChange={(value) => { setBalance(value); setError(""); }} aria-invalid={!!error} /></label><p className="form-help">Use this for a manual correction. AWN will not create a fake transaction.</p>{error && <p className="form-message is-error" role="alert">{error}</p>}<div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close}>Cancel</button><button className="app-button" type="button" onClick={submit}>Save balance</button></div></DialogFrame>;
}

function SectionActions({ addLabel, add, viewAllLabel, viewAll }: { addLabel: string; add: () => void; viewAllLabel?: string; viewAll: () => void }) {
  return <div className="accounts-section-actions"><button className="app-button app-button-secondary section-add-button" type="button" onClick={add}><AppIcon name="plus" />{addLabel}</button>{viewAllLabel && <button className="text-button accounts-view-all" type="button" onClick={viewAll}>{viewAllLabel}<AppIcon name="arrow" /></button>}</div>;
}

function ExpandableSection({ title, eyebrow, metrics, children }: { title: string; eyebrow: string; metrics: string[]; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return <section className="accounts-section-row" data-open={open}><button className="accounts-section-toggle" type="button" aria-expanded={open} aria-controls={contentId} aria-label={`${open ? "Collapse" : "Expand"} ${title}`} onClick={() => setOpen((current) => !current)}><div><p className="app-eyebrow">{eyebrow}</p><h2>{title}</h2></div><div className="accounts-section-metrics">{metrics.map((metric, index) => <span key={metric} className={index ? "" : "is-primary"}>{metric}</span>)}</div><span className="details-toggle" aria-hidden="true">+</span></button><div id={contentId} className="accounts-section-content" hidden={!open}>{children}</div></section>;
}

function AccountCard({ account, balance, profile, edit, remove }: { account: Account; balance: number; profile: FinancialProfile; edit: () => void; remove: () => void }) {
  const { formatMoney } = useUserPreferences();
  const currency = cardCurrency(account.currency, profile);
  const type = account.type === "current" ? "Current" : account.type;
  const eyebrow = account.purpose ? `${type} / ${account.purpose}` : account.type === "current" ? "Current / checking" : account.type;
  return <article className="account-info-card static-card"><div className="account-card-heading"><p className="app-eyebrow" title={eyebrow}>{eyebrow}</p><CardActions edit={edit} remove={remove} label={account.name} /></div><div className="account-card-content"><div className="account-identity"><span className="account-bank-icon"><AppIcon name="bank" /></span><h3>{displayBankName(account.name)}</h3></div><p className="account-meta">{displayCountry(account.country)} · {currency}</p>{accountDigits(account.lastFour) && <p className="account-digits">{accountDigits(account.lastFour)}</p>}</div><div className="account-balance"><span>Current balance</span><strong>{formatMoney(balance, currency)}</strong></div></article>;
}

function PaymentCard({ kind, name, purpose, country, currency, lastFour, linkedFunds, available, owed, open, edit, remove }: { kind: "debit" | "credit"; name: string; purpose?: string; country?: string; currency: Currency; lastFour?: string; linkedFunds?: string; available?: string; owed?: string; open: () => void; edit: () => void; remove: () => void }) {
  const { formatMoney } = useUserPreferences();
  const keyboard = (event: React.KeyboardEvent<HTMLElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); } };
  const eyebrow = purpose ? `${kind} / ${purpose}` : kind;
  return <article className={`payment-card action-card is-${kind}`} role="button" tabIndex={0} aria-label={`Open ${displayBankName(name)} ${kind} card details`} onClick={open} onKeyDown={keyboard}><div className="payment-card-top"><span title={eyebrow}>{eyebrow}</span><CardActions edit={edit} remove={remove} label={name} stopPropagation /></div><div className="payment-card-brand"><AppIcon name="card" /><strong>{displayBankName(name)}</strong></div>{masked(lastFour) && <p className="payment-card-number">{masked(lastFour)}</p>}<div className="payment-card-footer"><span className="card-location">{displayCountry(country)} · {currency}</span><div className="card-money-stack">{kind === "debit" ? linkedFunds ? <CardMoney label="Linked account funds" value={linkedFunds} /> : <span className="card-unlinked">Not linked</span> : <><CardMoney label="Owed" value={owed || formatMoney(0, currency)} /><CardMoney label="Available credit" value={available || formatMoney(0, currency)} /></>}</div></div></article>;
}

function CardMoney({ label, value }: { label: string; value: string }) { return <span className="card-money"><small>{label}</small><strong>{value}</strong></span>; }

function CardActions({ edit, remove, label, stopPropagation = false }: { edit: () => void; remove: () => void; label: string; stopPropagation?: boolean }) {
  const run = (event: React.MouseEvent, action: () => void) => { if (stopPropagation) event.stopPropagation(); action(); };
  return <div className="card-item-actions"><button className="icon-button" type="button" aria-label={`Edit ${label}`} title="Edit" onClick={(event) => run(event, edit)}><AppIcon name="edit" /></button><button className="icon-button is-danger" type="button" aria-label={`Delete ${label}`} title="Delete" onClick={(event) => run(event, remove)}><AppIcon name="trash" /></button></div>;
}

function SectionEmpty({ title, text }: { title: string; text: string }) { return <section className="accounts-empty"><span aria-hidden="true"><AppIcon name="plus" /></span><h3>{title}</h3><p>{text}</p></section>; }

function DialogFrame({ title, eyebrow, close, className = "", children }: { title: string; eyebrow: string; close: () => void; className?: string; children: React.ReactNode }) {
  const ref = useModalDialog<HTMLElement>(close);
  return <div className="dialog-backdrop cards-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section ref={ref} tabIndex={-1} className={`confirm-dialog cards-dialog ${className}`} role="dialog" aria-modal="true" aria-labelledby="cards-dialog-title"><div className="repeat-card-heading cards-dialog-header"><div><p className="app-eyebrow" id={title ? undefined : "cards-dialog-title"}>{eyebrow}</p>{title && <h2 id="cards-dialog-title">{title}</h2>}</div><button className="icon-button" onClick={close} type="button" aria-label="Close dialog"><AppIcon name="close" /></button></div>{children}</section></div>;
}

function CollectionDialog({ title, eyebrow, close, children }: { title: string; eyebrow: string; close: () => void; children: React.ReactNode }) {
  return <DialogFrame title={title} eyebrow={eyebrow} close={close} className="cards-collection-dialog"><div className="cards-collection-scroll">{children}</div></DialogFrame>;
}

function CardChoiceDialog({ close, choose }: { close: () => void; choose: (kind: "debit" | "credit") => void }) {
  return <DialogFrame title="Add a card" eyebrow="Choose card type" close={close} className="card-choice-dialog"><div className="card-choice-list"><button type="button" onClick={() => choose("debit")}><span><AppIcon name="card" /></span><span><strong>Debit card</strong><small>Optionally link it to an existing account.</small></span><AppIcon name="arrow" /></button><button type="button" onClick={() => choose("credit")}><span><AppIcon name="card" /></span><span><strong>Credit card</strong><small>Track the limit, amount owed, and available credit.</small></span><AppIcon name="arrow" /></button></div></DialogFrame>;
}

function AssetChoiceDialog({ close, choose }: { close: () => void; choose: (kind: "account" | "debit" | "credit") => void }) {
  return <DialogFrame title="Add account or card" eyebrow="Choose what to add" close={close} className="card-choice-dialog"><div className="card-choice-list"><button type="button" onClick={() => choose("account")}><span><AppIcon name="bank" /></span><span><strong>Account</strong><small>Add a current or savings account.</small></span><AppIcon name="arrow" /></button><button type="button" onClick={() => choose("debit")}><span><AppIcon name="card" /></span><span><strong>Debit card</strong><small>Optionally link it to an existing account.</small></span><AppIcon name="arrow" /></button><button type="button" onClick={() => choose("credit")}><span><AppIcon name="card" /></span><span><strong>Credit card</strong><small>Track the limit, amount owed, and available credit.</small></span><AppIcon name="arrow" /></button></div></DialogFrame>;
}

export function AssetCreationWorkflow({ close }: { close: () => void }) {
  const { profile, ready, save } = useFinancialProfile();
  const [editor, setEditor] = useState<Editor>();
  if (!ready || !profile) return null;
  return editor
    ? <EditorDialog editor={editor} profile={profile} save={save} close={close} />
    : <AssetChoiceDialog close={close} choose={(kind) => setEditor({ kind })} />;
}

function EditorDialog({ editor, profile, save, close }: { editor: Editor; profile: FinancialProfile; save: FinancialSave; close: () => void }) {
  const existing = editor.value;
  const label = editor.kind === "account" ? "account" : `${editor.kind} card`;
  const persist = async (item: FinancialItem) => {
    let next = profile;
    if (editor.kind === "account") next = { ...profile, accounts: upsert(profile.accounts, item as Account) };
    else if (editor.kind === "debit") next = { ...profile, debitCards: upsert(profile.debitCards ?? [], item as DebitCard) };
    else next = { ...profile, creditCards: upsert(profile.creditCards, item as CreditCard) };
    const saved = await save(next);
    if (saved) close();
    return saved;
  };
  return <DialogFrame title={`${existing ? "Edit" : "Add"} ${label}`} eyebrow="Manual details" close={close} className="cards-editor-dialog"><FinancialItemForm kind={editor.kind} existing={existing} profile={profile} onCancel={close} onSave={persist} /><p className="cards-privacy-note"><AppIcon name="wallet" />AWN only stores these manual details. Never enter a full card number, PIN, CVV, banking password, or login.</p></DialogFrame>;
}

function CardDetailDialog({ detail, profile, accounts, cards, availableCredit, close, edit }: { detail: Detail; profile: FinancialProfile; accounts: Record<string, number>; cards: Record<string, number>; availableCredit: Record<string, number>; close: () => void; edit: () => void }) {
  const { formatMoney } = useUserPreferences();
  if (detail.kind === "debit") {
    const card = detail.value;
    const linked = profile.accounts.find((account) => account.id === card.linkedAccountId);
    const available = linked ? formatMoney(accounts[linked.id] ?? linked.balance, card.currency) : "Not linked";
    return <DialogFrame title="" eyebrow="Debit card" close={close} className="card-detail-dialog"><DetailCard kind="debit" purpose={card.purpose} name={card.name} lastFour={card.lastFour} availableLabel="Available balance" availableValue={available} /><div className="card-detail-metrics is-debit"><DetailMetric label="Linked account" value={linked ? displayBankName(linked.name) : "Not linked"} /><DetailMetric label="Country / Currency" value={`${displayCountry(card.country)} · ${card.currency}`} /></div><DialogActions close={close} edit={edit} /></DialogFrame>;
  }
  const card = detail.value;
  const currency = cardCurrency(card.currency, profile);
  const owed = cards[card.id] ?? card.owed;
  const available = availableCredit[card.id] ?? card.limit - card.owed;
  const percent = card.limit ? Math.max(0, Math.min(100, owed / card.limit * 100)) : 0;
  return <DialogFrame title="" eyebrow="Credit card" close={close} className="card-detail-dialog"><DetailCard kind="credit" purpose={card.purpose} name={card.name} lastFour={card.lastFour} availableLabel="Available credit" availableValue={formatMoney(available, currency)} /><div className="card-detail-metrics is-credit"><DetailMetric label="Current amount owed" value={formatMoney(owed, currency)} /><DetailMetric label="Credit limit" value={formatMoney(card.limit, currency)} /><DetailMetric label="Payment due date" value={nextPaymentDueDate(card.dueDay, new Date(`${financialReferenceDate(profile)}T12:00:00`))} /></div><div className="credit-usage"><div><span>Credit limit used</span><strong>{Math.round(percent)}%</strong></div><div className="progress-track" role="progressbar" aria-label="Credit limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}><span style={{ width: `${percent}%` }} /></div></div><DialogActions close={close} edit={edit} /></DialogFrame>;
}

function DetailCard({ kind, purpose, name, lastFour, availableLabel, availableValue }: { kind: "debit" | "credit"; purpose?: string; name: string; lastFour?: string; availableLabel: string; availableValue: string }) { return <div className={`detail-payment-card is-${kind}`}><div className="detail-payment-identity"><span>{purpose ? `${kind} / ${purpose}` : kind}</span><h3>{displayBankName(name)}</h3>{masked(lastFour) && <strong>{masked(lastFour)}</strong>}</div><div className="detail-payment-available"><small>{availableLabel}</small><b>{availableValue}</b></div></div>; }
function DetailMetric({ label, value }: { label: string; value: string }) { return <span><small>{label}</small><strong>{value}</strong></span>; }
function DialogActions({ close, edit }: { close: () => void; edit: () => void }) { return <div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close}>Close</button><button className="app-button" type="button" onClick={edit}><AppIcon name="edit" />Edit card</button></div>; }

function DeleteDialog({ target, error, close, confirm }: { target: DeleteTarget; error: string; close: () => void; confirm: () => void }) { return <DialogFrame title={`Delete ${displayBankName(target.label)}?`} eyebrow="Confirm removal" close={close} className="delete-item-dialog"><p>This removes the saved {target.kind === "account" ? "account" : `${target.kind} card`} from AWN. This cannot be undone.</p>{error && <p className="form-message is-error" role="alert">{error}</p>}<div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close}>Cancel</button><button className="app-button danger-button" type="button" onClick={confirm}>Delete</button></div></DialogFrame>; }

function upsert<T extends { id: string }>(items: T[], item: T) { return items.some((value) => value.id === item.id) ? items.map((value) => value.id === item.id ? item : value) : [...items, item]; }
