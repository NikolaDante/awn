"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { MoneyInput } from "@/components/money-input";
import { financialReferenceDate } from "@/lib/financial-date";
import { normalizeSavingsTargetMonth, savingsTargetMonth } from "@/lib/onboarding";
import { newLocalId, type FinancialProfile, type SavingsGoal } from "@/lib/financial-types";

export function SavingsGoalForm({ profile, existing, onCancel, onSave }: { profile: FinancialProfile; existing?: SavingsGoal; onCancel: () => void; onSave: (goal: SavingsGoal) => Promise<boolean> | boolean | void }) {
  const [name, setName] = useState(existing?.name ?? "");
  const [target, setTarget] = useState(existing?.target ?? 0);
  const [saved, setSaved] = useState(existing?.saved ?? 0);
  const [contribution, setContribution] = useState(existing?.contribution ?? 0);
  const [targetMonth, setTargetMonth] = useState(existing ? savingsTargetMonth(existing) : "");
  const [priority, setPriority] = useState(existing?.priority ?? Math.min(5, profile.savingsGoals.length + 1));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Add a name for this savings goal.";
    if (target <= 0) next.target = "Target amount must be above zero.";
    if (saved < 0 || saved > target) next.saved = "Already saved must be between zero and the target.";
    if (contribution < 0) next.contribution = "Monthly contribution cannot be negative.";
    if (targetMonth && !normalizeSavingsTargetMonth(targetMonth)) next.targetMonth = "Choose a valid month and year.";
    setErrors(next);
    if (Object.keys(next).length) return;
    await onSave({ id: existing?.id ?? newLocalId(), name: name.trim(), target, saved, contribution, startDate: existing?.startDate ?? financialReferenceDate(profile), targetDate: normalizeSavingsTargetMonth(targetMonth), priority });
  };
  return <div className="savings-goal-fields onboarding-item-form">
    <FormField label="Goal name" error={errors.name} className="savings-goal-field-wide"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Emergency fund" /></FormField>
    <FormField label="Target amount" error={errors.target}><MoneyInput value={target} onValueChange={setTarget} placeholder="0.00" /></FormField>
    <FormField label="Already saved" optional error={errors.saved} hint="Zero is fine."><MoneyInput value={saved} onValueChange={setSaved} placeholder="0.00" /></FormField>
    <FormField label="Planned monthly contribution" optional error={errors.contribution} hint="Zero is fine."><MoneyInput value={contribution} onValueChange={setContribution} placeholder="0.00" /></FormField>
    <FormField label="Target month / year" optional error={errors.targetMonth}><input type="month" value={targetMonth} onInput={(event) => setTargetMonth(event.currentTarget.value)} onChange={(event) => setTargetMonth(event.target.value)} /></FormField>
    <FormField label="Priority"><select value={priority} onChange={(event) => setPriority(Number(event.target.value))}><option value="1">1 — Highest</option><option value="2">2 — High</option><option value="3">3 — Medium</option><option value="4">4 — Low</option><option value="5">5 — Lowest</option></select></FormField>
    <div className="confirm-dialog-actions savings-goal-field-wide"><button className="app-button app-button-secondary" type="button" onClick={onCancel}>Cancel</button><button className="app-button" type="button" onClick={submit}>{existing ? "Save changes" : "Add goal"}</button></div>
  </div>;
}
