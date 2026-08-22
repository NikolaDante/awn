"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FinancialProvider, useFinancialProfile } from "@/components/financial-provider";
import { authenticatedHomeRoute } from "@/lib/onboarding";

export function AuthenticatedAuthPageRedirect({ ownerId }: { ownerId: string }) {
  return <FinancialProvider ownerId={ownerId}><AuthDestination /></FinancialProvider>;
}

function AuthDestination() {
  const { profile, ready, issue, retry } = useFinancialProfile();
  const router = useRouter();
  const destination = ready && !issue ? authenticatedHomeRoute(profile) : null;
  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);
  if (issue) return <main className="auth-page"><section className="auth-card"><p className="app-eyebrow">Your private AWN space</p><h1>We couldn’t open your account.</h1><p className="auth-intro">{issue}</p><button className="app-button" type="button" onClick={retry}>Try again</button></section></main>;
  return <main className="auth-page"><section className="auth-card" aria-busy="true"><p className="auth-intro">Opening your AWN space…</p></section></main>;
}
