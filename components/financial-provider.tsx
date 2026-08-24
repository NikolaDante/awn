"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { normalizeBudgetSnapshots } from "@/lib/financial-budget";
import { clearCloudFinancialData, cloudFinancialIssue, loadCloudFinancialProfile, saveCloudFinancialImport, saveCloudFinancialProfile, updateCloudHouseholdName, type CloudFinancialLoadResult } from "@/lib/cloud-financial-repository";
import type { CloudFinancialState } from "@/lib/cloud-financial-core";
import { financialReferenceMonth } from "@/lib/financial-date";
import { normalizeFinancialPurposes } from "@/lib/financial-purpose";
import { normalizeLedgerProfile } from "@/lib/financial-ledger";
import type { FinancialProfile } from "@/lib/financial-types";
import type { FinancialImportRecord } from "@/lib/sms-import/types";
import { removedFinancialReference } from "@/lib/financial-reference-guards";
import { createClient } from "@/lib/supabase/client";

export type FinancialSave = (profile: FinancialProfile) => Promise<boolean>;
export type FinancialImportSave = (profile: FinancialProfile, imports: FinancialImportRecord[]) => Promise<boolean>;
type FinancialContextValue = {
  profile: FinancialProfile | null;
  privatePlanHouseholdId: string | null;
  householdName: string | null;
  ready: boolean;
  saving: boolean;
  issue: string | null;
  save: FinancialSave;
  importTransactions: FinancialImportSave;
  saveHouseholdName: (name: string) => Promise<boolean>;
  clearFinancialData: () => Promise<boolean>;
  retry: () => void;
};

const FinancialContext = createContext<FinancialContextValue | null>(null);

export function FinancialProvider({ children, ownerId }: Readonly<{ children: React.ReactNode; ownerId: string }>) {
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const [privatePlanHouseholdId, setPrivatePlanHouseholdId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const profileRef = useRef<FinancialProfile | null>(null);
  const cloudRef = useRef<CloudFinancialState | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const applyCloudState = useCallback((result: CloudFinancialLoadResult) => {
    cloudRef.current = result;
    profileRef.current = result.profile;
    setProfile(result.profile);
    setPrivatePlanHouseholdId(result.householdId);
    setHouseholdName(result.householdName);
    setIssue(result.issue);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadCloudFinancialProfile(ownerId).then((result) => {
      if (cancelled) return;
      applyCloudState(result);
      setReady(true);
    }).catch((error) => {
      if (cancelled) return;
      profileRef.current = null;
      cloudRef.current = null;
      setProfile(null);
      setPrivatePlanHouseholdId(null);
      setHouseholdName(null);
      setIssue(cloudFinancialIssue(error, "load"));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [applyCloudState, ownerId, reloadToken]);

  useEffect(() => {
    if (!privatePlanHouseholdId || !ready) return;
    const supabase = createClient(); let timer: ReturnType<typeof setTimeout> | null = null; let disposed = false;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const result = await loadCloudFinancialProfile(ownerId, false);
          if (!disposed) applyCloudState(result);
        } catch (error) {
          if (!disposed) { setIssue(cloudFinancialIssue(error, "load")); setReloadToken((value) => value + 1); }
        }
      }, 300);
    };
    const channel = supabase.channel(`awn-private-plan-${privatePlanHouseholdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_profiles", filter: `household_id=eq.${privatePlanHouseholdId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "households", filter: `id=eq.${privatePlanHouseholdId}` }, refetch)
      .subscribe();
    return () => { disposed = true; if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [privatePlanHouseholdId, applyCloudState, ownerId, ready]);

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
        setPrivatePlanHouseholdId(saved.householdId);
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
        setPrivatePlanHouseholdId(saved.householdId);
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
  const saveHouseholdName = useCallback(async (name: string) => {
    if (!cloudRef.current) { setIssue("We couldn’t update this plan because your Household is not ready."); return false; }
    setSaving(true);
    try { const savedName = await updateCloudHouseholdName(cloudRef.current, name); cloudRef.current = { ...cloudRef.current, householdName: savedName }; setHouseholdName(savedName); setIssue(null); return true; }
    catch { setIssue("We couldn’t update the plan name. Check your connection and try again."); return false; }
    finally { setSaving(false); }
  }, []);
  const clearFinancialData = useCallback(async () => {
    if (!cloudRef.current) { setIssue("We couldn’t clear this plan because your Household is not ready."); return false; }
    setSaving(true);
    try { const cleared = await clearCloudFinancialData(cloudRef.current); cloudRef.current = cleared; profileRef.current = cleared.profile; setProfile(cleared.profile); setIssue(null); return true; }
    catch { setIssue("We couldn’t clear your private financial data. Nothing was changed."); return false; }
    finally { setSaving(false); }
  }, []);
  return <FinancialContext.Provider value={{ profile, privatePlanHouseholdId, householdName, ready, saving, issue, save, importTransactions, saveHouseholdName, clearFinancialData, retry }}>{children}</FinancialContext.Provider>;
}

export function useFinancialProfile() {
  const context = useContext(FinancialContext);
  if (!context) throw new Error("FinancialProvider is required");
  return context;
}
