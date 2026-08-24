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
import { listHouseholds } from "@/lib/shared-household-repository";
import type { HouseholdSummary } from "@/lib/shared-households";

export type FinancialSave = (profile: FinancialProfile) => Promise<boolean>;
export type FinancialImportSave = (profile: FinancialProfile, imports: FinancialImportRecord[]) => Promise<boolean>;
type FinancialContextValue = {
  profile: FinancialProfile | null;
  activeHouseholdId: string | null;
  householdName: string | null;
  memberRole: "owner" | "member" | null;
  memberCount: number;
  households: HouseholdSummary[];
  ready: boolean;
  switching: boolean;
  saving: boolean;
  issue: string | null;
  save: FinancialSave;
  importTransactions: FinancialImportSave;
  saveHouseholdName: (name: string) => Promise<boolean>;
  clearFinancialData: () => Promise<boolean>;
  switchHousehold: (householdId: string) => Promise<boolean>;
  refreshHouseholds: () => Promise<void>;
  retry: () => void;
};

const FinancialContext = createContext<FinancialContextValue | null>(null);

export function FinancialProvider({ children, ownerId }: Readonly<{ children: React.ReactNode; ownerId: string }>) {
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<"owner" | "member" | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [issue, setIssue] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const profileRef = useRef<FinancialProfile | null>(null);
  const cloudRef = useRef<CloudFinancialState | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());

  const applyCloudState = useCallback((result: CloudFinancialLoadResult) => {
    cloudRef.current = result;
    profileRef.current = result.profile;
    setProfile(result.profile);
    setActiveHouseholdId(result.householdId);
    setHouseholdName(result.householdName);
    setMemberRole(result.memberRole);
    setMemberCount(result.memberCount);
    setIssue(result.issue);
  }, []);

  const refreshHouseholds = useCallback(async () => {
    const currentId = cloudRef.current?.householdId;
    const [available, result] = await Promise.all([listHouseholds(), currentId ? loadCloudFinancialProfile(ownerId, currentId, false) : Promise.resolve(null)]);
    setHouseholds(available);
    if (result) applyCloudState(result);
  }, [applyCloudState, ownerId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadCloudFinancialProfile(ownerId), listHouseholds()]).then(([result, available]) => {
      if (cancelled) return;
      applyCloudState(result);
      setHouseholds(available);
      setReady(true);
    }).catch((error) => {
      if (cancelled) return;
      profileRef.current = null;
      cloudRef.current = null;
      setProfile(null);
      setActiveHouseholdId(null);
      setHouseholdName(null);
      setMemberRole(null);
      setMemberCount(0);
      setHouseholds([]);
      setIssue(cloudFinancialIssue(error, "load"));
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [applyCloudState, ownerId, reloadToken]);

  const switchHousehold = useCallback(async (householdId: string) => {
    if (householdId === cloudRef.current?.householdId) return true;
    setSwitching(true); setReady(false); setIssue(null);
    cloudRef.current = null; profileRef.current = null; setProfile(null); setHouseholdName(null); setMemberRole(null); setMemberCount(0);
    try {
      const [result, available] = await Promise.all([loadCloudFinancialProfile(ownerId, householdId, false), listHouseholds()]);
      applyCloudState(result); setHouseholds(available); setReady(true); return true;
    } catch (error) {
      setIssue(cloudFinancialIssue(error, "load")); setReady(true); return false;
    } finally { setSwitching(false); }
  }, [applyCloudState, ownerId]);

  useEffect(() => {
    if (!activeHouseholdId || !ready) return;
    const supabase = createClient(); let timer: ReturnType<typeof setTimeout> | null = null; let disposed = false;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const [result, available] = await Promise.all([loadCloudFinancialProfile(ownerId, activeHouseholdId, false), listHouseholds()]);
          if (!disposed) { applyCloudState(result); setHouseholds(available); }
        } catch (error) {
          if (!disposed) { setIssue(cloudFinancialIssue(error, "load")); setReloadToken((value) => value + 1); }
        }
      }, 300);
    };
    const channel = supabase.channel(`awn-household-${activeHouseholdId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "financial_profiles", filter: `household_id=eq.${activeHouseholdId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "household_members", filter: `household_id=eq.${activeHouseholdId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "households", filter: `id=eq.${activeHouseholdId}` }, refetch)
      .subscribe();
    return () => { disposed = true; if (timer) clearTimeout(timer); void supabase.removeChannel(channel); };
  }, [activeHouseholdId, applyCloudState, ownerId, ready]);

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
    catch (error) { setIssue(error instanceof Error && error.message.includes("shared_household_clear_blocked") ? "Clearing shared Household data will be available through household management." : "We couldn’t clear the financial data. Nothing was changed."); return false; }
    finally { setSaving(false); }
  }, []);
  return <FinancialContext.Provider value={{ profile, activeHouseholdId, householdName, memberRole, memberCount, households, ready, switching, saving, issue, save, importTransactions, saveHouseholdName, clearFinancialData, switchHousehold, refreshHouseholds, retry }}>{children}</FinancialContext.Provider>;
}

export function useFinancialProfile() {
  const context = useContext(FinancialContext);
  if (!context) throw new Error("FinancialProvider is required");
  return context;
}
