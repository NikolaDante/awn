"use client";

import Link from "next/link";
import { FormEvent, Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeReturnPath } from "@/lib/auth/routing";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up" | "forgot-password" | "reset";
const callbackUrl = (path: string) => `${window.location.origin}${path}`;

export function AuthForm({ mode }: { mode: Mode }) {
  return (
    <Suspense fallback={<main className="auth-page"><section className="auth-card" aria-busy="true"><p className="auth-intro">Loading…</p></section></main>}>
      <AuthFormContent mode={mode} />
    </Suspense>
  );
}

function AuthFormContent({ mode }: { mode: Mode }) {
  const router = useRouter(); const searchParams = useSearchParams(); const errorRef = useRef<HTMLParagraphElement>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState(""); const [status, setStatus] = useState(""); const [error, setError] = useState(searchParams.get("session") === "invalid" ? "That link has expired or is no longer valid. Please sign in or request a new one." : ""); const [busy, setBusy] = useState(false); const [verificationPending, setVerificationPending] = useState(false);
  const next = safeReturnPath(searchParams.get("next"));
  const fail = (message: string) => { setError(message); setStatus(""); requestAnimationFrame(() => errorRef.current?.focus()); };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return; setError(""); setStatus("");
    if (mode === "reset" && password !== confirmation) return fail("Your passwords need to match.");
    if (mode !== "forgot-password" && password.length < 8) return fail("Use a password with at least 8 characters.");
    setBusy(true); const supabase = createClient();
    if (mode === "sign-in") {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) fail("We couldn’t sign you in with those details. Please try again or reset your password."); else router.replace(next);
    } else if (mode === "sign-up") {
      const { error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl(`/auth/callback?next=${encodeURIComponent(next)}`) } });
      if (authError) fail("We couldn’t create your account just now. Please try again."); else { setVerificationPending(true); setStatus("Check your email to verify your account before signing in."); }
    } else if (mode === "forgot-password") {
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl("/auth/callback?next=/auth/reset") });
      setStatus("If an account can use that address, we’ve sent password-reset instructions.");
    } else {
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) fail("Your reset link is no longer valid. Request a new password-reset email."); else { setStatus("Your password has been updated. You can now sign in."); setTimeout(() => router.replace("/auth/sign-in"), 700); }
    }
    setBusy(false);
  };
  const resend = async () => { if (busy || !email) return fail("Enter your email address to resend verification."); setBusy(true); setError(""); const supabase = createClient(); await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: callbackUrl(`/auth/callback?next=${encodeURIComponent(next)}`) } }); setStatus("If verification is needed, we’ve sent another email."); setBusy(false); };
  const isReset = mode === "reset"; const title = mode === "sign-in" ? "Welcome back." : mode === "sign-up" ? "Start your AWN account." : mode === "forgot-password" ? "Reset your password." : "Choose a new password.";
  const intro = mode === "sign-in" ? "Sign in to your private AWN space." : mode === "sign-up" ? "A secure place for your financial plan, at your pace." : mode === "forgot-password" ? "We’ll send instructions if an account can use that address." : "Use a new password you haven’t used elsewhere.";
  return <main className="auth-page"><section className="auth-card"><Link className="app-wordmark auth-brand" href="/" aria-label="Return to AWN homepage"><span className="wordmark-mark" aria-hidden="true">a</span><span>awn</span></Link><p className="app-eyebrow">Your private AWN space</p><h1>{title}</h1><p className="auth-intro">{intro}</p>{error && <p className="form-message is-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}{status && <p className="form-message is-success" role="status">{status}</p>}<form className="auth-form" onSubmit={submit}>{!isReset && <label className="form-field">Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>}{mode !== "forgot-password" && <label className="form-field">{isReset ? "New password" : "Password"}<input type="password" autoComplete={isReset ? "new-password" : mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></label>}{isReset && <label className="form-field">Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={8} required /></label>}<button className="app-button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : mode === "forgot-password" ? "Send reset instructions" : "Save new password"}</button></form>{mode === "sign-up" && verificationPending && <button type="button" className="text-button" onClick={resend} disabled={busy}>Resend verification email</button>}{mode === "sign-in" && <p className="auth-links"><Link href="/auth/forgot-password">Forgot password?</Link><Link href="/auth/sign-up">Create an account</Link></p>}{mode === "sign-up" && <p className="auth-links"><Link href="/auth/sign-in">Already have an account? Sign in</Link></p>}{mode === "forgot-password" && <p className="auth-links"><Link href="/auth/sign-in">Back to sign in</Link></p>}</section></main>;
}

export function SignOutButton() {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  return <button type="button" className="sidebar-placeholder" disabled={busy} onClick={async () => { setBusy(true); await createClient().auth.signOut(); router.replace("/"); router.refresh(); }}>{busy ? "Signing out…" : "Sign out"}</button>;
}
