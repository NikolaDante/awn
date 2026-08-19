# AWN

AWN is a personal and household finance tracker built with Next.js and Supabase authentication.

## Local Development

Create `.env.local` from `.env.example`, then run:

```bash
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

The development-only `/qa-seed` route is unavailable in production and Vercel Preview builds.

## Verification

```bash
git diff --check
pnpm run lint
pnpm exec tsc --noEmit
node --test tests/*.test.ts
pnpm build
```

## Preview Data

Supabase currently provides authentication only. Financial records are stored in the browser's `localStorage`, scoped by the authenticated Supabase user ID. They do not sync between browsers or devices and are lost if that browser storage is cleared.

See [docs/PREVIEW-DEPLOYMENT.md](docs/PREVIEW-DEPLOYMENT.md) for deployment configuration and current limitations. All frontend work must follow [docs/AWN-DESIGN-CONSTITUTION.md](docs/AWN-DESIGN-CONSTITUTION.md).
