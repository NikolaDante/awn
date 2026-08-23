"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { loadUserPreferences, saveUserPreferences } from "@/lib/user-preferences-repository";
import { DEFAULT_USER_PREFERENCES, formatDatePreference, formatMoneyPreference, type UserPreferences } from "@/lib/user-preferences";
import type { Amount, Currency } from "@/lib/financial-types";

type PreferencesContextValue = {
  preferences: UserPreferences;
  ready: boolean;
  saving: boolean;
  issue: string | null;
  savePreferences: (preferences: UserPreferences) => Promise<boolean>;
  formatMoney: (amount: Amount, currency: Currency) => string;
  formatDate: (value: string) => string;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function UserPreferencesProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const [preferences, setPreferences] = useState(DEFAULT_USER_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadUserPreferences(userId).then((value) => { if (active) { setPreferences(value); setIssue(null); setReady(true); } })
      .catch(() => { if (active) { setIssue("We couldn’t load your personal preferences. AWN is using its standard display for now."); setReady(true); } });
    return () => { active = false; };
  }, [userId]);

  const savePreferences = useCallback(async (next: UserPreferences) => {
    setSaving(true);
    try {
      const saved = await saveUserPreferences(userId, next);
      setPreferences(saved);
      setIssue(null);
      return true;
    } catch {
      setIssue("We couldn’t save your preferences. Check your connection and try again.");
      return false;
    } finally { setSaving(false); }
  }, [userId]);

  const formatMoney = useCallback((amount: Amount, currency: Currency) => formatMoneyPreference(amount, currency, preferences), [preferences]);
  const formatDate = useCallback((value: string) => formatDatePreference(value, preferences.dateFormat), [preferences.dateFormat]);
  return <PreferencesContext.Provider value={{ preferences, ready, saving, issue, savePreferences, formatMoney, formatDate }}>{children}</PreferencesContext.Provider>;
}

export function useUserPreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("UserPreferencesProvider is required");
  return context;
}
