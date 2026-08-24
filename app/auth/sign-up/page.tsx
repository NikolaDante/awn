import { AuthForm } from "@/components/auth-forms";
import { AuthenticatedAuthPageRedirect } from "@/components/auth-page-redirect";
import { optionalAuthenticatedUserId } from "@/lib/auth/server-user";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const ownerId = await optionalAuthenticatedUserId();
  const { next } = await searchParams;
  return ownerId ? <AuthenticatedAuthPageRedirect ownerId={ownerId} next={next} /> : <AuthForm mode="sign-up" />;
}
