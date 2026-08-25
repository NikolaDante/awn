"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/application-ui";
import { useFinancialProfile } from "@/components/financial-provider";
import { ModalDialog } from "@/components/modal-dialog";
import { MoneyInput } from "@/components/money-input";
import { useUserPreferences } from "@/components/user-preferences-provider";
import { AWN_CATEGORY_CATALOG, isDefaultCategoryName, profileCategoryNames } from "@/lib/financial-categories";
import { budgetPeriodForDate, financialReferenceDate } from "@/lib/financial-date";
import { currencies, type Currency, type FinancialProfile } from "@/lib/financial-types";
import { addCustomCategory, buildFinancialExport, clearConfirmationReady, currencyNames, customCategoryRemoval, hasMeaningfulFinancialData, validPlanName } from "@/lib/settings";
import { createClient } from "@/lib/supabase/client";
import { dateFormats, numberFormats, validDisplayName, type CurrencyPlacement, type DateFormat, type NumberFormat, type UserPreferences } from "@/lib/user-preferences";
import { createHouseholdInvitation, leaveHousehold, listHouseholdInvitations, listHouseholdMembers, refreshHouseholdInvitation, removeHouseholdMember, revokeHouseholdInvitation, transferHouseholdOwnership } from "@/lib/shared-household-repository";
import { getSharedPlan } from "@/lib/shared-planning-repository";
import type { SharedPlan } from "@/lib/shared-planning";
import { sharedHouseholdError, type CreatedHouseholdInvitation, type HouseholdInvitationSummary, type HouseholdMemberSummary } from "@/lib/shared-households";

type Tab = "plan" | "preferences" | "account" | "data";
type Dialog = "plan-name" | "budget-cycle" | "usual-income" | "display-name" | "email" | "password" | "clear" | null;
const tabs: Array<{ id: Tab; label: string }> = [{ id: "plan", label: "Plan" }, { id: "preferences", label: "Preferences" }, { id: "account", label: "Account & Security" }, { id: "data", label: "Data & Privacy" }];

export function SettingsView() {
  const [tab, setTab] = useState<Tab>("plan");
  return <div className="app-page settings-page"><PageHeader title="Settings" eyebrow="Your AWN space" /><div className="segmented-control settings-tabs" role="tablist" aria-label="Settings sections">{tabs.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "is-active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</div>{tab === "plan" ? <PlanSettings /> : tab === "preferences" ? <PreferenceSettings /> : tab === "account" ? <AccountSettings /> : <DataSettings />}</div>;
}

function SettingsSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: React.ReactNode }) {
  return <section className="content-panel settings-section"><div className="settings-section-heading"><div><p className="app-eyebrow">{eyebrow}</p><h2>{title}</h2><p>{description}</p></div></div><div className="settings-list">{children}</div></section>;
}

function SettingRow({ label, value, help, action, children }: { label: string; value?: string; help?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return <div className="settings-row"><div><strong>{label}</strong>{value && <span>{value}</span>}{help && <small>{help}</small>}</div>{children ?? action}</div>;
}

function PlanSettings() {
  const { profile, householdName, saving, issue, save, saveHouseholdName } = useFinancialProfile();
  const { formatDate, formatMoney } = useUserPreferences();
  const [dialog, setDialog] = useState<Dialog>(null); const [status, setStatus] = useState("");
  if (!profile || !householdName) return null;
  const meaningful = hasMeaningfulFinancialData(profile);
  const period = budgetPeriodForDate(profile.budgetStartDay, financialReferenceDate(profile));
  const custom = profileCategoryNames(profile).filter((name) => !isDefaultCategoryName(name));
  const updateCurrency = async (currency: Currency) => { if (meaningful) return; if (await save({ ...profile, currency })) setStatus("Base currency updated."); };
  const removeCustom = async (name: string) => { const safety = customCategoryRemoval(profile, name); if (!safety.allowed) return setStatus(safety.reason ?? "That category can’t be removed."); if (await save({ ...profile, customCategories: (profile.customCategories ?? []).filter((item) => item !== name) })) setStatus("Custom category removed."); };
  return <><SettingsSection eyebrow="Private plan" title="Plan settings" description="These settings belong only to your private financial plan.">
    <SettingRow label="Plan name" value={householdName} help="The private name of your financial plan." action={<button className="app-button app-button-secondary" type="button" onClick={() => setDialog("plan-name")}>Edit</button>} />
    <SettingRow label="Base currency" value={`${profile.currency} — ${currencyNames[profile.currency]}`} help={meaningful ? "Currency can’t be changed after financial activity has been recorded because AWN doesn’t convert existing amounts yet." : "Changing currency is safe while this plan is empty."}><select aria-label="Base currency" value={profile.currency} disabled={meaningful || saving} onChange={(event) => updateCurrency(event.target.value as Currency)}>{currencies.map((currency) => <option key={currency} value={currency}>{currency} — {currencyNames[currency]}</option>)}</select></SettingRow>
    <SettingRow label="Budget cycle" value={`Starts on day ${profile.budgetStartDay ?? 1}`} help={`Current cycle: ${formatDate(period.start)} – ${formatDate(period.end)}`} action={<button className="app-button app-button-secondary" type="button" onClick={() => setDialog("budget-cycle")}>Edit</button>} />
    <SettingRow label="Usual monthly income" value={profile.usualMonthlyIncome ? formatMoney(profile.usualMonthlyIncome, profile.currency) : "Not set"} help="Optional private planning reference. It never creates income or changes a balance." action={<button className="app-button app-button-secondary" type="button" onClick={() => setDialog("usual-income")}>Edit</button>} />
    <div className="settings-category-block"><div><strong>Categories</strong><small>AWN categories stay available. Custom categories can be removed only when they are unused.</small></div><div className="settings-default-categories">{AWN_CATEGORY_CATALOG.filter((group) => group.categories.length).map((group) => <div key={group.key}><b>{group.label}</b><span>{group.categories.map((category) => category.name).join(" · ")}</span></div>)}</div><div className="settings-custom-categories"><b>Custom categories</b>{custom.length ? custom.map((name) => { const safety = customCategoryRemoval(profile, name); return <div key={name}><span>{name}</span><button className="text-button" type="button" onClick={() => removeCustom(name)}>{safety.allowed ? "Delete" : "Used"}</button></div>; }) : <p>No custom categories yet.</p>}<AddCategory profile={profile} save={save} done={() => setStatus("Custom category added.")} /></div></div>
    {(status || issue) && <p className={`form-message ${issue ? "is-error" : "is-success"}`} role="status">{issue ?? status}</p>}
  </SettingsSection><HouseholdSharing />{dialog === "plan-name" && <PlanNameDialog current={householdName} close={() => setDialog(null)} save={async (name) => { const ok = await saveHouseholdName(name); if (ok) { setStatus("Plan name updated."); setDialog(null); } return ok; }} />}{dialog === "budget-cycle" && <BudgetCycleDialog profile={profile} close={() => setDialog(null)} save={async (day) => { const ok = await save({ ...profile, budgetStartDay: day }); if (ok) { setStatus("Budget cycle updated."); setDialog(null); } return ok; }} />}{dialog === "usual-income" && <UsualIncomeDialog profile={profile} close={() => setDialog(null)} save={async (usualMonthlyIncome) => { const ok = await save({ ...profile, usualMonthlyIncome: usualMonthlyIncome || undefined }); if (ok) { setStatus("Usual monthly income updated."); setDialog(null); } return ok; }} />}</>;
}

type HouseholdAction = { kind: "remove" | "transfer"; member: HouseholdMemberSummary } | { kind: "leave" } | null;
type VisibleHouseholdInvitation = Pick<CreatedHouseholdInvitation, "email" | "link">;

function HouseholdSharing() {
  const router = useRouter();
  const [plan, setPlan] = useState<SharedPlan>();
  const [members, setMembers] = useState<HouseholdMemberSummary[]>([]); const [invitations, setInvitations] = useState<HouseholdInvitationSummary[]>([]); const [inviteOpen, setInviteOpen] = useState(false); const [created, setCreated] = useState<VisibleHouseholdInvitation | null>(null); const [action, setAction] = useState<HouseholdAction>(null); const [busy, setBusy] = useState(false); const [status, setStatus] = useState(""); const [error, setError] = useState("");
  const load = async () => {
    const nextPlan = await getSharedPlan();
    const [nextMembers, nextInvitations] = await Promise.all([listHouseholdMembers(nextPlan.householdId), nextPlan.role === "owner" ? listHouseholdInvitations(nextPlan.householdId) : Promise.resolve([])]);
    setPlan(nextPlan); setMembers(nextMembers); setInvitations(nextInvitations);
  };
  useEffect(() => { let active = true; getSharedPlan().then(async (nextPlan) => { const [nextMembers, nextInvitations] = await Promise.all([listHouseholdMembers(nextPlan.householdId), nextPlan.role === "owner" ? listHouseholdInvitations(nextPlan.householdId) : Promise.resolve([])]); if (active) { setPlan(nextPlan); setMembers(nextMembers); setInvitations(nextInvitations); } }).catch((reason) => { if (active) setError(sharedHouseholdError(reason instanceof Error ? reason.message : "")); }); return () => { active = false; }; }, []);
  if (!plan) return null;
  const pending = invitations.filter((item) => item.status === "pending"); const expired = invitations.filter((item) => item.status === "expired").slice(0, 1);
  const copy = async (invitation: HouseholdInvitationSummary | VisibleHouseholdInvitation) => {
    setBusy(true); setError("");
    try { const link = "link" in invitation ? invitation.link : await refreshHouseholdInvitation(invitation.id); if (!("link" in invitation)) setCreated({ ...invitation, link }); await copyText(link); setStatus("Copied"); if (!("link" in invitation)) await load(); }
    catch (reason) { setError(sharedHouseholdError(reason instanceof Error ? reason.message : "")); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => { setBusy(true); setError(""); try { await revokeHouseholdInvitation(id); setCreated(null); setStatus("Invitation revoked."); await load(); } catch (reason) { setError(sharedHouseholdError(reason instanceof Error ? reason.message : "")); } finally { setBusy(false); } };
  const confirm = async () => {
    if (!action) return; setBusy(true); setError("");
    try {
      if (action.kind === "remove") { await removeHouseholdMember(plan.householdId, action.member.userId); setStatus("Member removed. Their private finances were not changed."); }
      if (action.kind === "transfer") { await transferHouseholdOwnership(plan.householdId, action.member.userId); setStatus(`Shared-plan management transferred to ${action.member.displayName}. Private finances did not move.`); }
      if (action.kind === "leave") { await leaveHousehold(plan.householdId); setAction(null); router.replace("/dashboard"); router.refresh(); return; }
      setAction(null); await load();
    } catch (reason) { setError(sharedHouseholdError(reason instanceof Error ? reason.message : "")); }
    finally { setBusy(false); }
  };
  return <><SettingsSection eyebrow="Shared planning" title="Household sharing" description="Plan shared budgets and savings goals with one trusted person. Accounts, cards, balances, transactions, history, and SMS imports always remain private.">
    {members.map((item) => <div className="settings-row household-member-row" key={item.userId}><div><strong>{item.displayName}{item.isCurrentUser ? " — You" : ""}</strong><span>{item.role === "owner" ? "Owner" : "Member"}</span><small>{item.email}</small></div>{plan.role === "owner" && item.role === "member" && <div className="household-row-actions"><button className="text-button" type="button" onClick={() => setAction({ kind: "transfer", member: item })}>Transfer ownership</button><button className="text-button danger-text" type="button" onClick={() => setAction({ kind: "remove", member: item })}>Remove member</button></div>}</div>)}
    {plan.role === "owner" && pending.map((invitation) => <div className="settings-row household-invitation-row" key={invitation.id}><div><strong>Pending invitation</strong><span>{invitation.email}</span><small>Expires {formatInvitationDate(invitation.expiresAt)}</small></div><div className="household-row-actions"><button className="text-button" type="button" disabled={busy} onClick={() => copy(invitation)}>Copy link</button><button className="text-button danger-text" type="button" disabled={busy} onClick={() => revoke(invitation.id)}>Revoke</button></div></div>)}
    {plan.role === "owner" && expired.map((invitation) => <div className="settings-row" key={invitation.id}><div><strong>Expired invitation</strong><span>{invitation.email}</span><small>Expired {formatInvitationDate(invitation.expiresAt)}</small></div></div>)}
    {created && <div className="household-created-invite"><strong>Invitation created for:</strong><span>{created.email}</span><p>Share this secure link with the invited person.</p><label className="form-field">Secure invitation link<input aria-label="Invitation link" value={created.link} readOnly /></label><button className="app-button app-button-secondary" type="button" disabled={busy} onClick={() => copy(created)}>Copy invitation link</button></div>}
    {plan.role === "owner" ? plan.memberCount >= 2 ? <p className="household-limit-copy">This shared plan already has two members.</p> : pending.length === 0 && <button className="app-button" type="button" onClick={() => setInviteOpen(true)}>Invite partner</button> : <button className="app-button app-button-secondary" type="button" onClick={() => setAction({ kind: "leave" })}>Leave household</button>}
    {(status || error) && <p className={`form-message ${error ? "is-error" : "is-success"}`} role="status">{error || status}</p>}
  </SettingsSection>{inviteOpen && <InviteMemberDialog householdName={plan.name} close={() => setInviteOpen(false)} create={async (email) => { try { const invitation = await createHouseholdInvitation(plan.householdId, email); setCreated(invitation); setStatus(`Invitation created for ${invitation.email}.`); setError(""); setInviteOpen(false); await load(); return null; } catch (reason) { return sharedHouseholdError(reason instanceof Error ? reason.message : ""); } }} />}{action && <HouseholdActionDialog action={action} busy={busy} close={() => setAction(null)} confirm={confirm} />}</>;
}

function InviteMemberDialog({ householdName, close, create }: { householdName: string; close: () => void; create: (email: string) => Promise<string | null> }) {
  const [email, setEmail] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); const result = await create(email.trim()); setBusy(false); if (result) setError(result); };
  return <ModalDialog title="Invite partner" eyebrow="Household sharing" close={close} className="settings-dialog"><p>Invite one person to plan budgets and savings goals for {householdName} with you. Personal accounts, cards, transactions, and balances remain private.</p><label className="form-field">Email address<input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} autoFocus required /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogButtons close={close} save={submit} busy={busy} label="Create invitation" /></ModalDialog>;
}

function HouseholdActionDialog({ action, busy, close, confirm }: { action: Exclude<HouseholdAction, null>; busy: boolean; close: () => void; confirm: () => void }) {
  const remove = action.kind === "remove"; const transfer = action.kind === "transfer";
  const title = remove ? "Remove member?" : transfer ? `Transfer ownership to ${action.member.displayName}?` : "Leave household?";
  const text = remove ? "This person will immediately lose access to the shared budgets and savings goals. Their private finances will not be affected." : transfer ? "They will manage this shared plan. You will remain as a Member, and neither person’s private finances will move or change." : "You’ll lose access to the shared budgets and savings goals. Your private finances will not be affected.";
  return <ModalDialog title={title} eyebrow="Household sharing" close={close} closeOnBackdrop={!busy} className="settings-dialog"><p>{text}</p><div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" disabled={busy} onClick={close}>Cancel</button><button className={`app-button${remove ? " danger-button" : ""}`} type="button" disabled={busy} onClick={confirm}>{busy ? "Please wait…" : remove ? "Remove member" : transfer ? "Transfer ownership" : "Leave household"}</button></div></ModalDialog>;
}

function formatInvitationDate(value: string) { return new Intl.DateTimeFormat("en-AE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
async function copyText(value: string) { if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value); const field = document.createElement("textarea"); field.value = value; field.style.position = "fixed"; field.style.opacity = "0"; document.body.append(field); field.select(); const copied = document.execCommand("copy"); field.remove(); if (!copied) throw new Error("clipboard_unavailable"); }

function AddCategory({ profile, save, done }: { profile: FinancialProfile; save: (profile: FinancialProfile) => Promise<boolean>; done: () => void }) {
  const [name, setName] = useState(""); const [error, setError] = useState("");
  const submit = async () => { const result = addCustomCategory(profile, name); if (result.error) return setError(result.error); if (await save(result.profile)) { setName(""); setError(""); done(); } };
  return <div className="settings-inline-add"><label>New custom category<input value={name} maxLength={60} onChange={(event) => { setName(event.target.value); setError(""); }} /></label><button className="app-button app-button-secondary" type="button" onClick={submit}>Add category</button>{error && <small className="field-error">{error}</small>}</div>;
}

function PlanNameDialog({ current, close, save }: { current: string; close: () => void; save: (name: string) => Promise<boolean> }) {
  const [value, setValue] = useState(current); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { const name = validPlanName(value); if (!name) return setError("Enter a plan name from 1 to 60 characters."); setBusy(true); await save(name); setBusy(false); };
  return <ModalDialog title="Edit plan name" eyebrow="Plan settings" close={close} className="settings-dialog"><label className="form-field">Plan name<input value={value} maxLength={60} onChange={(event) => { setValue(event.target.value); setError(""); }} autoFocus /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogButtons close={close} save={submit} busy={busy} label="Save plan name" /></ModalDialog>;
}

function BudgetCycleDialog({ profile, close, save }: { profile: FinancialProfile; close: () => void; save: (day: number) => Promise<boolean> }) {
  const [value, setValue] = useState(String(profile.budgetStartDay ?? 1)); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async () => { const day = Number(value); if (!Number.isInteger(day) || day < 1 || day > 28) return setError("Choose a budget start day from 1 to 28."); setBusy(true); await save(day); setBusy(false); };
  return <ModalDialog title="Edit budget cycle" eyebrow="Plan settings" close={close} className="settings-dialog"><label className="form-field">Start day<input inputMode="numeric" pattern="[0-9]*" value={value} onChange={(event) => { if (/^\d{0,2}$/.test(event.target.value)) setValue(event.target.value); setError(""); }} autoFocus /></label><p className="form-help">Choose day 1–28 so every month has a valid cycle.</p>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogButtons close={close} save={submit} busy={busy} label="Save budget cycle" /></ModalDialog>;
}

function UsualIncomeDialog({ profile, close, save }: { profile: FinancialProfile; close: () => void; save: (amount: number) => Promise<boolean> }) {
  const [value, setValue] = useState(profile.usualMonthlyIncome ?? 0); const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); await save(value); setBusy(false); };
  return <ModalDialog title="Edit usual monthly income" eyebrow="Private plan" close={close} className="settings-dialog"><label className="form-field">Usual monthly income<MoneyInput value={value} onValueChange={setValue} autoFocus /></label><p className="form-help">Optional planning data only. This does not create an Income transaction or change any account balance.</p><DialogButtons close={close} save={submit} busy={busy} label="Save planning income" /></ModalDialog>;
}

function PreferenceSettings() {
  const { preferences, saving, issue, savePreferences, formatMoney, formatDate } = useUserPreferences(); const [status, setStatus] = useState("");
  const update = async (patch: Partial<UserPreferences>) => { if (await savePreferences({ ...preferences, ...patch })) setStatus("Preferences saved."); };
  return <SettingsSection eyebrow="Personal display" title="Preferences" description="These choices belong to you and change presentation only. Stored amounts and dates stay unchanged.">
    <SettingRow label="Currency placement" value={formatMoney(123456, "AED")}><select aria-label="Currency placement" disabled={saving} value={preferences.currencyPlacement} onChange={(event) => update({ currencyPlacement: event.target.value as CurrencyPlacement })}><option value="before">AED 1,234.56</option><option value="after">1,234.56 AED</option></select></SettingRow>
    <SettingRow label="Number format" value={formatMoney(123456, "AED")}><select aria-label="Number format" disabled={saving} value={preferences.numberFormat} onChange={(event) => update({ numberFormat: event.target.value as NumberFormat })}>{numberFormats.map((format) => <option key={format} value={format}>{format === "comma-dot" ? "1,234.56" : format === "dot-comma" ? "1.234,56" : "1 234,56"}</option>)}</select></SettingRow>
    <SettingRow label="Date format" value={formatDate("2026-08-23")}><select aria-label="Date format" disabled={saving} value={preferences.dateFormat} onChange={(event) => update({ dateFormat: event.target.value as DateFormat })}>{dateFormats.map((format) => <option key={format}>{format}</option>)}</select></SettingRow>
    {(status || issue) && <p className={`form-message ${issue ? "is-error" : "is-success"}`} role="status">{issue ?? status}</p>}
  </SettingsSection>;
}

function AccountSettings() {
  const router = useRouter(); const { preferences, savePreferences } = useUserPreferences(); const [dialog, setDialog] = useState<Dialog>(null); const [email, setEmail] = useState(""); const [providers, setProviders] = useState<string[]>([]); const [status, setStatus] = useState("");
  useEffect(() => { createClient().auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? ""); setProviders((data.user?.identities ?? []).flatMap((identity) => identity.provider ? [identity.provider] : [])); }); }, []);
  const hasPassword = providers.includes("email"); const hasGoogle = providers.includes("google");
  const signOut = async () => { await createClient().auth.signOut(); router.replace("/"); router.refresh(); };
  return <><SettingsSection eyebrow="Your account" title="Account & Security" description="Manage your personal identity and sign-in method without changing this Household plan.">
    <SettingRow label="Display name" value={preferences.displayName || "Not set"} help="Used to identify your activity in future shared plans." action={<button className="app-button app-button-secondary" type="button" onClick={() => setDialog("display-name")}>Edit</button>} />
    <SettingRow label="Email" value={email || "Loading…"} help={hasPassword ? "Supabase may ask you to confirm a new address." : "Email changes are unavailable for this provider-only account."} action={<button className="app-button app-button-secondary" type="button" disabled={!hasPassword} onClick={() => setDialog("email")}>Change email</button>} />
    <SettingRow label="Sign-in method" value={[hasPassword ? "Email & password" : "", hasGoogle ? "Google" : ""].filter(Boolean).join(" + ") || "Loading…"} help={!hasPassword && hasGoogle ? "Password login is not currently configured." : "Your password stays with Supabase Auth."} action={hasPassword ? <button className="app-button app-button-secondary" type="button" onClick={() => setDialog("password")}>Change password</button> : undefined} />
    <SettingRow label="Sign out" help="End this session on this device." action={<button className="app-button app-button-secondary" type="button" onClick={signOut}>Sign out</button>} />
    {status && <p className="form-message is-success" role="status">{status}</p>}
  </SettingsSection>{dialog === "display-name" && <DisplayNameDialog current={preferences.displayName} close={() => setDialog(null)} save={async (displayName) => { const ok = await savePreferences({ ...preferences, displayName }); if (ok) { setStatus("Display name updated."); setDialog(null); } return ok; }} />}{dialog === "email" && <EmailDialog current={email} close={() => setDialog(null)} done={(message) => { setStatus(message); setDialog(null); }} />}{dialog === "password" && <PasswordDialog close={() => setDialog(null)} done={() => { setStatus("Password updated."); setDialog(null); }} />}</>;
}

function DisplayNameDialog({ current, close, save }: { current: string; close: () => void; save: (name: string) => Promise<boolean> }) {
  const [value, setValue] = useState(current); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const submit = async () => { const name = validDisplayName(value); if (name === null) return setError("Use a display name up to 60 characters."); setBusy(true); await save(name); setBusy(false); };
  return <ModalDialog title="Edit display name" eyebrow="Account" close={close} className="settings-dialog"><label className="form-field">Display name<input value={value} maxLength={60} onChange={(event) => { setValue(event.target.value); setError(""); }} autoFocus /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogButtons close={close} save={submit} busy={busy} label="Save display name" /></ModalDialog>;
}

function EmailDialog({ current, close, done }: { current: string; close: () => void; done: (message: string) => void }) {
  const [value, setValue] = useState(current); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const submit = async () => { if (!/^\S+@\S+\.\S+$/.test(value)) return setError("Enter a valid email address."); setBusy(true); const { data, error: authError } = await createClient().auth.updateUser({ email: value.trim() }); setBusy(false); if (authError) return setError(authError.status === 429 ? "Too many requests. Wait a moment and try again." : "We couldn’t start that email change. Try again."); done(data.user?.email === value.trim() ? "Email updated." : "Check your new email to confirm the change."); };
  return <ModalDialog title="Change email" eyebrow="Account security" close={close} className="settings-dialog"><label className="form-field">New email<input type="email" value={value} onChange={(event) => { setValue(event.target.value); setError(""); }} autoFocus /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogButtons close={close} save={submit} busy={busy} label="Update email" /></ModalDialog>;
}

function PasswordDialog({ close, done }: { close: () => void; done: () => void }) {
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const submit = async () => { if (password.length < 8) return setError("Use a password with at least 8 characters."); if (password !== confirmation) return setError("Your passwords need to match."); setBusy(true); const { error: authError } = await createClient().auth.updateUser({ password }); setBusy(false); if (authError) return setError(authError.status === 429 ? "Too many requests. Wait a moment and try again." : "We couldn’t update your password. Try again."); done(); };
  return <ModalDialog title="Change password" eyebrow="Account security" close={close} className="settings-dialog"><label className="form-field">New password<input type="password" minLength={8} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoFocus /></label><label className="form-field">Confirm password<input type="password" minLength={8} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(""); }} /></label>{error && <p className="form-message is-error" role="alert">{error}</p>}<DialogButtons close={close} save={submit} busy={busy} label="Save password" /></ModalDialog>;
}

function DataSettings() {
  const router = useRouter(); const { profile, householdName, saving, issue, clearFinancialData } = useFinancialProfile(); const [clearOpen, setClearOpen] = useState(false); const [status, setStatus] = useState("");
  const exportData = () => { if (!profile || !householdName) return; const exported = buildFinancialExport(householdName, profile); const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `awn-financial-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); setStatus("Financial export downloaded."); };
  if (!profile || !householdName) return null;
  return <><SettingsSection eyebrow="Your information" title="Data & Privacy" description="Export a safe copy or clear only this plan’s financial content.">
    <SettingRow label="Export data" help="Download your private plan’s financial data as JSON v1. Authentication secrets and shared planning data are not included." action={<button className="app-button app-button-secondary" type="button" onClick={exportData}>Export JSON</button>} />
    <SettingRow label="Clear financial data" help="Permanently remove only your private accounts, cards, transactions, budgets, goals, custom categories, cash, SMS import history, and private-to-Household contribution mappings. Shared budgets and shared goals remain." action={<button className="app-button danger-button" type="button" onClick={() => setClearOpen(true)}>Clear financial data</button>} />
    {(status || issue) && <p className={`form-message ${issue ? "is-error" : "is-success"}`} role="status">{issue ?? status}</p>}
  </SettingsSection>{clearOpen && <ClearDataDialog busy={saving} close={() => setClearOpen(false)} clear={async () => { const ok = await clearFinancialData(); if (ok) { setClearOpen(false); router.replace("/onboarding"); } return ok; }} />}</>;
}

function ClearDataDialog({ busy, close, clear }: { busy: boolean; close: () => void; clear: () => Promise<boolean> }) {
  const [value, setValue] = useState(""); const ready = clearConfirmationReady(value);
  return <ModalDialog title="Clear your private financial data?" eyebrow="Permanent action" close={close} closeOnBackdrop={!busy} className="settings-dialog clear-data-dialog"><p>This permanently removes your private financial data and your aggregate Household spending mappings. Shared budgets, shared savings goals, the other member’s private data, and the relationship remain. This cannot be undone.</p><label className="form-field">Type CLEAR to continue<input value={value} onChange={(event) => setValue(event.target.value)} autoComplete="off" autoFocus /></label><div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="app-button danger-button" type="button" disabled={!ready || busy} onClick={clear}>{busy ? "Clearing…" : "Clear private data"}</button></div></ModalDialog>;
}

function DialogButtons({ close, save, busy, label }: { close: () => void; save: () => void; busy: boolean; label: string }) { return <div className="confirm-dialog-actions"><button className="app-button app-button-secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="app-button" type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : label}</button></div>; }
