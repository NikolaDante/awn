"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useFinancialProfile } from "@/components/financial-provider";
import { authenticatedFinancialRoute } from "@/lib/onboarding";

export function AuthenticatedFinancialGate({ children }: { children: React.ReactNode }) {
  const { profile, ready, issue } = useFinancialProfile();
  const pathname = usePathname();
  const router = useRouter();
  const redirect = ready && !issue ? authenticatedFinancialRoute(profile, pathname) : null;
  useEffect(() => { if (redirect) router.replace(redirect); }, [redirect, router]);
  if (!ready || redirect) return <main className="app-workspace"><p className="loading-copy">Preparing your AWN setup…</p></main>;
  return children;
}
