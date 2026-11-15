# Autopilot

Project settings for the global `autopilot` skill. These override its defaults.
Everything in `AGENTS.md` still applies (Next.js docs, Linear and PR rules).

## Basics

- Base branch: `main`. Merge method: `gh pr merge <n> --squash --delete-branch`.
- Linear team: MAR. Confirm the issue belongs to Padelaso before starting.
- Monorepo (pnpm 11 + Turbo): `apps/app` (Next.js web app), `apps/marketing`
  (Next.js, port 3001), `apps/mobile` (Expo dev client + watchOS target),
  `packages/domain`, `packages/data`, `supabase/` (migrations, pgTAP tests).
- Read `PRODUCT.md` before any UI work: mobile-first, playful, retro.

## Worktree setup

Copy from the main checkout into each new worktree (gitignored, never
commit): `.env.local`.

Mobile: reuse the installed `Padelaso Dev` dev client (scheme
`padelaso-dev`) for JS-only changes and run only Metro from the worktree
(`pnpm --filter @padelaso/mobile dev -- --port <free port>`). Rebuild with
`pnpm mobile:ios` only when the change touches `app.config.ts`, `plugins/`,
`modules/`, `targets/`, `eas.json`, or native dependencies. Watch changes
(`targets/`, Swift) always need a native build.

## Commands

CI runs `pnpm exec supabase start && pnpm check`. Run the same before opening
the PR (needs Docker for local Supabase):

```bash
pnpm exec supabase start
pnpm check          # lint, typecheck, build, test, test:db, test:integration
```

For a fast loop, scope with Turbo/pnpm filters, e.g.
`pnpm --filter @padelaso/domain test`, `pnpm --filter @padelaso/app test`.
Without Supabase env vars, `build` needs the CI placeholders:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 \
NEXT_PUBLIC_SUPABASE_ANON_KEY=local-test-anon-key \
SUPABASE_SERVICE_ROLE_KEY=local-test-service-role-key \
pnpm build
```

- Web dev server: `pnpm dev` (app on `http://localhost:3000`),
  `pnpm dev:marketing` (`http://localhost:3001`).
- iOS: `pnpm mobile:ios` builds the dev client, `pnpm dev:mobile` starts Metro.
  Scheme `padelaso-dev`, bundle ID `com.padelaso.mobile.dev`.
- Watch: `pnpm --filter @padelaso/mobile watch:test` (Swift).
- Never point local runs at the hosted Supabase project. Use the local stack.

## Verification

- Domain logic (scoring, stats, rankings) lives in `packages/domain`: unit
  test in Vitest first, failing on base.
- Data access / RPCs: integration test (`pnpm test:integration`) against local
  Supabase.
- SQL migrations, RLS, functions: pgTAP test in `supabase/tests`
  (`pnpm test:db`), including a test that a non-member **cannot** read or write.
- Mobile UI: run on the iOS Simulator. In T3 Code, use the device tools and
  release the device with `device_close` (and stop Metro) when done.
- Web UI: run the app and check a phone-sized viewport first, then desktop.

## Evidence

- Mobile UI: Simulator screenshots before/after (iPhone size); recording for
  match-recording or scoring interactions.
- Web UI: before/after screenshots, mobile viewport first.
- Scoring, match lifecycle, auth/session or MCP flows: Mermaid diagram
  (`sequenceDiagram` for client ↔ Supabase calls, `stateDiagram-v2` for match
  state), before and after.
- Migrations: the migration's effect in a short table (tables/policies/
  functions added or changed) and the pgTAP output.

## Vercel Preview

- Depth: `read-only`. Previews talk to a hosted Supabase project, so never
  sign in with a real account, submit forms, create matches, or trigger any
  write. Load the touched pages (web app and marketing) and check rendering,
  console and network errors only.
- Interactions and data flows are verified locally against the local
  Supabase stack (see Verification), not on the Preview.
- The mobile app has no Preview; this step covers `apps/app` and
  `apps/marketing` only.

## Production monitoring

- Vercel projects: `padelaso` (web app) and `padelaso-marketing`
  (https://padelaso.com). Get the app's production domain from the Vercel
  project (`list_project_domains`) rather than guessing it.
- After a merge: deployment Ready for each project the PR touched, smoke
  the touched pages, Vercel runtime errors for 15 minutes, plus Supabase
  MCP `query_logs` (API, auth, Postgres) and `get_advisors` (security) for
  the production project.
- Logged-in check (production app: https://app.padelaso.com):
  - Session: the owner's account, limited to the **Test** group
    (`c17cb001-331b-4af7-a5ce-cc096ba7fafe`). The saved state holds only
    `app.padelaso.com` cookies and storage, no Google login.
  - Load it with
    `agent-browser --session autopilot-padelaso --state ~/.autopilot/auth/padelaso.json open https://app.padelaso.com/`.
  - Before every page, confirm the header shows the **Test** group. If
    any other group appears, stop, take no screenshots, and report it.
    Never use the group switcher.
  - Read-only: open the home, matches, players and stats pages. Never
    record a match, edit a group or player, or change settings.
  - **Re-save after every check**, before closing the session:
    `agent-browser --session autopilot-padelaso state save ~/.autopilot/auth/padelaso.json`
    then `chmod 600` it. Supabase rotates the refresh token on renewal;
    reusing an old one can revoke the session.
  - Logged out (login page shown): skip the check, say so, and ask the
    owner to refresh the session. Never type credentials or start a
    Google sign-in: Google blocks automated browsers.
  - All players and matches in the Test group are fake, so its
    screenshots may be used as PR evidence. Crop to the app; never show
    other groups, emails, or tokens.
- Refreshing the session (owner, by hand): open
  `open -na "Google Chrome" --args --user-data-dir="$HOME/.autopilot/auth/padelaso-chrome" https://app.padelaso.com/login`,
  sign in, pick the Test group, quit Chrome. Then ask an agent to export
  it: relaunch that profile with `--remote-debugging-port=9333`,
  `agent-browser --cdp 9333 state save` to a temporary file, keep only
  `app.padelaso.com` cookies/storage (plus the active group cookie) in
  `~/.autopilot/auth/padelaso.json`, delete the temporary file, quit Chrome.

## Merge rules

Auto-merge allowed at **low** risk when all checks are green. Never auto-merge
when the PR touches:

- `supabase/migrations/` (production data, hard to roll back),
- RLS policies, `security definer` functions, grants, or public RPCs,
- auth or sessions (`apps/mobile/AUTH.md` area, Google sign-in, OAuth
  consent, MCP scopes or tools that write data),
- `eas.json`, signing, app identifiers, or the watch target,
- env var handling or anything that could expose a service role key,
- CI (`.github/workflows/`).

## Don't

- Commit `.env*`, Supabase keys, or captures.
- Show real player names or emails in screenshots; use seed/test data.
- Use a hosted backend for tests or evidence.
