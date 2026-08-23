import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/routing";
import { oauthCallbackFailureState, parseSocialAuthProvider, type SocialAuthProvider } from "@/lib/auth/social";
import { createClient } from "@/lib/supabase/server";

function authFailure(request: NextRequest, next: string, provider: SocialAuthProvider | null, state: "cancelled" | "failed" = "failed") {
  const signIn = new URL("/auth/sign-in", request.url);
  signIn.searchParams.set("next", next);
  if (provider) {
    signIn.searchParams.set("oauth", state);
    signIn.searchParams.set("provider", provider);
  } else {
    signIn.searchParams.set("session", "invalid");
  }
  return NextResponse.redirect(signIn);
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  const provider = parseSocialAuthProvider(request.nextUrl.searchParams.get("provider"));
  const oauthError = request.nextUrl.searchParams.get("error") ?? request.nextUrl.searchParams.get("error_code");
  if (oauthError) return authFailure(request, next, provider, oauthCallbackFailureState(oauthError));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return authFailure(request, next, provider);
  } else return authFailure(request, next, provider);
  const destination = new URL(next, request.url);
  const response = NextResponse.redirect(destination);
  if (destination.pathname === "/auth/reset") response.cookies.set("awn-recovery", "verified", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/auth/reset" });
  return response;
}
