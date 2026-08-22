"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { countryCurrencies, debitAccountAvailable, displayCountry, suggestedCurrency } from "@/lib/financial-institutions";
import { FINANCIAL_PURPOSE_MAX_LENGTH, normalizeFinancialPurpose } from "@/lib/financial-purpose";
import { currencies, newLocalId, type Account, type CreditCard, type Currency, type DebitCard, type FinancialProfile } from "@/lib/financial-types";

export type FinancialItemKind = "account" | "debit" | "credit";
export type FinancialItem = Account | DebitCard | CreditCard;

export function FinancialItemForm({ kind, existing, profile, onCancel, onSave }: { kind: FinancialItemKind; existing?: FinancialItem; profile: FinancialProfile; onCancel: () => void; onSave: (item: FinancialItem) => Promise<boolean> | boolean | void }) {
  const existingDebit = kind === "debit" ? existing as DebitCard | undefined : undefined;
  const initialCountry = existing && "country" in existing ? displayCountry(existing.country) : displayCountry(profile.country) === "Country not set" ? "United Arab Emirates" : displayCountry(profile.country);
  const [name, setName] = useState(existing?.name ?? "");
  const [purpose, setPurpose] = useState(existing?.purpose ?? "");
  const [country, setCountry] = useState(initialCountry);
  const [currency, setCurrency] = useState<Currency>(existing && "currency" in existing && existing.currency ? existing.currency : suggestedCurrency(initialCountry) ?? profile.currency);
  const [lastFour, setLastFour] = useState(existing && "lastFour" in existing ? existing.lastFour ?? "" : "");
  const [accountType, setAccountType] = useState<Account["type"]>(kind === "account" && existing ? (existing as Account).type : "current");
  const [balance, setBalance] = useState(kind === "account" && existing ? (existing as Account).balance : 0);
  const [linkedAccountId, setLinkedAccountId] = useState(existingDebit?.linkedAccountId ?? "");
  const [limit, setLimit] = useState(kind === "credit" && existing ? (existing as CreditCard).limit : 0);
  const [owed, setOwed] = useState(kind === "credit" && existing ? (existing as CreditCard).owed : 0);
  const [dueDay, setDueDay] = useState(kind === "credit" && existing ? (existing as CreditCard).dueDay : 1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const countryOptions = initialCountry !== "Country not set" && !(initialCountry in countryCurrencies) ? [initialCountry, ...Object.keys(countryCurrencies)] : Object.keys(countryCurrencies);
  const label = kind === "account" ? "account" : `${kind} card`;

  const updateCountry = (value: string) => { setCountry(value); const suggested = suggestedCurrency(value); if (suggested) setCurrency(suggested); };
  const submit = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = `Add a bank or ${kind === "account" ? "account" : "card"} name.`;
    if (lastFour && !/^\d{4}$/.test(lastFour)) next.lastFour = "Enter four digits, or leave this empty.";
    if (kind === "account" && balance < 0) next.balance = "Current balance cannot be negative.";
    if (kind === "debit" && linkedAccountId && !debitAccountAvailable(profile, linkedAccountId, existing?.id)) next.linkedAccountId = "This account already has a linked debit card.";
    if (kind === "credit") {
      if (limit <= 0) next.limit = "Credit limit must be above zero.";
      if (owed < 0) next.owed = "Current amount owed cannot be negative.";
      if (owed > limit) next.owed = "Current amount owed cannot exceed the credit limit.";
      if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) next.dueDay = "Use a recurring due day from 1 to 31.";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    const common = { id: existing?.id ?? newLocalId(), name: name.trim(), country, currency, lastFour: lastFour || undefined, purpose: normalizeFinancialPurpose(purpose) };
    const item = kind === "account" ? { ...common, type: accountType, balance } as Account : kind === "debit" ? { ...common, linkedAccountId: linkedAccountId || undefined } as DebitCard : { ...common, limit, owed, dueDay } as CreditCard;
    if (await onSave(item) === false) setErrors({ form: "AWN could not save these changes." });
  };

  return <div className="cards-form onboarding-item-form">
    <FormField label="Bank / card name" error={errors.name} className="cards-field-wide"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. FAB Bank" /></FormField>
    <FormField label="Purpose" optional hint={kind === "credit" ? "For example: groceries, travel, or backup." : "For example: salary, everyday expenses, or savings."} className="cards-field-wide"><input maxLength={FINANCIAL_PURPOSE_MAX_LENGTH} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="What do you use this for?" /></FormField>
    <div className="cards-form-row">
      <FormField label="Country"><select value={country} onChange={(event) => updateCountry(event.target.value)}>{countryOptions.map((item) => <option key={item}>{item}</option>)}</select></FormField>
      <FormField label="Currency"><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{currencies.map((item) => <option key={item}>{item}</option>)}</select></FormField>
    </div>
    <FormField label="Last 4 digits" optional error={errors.lastFour} hint="Used only to help you recognize it." className="cards-field-wide"><input inputMode="numeric" maxLength={4} value={lastFour} onChange={(event) => setLastFour(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1234" /></FormField>
    {kind === "account" && <div className="cards-form-row">
      <FormField label="Account type"><select value={accountType} onChange={(event) => setAccountType(event.target.value as Account["type"])}><option value="current">Current / checking</option><option value="savings">Savings</option>{kind === "account" && existing && "type" in existing && existing.type === "cash" && <option value="cash">Legacy cash account</option>}</select></FormField>
      <FormField label="Current balance" error={errors.balance}><MoneyInput value={balance} onValueChange={setBalance} placeholder="0.00" /></FormField>
    </div>}
    {kind === "debit" && <FormField label="Linked account" optional error={errors.linkedAccountId} hint="Each account can be linked to one debit card." className="cards-field-wide"><select value={linkedAccountId} onChange={(event) => setLinkedAccountId(event.target.value)}><option value="">Not linked</option>{profile.accounts.map((account) => <option value={account.id} key={account.id} disabled={!debitAccountAvailable(profile, account.id, existing?.id)}>{account.name}{!debitAccountAvailable(profile, account.id, existing?.id) ? " — already linked" : ""}</option>)}</select></FormField>}
    {kind === "credit" && <>
      <div className="cards-form-row"><FormField label="Credit limit" error={errors.limit}><MoneyInput value={limit} onValueChange={setLimit} placeholder="0.00" /></FormField><FormField label="Current amount owed" error={errors.owed}><MoneyInput value={owed} onValueChange={setOwed} placeholder="0.00" /></FormField></div>
      <FormField label="Payment due day" error={errors.dueDay} hint="Repeats monthly on this day." className="cards-field-wide"><input type="number" min="1" max="31" value={dueDay} onChange={(event) => setDueDay(Number(event.target.value))} /></FormField>
    </>}
    {errors.form && <p className="form-message is-error cards-field-wide" role="alert">{errors.form}</p>}
    <div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={onCancel}>Cancel</button><button className="app-button" type="button" onClick={submit}>{existing ? "Save changes" : `Add ${label}`}</button></div>
  </div>;
}
