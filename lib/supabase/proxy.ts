import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authenticatedUserId, isProtectedPath, safeReturnPath } from "@/lib/auth/routing";
import { getSupabaseEnvironment } from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = getSupabaseEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  if (isProtectedPath(request.nextUrl.pathname) && !authenticatedUserId(data)) {
    const redirect = new URL("/auth/sign-in", request.url);
    redirect.searchParams.set("next", safeReturnPath(`${request.nextUrl.pathname}${request.nextUrl.search}`, "/dashboard"));
    const redirectResponse = NextResponse.redirect(redirect);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) redirectResponse.headers.set(name, value);
    }
    return redirectResponse;
  }
  return response;
}
