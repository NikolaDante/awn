import { NextResponse, type NextRequest } from "next/server";
import { safeReturnPath } from "@/lib/auth/routing";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeReturnPath(request.nextUrl.searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const signIn = new URL("/auth/sign-in", request.url);
      signIn.searchParams.set("session", "invalid");
      signIn.searchParams.set("next", next);
      return NextResponse.redirect(signIn);
    }
  } else {
    const signIn = new URL("/auth/sign-in", request.url);
    signIn.searchParams.set("session", "invalid");
    signIn.searchParams.set("next", next);
    return NextResponse.redirect(signIn);
  }
  const destination = new URL(next, request.url);
  const response = NextResponse.redirect(destination);
  if (destination.pathname === "/auth/reset") response.cookies.set("awn-recovery", "verified", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/auth/reset" });
  return response;
}
