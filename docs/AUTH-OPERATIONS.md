# AWN social Auth operations

AWN uses Supabase Auth's browser PKCE flow and the existing AWN callback at `/auth/callback`. Google and Apple are authentication providers only; AWN does not request or store provider API tokens. Email/password Auth remains enabled.

## Shared project values

- Supabase project ref: `bxzcssgbcgvhsaihsple`
- Supabase Auth domain: `bxzcssgbcgvhsaihsple.supabase.co`
- Provider-side callback URI: `https://bxzcssgbcgvhsaihsple.supabase.co/auth/v1/callback`
- Local AWN callback: `http://localhost:3000/auth/callback`
- Hosted AWN callback: `https://<preview-domain>/auth/callback`

Add each exact hosted AWN callback to **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs** before enabling its Preview button. Prefer exact Preview or stable branch URLs over broad wildcards.

## Google

1. In Google Auth Platform, create a **Web application** OAuth client.
2. Add the AWN hosted origin as an authorized JavaScript origin.
3. Add `https://bxzcssgbcgvhsaihsple.supabase.co/auth/v1/callback` as the authorized redirect URI.
4. In **Supabase Dashboard → Authentication → Providers → Google**, enter the Client ID and Client Secret and enable Google.
5. Set `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true` for the matching Vercel Preview environment and redeploy.

Use only the basic identity scopes Supabase needs. Do not request Drive, Gmail, Calendar, or Contacts access.

## Apple

1. Use an Apple Developer Team with an App ID that has **Sign in with Apple** enabled.
2. Create a Services ID for web Auth and attach it to that App ID.
3. Configure the Services ID website domain as `bxzcssgbcgvhsaihsple.supabase.co` and its return URL as `https://bxzcssgbcgvhsaihsple.supabase.co/auth/v1/callback`.
4. Create a Sign in with Apple signing key and keep its `.p8` file in secure operational storage.
5. Generate the Apple client secret and configure **Supabase Dashboard → Authentication → Providers → Apple** with the Services ID as the web Client ID and the generated secret. If native IDs are also present, the Services ID must be first for the web OAuth flow.
6. Set `NEXT_PUBLIC_AUTH_APPLE_ENABLED=true` for the matching Vercel Preview environment and redeploy.

Apple OAuth does not reliably provide a full name, and AWN does not require one. Apple private-relay email addresses are valid Auth emails. Future Household membership must continue to bind to the authenticated Supabase user ID rather than assuming a visible email is permanent.

### Apple sign-in secret rotation

- Rotate the Apple web OAuth client secret before it expires and at least every 6 months.
- Keep the `.p8` signing key secure and available for rotation.
- Never commit or place the `.p8`, Apple client secret, or signing material in browser code.
- Revoke and replace the key immediately if it is lost or exposed.

## Security and identity

- Never commit Google/Apple client secrets, Apple `.p8` files, Supabase service-role keys, or provider tokens.
- Provider secrets belong only in Supabase Auth provider configuration.
- AWN relies on Supabase's verified-email identity-linking rules and never merges users by email in application code.
- The Supabase Auth user ID remains the application identity. The existing idempotent personal-Household resolver handles password and social users identically.
