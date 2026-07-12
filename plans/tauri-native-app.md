# Padelaso → Native App via Tauri v2 (revised 2026-07-12)

> Revision of the original June 2026 plan after a deep review: verified against the
> current codebase and against Tauri v2 / Supabase / Google OAuth docs as of July 2026.
> Major changes from v1 are marked **[CHANGED]**. Sources at the bottom.

## Context

Padelaso is a Spanish-language, mobile-first padel-match tracker: Next.js 16.2.2
(App Router) + Supabase, deployed on Vercel. Goal: ship it as a native app using
**Tauri v2**, keeping the Vercel web app running unchanged (the `/api/*` routes used
by Apple Shortcuts must stay live).

**Outcome (revised).** A native **desktop** app (macOS first; Windows/Linux come for
free) with deep-link OAuth, persistent local settings, native notifications, and a
signed auto-updater — plus a **separately-decided mobile track** (see "Mobile
decision" below). Same Supabase data, single codebase, conditional static export.

---

## Architecture decision: single codebase, conditional build target (unchanged)

`BUILD_TARGET=tauri` switches `next.config.ts` to `output: 'export'`. Web stays SSR
on Vercel. This survives review — and the codebase makes it cheap: every SWR hook in
`src/lib/supabase-hooks.ts` already fetches client-side from Supabase; server
rendering only supplies `fallbackData` hydration and auth redirects. The Tauri build
doesn't lose capabilities, only a warm cache.

## [CHANGED] Rollout strategy: desktop first, mobile is a separate decision

The original plan targeted all platforms at once. Research says Tauri mobile is the
weak link for a mobile-first app:

1. **No official remote push.** `@tauri-apps/plugin-notification` is local-only on
   mobile; APNs/FCM only via community plugins (core request tauri#11651 still open).
   No service workers in WKWebView → no Web Push either. "MVP-vote nudges" and
   "matchday reminders" need *remote* push to be useful — a local notification can't
   fire because a friend registered a match.
2. **App Store Guideline 4.2** (minimum functionality) rejects thin webview wrappers.
   Push + genuinely-used native capability are the standard mitigations — exactly
   what Tauri mobile lacks out of the box.
3. Safe-area insets are broken by default on Tauri iOS (see Phase 8), dynamic-route
   handling is manual, and the mobile plugin ecosystem is young.

**Phase A (this plan, high confidence): Tauri desktop.** All refactor work here is
reusable regardless of the mobile choice.

**Phase B (decide later): mobile.** Options in order of preference:
- **Capacitor for iOS/Android**, consuming the *same* static export. Mature official
  push plugin (APNs/FCM), first-party safe-area/keyboard handling, years of
  Supabase-on-iOS precedent. Tauri desktop + Capacitor mobile are both thin shells
  over the same `out/` directory.
- **Tauri iOS**, accepting local-only notifications at launch + community push plugin.
- **Defer mobile**: the web app already serves phones; iOS 16.4+ Web Push for
  installed PWAs is a stopgap.

---

## Current-state audit (2026-07-12) — what actually needs converting

Verified against the repo (this section replaces the original plan's stale claims):

| Area | Reality | Tauri strategy |
|---|---|---|
| `src/app/layout.tsx` | **Already pure client providers** — no `getServerAuth()` call (original plan was stale here). | No change needed. |
| List pages `/`, `/matches`, `/players`, `/stats` | Server Components calling `requireGroupContext()` (`src/lib/server-data.ts`) → `cookies()` + `redirect()` + SWR prefetch. | Tauri variants: client components rendering `<MobileShell>` + existing `*-page-content.tsx`, with client-side auth/onboarding redirect (AuthProvider + GroupProvider already support this; GroupProvider has a localStorage fallback for the active group). Loses SSR prefetch → brief loading state, nothing else. |
| Dynamic routes `matches/[matchId]`, `matches/[matchId]/scorekeeper`, `players/[playerId]`, `groups/[groupId]` | Thin async server wrappers → client `content.tsx`. No `generateStaticParams()`. Scorekeeper also awaits `searchParams` server-side. | **Query-param routes** in the Tauri build (see Phase 3.4). |
| Server Action `src/lib/server-actions.ts` (`revalidateGroupData`) | Used by `edit-match-dialog.tsx` and `matches/[matchId]/content.tsx`. Server Actions are unsupported in static export. | No-op under Tauri — it only flushes the RSC router cache, which doesn't exist in a static export. Semantically correct. |
| Supabase browser client `src/lib/supabase.ts` | `createBrowserClient` from `@supabase/ssr` → **session lives in cookies**, not localStorage (original plan was wrong here). | Tauri build constructs plain `supabase-js` `createClient` with `flowType: 'pkce'` and a **custom `storage` adapter backed by `tauri-plugin-store`** (see Phase 5.0). |
| API routes `api/state`, `api/score`, `api/events` + `auth/callback/route.ts` | Server-only; used by Apple Shortcuts / web OAuth. | Excluded from Tauri build via `pageExtensions` (see Phase 3.2). Stay untouched on Vercel. |
| Active-group cookie (`active-group-cookie.ts`) | Set via `document.cookie`, read server-side for SSR. | GroupProvider's localStorage fallback already covers Tauri. |
| Realtime re-subscribe on visibility | Already implemented in `scorekeeper/content.tsx` and `matches/[matchId]/content.tsx`. | Verify against Tauri iOS/macOS lifecycle events, not just browser `visibilitychange`. |

Next 16.2.2 static-export constraints (from `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`):
no `cookies()`, no Server Actions, no proxy, no dynamic routes without
`generateStaticParams()`, Route Handlers GET-only-and-static. `next dev` errors early
on these when `output: 'export'` is set — which is why dev/prod parity matters
(Phase 3.1).

---

## Phase 1 — Prerequisites & toolchain (unchanged)

- Rust via rustup; latest stable (os plugin needs ≥1.77.2).
- Xcode CLT (`xcode-select --install`).
- Apple Developer account ($99/yr) for signing/notarization — start enrollment early.
- Defer iOS targets/Cocoapods until the mobile decision lands on Tauri iOS.

## Phase 2 — Add Tauri to the repo (unchanged)

```bash
pnpm add -D @tauri-apps/cli@latest
pnpm tauri init
```

Frontend dir `../out`, devUrl `http://localhost:3000`. Add `src-tauri/target/` and
`src-tauri/gen/` to `.gitignore`.

## Phase 3 — Conditional static export

### 3.1 `next.config.ts` [CHANGED: dev parity + assetPrefix detail]

```ts
const isTauri = process.env.BUILD_TARGET === 'tauri';
const isProd = process.env.NODE_ENV === 'production';
const internalHost = process.env.TAURI_DEV_HOST || 'localhost';

const nextConfig: NextConfig = {
  ...(isTauri && {
    output: 'export',
    images: { unoptimized: true },
    // Dev only — points the webview at the Next dev server (needed for mobile dev).
    assetPrefix: isProd ? undefined : `http://${internalHost}:3000`,
    pageExtensions: ['tsx', 'ts'],          // excludes *.web.tsx / *.web.ts routes
  }),
  ...(!isTauri && {
    pageExtensions: ['web.tsx', 'web.ts', 'tsx', 'ts'],
  }),
  // ...existing config (reactCompiler, htmlLimitedBots, images.remotePatterns)
};
```

`trailingSlash` is not required by the Tauri guide; add only if asset paths misbehave.

**Dev parity:** `beforeDevCommand` must be `BUILD_TARGET=tauri pnpm dev` — otherwise
`tauri dev` runs the SSR app (cookies/Server Components silently work) and production
builds break. With the env var set, `next dev` errors early on export-incompatible
code, which is exactly what we want.

### 3.2 Excluding server-only routes [CHANGED: pageExtensions instead of file-moving script]

Rename web-only route files so they only match the web build's `pageExtensions`:

- `src/app/api/state/route.ts` → `route.web.ts` (same for `score`, `events`)
- `src/app/auth/callback/route.ts` → `route.web.ts`
- The four list pages get **two variants**: `page.web.tsx` (current server component)
  and `page.tsx` (new client version). Same pattern for the dynamic-route wrappers
  if their Tauri variants differ.

No filesystem mutation at build time; a crashed build can't leave the tree rearranged.
Verify after both builds that the right variant won (Phase 11).

### 3.3 Server Action

`revalidateGroupData` gets a runtime guard (or a `.web.ts` twin + no-op default):
under Tauri it does nothing. Callers don't change.

### 3.4 Dynamic routes [CHANGED: query-param routes, not "client-side routing only"]

The original idea (skip `generateStaticParams`, rely on client navigation) fails
twice: Next 16 errors at build, and Tauri's asset protocol has **no SPA fallback** —
`/matches/abc123` 404s in production builds while working in `tauri dev`
(tauri#7502). Do this instead:

- Tauri build gets static pages `matches/detail/page.tsx`, `players/detail/page.tsx`,
  `groups/settings/page.tsx`, `matches/scorekeeper/page.tsx` — client components
  reading `useSearchParams()` (`?id=...`, scorekeeper also `?pinned=1`) and rendering
  the existing `content.tsx` components unchanged.
- A `navigateToMatch(id)` / `matchHref(id)` helper in `src/lib/tauri-runtime.ts`
  abstracts the URL shape per build target so shared components never hardcode paths.
- The scorekeeper's server-side `await searchParams` must move client-side in the
  Tauri variant (it makes the route dynamic → breaks export).

## Phase 4 — `tauri.conf.json` (mostly unchanged)

As in v1 (420×900 window, `frontendDist: "../out"`), with:
- `beforeDevCommand`: `BUILD_TARGET=tauri pnpm dev` **[CHANGED]**
- `beforeBuildCommand`: `BUILD_TARGET=tauri pnpm build`
- `app.windows[0].backgroundColor` set to the dark theme color (no white flash).
- CSP: keep `connect-src https://*.supabase.co wss://*.supabase.co`; drop
  `accounts.google.com` from `connect-src` (OAuth happens in the system browser, not
  the webview) but keep `lh3.googleusercontent.com` in `img-src`.

## Phase 5 — Auth [CHANGED: this whole phase was redesigned]

### 5.0 Session storage adapter (prerequisite)

`src/lib/supabase.ts` currently uses `@supabase/ssr`'s `createBrowserClient` →
session in **cookies**. Webview cookies are not reliably persistent across restarts,
and WKWebView storage can be purged under storage pressure. Under Tauri:

```ts
// src/lib/tauri-runtime.ts — used by getBrowserClient() when isTauri
import { LazyStore } from '@tauri-apps/plugin-store';
const store = new LazyStore('auth.json');

export const tauriAuthStorage = {
  getItem: (k: string) => store.get<string>(k).then(v => v ?? null),
  setItem: (k: string, v: string) => store.set(k, v).then(() => store.save()),
  removeItem: (k: string) => store.delete(k).then(() => store.save()),
};

createClient(url, anonKey, {
  auth: { flowType: 'pkce', storage: tauriAuthStorage, detectSessionInUrl: false },
});
```

This also persists the **PKCE code verifier**, which must survive the round-trip
through the system browser. (Upgrade path: Stronghold/Keychain if tokens should live
outside the webview entirely.)

### 5.1 OAuth flow — the corrected design

**Google Cloud Console rejects custom-scheme redirect URIs for "Web application"
clients — and with Supabase it's irrelevant anyway.** Google only ever redirects to
`https://<project>.supabase.co/auth/v1/callback`. The app-side redirect is validated
against **Supabase's Redirect URLs allowlist**, which accepts custom schemes.
(Reminder from prior debugging: Supabase allowlist entries need `**` wildcards to
survive query strings.)

Flow (proven pattern — Ebb app writeup, JeaneC/tauri-oauth-supabase):

1. `signInWithOAuth({ provider: 'google', options: { skipBrowserRedirect: true, redirectTo } })`
   with the PKCE client from 5.0; open the returned URL in the **system browser**
   via the opener plugin.
2. `redirectTo` = an https **middleman page hosted on the existing Vercel app**, e.g.
   `https://padelaso.com/auth/native` (a `page.web.tsx`, allowlisted in Supabase).
   It forwards `code` to `padelaso://auth/callback?code=...` and shows an
   "Abrir Padelaso" fallback button. (Direct-to-scheme redirect works but leaves a
   hung browser tab and is flakier.)
3. At app boot, `onOpenUrl` (deep-link plugin) extracts `code` →
   `supabase.auth.exchangeCodeForSession(code)` → existing `AuthProvider`'s
   `onAuthStateChange` picks up the session (including the realtime `setAuth` re-key
   it already does).

### 5.2 Deep-link registration

```json
{
  "plugins": {
    "deep-link": {
      "desktop": { "schemes": ["padelaso"] },
      "mobile": [
        { "scheme": ["https"], "host": "padelaso.com", "pathPrefix": ["/auth"], "appLink": true },
        { "scheme": ["padelaso"], "appLink": false }
      ]
    }
  }
}
```

(Mobile block only matters if Phase B lands on Tauri iOS; current docs use the
`scheme`/`host`/`pathPrefix`/`appLink` shape. Universal Links additionally require
`.well-known/apple-app-site-association` + `assetlinks.json` served from the domain.)

**Testing caveat:** runtime `register()` works only on Linux/Windows. On macOS the
scheme comes from the bundled app's Info.plist — `padelaso://` will NOT respond in
`tauri dev`; end-to-end OAuth testing requires `pnpm tauri build` + installing the app.

### 5.3 Dashboard changes (no code)

- Supabase Auth → Redirect URLs: add `padelaso://auth/callback**` and
  `https://padelaso.com/auth/native**`.
- Google Cloud Console: **no change** (Supabase's callback is already registered).

## Phase 6 — Capabilities [CHANGED: opener plugin replaces shell]

`shell.open` is deprecated in favor of the **opener** plugin, and shell's `allow-open`
doesn't document URL scoping. Capability file:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "main-capability",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:event:default",
    {
      "identifier": "opener:allow-open-url",
      "allow": [
        { "url": "https://*.supabase.co/*" },
        { "url": "https://accounts.google.com/*" },
        { "url": "https://padelaso.com/*" }
      ]
    },
    "notification:default",
    "store:default",
    "os:default",
    "deep-link:default",
    "updater:default"
  ],
  "platforms": ["macOS", "windows", "linux"]
}
```

Still deliberately absent: `fs:*`, `shell:allow-execute`, `dialog:*`, `http:*`
(supabase-js uses plain `fetch`), `deep-link:allow-register` (useless on macOS),
`os:allow-hostname`.

## Phase 7 — Plugin integration (v1 content stands, two notes)

- **Notifications (desktop)**: check → request → send flow as in v1. Wire into
  realtime events while the window is unfocused. Remote push does not exist in Tauri;
  desktop notifications fire from the app's own live websocket, which is fine while
  the app runs.
- **Store**: `settings.json` for prefs (theme, last group) behind a
  `local-store` adapter branching on `window.__TAURI_INTERNALS__`; `auth.json`
  reserved for the auth adapter (5.0).
- **OS**: tag analytics with `platform: 'tauri-macos'` etc.
- **Updater**: desktop only, throttled check on focus.

## Phase 8 — Native UX polish

As v1 (backgroundColor, splash, user-select, titleBarStyle decision), plus
**[CHANGED]** if Phase B lands on Tauri iOS: `env(safe-area-inset-*)` resolves to 0
by default because WKWebView lays out inside the safe area — needs `viewport-fit=cover`
(already present) **plus** `contentInsetAdjustmentBehavior = .never` via the community
plugin `tauri-plugin-ios-webview-insets` (tauri#11475 still open).

## Phase 9 — Icons & distribution (unchanged for desktop)

`pnpm tauri icon` from a 1024px master; DMG signing/notarization via
`APPLE_CERTIFICATE`/`APPLE_API_*` env vars; App Store macOS build needs App Sandbox
entitlements. iOS section deferred to Phase B.

## Phase 10 — Auto-updater [CHANGED: two additions]

As v1 (generate signer key, guard it — losing it bricks the update channel;
`TAURI_SIGNING_PRIVATE_KEY` in CI), plus:
- `"bundle": { "createUpdaterArtifacts": true }` is required.
- Prefer **GitHub Releases + static `latest.json`** (generated by `tauri-action`)
  over a bespoke Vercel API route — endpoints support `{{target}}`/`{{current_version}}`
  template variables either way, and a static file is one less endpoint to maintain.

## Phase 11 — Verification [CHANGED: additions in bold]

After Phase 3:
- `BUILD_TARGET=tauri pnpm build` emits `out/`; plain `pnpm build` still SSRs.
- Serve `out/` with `npx serve` and walk login → group switch → match wizard →
  **match detail and scorekeeper via the query-param routes**.
- **Confirm the web build still exposes `/api/state|score|events` and
  `/auth/callback`, and the Tauri `out/` contains none of them** (pageExtensions
  check in both directions).
- **Edit a match, navigate back and forth — confirms the server-action no-op is safe.**

After Phase 5:
- **Use a bundled build** (not `tauri dev`) on macOS: Google sign-in → system browser
  → middleman page → app foregrounds with a session.
- **Kill the app, relaunch — still signed in** (validates the storage adapter).
- Sign out → sign in again from fresh state.

After Phase 6: denied-command probe (`fs` read of /etc/passwd) and unscoped
`opener.openUrl('javascript:alert(1)')` must both reject.

After Phase 7: store persists last group across restarts; notification fires from a
realtime event while unfocused.

After Phases 9–10: signed DMG installs clean on a second Mac; 0.1.0 → 0.2.0 update
round-trip works.

---

## Critical files

Created: `src-tauri/*` (conf, capabilities, icons, Rust entry),
`src/lib/tauri-runtime.ts` (runtime detection, auth storage adapter, opener/notify/
store wrappers, `matchHref`-style nav helpers), Tauri page variants
(`page.tsx` next to `page.web.tsx` for the four list pages; `*/detail/page.tsx`
query-param routes), `src/app/auth/native/page.web.tsx` (OAuth middleman).

Modified: `next.config.ts` (conditional export + pageExtensions), `package.json`
(scripts + deps), `src/lib/supabase.ts` (client factory branches on Tauri),
`src/components/auth/auth-provider.tsx` (redirectTo + system-browser branch),
`src/lib/server-actions.ts` callers untouched (guard inside), `.gitignore`.

Renamed to `.web.ts(x)`: `api/state|score|events/route.ts`,
`auth/callback/route.ts`, the four list `page.tsx` files (originals become
`page.web.tsx`).

Untouched: everything the Vercel build serves today keeps serving.

## Risks & open questions (updated)

1. **Mobile track undecided** — see "Rollout strategy". Don't start Tauri iOS work
   before deciding push-notification strategy; it may flip the choice to Capacitor.
2. **Apple Developer enrollment lead time** — start early.
3. **macOS deep-link testing requires bundled builds** — budget iteration time.
4. **Realtime sockets under Tauri lifecycle** — existing visibilitychange logic may
   need Tauri window-event equivalents on macOS (occlusion) and mobile (resume).
5. **First Rust compile / CI** — cache `~/.cargo` + `src-tauri/target/`.

## Sources

- Tauri Next.js guide: https://v2.tauri.app/start/frontend/nextjs/ (verified against Next 14.2.3 only)
- Static export constraints for this exact Next version: `node_modules/next/dist/docs/01-app/02-guides/static-exports.md`
- Dynamic routes 404 after build: https://github.com/tauri-apps/tauri/issues/7502
- Deep linking: https://v2.tauri.app/plugin/deep-linking/ (register() Linux/Windows only)
- Supabase redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Tauri 2 + Supabase Google OAuth pattern: https://medium.com/@nathancovey/supabase-google-oauth-in-a-tauri-2-0-macos-app-with-deep-links-f8876375cb0a · https://github.com/JeaneC/tauri-oauth-supabase
- Opener plugin (replaces shell.open): https://v2.tauri.app/plugin/opener/
- Updater: https://v2.tauri.app/plugin/updater/
- Mobile push feature request (open): https://github.com/tauri-apps/tauri/issues/11651
- iOS safe-area issue (open): https://github.com/tauri-apps/tauri/issues/11475 · fix: https://engineering.mobalab.net/2026/05/13/tauri-2-on-ios-a-simple-fix-for-wkwebview-safe-area-inset-issues/
- WKWebView storage/App Store 4.2 notes: https://takazudomodular.com/pj/zudo-tauri/docs/mobile/wkwebview-gotchas/ · https://takazudomodular.com/pj/zudo-tauri/docs/mobile/app-store-review-4-2/
- Tauri vs Capacitor (2026): https://trysaasbattle.com/tauri-vs-capacitor/
