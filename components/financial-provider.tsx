"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { normalizeBudgetSnapshots } from "@/lib/financial-budget";
import { cloudFinancialIssue, loadCloudFinancialProfile, saveCloudFinancialImport, saveCloudFinancialProfile } from "@/lib/cloud-financial-repository";
import type { CloudFinancialState } from "@/lib/cloud-financial-core";
import { financialReferenceMonth } from "@/lib/financial-date";
import { normalizeFinancialPurposes } from "@/lib/financial-purpose";
import { normalizeLedgerProfile } from "@/lib/financial-ledger";
import type { FinancialProfile } from "@/lib/financial-types";
import type { FinancialImportRecord } from "@/lib/sms-import/types";
import { removedFinancialReference } from "@/lib/financial-reference-guards";

export type FinancialSave = (profile: FinancialProfile) => Promise<boolean>;
export type FinancialImportSave = (profile: FinancialProfile, imports: FinancialImportRecord[]) => Promise<boolean>;
type FinancialContextValue = {
  profile: FinancialProfile | null;
  activeHouseholdId: string | null;
  ready: boolean;
  saving: boolean;
  issue: string | null;
  save: FinancialSave;
  importTransactions: FinancialImportSave;
  retry: () => void;
};

const FinancialContext = createContext<FinancialContextValue | null>(null);

export function FinancialProvider({ children, ownerId }: Readonly<{ children: React.ReactNode; ownerId: string }>) {
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const profileRef = useRef<FinancialProfile | null>(null);
  const cloudRef = useRef<CloudFinancialState | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    loadCloudFinancialProfile(ownerId).then((result) => {
      if (cancelled) return;
      cloudRef.current = result;
      profileRef.current = result.profile;
      setProfile(result.profile);
      setActiveHouseholdId(result.householdId);
      setIssue(result.issue);
      setReady(true);
    }).catch((error) => {
      if (cancelled) return;
      profileRef.current = null;
      cloudRef.current = null;
      setProfile(null);
      setActiveHouseholdId(null);
      setIssue(cloudFinancialIssue(error, "load"));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [ownerId, reloadToken]);

  const save = useCallback<FinancialSave>((next) => {
    const operation = saveQueue.current.then(async () => {
      const withPurposes = normalizeLedgerProfile(normalizeFinancialPurposes(next));
      const normalized = normalizeBudgetSnapshots(withPurposes, financialReferenceMonth(withPurposes));
      if (profileRef.current && removedFinancialReference(profileRef.current, normalized)) {
        setIssue("That change would remove financial history that is still referenced.");
        return false;
      }
      if (!cloudRef.current) {
        setIssue("We couldn’t save that change because your Household is not ready. Try again.");
        return false;
      }

      setSaving(true);
      const updated = { ...normalized, updatedAt: new Date().toISOString() };
      try {
        const saved = await saveCloudFinancialProfile(cloudRef.current, updated);
        cloudRef.current = saved;
        profileRef.current = saved.profile;
        setProfile(saved.profile);
        setActiveHouseholdId(saved.householdId);
        setIssue(null);
        return true;
      } catch (error) {
        setIssue(cloudFinancialIssue(error, "save"));
        return false;
      } finally {
        setSaving(false);
      }
    });
    saveQueue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const importTransactions = useCallback<FinancialImportSave>((next, imports) => {
    const operation = saveQueue.current.then(async () => {
      const withPurposes = normalizeLedgerProfile(normalizeFinancialPurposes(next));
      const normalized = normalizeBudgetSnapshots(withPurposes, financialReferenceMonth(withPurposes));
      if (!cloudRef.current) { setIssue("We couldn’t import because your Household is not ready. Try again."); return false; }
      setSaving(true);
      const updated = { ...normalized, updatedAt: new Date().toISOString() };
      try {
        const saved = await saveCloudFinancialImport(cloudRef.current, updated, imports);
        cloudRef.current = saved;
        profileRef.current = saved.profile;
        setProfile(saved.profile);
        setActiveHouseholdId(saved.householdId);
        setIssue(null);
        return true;
      } catch (error) {
        setIssue(cloudFinancialIssue(error, "save"));
        return false;
      } finally {
        setSaving(false);
      }
    });
    saveQueue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const retry = useCallback(() => {
    setReady(false);
    setIssue(null);
    setReloadToken((current) => current + 1);
  }, []);
  return <FinancialContext.Provider value={{ profile, activeHouseholdId, ready, saving, issue, save, importTransactions, retry }}>{children}</FinancialContext.Provider>;
}

export function useFinancialProfile() {
  const context = useContext(FinancialContext);
  if (!context) throw new Error("FinancialProvider is required");
  return context;
}
