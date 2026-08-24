"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { acceptHouseholdInvitation, declineHouseholdInvitation, getHouseholdInvitationPreview } from "@/lib/shared-household-repository";
import { sharedHouseholdError, type HouseholdInvitationPreview } from "@/lib/shared-households";
import { createClient } from "@/lib/supabase/client";

export function HouseholdInvitationView({ token }: { token: string }) {
  const router = useRouter(); const [preview, setPreview] = useState<HouseholdInvitationPreview | null | undefined>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [declined, setDeclined] = useState(false);
  useEffect(() => { let active = true; getHouseholdInvitationPreview(token).then((value) => { if (active) setPreview(value); }).catch(() => { if (active) setPreview(null); }); return () => { active = false; }; }, [token]);
  const invitePath = `/invite/${encodeURIComponent(token)}`; const authNext = encodeURIComponent(invitePath);
  const accept = async () => { setBusy(true); setError(""); try { const result = await acceptHouseholdInvitation(token); router.replace(result.onboardingCompleted ? "/dashboard" : "/onboarding"); router.refresh(); } catch (reason) { setError(sharedHouseholdError(reason instanceof Error ? reason.message : "")); setBusy(false); } };
  const decline = async () => { setBusy(true); setError(""); try { await declineHouseholdInvitation(token); setDeclined(true); } catch (reason) { setError(sharedHouseholdError(reason instanceof Error ? reason.message : "")); } finally { setBusy(false); } };
  const signOut = async () => { setBusy(true); await createClient().auth.signOut(); router.replace(invitePath); router.refresh(); };
  if (preview === undefined) return <main className="invite-page"><section className="invite-card" aria-busy="true"><p>Checking your secure invitation…</p></section></main>;
  if (!preview) return <InviteUnavailable title="This invitation isn’t available." text="The link may be invalid or no longer active." />;
  if (declined) return <InviteUnavailable title="Invitation declined." text="No Household access was added. Your personal AWN plan is unchanged." />;
  if (preview.status !== "pending") return <InviteUnavailable title={preview.status === "expired" ? "This invitation has expired." : "This invitation is no longer available."} text="Ask the Household owner to create a new secure invitation if needed." />;
  return <main className="invite-page"><section className="invite-card"><Link className="app-wordmark auth-brand" href="/" aria-label="AWN home"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></Link><p className="app-eyebrow">Shared planning</p><h1>You’ve been invited to plan together</h1><h2>{preview.householdName}</h2><p className="invite-by">Invited by <strong>{preview.invitedBy}</strong></p><p>You’ve been invited to plan budgets and savings goals together on AWN.</p><p><strong>Your personal accounts, cards, transactions and balances remain private.</strong></p><small>Invitation expires {new Intl.DateTimeFormat("en-AE", { day: "numeric", month: "short", year: "numeric" }).format(new Date(preview.expiresAt))}.</small>{error && <p className="form-message is-error" role="alert">{error}</p>}{!preview.authenticated ? <div className="invite-actions"><Link className="app-button" href={`/auth/sign-in?next=${authNext}`}>Sign in to continue</Link><Link className="app-button app-button-secondary" href={`/auth/sign-up?next=${authNext}`}>Create account</Link></div> : !preview.emailMatches ? <><p className="form-message is-error" role="alert">This invitation was sent to another email address.</p><button className="app-button app-button-secondary" type="button" disabled={busy} onClick={signOut}>Sign out</button></> : <div className="invite-actions"><button className="app-button" type="button" disabled={busy} onClick={accept}>{busy ? "Joining…" : "Join shared plan"}</button><button className="app-button app-button-secondary" type="button" disabled={busy} onClick={decline}>Decline</button></div>}</section></main>;
}

function InviteUnavailable({ title, text }: { title: string; text: string }) { return <main className="invite-page"><section className="invite-card"><p className="app-eyebrow">Shared Household</p><h1>{title}</h1><p>{text}</p><Link className="app-button" href="/">Return to AWN</Link></section></main>; }
