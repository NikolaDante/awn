export const publicPaths = ["/", "/auth/sign-in", "/auth/sign-up", "/auth/forgot-password", "/auth/callback", "/auth/reset"] as const;
const localOrigin = "http://awn.local";
const controlCharacters = /[\u0000-\u001f\u007f]/;

export function isPublicPath(pathname: string) { return publicPaths.includes(pathname as (typeof publicPaths)[number]); }
export function isProtectedPath(pathname: string) { return !isPublicPath(pathname) && !pathname.startsWith("/_next") && !pathname.startsWith("/favicon"); }
export function safeReturnPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  let decoded = value;
  for (let pass = 0; pass < 3; pass += 1) {
    if (decoded.startsWith("//") || decoded.includes("\\") || controlCharacters.test(decoded)) return fallback;
    try {
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    } catch { return fallback; }
  }
  try {
    const target = new URL(value, localOrigin);
    if (target.origin !== localOrigin || target.pathname.startsWith("//")) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return fallback; }
}
export function authenticatedUserId(claims: { claims?: { sub?: unknown } } | null | undefined) {
  const subject = claims?.claims?.sub;
  return typeof subject === "string" && subject.length > 0 ? subject : null;
}
