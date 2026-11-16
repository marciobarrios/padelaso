# Padelaso MCP server (MAR-98, MAR-99)

Padelaso exposes a remote [Model Context Protocol](https://modelcontextprotocol.io) server so
assistants such as ChatGPT and Claude can read a user's groups, players, match history and
stats, and record new matches. Users sign in with their Padelaso account through Supabase
Auth's OAuth 2.1 server. Access is open to all signed-in, non-anonymous users through admitted OAuth clients (manual allowlist or opt-in ChatGPT self-service). Phase 1 (MAR-98) added the
read tools; phase 2 (MAR-99) adds `create_match`. No tool edits or deletes data.

| | |
| --- | --- |
| Endpoint | `POST /api/mcp` (Streamable HTTP, stateless; `GET`/`DELETE` answer per the SDK) |
| Protected resource metadata | `/.well-known/oauth-protected-resource/api/mcp` (also served at `/.well-known/oauth-protected-resource`) |
| Authorization server | Supabase Auth, issuer `<SUPABASE_URL>/auth/v1` |
| AS metadata | `<SUPABASE_URL>/.well-known/oauth-authorization-server/auth/v1` |
| Consent page | `/oauth/consent` |
| Code | `src/lib/mcp/` (config, auth, tools, handler), `src/app/oauth/consent/` |
| Write path | `public.create_match` (`supabase/migrations/20261114234718_create_match.sql`) |

Built with `mcp-handler` 2.3, `@modelcontextprotocol/server` 2.4 and Zod 4 on the Node.js
runtime. Every request builds a fresh MCP server, so there is no session store or affinity.

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing public project settings. The issuer is derived from the URL. |
| `MCP_RESOURCE_URL` | Canonical MCP URL, e.g. `https://app.padelaso.com/api/mcp`. Must be `https`, or `http` on localhost, and end in `/api/mcp`. Required in production (`VERCEL_ENV=production`): without it the endpoint and its metadata answer `500`. Elsewhere, if unset, the deployment's own origin is used, which suits previews and local development. |
| `MCP_ALLOWED_CLIENT_IDS` | Comma-separated manually approved OAuth client IDs. Retain existing IDs during rollout and rollback. |
| `MCP_SELF_SERVICE_ENABLED` | Exact value `true` additionally admits Supabase DCR clients whose registered callbacks all match the ChatGPT policy below. Unset/other values keep manual-only admission. |
| `SUPABASE_SERVICE_ROLE_KEY` | Existing server-only key, additionally used to read OAuth client registration metadata when checking self-service admission. Never forwarded to tools or browsers. |
| `MCP_RATE_LIMIT_PER_CLIENT` | Requests per minute for one user through one OAuth client. Default `60`. See [Rate limits](#rate-limits). |
| `MCP_RATE_LIMIT_PER_USER` | Requests per minute for one user across all their clients. Default `120`. |

Tool data access always uses the caller's token and RLS. The admin client is used only for the
self-service registration lookup, after bearer signature verification (and in server-side consent).

## Authorization

`withMcpAuth` reads the bearer token from the `Authorization` header only; tokens in the query
string are ignored. `verifyMcpAccessToken` (`src/lib/mcp/auth.ts`) then:

1. Verifies the signature and expiry with `supabase.auth.getClaims`. With asymmetric signing
   keys (recommended) this checks the JWKS locally with a per-process cache; with the legacy
   HS256 secret it asks Supabase Auth to validate the token.
2. Requires `iss` to equal the project's issuer, `aud` to include `authenticated`,
   `role = authenticated`, a UUID `sub`, and a non-anonymous user.
3. Requires a `client_id` claim. Supabase adds it only to tokens issued by its OAuth server,
   so ordinary web and native sessions are rejected.
4. Requires the client to pass the shared admission policy below. No user allowlist is required.

Steps 2 and 3 also run on the token's unverified payload before step 1. When self-service is
disabled, the manual client allowlist is checked there too.
Anyone can send a token, and for an unknown key or an HS256 token `getClaims` calls Supabase
Auth, so tokens that could never pass are refused without a network call. Only the verified
claims are trusted afterwards.

| Failure | Response |
| --- | --- |
| Missing, malformed, forged or expired token; wrong issuer, audience or role; no `client_id` | `401`, `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…"` |
| Client not allowlisted | `403`, `WWW-Authenticate: Bearer error="insufficient_scope", resource_metadata="…"` (not `401`: signing in again cannot fix it) |
| Supabase Auth or JWKS unreachable | `500 server_error` (not `401`, so clients keep the token and retry) |

Tools run with a per-request Supabase client built from the verified token and the anon key
(`createUserSupabaseClient`, shared with the native API). **RLS is the data authority**: a
group the user doesn't belong to is invisible, and the tools report it as "Group not found"
whether it exists or not.

**Cross-group requests are tool errors, not HTTP 403.** The token is valid and the request is
well-formed; only one argument points at data the user can't see. MCP clients treat a 403
`insufficient_scope` as a request to re-authorize with more scopes, which can't help here and
would push users into a sign-in loop. A tool error tells the model what went wrong. HTTP 401
and 403 are reserved for token and account problems.

### Audience binding (investigated, not adopted)

Supabase's authorize endpoint accepts and validates an RFC 8707 `resource` parameter, and the
token endpoint checks it matches, but the issued access token's `aud` is always
`authenticated`. Nothing in the token says it was minted for this MCP server.

A [custom access token hook](https://supabase.com/docs/guides/auth/oauth-server/token-security)
could set `aud` to the MCP resource for our client IDs. It isn't adopted because the same token
must keep working against PostgREST with RLS, and we haven't verified that PostgREST, Realtime
and Storage accept a non-`authenticated` audience. Instead, the server requires an allowlisted
`client_id`. Tokens issued to other OAuth clients of the project are rejected, and Supabase
binds refresh tokens to the client that obtained them.

### Direct database access (MAR-144)

An OAuth access token is an ordinary `authenticated` user JWT plus `client_id`, so a client
holding it can call Supabase's APIs directly, not only `/api/mcp`. Supabase scopes
(`openid email profile phone`) only control identity claims. The database therefore limits
these tokens to what the tools need
(`supabase/migrations/20261115150000_lock_down_oauth_client_tokens.sql`):

- **Restrictive RLS policies** on every `public` table: no inserts, updates or deletes, and no
  reads beyond `groups`, `players` and `matches`. They apply to the Data API, GraphQL and
  Realtime alike. Security definer functions bypass RLS, so `create_match` keeps working.
- **A Data API pre-request guard** (`mcp_private.check_request`, set as
  `pgrst.db_pre_request` on `authenticator`): OAuth tokens may only `GET`/`HEAD` `/groups`,
  `/players` and `/matches`, `POST /rpc/create_match` and `POST /rpc/hit_mcp_rate_limit` (the
  rate limit counter). Anything else is a `403` with code
  `OAUTH_CLIENT_FORBIDDEN`. This covers the other RPCs, which RLS can't, and GraphQL.

Tokens without `client_id` (web and native sessions) pass both layers unchanged. A new tool
that reads another table or calls another RPC must be added to both layers, and a new
`public` table needs its own restrictive policies: `supabase/tests/oauth_client_lockdown_test.sql`
fails until it has them.

Gaps to keep in mind:

- Revoking a grant doesn't invalidate access tokens already issued; they expire within
  `jwt_expiry` (1 hour).

The consent page states the single v1 permission, "leer y registrar partidos": it lists what the connection's tools do (read data,
record matches after confirmation) and what they don't (edit or delete), never claiming the
grant itself is limited. It is also served with `frame-ancestors 'none'` and
`X-Frame-Options: DENY` (`next.config.ts`) so it can't be framed.

## Rate limits

`/api/mcp` limits every authenticated request (MAR-145), with two budgets per one-minute window:

| Budget | Key | Default | Setting |
| --- | --- | --- | --- |
| Per client | user + OAuth `client_id` | 60 requests | `MCP_RATE_LIMIT_PER_CLIENT` |
| Per user | user, all clients together | 120 requests | `MCP_RATE_LIMIT_PER_USER` |

So two users never share a budget, and a user's second client (say Claude next to ChatGPT) has its
own per-client budget but counts toward the same user total. Every MCP request counts:
`initialize`, `tools/list` and each tool call.

How it works (`src/lib/mcp/rate-limit.ts`): after the token is verified and before the request
reaches the MCP server, the route calls `public.hit_mcp_rate_limit()` with the caller's own token
(`supabase/migrations/20261116010000_mcp_rate_limits.sql`). The function adds one to the user's
and the user + client counters for the current minute in `mcp_private.rate_limit_windows`,
deletes the user's older windows, and returns both counts and the seconds left in the minute. The
app compares the counts with the limits. Counters live in Postgres because serverless instances
share no memory; Vercel Firewall rate limits key on IP or headers, not on verified token claims.

Over either limit the response is `429` with `Retry-After: <seconds until the next minute>` and a
JSON-RPC error body; no tool runs:

```json
{ "jsonrpc": "2.0", "id": null, "error": { "code": -32029, "message": "Rate limit exceeded. Try again in 42 seconds.", "data": { "retryAfter": 42 } } }
```

- Windows are fixed minutes, so a burst across a minute boundary can reach twice a limit.
- Unauthenticated and refused requests (401/403) never reach the counter.
- If the counter can't be reached the request runs (fails open, reported to Sentry): the tools
  need the same database and report its outage themselves.
- A caller who calls the RPC directly with their token (the Data API guard allows it) only spends
  their own budget. Counters are deleted with the user.

**Changing the limits.** Set `MCP_RATE_LIMIT_PER_CLIENT` and/or `MCP_RATE_LIMIT_PER_USER` (positive
integers, requests per minute) in the Vercel project and redeploy. A missing or invalid value uses
the default. The window length is fixed in the SQL function; changing it needs a migration.

## Tools

Read tools are annotated `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`,
`openWorldHint: false`. `create_match` is `readOnlyHint: false`, `destructiveHint: false`,
`idempotentHint: false`, `openWorldHint: false`. Every tool declares an `outputSchema`.
Results return `structuredContent` and the same JSON as text. Outputs contain display data
only: no invite codes, account IDs, creators or internal fields.

| Tool | Input | Output |
| --- | --- | --- |
| `list_groups` | — | `groups: [{ id, name, emoji }]` |
| `list_players` | `group_id`, optional `name` (case- and accent-insensitive substring) | `group`, `players: [{ id, name, emoji, isYou }]` |
| `list_matches` | `group_id`, optional `player_id`, `limit` 1–50 (default 10), `offset` 0–10000 | `group`, `matches: [{ id, date, court, team1, team2, sets, winner }]`, `nextOffset` |
| `get_player_stats` | `group_id`, `player_id` | `group`, `player`, `matches`, `wins`, `losses`, `undecided`, `winRate`, `currentStreak`, `bestStreak`, `recentForm`, `ranking`, `partners` |
| `create_match` | `group_id`, `team1` and `team2` (two player IDs each), `sets` (1–5 of `{ team1, team2 }` games), optional `played_at`, `court`, `events`, `idempotency_key` | `status`, `message`, `group`, `match` (as in `list_matches`), `events`, `url` |

- `isYou` marks the player linked to the signed-in user, so "my stats" works without exposing
  user IDs.
- Teams list `{ id, name }` per player; `name` is `null` for deleted players. `winner` is `null`
  for ties and unfinished matches.
- Stats reuse `@padelaso/domain/stats` (`calculatePlayerStats`, `getRecentForm`,
  `getPartnerStats`, `getRankedPlayerStats`) over the group's full history, so they match the
  app's player page and all-time stats ranking.
- Match reads live in `@padelaso/data/queries`. Paging and the player filter run in the
  database. Full-history reads page until PostgREST's exact count is reached, so the API's
  `max_rows` cap can't truncate stats.

## Recording matches

`create_match` takes IDs, never names. The model resolves names with `list_players`. The tool
descriptions and server instructions tell it to show candidates and ask the user when a name
matches several players or none, and to restate the group, teams, set scores and date before
calling. Confirmation itself is the client's: ChatGPT and Claude ask the user before running a
tool that isn't read-only. There is no custom two-step flow.

The tool checks the request with `validateMatchDraft` (`@padelaso/domain/matches`) and the
group's players first, so errors are specific ("Set 2 has no score", "These IDs are not players
of …"). It then calls `public.create_match` through the caller's client, which checks
everything again and saves the match and its events in one transaction:

- **Authorization.** Security definer, like `native_apply_command`: it requires `auth.uid()`,
  membership of the group, and four distinct players of that group, and sets `created_by` to
  the caller. Only `authenticated` may execute it. A missing group and someone else's group
  both return `GROUP_NOT_FOUND`.
- **Rules.** Two teams of two different players; 1–5 sets; whole scores 0–99; no 0–0 sets;
  a date with a UTC offset, not in the future (5 minutes of skew) and at most a year ago,
  defaulting to now; court 1–99; up to 50 events, each for a match player. Event types must
  be current ones (`EVENT_CONFIGS`); the tool's schema enforces the vocabulary and the
  database only its format, as for native commands.
- **Duplicates.** Two layers, because a model may regenerate its own key between retries:
  1. `idempotency_key`, a UUID kept per user for 48 hours. The same key and request replays the
     saved match (`status: "replayed"`); the same key with a different request is refused. The
     tool accepts only UUIDs: ChatGPT once built a key from the player names, and its safety
     check then warned about "opaque or disguised user context" before running the call. (The
     database accepts any key of 8–128 `[A-Za-z0-9._:-]` characters.)
  2. Without a matching key, an identical match (same group, same teams in either order, same
     set scores) created in the last 15 minutes and played within 12 hours of the requested
     date is returned instead (`status: "duplicate"`). Calls for one group are serialized with
     an advisory lock, so concurrent retries can't both pass this check.
- **Atomicity.** The match, its events and the receipt are written in one transaction; any
  failure leaves nothing. Refused requests save no receipt, so a fixed request can reuse the
  key.

Created matches are ordinary rows: the web, mobile, native scoring state and stats see them
immediately. `url` is `<app origin>/matches/<id>`, derived from `MCP_RESOURCE_URL`.

| Error code | Meaning |
| --- | --- |
| `GROUP_NOT_FOUND` | Not a member, or no such group |
| `INVALID_TEAMS`, `PLAYER_NOT_IN_GROUP` | Wrong team shape, repeated player, or players outside the group (`playerIds` names them) |
| `INVALID_SETS`, `INVALID_DATE`, `INVALID_EVENTS`, `INVALID_REQUEST` | The request breaks a rule above |
| `IDEMPOTENCY_KEY_REUSED` | The key already saved a different match |
| `BUSY` | Another match for the group held the lock for 3 seconds; nothing was saved |

All of them reach the model as tool errors ending in "Nothing was saved."

## Registration decision and trust policy (MAR-154)

**Use native Supabase dynamic client registration (DCR, RFC 7591).** ChatGPT supports DCR when
CIMD is unavailable; Supabase's documented OAuth server exposes DCR but does not currently
advertise CIMD. We do not add an OAuth proxy or implement CIMD ourselves. The decision and
trust policy were recorded on MAR-154 before implementation. Sources checked 16 November 2026:
[Supabase setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started),
[OpenAI authentication](https://developers.openai.com/plugins/build/auth).

`src/lib/mcp/client-admission.ts` is shared by the consent page, consent action and MCP verifier:

- Existing `MCP_ALLOWED_CLIENT_IDS` entries keep working without a registry lookup.
- With `MCP_SELF_SERVICE_ENABLED=true`, other UUID client IDs are looked up using the project's
  server-only `auth.admin.oauth.getClient`. At the MCP boundary this happens **after** JWT
  signature/issuer/audience/role/expiry checks. No admission cache outlives registration changes.
- The record must match the ID, have `registration_type=dynamic`, and have at least one callback.
  **Every** registered URI must exactly match one of these serialized forms:
  `https://chatgpt.com/connector_platform_oauth_redirect` or
  `https://chatgpt.com/connector/oauth/{callback_id}` (nonempty ASCII letters, digits, `_` or `-`).
  No alternate host, port, credentials, query, fragment, encoding or extra path segment is accepted.
  Supabase still matches each authorization request's redirect URI exactly against registration.
- Manual clients outside the explicit allowlist, deleted clients, and untrusted callbacks fail
  closed. Registry outages return a generic server error at the MCP boundary; no tool runs.
- This trusts the **callback destination**, not a client-supplied name or verified publisher.
  An arbitrary registrant may copy ChatGPT's name and callbacks, but cannot receive a code at
  their own destination through this policy. User authentication/consent and PKCE remain required.
  DCR itself is public and may store rejected registrations; monitor Supabase Auth's registration
  abuse/rate limits. MCP limits still apply per user/client and across all a user's clients.
- Other MCP clients remain supported through the explicit manual allowlist. Extending automatic
  admission to another provider requires a separately reviewed callback policy.

Supabase retains authorization-code/PKCE validation, refresh rotation/replay rejection, consent
and grant revocation. Existing group RLS, Data API restrictions, tool authorization, audit and
request limits are unchanged. Resource-bound audience tokens are still not claimed: this uses
Supabase's `aud=authenticated` contract described above.

## Supabase OAuth server setup

**Local.** `supabase/config.toml` enables `[auth.oauth_server]` with
`authorization_url_path = "/oauth/consent"` and `allow_dynamic_registration = true` for integration
tests. Restart only your own stack after configuration changes. Local DCR alone does not open
admission: set `MCP_SELF_SERVICE_ENABLED=true` on your local app too. The local gateway serves
discovery at `<LOCAL_SUPABASE_URL>/auth/v1/.well-known/oauth-authorization-server`; unlike the
hosted gateway, it does not route the root `/.well-known/oauth-authorization-server/auth/v1` alias.

**Production rollout (owner, after code review and merge):**

1. Keep the existing OAuth clients and `MCP_ALLOWED_CLIENT_IDS` unchanged. Confirm the existing
   connection works before rollout. Do not distribute its confidential client secret.
2. Confirm **Authentication → OAuth Server** is enabled, authorization path `/oauth/consent`,
   and **Authentication → URL Configuration → Site URL** is `https://app.padelaso.com`.
   Prefer asymmetric JWT signing keys. Keep the existing one-hour access-token expiry.
3. Deploy this code with self-service disabled first; verify the existing connection still works.
   Ensure the product's server-only `SUPABASE_SERVICE_ROLE_KEY` is available for registry reads.
4. Enable dynamic registration in **Authentication → OAuth Server**. This is a hosted setting;
   editing `supabase/config.toml` alone does not change it. Fetch
   `<SUPABASE_URL>/.well-known/oauth-authorization-server/auth/v1` and confirm it now advertises
   `registration_endpoint`, authorization-code/refresh support and `S256`. Do not fabricate metadata.
5. Set `MCP_SELF_SERVICE_ENABLED=true` in the production Vercel app project and redeploy once.
   Keep `MCP_RESOURCE_URL=https://app.padelaso.com/api/mcp` and the existing manual IDs.
   New users/connections then need no admin client registration, secret handoff or redeploy.
6. Complete the authorized ChatGPT acceptance checklist below. Metadata and integration tests
   alone do not establish production success. Keep MAR-154 open until this passes; MAR-108's
   user-facing guide is blocked on the verified result.

**Rollback:** set `MCP_SELF_SERVICE_ENABLED=false` and redeploy. Existing manual IDs continue to
work; self-service-only clients are refused at consent and MCP admission, including already issued
bearers. Disable Supabase DCR to stop new registrations too (this alone does not revoke existing
clients/grants). Do not delete legacy clients or alter RLS. To end an individual connection, revoke
its grant in Padelaso Settings → Integraciones. Revocation blocks refresh; an issued access token
may remain usable until expiry, at most **one hour** with the documented production configuration.
Do not claim instant bearer revocation. Re-enable the flag to restore still-valid dynamic clients;
a revoked grant requires reconnecting. Automated tests cover manual admission during rollback.

## Connecting ChatGPT

As of 16 November 2026, OpenAI's
[connection requirements](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)
describe custom MCP support on ChatGPT web for Business and Enterprise/Edu, with account and
workspace policy restrictions. Business creation/publishing requires an admin/owner;
Enterprise/Edu can delegate creation via RBAC, while publishing remains admin/owner-only.
Confirm the actual account's available controls; do not promise access for every plan.

After production rollout, use **Add custom MCP server** in Plugins (or the legacy Apps → Create
surface when shown). Enter `https://app.padelaso.com/api/mcp`, choose OAuth/DCR, and leave manual
client ID/secret fields empty. ChatGPT discovers Supabase, registers its callback, and opens the
Padelaso sign-in and consent flow. Sign in with your own Padelaso account, review the destination
and permissions, then approve. Supabase may skip repeat consent for an already approved grant.
If DCR isn't offered or the callback differs, stop and investigate rather than sharing a secret.
Without RFC 9207 `iss`, ChatGPT uses its callback-ID-specific `/connector/oauth/{callback_id}`
path; the policy also supports the documented stable callback for eligible/older connections.

### Live acceptance checklist (required; outstanding)

Use an explicitly authorized account, **Test group only**. The routine saved browser state is
read-only; obtain separate authorization for connecting, refreshing and disconnecting.
Never expose credentials, bearer/refresh tokens, authorization codes, or user email in evidence.

1. On a supported ChatGPT account/workspace, add a previously unconfigured connection using only
   the MCP URL and OAuth/DCR. Confirm no admin provisioning, client secret or per-user deploy.
2. Sign in, review consent and approve. Query groups, confirm Test membership before any further
   calls, then query only Test players/matches. Do not query another group's data or record matches.
3. Reconnect and verify repeat consent behavior. Exercise renewal after access-token expiry,
   checking that reads still work without another sign-in; never capture the token exchange.
4. Disconnect/revoke the grant in Settings → Integraciones, confirm refresh/reconnect requires
   authorization again, and distinguish blocked refresh from residual bearer lifetime (≤1 hour).
5. Re-check an existing manually approved connection and record the actual plan/workspace,
   outcome, deployment SHA and residual lifetime. No secrets in the issue, PR or captures.

### Second client check

Other MCP clients can retain manually registered public/PKCE or confidential clients with their
own exact callbacks and matching token endpoint auth method (`none`, `client_secret_basic` or
`client_secret_post`). Add the ID to `MCP_ALLOWED_CLIENT_IDS` and redeploy once for that provider.
Use Claude or MCP Inspector for the separate compatibility check; no existing client is deleted.

### Troubleshooting

Problems seen during the first production connection (November 2026):

| Symptom | Cause | Fix |
| --- | --- | --- |
| ChatGPT: "Couldn't discover OAuth settings" | The protected resource metadata answers `500`. Runtime logs show `MCP_RESOURCE_URL must be set in production`. | Set `MCP_RESOURCE_URL` and redeploy. A variable added after the last deployment isn't applied yet. |
| Consent page: "Esta aplicación todavía no puede conectarse a Padelaso" | The client failed admission. | Check the rollout flag, DCR registration type and every registered callback; for manual clients compare `MCP_ALLOWED_CLIENT_IDS`. Redeploy after env edits. |
| ChatGPT shows an error right after approving | The token exchange fails. Supabase Auth logs show `invalid authentication method: client is registered for 'client_secret_basic' but 'client_secret_post' was used`. | Make the token endpoint auth method match in ChatGPT and on the Supabase client. |

| ChatGPT requests manual credentials / DCR is unavailable | Hosted DCR isn't enabled or discovery is stale. | Verify the real `registration_endpoint`, then recreate the connection so ChatGPT re-discovers it. |
| Consent/MCP fails with client verification unavailable | The server-only admin key or OAuth registry is unavailable. | Restore the key/service; never bypass admission. |

After any fix, start the connection again from the client. An authorization request that was
already shown on the consent page may have expired.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `src/lib/mcp/handler.test.ts`: the HTTP boundary with real ES256 signatures against a stubbed
  JWKS and PostgREST. It covers every 401/403 case, query-string tokens, JWKS outages,
  initialize, the tool list and annotations, the caller-scoped client, tool outputs, stats parity
  with the domain package, cross-group requests, error redaction and metadata. For
  `create_match`: the request sent as the caller, the saved summary and link, invalid input that
  never reaches the database, and how refusals, replays and duplicates are reported.
- `supabase/tests/create_match_test.sql` (`pnpm test:db`): privileges, authorization, every
  validation rule, replays, key reuse, the duplicate window, per-user keys, atomicity of match
  plus events, and two concurrent identical requests creating one match.
- `src/lib/mcp/handler.test.ts` (rate limiting): requests under the limit, `429` with
  `Retry-After` over it without running the tool, separate budgets for two users and for two
  clients of one user under the shared user total, the counter failing open, and invalid limits.
- `supabase/tests/mcp_rate_limits_test.sql` (`pnpm test:db`): privileges, ordinary sessions
  refused, counts per user + client and per user, cleanup of old windows and of deleted users.
- `supabase/tests/oauth_client_lockdown_test.sql` (`pnpm test:db`): OAuth tokens read only
  their own groups, players and matches, can't write any table or read the others, still
  record through `create_match`, and pass the pre-request guard only for the tools' requests.
  Ordinary sessions are unchanged, and every `public` table must be covered.
- `src/app/oauth/consent/consent.test.ts`: authorization ID parsing (Supabase IDs are
  32-character alphanumerics, not UUIDs), the login round trip, and shared server-side client admission
  enforcement in the consent action.
- `packages/data/tests/reads.test.ts`: full-history paging under a `max_rows` cap and filter
  injection.
- `src/lib/mcp/oauth.integration.test.ts` (`pnpm test:integration`, needs `supabase start`;
  runs in CI): native DCR discovery/registration, rollback admission, and a real authorization-code + PKCE flow through the local OAuth server, then MCP
  calls with the issued token against real RLS, including recording a match, its retries, and
  refused requests sent straight to `create_match`, and the same token refused (`403`) by the
  Data API for other tables, writes and RPCs.
- Manual, outstanding: the second-client check above, and recording a match from ChatGPT
  (step 6 above). The `create_match` migration is applied in production.

Connection management and hardening are tracked in MAR-100. MAR-149 opens user access; MAR-154 adds opt-in self-service client admission. The final installation guide belongs to MAR-108.


## Tool-call telemetry

After authentication, each `tools/call` dispatch emits one JSON console entry:
`event` (`mcp-tool-call`), verified `userId`, verified `clientId`, `tool`,
`outcome` (`ok`, `denied`, `error`), and `durationMs`. Unknown tool names are
recorded as `unknown`, since arbitrary names can contain user data. Expected
input/permission denials are not sent to Sentry. Unexpected executor or output
validation failures send a fixed exception tagged with tool and client; raw
errors, arguments, results, tokens and inherited request context are excluded.
Wire-schema denials are included. Authentication failures are handled before
this boundary and do not represent an executed tool call.
