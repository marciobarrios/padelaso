# Padelaso

Padelaso is a playful match tracker for groups of friends who play padel. This
repository is a pnpm/Turborepo monorepo containing the public marketing site,
the authenticated product, and framework-neutral game logic that can later be
used by mobile clients.

## Workspace

```text
apps/
├── app/                    # Next.js product → app.padelaso.com
└── marketing/              # Next.js landing page → padelaso.com
packages/
├── domain/                 # Types, events, scoring and statistics
├── eslint-config/          # Shared Next.js ESLint configuration
└── typescript-config/      # Shared TypeScript configuration
supabase/
└── migrations/             # Shared database schema history
```

The product uses **Next.js 16**, **React 19**, **TypeScript**, **Supabase**,
**Tailwind CSS 4**, and **shadcn/ui**. Both web applications deploy independently
on Vercel while Turborepo coordinates local and CI tasks.

## Getting started

### Prerequisites

- Node.js 20 or newer
- pnpm 11.20.0 (pinned in the root `package.json`)
- A Supabase project for the authenticated application

Install all workspaces:

```bash
pnpm install
```

Create `apps/app/.env.local` with the product credentials:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

`SUPABASE_SERVICE_ROLE_KEY` is required only for server routes that explicitly
use the administrative client. Never expose it with a `NEXT_PUBLIC_` prefix.

## Development

```bash
pnpm dev                 # Product at http://localhost:3000
pnpm dev:marketing       # Marketing at http://localhost:3001
pnpm dev:all             # Both applications
pnpm lint                # Lint every relevant workspace
pnpm typecheck           # Type-check the dependency graph
pnpm build               # Build every workspace
pnpm check               # Lint, type-check, and build
```

Run a single workspace directly when needed:

```bash
pnpm --filter @padelaso/app build
pnpm --filter @padelaso/marketing dev
pnpm --filter @padelaso/domain typecheck
```

The included Superset setup links the developer's existing root `.env.local`
into `apps/app/.env.local` and then installs the workspace.

## Shared domain package

`@padelaso/domain` is deliberately independent of React, Next.js, and Supabase.
Use its explicit subpath exports:

```ts
import type { Match, Player } from "@padelaso/domain/types";
import { EVENT_CONFIGS } from "@padelaso/domain/events";
import { getSetWins } from "@padelaso/domain/matches";
import { calculatePlayerStats } from "@padelaso/domain/stats";
```

Browser utilities, database mapping, authentication, and UI components remain
inside `apps/app`. A future mobile app should be added as `apps/mobile` and can
consume the domain package without inheriting web-only code.

## Deployment

Create two Vercel projects from this repository:

| Project | Root directory | Domain | Environment |
| --- | --- | --- | --- |
| Marketing | `apps/marketing` | `padelaso.com` | No Supabase secrets |
| Product | `apps/app` | `app.padelaso.com` | Supabase variables |

The product's `apps/app/vercel.json` keeps its server functions in Frankfurt
(`fra1`). The marketing project redirects legacy product pages to the app
subdomain and proxies `/api/*` so existing Apple Shortcuts remain compatible.

Before moving the domains, add
`https://app.padelaso.com/auth/callback` to Supabase Auth's redirect allowlist.
Deploy and verify both projects as previews before changing production DNS.

## Product features

- Groups with invite codes and admin/member roles
- Match creation, scoring, editing, and sharing
- Memorable in-match events and MVP voting
- Player, pair, rivalry, streak, and event statistics
- Google OAuth through Supabase Auth
- Token-protected APIs used by Apple Shortcuts
- Mobile-first dark interface in Spanish

All group data is protected by Supabase Row-Level Security policies. Database
changes belong in `supabase/migrations`; local environment files and secrets
must remain untracked.
