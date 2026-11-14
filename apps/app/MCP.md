# Padelaso MCP server (MAR-98, phase 1)

Padelaso exposes a remote [Model Context Protocol](https://modelcontextprotocol.io) server so
assistants such as ChatGPT and Claude can read a user's groups, players, match history and
stats. Users sign in with their Padelaso account through Supabase Auth's OAuth 2.1 server.
Phase 1 is **read-only** and limited to an allowlist of users.

| | |
| --- | --- |
| Endpoint | `POST /api/mcp` (Streamable HTTP, stateless; `GET`/`DELETE` answer per the SDK) |
| Protected resource metadata | `/.well-known/oauth-protected-resource/api/mcp` (also served at `/.well-known/oauth-protected-resource`) |
| Authorization server | Supabase Auth, issuer `<SUPABASE_URL>/auth/v1` |
| AS metadata | `<SUPABASE_URL>/.well-known/oauth-authorization-server/auth/v1` |
| Consent page | `/oauth/consent` |
| Code | `src/lib/mcp/` (config, auth, tools, handler), `src/app/oauth/consent/` |

Built with `mcp-handler` 2.3, `@modelcontextprotocol/server` 2.4 and Zod 4 on the Node.js
runtime. Every request builds a fresh MCP server, so there is no session store or affinity.

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing public project settings. The issuer is derived from the URL. |
| `MCP_RESOURCE_URL` | Canonical MCP URL, e.g. `https://app.padelaso.com/api/mcp`. Must be `https`, or `http` on localhost, and end in `/api/mcp`. Required in production (`VERCEL_ENV=production`): without it the endpoint and its metadata answer `500`. Elsewhere, if unset, the deployment's own origin is used, which suits previews and local development. |
| `MCP_ALLOWED_CLIENT_IDS` | Comma-separated OAuth client IDs allowed to call the server. Empty denies every client. |
| `MCP_ALLOWED_USER_IDS` | Comma-separated Supabase user IDs in the phase 1 beta. Empty denies every user. Remove with MAR-100. |

No service-role key is used anywhere in the MCP path.

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
4. Requires the client to be in `MCP_ALLOWED_CLIENT_IDS` and the user to be in
   `MCP_ALLOWED_USER_IDS`.

Steps 2 and 3 and the client check also run on the token's unverified payload before step 1.
Anyone can send a token, and for an unknown key or an HS256 token `getClaims` calls Supabase
Auth, so tokens that could never pass are refused without a network call. Only the verified
claims are trusted afterwards.

| Failure | Response |
| --- | --- |
| Missing, malformed, forged or expired token; wrong issuer, audience or role; no `client_id` | `401`, `WWW-Authenticate: Bearer error="invalid_token", resource_metadata="…"` |
| Client not allowlisted, or user not in the beta | `403`, `WWW-Authenticate: Bearer error="insufficient_scope", resource_metadata="…"` (not `401`: signing in again cannot fix it) |
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

Gaps to keep in mind:

- An OAuth access token is a full user token. A client holding it could call Supabase's REST
  API directly with the same RLS permissions as the user, including writes. The MCP server
  exposes no write tools, but the token isn't technically read-only. Supabase scopes
  (`openid email profile phone`) only control identity claims.
- Revoking a grant doesn't invalidate access tokens already issued; they expire within
  `jwt_expiry` (1 hour).

The consent page tells the user both: it describes the connection as offering queries only,
never as unable to write. It is also served with `frame-ancestors 'none'` and
`X-Frame-Options: DENY` (`next.config.ts`) so it can't be framed.

## Tools

All tools are annotated `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`,
`openWorldHint: false`, and declare an `outputSchema`. Results return `structuredContent` and
the same JSON as text. Outputs contain display data only: no invite codes, account IDs,
creators or internal fields.

| Tool | Input | Output |
| --- | --- | --- |
| `list_groups` | — | `groups: [{ id, name, emoji }]` |
| `list_players` | `group_id`, optional `name` (case- and accent-insensitive substring) | `group`, `players: [{ id, name, emoji, isYou }]` |
| `list_matches` | `group_id`, optional `player_id`, `limit` 1–50 (default 10), `offset` 0–10000 | `group`, `matches: [{ id, date, court, team1, team2, sets, winner }]`, `nextOffset` |
| `get_player_stats` | `group_id`, `player_id` | `group`, `player`, `matches`, `wins`, `losses`, `undecided`, `winRate`, `currentStreak`, `bestStreak`, `recentForm`, `ranking`, `partners` |

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

## Supabase OAuth server setup

**Local.** `supabase/config.toml` enables `[auth.oauth_server]` with
`authorization_url_path = "/oauth/consent"` and dynamic registration off. Restart the stack
(`supabase stop && supabase start`) after pulling. The consent page is then
`http://127.0.0.1:3000/oauth/consent`.

**Production** (dashboard; `supabase config push` is not assumed to cover it):

1. **Authentication → OAuth Server**: enable the server, set the authorization path to
   `/oauth/consent`, leave dynamic client registration **off**.
2. **Authentication → URL Configuration**: Site URL must be the product app origin (the consent
   URL is Site URL + path).
3. **JWT signing keys**: prefer an asymmetric key (ES256/RS256). HS256 works but makes every MCP
   request call Supabase Auth to validate the token, and the `openid` scope requires asymmetric
   keys.
4. **Authentication → OAuth Apps → Add client**: name `ChatGPT`, the redirect URI from the next
   section, confidential client (`client_secret_basic` or `client_secret_post`, matching ChatGPT's
   setting). Copy the client ID and secret.
5. In Vercel (product project): set `MCP_RESOURCE_URL`, `MCP_ALLOWED_CLIENT_IDS` (the client ID)
   and `MCP_ALLOWED_USER_IDS` (testers' user IDs), then redeploy.

**Registration decision: manual first, dynamic registration off.** Enable dynamic registration
only if ChatGPT can't complete the flow with a manually registered client. Record the failure
here if that happens. With dynamic registration on, `MCP_ALLOWED_CLIENT_IDS` would have to be
replaced (for example by a redirect-URI policy), since client IDs would no longer be known in
advance.

**RFC 9207 `iss`.** Supabase Auth's authorize handler returns only `code` and `state`; it
doesn't add `iss` to the authorization response. The OAuth integration test logs what the local
stack returns (`[MAR-98] authorization response iss parameter`). Without `iss`, register the
**connector-specific callback URL that ChatGPT shows** when you create the connector, not the
generic `https://chatgpt.com/connector_platform_oauth_redirect`.

## Connecting ChatGPT

1. In ChatGPT's connector settings, choose **Add custom MCP server** (developer mode may need to
   be enabled first).
2. URL: the `MCP_RESOURCE_URL` value. Authentication: **OAuth**.
3. Open **Advanced OAuth settings**. Copy the callback URL ChatGPT shows and register it on the
   Supabase client (setup step 4). Enter the client ID and secret.
4. Save and connect. ChatGPT discovers Supabase from the protected resource metadata, sends you
   to `/oauth/consent`, and through Google sign-in if needed (the `authorization_id` survives
   the round trip). Approve.
5. Try: "What groups am I in on Padelaso?", "Show my last five matches", "What are Pablo's
   stats?" Compare the numbers with the app's player page.

### Second client check

Repeat with Claude (custom connector) or the MCP Inspector
(`npx @modelcontextprotocol/inspector`). Register a separate Supabase OAuth client with that
client's callback, add its ID to `MCP_ALLOWED_CLIENT_IDS`, and connect. Nothing in the server is
ChatGPT-specific; CORS allows browser-based clients because authentication is bearer-only.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- `src/lib/mcp/handler.test.ts`: the HTTP boundary with real ES256 signatures against a stubbed
  JWKS and PostgREST. It covers every 401/403 case, query-string tokens, JWKS outages,
  initialize, the tool list and annotations, the caller-scoped client, tool outputs, stats parity
  with the domain package, cross-group requests, error redaction and metadata.
- `src/app/oauth/consent/consent.test.ts`: authorization ID parsing (Supabase IDs are
  32-character alphanumerics, not UUIDs), the login round trip, and server-side allowlist
  enforcement in the consent action.
- `packages/data/tests/reads.test.ts`: full-history paging under a `max_rows` cap and filter
  injection.
- `src/lib/mcp/oauth.integration.test.ts` (`pnpm test:integration`, needs `supabase start`;
  runs in CI): a real authorization-code + PKCE flow through the local OAuth server, then MCP
  calls with the issued token against real RLS.
- Manual, outstanding: production OAuth enablement, the ChatGPT connection and the second-client
  check above.

Rate limiting, connection management and opening access beyond the allowlist are MAR-100.
