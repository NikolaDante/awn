"use client";

import { useState } from "react";
import { qaFinancialProfile, QA_BACKUP_STORAGE_KEY } from "@/lib/financial-qa-fixture";
import { FINANCIAL_STORAGE_KEY, LEGACY_FINANCIAL_STORAGE_KEY } from "@/lib/financial-storage";

export function QaSeedControl() {
  const [status, setStatus] = useState("");

  const seed = () => {
    const current = window.localStorage.getItem(FINANCIAL_STORAGE_KEY);
    if (current) window.localStorage.setItem(QA_BACKUP_STORAGE_KEY, current);
    window.localStorage.setItem(FINANCIAL_STORAGE_KEY, JSON.stringify(qaFinancialProfile));
    window.localStorage.removeItem(LEGACY_FINANCIAL_STORAGE_KEY);
    setStatus(current ? `Previous financial profile backed up to ${QA_BACKUP_STORAGE_KEY}. Loading QA profile...` : "No existing financial profile was present. Loading QA profile...");
    window.setTimeout(() => window.location.assign("/dashboard"), 250);
  };

  return <main style={{ maxWidth: 680, margin: "80px auto", padding: 24, fontFamily: "Arial, sans-serif" }}><h1>AWN development QA seed</h1><p>This development-only control replaces the financial profile stored in this browser. It does not modify or delete the authenticated Supabase account.</p><p>The current financial profile is copied to <code>{QA_BACKUP_STORAGE_KEY}</code> before replacement.</p><button type="button" onClick={seed} style={{ minHeight: 44, padding: "0 18px", border: 0, borderRadius: 12, background: "#665cf6", color: "white", fontWeight: 700 }}>Back up and load January–March QA profile</button>{status && <p role="status">{status}</p>}</main>;
}
