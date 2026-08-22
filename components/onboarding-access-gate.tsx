"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFinancialProfile } from "@/components/financial-provider";
import { authenticatedFinancialRoute } from "@/lib/onboarding";

export function OnboardingAccessGate({ children, editMode = false }: { children: React.ReactNode; editMode?: boolean }) {
  const { profile, ready, issue, retry } = useFinancialProfile();
  const router = useRouter();
  const redirect = ready && !issue ? authenticatedFinancialRoute(profile, "/onboarding", editMode) : null;
  useEffect(() => { if (redirect) router.replace(redirect); }, [redirect, router]);
  if (!ready || redirect) return <main className="onboarding-page"><p className="loading-copy">Loading your setup…</p></main>;
  if (issue) return <main className="onboarding-page"><section className="onboarding-card"><h1>We couldn’t load your financial data.</h1><p>{issue}</p><button className="app-button app-button-light" type="button" onClick={retry}>Try again</button></section></main>;
  return children;
}
