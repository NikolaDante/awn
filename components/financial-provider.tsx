"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { FinancialProfile } from "@/lib/financial-types";
import { removedFinancialReference } from "@/lib/financial-reference-guards";
import { loadFinancialProfile, resetFinancialProfile, saveFinancialProfile } from "@/lib/financial-storage";

type FinancialContextValue = { profile: FinancialProfile | null; ready: boolean; issue: string | null; save: (profile: FinancialProfile) => boolean; reset: () => void };
const FinancialContext = createContext<FinancialContextValue | null>(null);

export function FinancialProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [profile, setProfile] = useState<FinancialProfile | null>(null);
  const profileRef = useRef<FinancialProfile | null>(null);
  const [issue, setIssue] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { queueMicrotask(() => { const result = loadFinancialProfile(); profileRef.current = result.profile; setProfile(result.profile); setIssue(result.issue); setReady(true); }); }, []);
  const save = useCallback((next: FinancialProfile) => { if (profileRef.current && removedFinancialReference(profileRef.current, next)) return false; const updated = { ...next, updatedAt: new Date().toISOString() }; const saved = saveFinancialProfile(updated); if (saved) { profileRef.current = updated; setProfile(updated); setIssue(null); } else setIssue("AWN could not save this plan in this browser."); return saved; }, []);
  const reset = useCallback(() => { resetFinancialProfile(); profileRef.current = null; setProfile(null); setIssue(null); }, []);
  return <FinancialContext.Provider value={{ profile, ready, issue, save, reset }}>{children}</FinancialContext.Provider>;
}

export function useFinancialProfile() { const context = useContext(FinancialContext); if (!context) throw new Error("FinancialProvider is required"); return context; }
