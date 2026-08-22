"use client";

import { useState } from "react";
import { qaFinancialProfile, QA_BACKUP_STORAGE_KEY } from "@/lib/financial-qa-fixture";
import { FINANCIAL_STORAGE_KEY, LEGACY_FINANCIAL_STORAGE_KEY, financialStorageKey } from "@/lib/financial-storage";
import { createClient } from "@/lib/supabase/client";

export function QaSeedControl() {
  const [status, setStatus] = useState("");

  const seed = async () => {
    const { data } = await createClient().auth.getClaims();
    const ownerId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
    if (!ownerId) return setStatus("Sign in before loading the QA profile.");
    const key = financialStorageKey(ownerId);
    const current = window.localStorage.getItem(key) ?? window.localStorage.getItem(FINANCIAL_STORAGE_KEY);
    if (current) window.localStorage.setItem(QA_BACKUP_STORAGE_KEY, current);
    window.localStorage.setItem(key, JSON.stringify(qaFinancialProfile));
    window.localStorage.removeItem(FINANCIAL_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_FINANCIAL_STORAGE_KEY);
    setStatus(current ? `Previous financial profile backed up to ${QA_BACKUP_STORAGE_KEY}. Loading QA profile...` : "No existing financial profile was present. Loading QA profile...");
    window.setTimeout(() => window.location.assign("/dashboard"), 250);
  };

  return <main style={{ maxWidth: 680, margin: "80px auto", padding: 24, fontFamily: "Arial, sans-serif" }}><h1>AWN development migration seed</h1><p>This development-only control creates a local migration candidate. It does not modify or delete the authenticated Supabase account.</p><p>The candidate imports only when the user’s Household cloud profile is empty; initialized cloud data always wins. The current browser profile is copied to <code>{QA_BACKUP_STORAGE_KEY}</code> first.</p><button type="button" onClick={seed} style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 12, background: "#665cf6", color: "white", fontWeight: 700 }}>Back up and stage January–March migration profile</button>{status && <p role="status">{status}</p>}</main>;
}
