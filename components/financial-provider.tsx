"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { normalizeBudgetSnapshots } from "@/lib/financial-budget";
import { financialReferenceMonth } from "@/lib/financial-date";
import { normalizeFinancialPurposes } from "@/lib/financial-purpose";
import { normalizeLedgerProfile } from "@/lib/financial-ledger";
import type { FinancialProfile } from "@/lib/financial-types";
import { removedFinancialReference } from "@/lib/financial-reference-guards";
import { loadFinancialProfile, resetFinancialProfile, saveFinancialProfile } from "@/lib/financial-storage";

type FinancialContextValue = { profile: FinancialProfile | null; ready: boolean; issue: string | null; save: (profile: FinancialProfile) => boolean; reset: () => void };
const FinancialContext = createContext<FinancialContextValue | null>(null);

export function FinancialProvider({ children, ownerId }: Readonly<{ children: React.ReactNode; ownerId: string }>) {
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const profileRef = useRef<FinancialProfile | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    queueMicrotask(() => { const result = loadFinancialProfile(ownerId); profileRef.current = result.profile; setProfile(result.profile); setIssue(result.issue); setReady(true); });
  }, [ownerId]);
  const save = useCallback((next: FinancialProfile) => { const withPurposes = normalizeLedgerProfile(normalizeFinancialPurposes(next)); const normalized = normalizeBudgetSnapshots(withPurposes, financialReferenceMonth(withPurposes)); if (profileRef.current && removedFinancialReference(profileRef.current, normalized)) return false; const updated = { ...normalized, updatedAt: new Date().toISOString() }; const saved = saveFinancialProfile(ownerId, updated); if (saved) { profileRef.current = updated; setProfile(updated); setIssue(null); } else setIssue("AWN could not save this plan in this browser."); return saved; }, [ownerId]);
  const reset = useCallback(() => { resetFinancialProfile(ownerId); profileRef.current = null; setProfile(null); setIssue(null); }, [ownerId]);
  return <FinancialContext.Provider value={{ profile, ready, issue, save, reset }}>{children}</FinancialContext.Provider>;
}

export function useFinancialProfile() { const context = useContext(FinancialContext); if (!context) throw new Error("FinancialProvider is required"); return context; }
