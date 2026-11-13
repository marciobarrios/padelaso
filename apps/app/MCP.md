# Padelaso remote MCP (MAR-98)

The Node.js App Router endpoint is `GET/POST /api/mcp`. `mcp-handler` 2 and MCP SDK 2 create a fresh stateless server per request; there is no Redis or session affinity. Both current MCP and legacy Streamable HTTP use the same endpoint. No write tools, prompts, UI cards, directory, LLM calls, or connection-management UI are exposed.

## Configuration and trust boundary

Set these in the **product** Vercel project (and local environment):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: existing user-facing project configuration.
- `MCP_RESOURCE_URL`: canonical public URL, e.g. `https://app.padelaso.com/api/mcp`. HTTP is accepted only for localhost development. This pins metadata/challenges independently of proxy headers.
- `MCP_ALLOWED_CLIENT_IDS`: comma-separated registered OAuth client IDs.
- `MCP_ALLOWED_USER_IDS`: comma-separated user UUIDs during phase 1. Both allowlists deny access when empty.

`src/lib/mcp/auth.ts` is the replaceable authorization adapter. It verifies asymmetric JWT signatures against the project's cached JWKS, issuer, `exp`, `iat`, audience `authenticated`, authenticated role, subject, and OAuth `client_id`. Ordinary application sessions and service-role tokens are rejected. Only Authorization bearer headers are consumed; query tokens are never consumed. Use an asymmetric Supabase signing key (ES256 or RS256); HS256 is intentionally unsupported. Validation failure is 401, allowlist/group failure is 403, with RFC 9728 `WWW-Authenticate` metadata challenges. Responses are not cached.

`/.well-known/oauth-protected-resource` advertises the canonical MCP resource and Supabase issuer `<SUPABASE_URL>/auth/v1`. The AS metadata is at `<SUPABASE_URL>/.well-known/oauth-authorization-server/auth/v1`.

Every database call uses a fresh client with the validated user's token and the public anon key, reusing the native v1 client factory. Runtime reads never use the service role. Group calls additionally check `group_members` before SDK dispatch to return HTTP 403; RLS remains the database authority, including direct REST access. Database failures return generic errors, not SQL or tokens.

## OAuth setup and manual acceptance

Local `supabase/config.toml` enables `[auth.oauth_server]`, sets `authorization_url_path = "/oauth/consent"`, and leaves dynamic registration disabled. Restart the local stack after changing configuration.

Production setup remains a dashboard action for Marcio:

1. In the intended Supabase project's Authentication OAuth Server settings, enable the OAuth 2.1 server and set authorization path `/oauth/consent`. Confirm Site URL points at the product app and the existing Google login callback is allowed. Do not assume `supabase config push` applies OAuth server settings.
2. Confirm asymmetric signing and fetch AS discovery. Inspect `authorization_response_iss_parameter_supported` and an actual authorization response's `iss`. The upstream `authorize.go` inspected during implementation did not contain `iss`; this alone does not prove the deployed server's behavior. If the deployed response includes RFC 9207 `iss`, register `https://chatgpt.com/connector_platform_oauth_redirect`. Otherwise use the exact connector-specific callback shown by ChatGPT. Do not guess the callback.
3. Manually register a ChatGPT OAuth client with that exact callback; put its ID in `MCP_ALLOWED_CLIENT_IDS`, and the tester's user UUID in `MCP_ALLOWED_USER_IDS`. Keep the client secret in ChatGPT's Advanced OAuth settings, never in the repo or public variables. Use the registered client's supported token authentication method and PKCE.
4. In ChatGPT, choose **Add custom MCP server**, enter the canonical `/api/mcp` URL and OAuth, then enter the manual client ID/secret under Advanced OAuth. Complete Google sign-in, consent, and redirect. `authorization_id` survives the existing safe login return path. Exercise both Approve and Deny, expired requests, and a signed-out start.
5. Ask for groups, resolve a player name, list match history, and compare their stats with Padelaso. Try a group the user does not belong to (403), an ordinary session token (401), and a user outside the allowlist (403).
6. Connect a separately registered MCP Inspector or Claude OAuth client, temporarily add its ID to the allowlist, and repeat discovery and reads. No ChatGPT host or callback is hardcoded in the endpoint.
7. Only if manual ChatGPT registration fails, record the exact failure and decide whether to enable dynamic registration. This implementation has **not** enabled DCR. Supabase does not document CIMD support.

The manual registration decision is **manual first, DCR disabled**. Hosted enablement, registered IDs, deployed RFC 9207 behavior, ChatGPT and second-client acceptance remain unverified until the above steps are performed.

## Grant and audience decision

The consent page describes the single **read and record matches** grant, while making clear that this phase exposes queries only. Supabase OAuth scopes (`openid email profile phone`) control identity claims, not database privileges. The OAuth access token is a full user token usable directly against Supabase REST; MCP annotations and the read-only tool list do not restrict that token's database permissions. Existing RLS must hold independently. Revocation may leave already-issued tokens valid for up to one hour (configured JWT lifetime).

[Supabase token-security docs](https://supabase.com/docs/guides/auth/oauth-server/token-security) document custom access token hooks that change `aud` by OAuth `client_id`. We did **not** adopt one: resource-only audience acceptance by this project's PostgREST/RLS has not been verified, and retaining `authenticated` is necessary for the known user-client pattern. No RFC 8707 resource binding is claimed. The endpoint explicitly checks shared audience plus both allowlists and client ID. A custom audience or extra claim without AS-enforced resource selection would not by itself establish RFC 8707 binding. A future change must prove ordinary app/native sessions and OAuth REST/RLS access still work before adopting a hook. No database hook, migration, or RLS changes are included here.

## Read tools

All four have `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`. Results include compact JSON text and `structuredContent`, without invite codes, user IDs, creators, or debug fields.

| Tool | Input | Output |
| --- | --- | --- |
| `list_groups` | `{}` | `groups: [{id,name,emoji}]` |
| `list_players` | `group_id` UUID, optional `name` (max 100 chars) | `players: [{id,name,emoji}]`; case-insensitive literal substring |
| `list_matches` | `group_id` UUID, `limit` 1–100 (default 25), `offset` 0–10000 (default 0) | `matches`, `next_offset`; newest first |
| `get_player_stats` | `group_id`, `player_id` UUIDs | shared domain `stats`; player must belong to requested group |

Match reads page through PostgREST before computing domain stats, avoiding the default row-cap truncation. Stats retain the product's existing treatment of ties/unfinished matches. Concurrent changes during pagination do not have snapshot isolation. Rate limits, connection administration and broader hardening belong to MAR-100.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- HTTP boundary tests in `src/lib/mcp/handler.test.ts` use real ES256 signatures with an in-memory JWKS and mocked data, covering protocol initialization, four-tool discovery/annotations, shared stats, issuer/audience/expiry, tampering, ordinary sessions, allowlists, query-token rejection, and group challenges. This is not a hosted OAuth acceptance test.
- `pnpm test:integration` runs real database RLS/read-projection tests alongside existing routes. Requires Docker/Podman and `supabase start`; locally blocked because neither container runtime is installed. CI must run these.
- T3 preview navigation worked, but screenshot capture repeatedly failed with `Preview automation snapshot timed out after 15000ms`. Before/after screenshots and live authenticated consent acceptance are outstanding; do not treat the UI as visually verified.
