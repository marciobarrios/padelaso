import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EVENT_CONFIGS } from "@padelaso/domain/events";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { canUseMcpClient } from "./client-admission";

/**
 * MAR-98 end to end on the local stack: a real OAuth 2.1 authorization-code
 * flow with PKCE through Supabase's OAuth server, then MCP calls with the
 * issued token, authorized by the real database policies.
 */

const ORIGIN = "https://padelaso.test";
const REDIRECT_URI = "https://chatgpt.com/connector/oauth/padelaso-integration";
const PASSWORD = "integration-test-password";
const run = randomUUID().slice(0, 8);
const API = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

let admin: SupabaseClient;
let clientId: string;
let memberId: string;
let member: Awaited<ReturnType<typeof createUser>>;
let stranger: Awaited<ReturnType<typeof createUser>>;
let memberSessionJwt: string;
let oauthToken: string;
let callback: URL;
let groupId: string;
let otherGroupId: string;
let ana: string;
let ids: Record<"Ana" | "Pablo" | "Lucía" | "Marta", string>;
const createdUsers: string[] = [];
const createdClients: string[] = [];
let registrationEndpoint: string;

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

function sessionClient() {
  return createClient(API(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The Data API as a client holding this bearer token would call it, bypassing /api/mcp. */
function dataClient(token: string) {
  return createClient(API(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function createUser(name: string) {
  const email = `mcp-${name}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const client = sessionClient();
  const session = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (session.error) throw session.error;
  return { id: data.user.id, client, jwt: session.data.session.access_token };
}

async function createGroup(name: string, userId: string) {
  const group = must(await admin.from("groups")
    .insert({ name, emoji: "P", invite_code: `${name.slice(0, 2)}${run}`.slice(0, 8), created_by: userId })
    .select("id").single()) as { id: string };
  must(await admin.from("group_members").insert({ group_id: group.id, user_id: userId, role: "admin" }));
  return group.id;
}

/** The browser half of the flow: authorize, sign in, consent, follow the redirect. */
async function authorize(user: { client: SupabaseClient }, deny = false, oauthClientId = clientId) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${API()}/auth/v1/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code", client_id: oauthClientId, redirect_uri: REDIRECT_URI, scope: "email",
    state: "state-123", code_challenge: challenge, code_challenge_method: "S256",
    resource: `${ORIGIN}/api/mcp`,
  }).toString();

  const start = await fetch(url, { redirect: "manual" });
  expect(start.status).toBe(302);
  const consent = new URL(start.headers.get("location")!);
  expect(consent.pathname).toBe("/oauth/consent");
  const authorizationId = consent.searchParams.get("authorization_id")!;
  // The consent page must accept the real format, which is not a UUID.
  expect(authorizationId).toMatch(/^[A-Za-z0-9]{32}$/);

  const details = must(await user.client.auth.oauth.getAuthorizationDetails(authorizationId));
  expect(details).toMatchObject({ authorization_id: authorizationId, client: { id: oauthClientId } });
  const approved = must(await user.client.auth.oauth[deny ? "denyAuthorization" : "approveAuthorization"](authorizationId, { skipBrowserRedirect: true }));
  return { redirect: new URL(approved.redirect_url), verifier };
}

async function tokenRequest(params: Record<string, string>, oauthClientId = clientId) {
  return fetch(`${API()}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: oauthClientId, ...params }),
  });
}

async function exchange(code: string, verifier: string, oauthClientId = clientId) {
  const response = await tokenRequest({
    grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: verifier,
  }, oauthClientId);
  expect(response.status).toBe(200);
  return (await response.json()) as { access_token: string; refresh_token: string };
}

async function rpc(body: unknown, token?: string) {
  return POST(new Request(`${ORIGIN}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }));
}

async function callTool(name: string, args: Record<string, unknown> = {}, token = oauthToken) {
  const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, token);
  expect(response.status).toBe(200);
  const text = await response.text();
  const json = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).at(-1)!
    : text;
  return JSON.parse(json).result;
}

beforeAll(async () => {
  admin = createClient(API(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Local gateway exposes GoTrue discovery under /auth/v1; the hosted
  // RFC 8414 root alias is not routed by the CLI stack.
  const discovery = await fetch(`${API()}/auth/v1/.well-known/oauth-authorization-server`);
  expect(discovery.status).toBe(200);
  const metadata = await discovery.json();
  registrationEndpoint = metadata.registration_endpoint;
  expect(typeof registrationEndpoint).toBe("string");
  // Only ever register on the disposable local stack, never a hosted endpoint.
  expect(new URL(registrationEndpoint).origin).toBe(new URL(API()).origin);
  const registered = await fetch(registrationEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: `MCP DCR ${run}`, redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: "none" }),
  });
  expect(registered.status).toBe(201);
  const client = await registered.json();
  clientId = client.client_id;
  createdClients.push(clientId);
  vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "true");
  vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "");
  expect(await canUseMcpClient(clientId)).toBe(true);

  member = await createUser("member");
  stranger = await createUser("stranger");
  memberId = member.id;
  memberSessionJwt = member.jwt;
  groupId = await createGroup(`MCP ${run}`, member.id);
  otherGroupId = await createGroup(`Other ${run}`, stranger.id);

  const players = must(await admin.from("players").insert([
    { name: "Ana", emoji: "A", group_id: groupId, user_id: member.id, created_by: member.id },
    { name: "Pablo", emoji: "P", group_id: groupId, created_by: member.id },
    { name: "Lucía", emoji: "L", group_id: groupId, created_by: member.id },
    { name: "Marta", emoji: "M", group_id: groupId, created_by: member.id },
  ]).select("id, name")) as { id: string; name: string }[];
  const id = (name: string) => players.find((p) => p.name === name)!.id;
  ana = id("Ana");
  ids = { Ana: ana, Pablo: id("Pablo"), "Lucía": id("Lucía"), Marta: id("Marta") };
  must(await admin.from("matches").insert([
    { group_id: groupId, created_by: member.id, date: "2026-10-01T19:00:00Z", team1: [ana, id("Pablo")], team2: [id("Lucía"), id("Marta")], sets: [{ team1Score: 6, team2Score: 3 }, { team1Score: 6, team2Score: 4 }] },
    { group_id: groupId, created_by: member.id, date: "2026-10-08T19:00:00Z", team1: [ana, id("Lucía")], team2: [id("Pablo"), id("Marta")], sets: [{ team1Score: 2, team2Score: 6 }, { team1Score: 3, team2Score: 6 }] },
  ]));

  const flow = await authorize(member);
  callback = flow.redirect;
  oauthToken = (await exchange(callback.searchParams.get("code")!, flow.verifier)).access_token;

  vi.stubEnv("MCP_RESOURCE_URL", `${ORIGIN}/api/mcp`);

});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (!admin) return;
  for (const id of [groupId, otherGroupId].filter(Boolean)) {
    await admin.from("matches").delete().eq("group_id", id);
    await admin.from("players").delete().eq("group_id", id);
    await admin.from("groups").delete().eq("id", id);
  }
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  for (const id of createdClients) await admin.auth.admin.oauth.deleteClient(id);
});

describe("MCP over Supabase OAuth on the real stack", () => {
  it("retains manual client admission and rollback without changing existing connections", async () => {
    const legacy = must(await admin.auth.admin.oauth.createClient({ client_name: `Legacy ${run}`, redirect_uris: [REDIRECT_URI], token_endpoint_auth_method: "none" }));
    createdClients.push(legacy.client_id);
    expect(await canUseMcpClient(legacy.client_id)).toBe(false);
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", legacy.client_id);
    vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "false");
    try {
      expect(await canUseMcpClient(legacy.client_id)).toBe(true);
      const user = await createUser("legacy");
      const flow = await authorize(user, false, legacy.client_id);
      const tokens = await exchange(flow.redirect.searchParams.get("code")!, flow.verifier, legacy.client_id);
      expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, tokens.access_token)).status).toBe(200);
      expect(await canUseMcpClient(clientId)).toBe(false);
    } finally {
      vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "true");
      vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "");
    }
  });

  it("refuses DCR clients with untrusted callbacks even when Supabase registers them", async () => {
    const response = await fetch(registrationEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "Not ChatGPT", redirect_uris: ["https://evil.test/callback"], token_endpoint_auth_method: "none" }),
    });
    expect(response.status).toBe(201);
    const client = await response.json();
    createdClients.push(client.client_id);
    expect(await canUseMcpClient(client.client_id)).toBe(false);
  });

  it.each(["javascript:alert(1)", "https://chatgpt.com/connector/oauth/test#fragment"])("rejects invalid registration redirects: %s", async (uri) => {
    const response = await fetch(registrationEndpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [uri], token_endpoint_auth_method: "none" }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects an authorization redirect that differs from the registered callback", async () => {
    const url = new URL(`${API()}/auth/v1/oauth/authorize`);
    url.search = new URLSearchParams({ response_type: "code", client_id: clientId,
      redirect_uri: "https://evil.test/callback", code_challenge: "a".repeat(43), code_challenge_method: "S256" }).toString();
    const response = await fetch(url, { redirect: "manual" });
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
  });

  it("connects two unrelated users independently and isolates their groups", async () => {
    const flow = await authorize(stranger);
    const token = (await exchange(flow.redirect.searchParams.get("code")!, flow.verifier)).access_token;
    for (const [bearer, own, other] of [[oauthToken, groupId, otherGroupId], [token, otherGroupId, groupId]]) {
      const result = await callTool("list_groups", {}, bearer);
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent.groups.map((g: { id: string }) => g.id)).toEqual([own]);
      const denied = await callTool("list_players", { group_id: other }, bearer);
      expect(denied.isError).toBe(true);
      expect(denied.content[0].text).toMatch(/Group not found/);
    }
  });

  it("rejects a genuinely issued access token after its expiry with 401", async () => {
    const claims = JSON.parse(Buffer.from(oauthToken.split(".")[1], "base64url").toString());
    // Advance only the application clock; keep the signed token intact and real I/O running.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((claims.exp + 1) * 1000);
    try {
      const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, oauthToken);
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a replayed authorization code", async () => {
    const user = await createUser("code-replay");
    const flow = await authorize(user);
    const code = flow.redirect.searchParams.get("code")!;
    await exchange(code, flow.verifier);
    const replay = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: flow.verifier });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("keeps OAuth refresh working after local web sign-out", async () => {
    const user = await createUser("local-signout");
    const flow = await authorize(user);
    const tokens = await exchange(flow.redirect.searchParams.get("code")!, flow.verifier);
    expect((await user.client.auth.signOut({ scope: "local" })).error).toBeNull();
    const response = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    expect(response.status).toBe(200);
    const refreshed = await response.json();
    expect(refreshed.access_token).toEqual(expect.any(String));
  });

  it("rejects refresh of tokens issued before the user revoked the grant", async () => {
    const user = await createUser("revoked");
    const flow = await authorize(user);
    const tokens = await exchange(flow.redirect.searchParams.get("code")!, flow.verifier);
    const grants = must(await user.client.auth.oauth.listGrants());
    expect(grants.some((grant) => grant.client.id === clientId)).toBe(true);
    const claims = JSON.parse(Buffer.from(tokens.access_token.split(".")[1], "base64url").toString());
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(3600);
    must(await user.client.auth.oauth.revokeGrant({ clientId }));
    expect(must(await user.client.auth.oauth.listGrants())).toEqual([]);
    const response = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    expect(response.status).toBe(400);
    expect((await response.json()).error_code).toMatch(/^(refresh_token_not_found|session_not_found)$/);
  });

  it("rejects a rotated refresh token replay outside the reuse interval", async () => {
    const user = await createUser("refresh-replay");
    const flow = await authorize(user);
    const tokens = await exchange(flow.redirect.searchParams.get("code")!, flow.verifier);
    const refresh = (token: string) => tokenRequest({ grant_type: "refresh_token", refresh_token: token });
    const first = await refresh(tokens.refresh_token);
    expect(first.status).toBe(200);
    const rotated = await first.json();
    expect(rotated.refresh_token).not.toBe(tokens.refresh_token);
    // Supabase tolerates immediate retries and reuse of the current token's parent.
    // Rotate again so the replayed token is a grandparent, then outwait the grace period.
    expect((await refresh(rotated.refresh_token)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 11_000));
    const replay = await refresh(tokens.refresh_token);
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error_code: "refresh_token_already_used" });
  });

  it("denied consent returns access_denied and never an authorization code", async () => {
    const user = await createUser("denied");
    const flow = await authorize(user, true);
    expect(`${flow.redirect.origin}${flow.redirect.pathname}`).toBe(REDIRECT_URI);
    expect(flow.redirect.searchParams.get("state")).toBe("state-123");
    expect(flow.redirect.searchParams.get("error")).toBe("access_denied");
    expect(flow.redirect.searchParams.has("code")).toBe(false);
    const grants = must(await user.client.auth.oauth.listGrants());
    expect(grants).toEqual([]);
  });

  it("returns to the registered callback with the code and state", () => {
    expect(`${callback.origin}${callback.pathname}`).toBe(REDIRECT_URI);
    expect(callback.searchParams.get("state")).toBe("state-123");
    // Documents RFC 9207 support for the ChatGPT callback decision (see MCP.md).
    console.info(`[MAR-98] authorization response iss parameter: ${callback.searchParams.get("iss") ?? "absent"}`);
  });

  it("issues a token bound to the OAuth client", () => {
    const claims = JSON.parse(Buffer.from(oauthToken.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ client_id: clientId, sub: memberId, role: "authenticated", iss: `${API()}/auth/v1` });
    console.info(`[MAR-98] OAuth token aud: ${JSON.stringify(claims.aud)}`);
  });

  it("lists only the caller's groups, as enforced by RLS", async () => {
    const result = await callTool("list_groups");
    const ids = result.structuredContent.groups.map((g: { id: string }) => g.id);
    expect(ids).toContain(groupId);
    expect(ids).not.toContain(otherGroupId);
  });

  it("resolves names, lists history and computes stats", async () => {
    const players = await callTool("list_players", { group_id: groupId, name: "lucia" });
    expect(players.structuredContent.players.map((p: { name: string }) => p.name)).toEqual(["Lucía"]);

    const history = await callTool("list_matches", { group_id: groupId });
    expect(history.structuredContent.matches.map((m: { winner: string }) => m.winner)).toEqual(["team2", "team1"]);

    const stats = await callTool("get_player_stats", { group_id: groupId, player_id: ana });
    expect(stats.structuredContent).toMatchObject({
      player: { name: "Ana", isYou: true }, matches: 2, wins: 1, losses: 1, recentForm: ["W", "L"],
    });
  });

  it("does not reveal other groups", async () => {
    const result = await callTool("list_players", { group_id: otherGroupId });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Group not found/);
  });

  it("records a match atomically, as the caller, without duplicating retries", async () => {
    const countMatches = async () => (await admin.from("matches").select("id", { count: "exact", head: true })
      .eq("group_id", groupId)).count;
    const before = await countMatches();
    const args = {
      group_id: groupId,
      team1: [ids.Ana, ids.Marta],
      team2: [ids.Pablo, ids["Lucía"]],
      sets: [{ team1: 6, team2: 3 }, { team1: 7, team2: 6 }],
      events: [{ player_id: ids.Marta, type: "salvada_top" }],
      idempotency_key: randomUUID(),
    };

    const created = await callTool("create_match", args);
    expect(created.isError).toBeFalsy();
    expect(created.structuredContent).toMatchObject({
      status: "created",
      match: { winner: "team1", team1: { players: [{ name: "Ana" }, { name: "Marta" }] } },
      events: [{ player: { name: "Marta" }, type: "salvada_top" }],
    });
    const matchId = created.structuredContent.match.id;
    expect(created.structuredContent.url).toBe(`${ORIGIN}/matches/${matchId}`);

    // Retries: the same key, then a key the model regenerated.
    expect((await callTool("create_match", args)).structuredContent).toMatchObject({ status: "replayed", match: { id: matchId } });
    expect((await callTool("create_match", { ...args, idempotency_key: randomUUID() })).structuredContent)
      .toMatchObject({ status: "duplicate", match: { id: matchId } });
    expect(await countMatches()).toBe(before! + 1);

    const row = must(await admin.from("matches").select("created_by, match_events(type, created_by)")
      .eq("id", matchId).single()) as { created_by: string; match_events: { type: string; created_by: string }[] };
    expect(row).toEqual({ created_by: memberId, match_events: [{ type: "salvada_top", created_by: memberId }] });

    // The new match is part of the normal history and stats right away.
    const history = await callTool("list_matches", { group_id: groupId, limit: 1 });
    expect(history.structuredContent.matches[0].id).toBe(matchId);
    const stats = await callTool("get_player_stats", { group_id: groupId, player_id: ana });
    expect(stats.structuredContent).toMatchObject({ matches: 3, wins: 2, losses: 1 });
  });

  it("never records invalid or unauthorized matches", async () => {
    const before = (await admin.from("matches").select("id", { count: "exact", head: true })
      .in("group_id", [groupId, otherGroupId])).count;
    const base = { team1: [ids.Ana, ids.Pablo], team2: [ids["Lucía"], ids.Marta], sets: [{ team1: 6, team2: 1 }] };

    const otherGroup = await callTool("create_match", { ...base, group_id: otherGroupId });
    expect(otherGroup.content[0].text).toMatch(/Group not found/);
    const badScore = await callTool("create_match", { ...base, group_id: groupId, sets: [{ team1: 0, team2: 0 }] });
    expect(badScore.content[0].text).toMatch(/no score/);

    // Straight to the database function with the same token, skipping the tool's checks.
    const direct = await dataClient(oauthToken)
      .rpc("create_match", { p_request: { groupId: otherGroupId, ...base, sets: [{ team1Score: 6, team2Score: 1 }] } });
    expect(direct.data).toMatchObject({ status: "rejected", code: "GROUP_NOT_FOUND" });

    expect((await admin.from("matches").select("id", { count: "exact", head: true })
      .in("group_id", [groupId, otherGroupId])).count).toBe(before);
  });

  it("shows a match's event IDs and version only to its group (MAR-157)", async () => {
    const created = await callTool("create_match", {
      group_id: groupId,
      team1: [ids.Ana, ids.Pablo],
      team2: [ids["Lucía"], ids.Marta],
      sets: [{ team1: 6, team2: 2 }],
      events: [{ player_id: ids.Ana, type: "ace" }, { player_id: ids.Marta, type: "salvada_top" }],
      idempotency_key: randomUUID(),
    });
    const matchId = created.structuredContent.match.id;
    const saved = must(await admin.from("match_events").select("id, player_id, type")
      .eq("match_id", matchId).order("sequence")) as { id: string; player_id: string; type: string }[];

    const detail = await callTool("get_match", { group_id: groupId, match_id: matchId });
    expect(detail.isError).toBeFalsy();
    expect(detail.structuredContent).toMatchObject({
      match: { id: matchId, sets: [{ team1: 6, team2: 2 }] },
      events: saved.map((e) => ({ id: e.id, player: { id: e.player_id }, type: e.type })),
      version: expect.any(Number),
      url: `${ORIGIN}/matches/${matchId}`,
    });

    // Any change to the match's events, from any writer, changes the version.
    must(await admin.from("match_events").delete().eq("id", saved[1].id));
    const after = await callTool("get_match", { group_id: groupId, match_id: matchId });
    expect(after.structuredContent.events.map((e: { id: string }) => e.id)).toEqual([saved[0].id]);
    expect(after.structuredContent.version).toBeGreaterThan(detail.structuredContent.version);

    const missing = await callTool("get_match", { group_id: groupId, match_id: randomUUID() });
    expect(missing.content[0].text).toMatch(/Match not found/);
    const otherGroup = await callTool("get_match", { group_id: otherGroupId, match_id: matchId });
    expect(otherGroup.content[0].text).toMatch(/Group not found/);

    // Straight to the database function: the wrong group, and a non-member, see nothing.
    const wrongGroup = await dataClient(oauthToken)
      .rpc("get_match_detail", { p_group_id: otherGroupId, p_match_id: matchId });
    expect(wrongGroup.data).toEqual({ status: "rejected", code: "MATCH_NOT_FOUND", message: "Match not found in this group." });
    const outsider = await dataClient(stranger.jwt)
      .rpc("get_match_detail", { p_group_id: groupId, p_match_id: matchId });
    expect(outsider.data).toEqual(wrongGroup.data);
  });

  it("adds events to an existing match exactly once, even when retried (MAR-158)", async () => {
    const created = await callTool("create_match", {
      group_id: groupId,
      team1: [ids.Ana, ids.Pablo],
      team2: [ids["Lucía"], ids.Marta],
      sets: [{ team1: 6, team2: 4 }],
      events: [{ player_id: ids.Ana, type: "ace" }],
      idempotency_key: randomUUID(),
    });
    const matchId = created.structuredContent.match.id;
    const savedEvents = async () => must(await admin.from("match_events").select("id, player_id, type, created_by")
      .eq("match_id", matchId).order("sequence")) as { id: string; player_id: string; type: string; created_by: string }[];

    // Every current event type, so the database's vocabulary can't drift from EVENT_CONFIGS.
    const players = [ids.Ana, ids.Pablo, ids["Lucía"], ids.Marta];
    const events = EVENT_CONFIGS.map((e, i) => ({ player_id: players[i % 4], type: e.type }));
    const key = randomUUID();
    const request = { group_id: groupId, match_id: matchId, events, idempotency_key: key };

    // Two identical calls at once, as a client retrying a timed-out request might.
    const [one, two] = await Promise.all([callTool("add_match_events", request), callTool("add_match_events", request)]);
    expect(one.isError || two.isError).toBeFalsy();
    expect([one.structuredContent.status, two.structuredContent.status].sort()).toEqual(["added", "replayed"]);

    const saved = await savedEvents();
    expect(saved).toHaveLength(1 + events.length);
    expect(saved.slice(1).map((e) => ({ player_id: e.player_id, type: e.type })))
      .toEqual(events.map((e) => ({ player_id: e.player_id, type: e.type })));
    expect(new Set(saved.map((e) => e.created_by))).toEqual(new Set([memberId]));
    expect(one.structuredContent).toMatchObject({
      match: { id: matchId },
      added: saved.slice(1).map((e) => ({ id: e.id, player: { id: e.player_id }, type: e.type })),
      events: saved.map((e) => ({ id: e.id })),
      url: `${ORIGIN}/matches/${matchId}`,
    });
    const detail = await callTool("get_match", { group_id: groupId, match_id: matchId });
    expect(detail.structuredContent.version).toBe(one.structuredContent.version);

    // A later retry replays; the same key for another request, and invalid requests, save nothing.
    const retry = await callTool("add_match_events", request);
    expect(retry.structuredContent).toMatchObject({ status: "replayed", added: one.structuredContent.added });
    const reused = await callTool("add_match_events", { ...request, events: [{ player_id: ids.Ana, type: "ace" }] });
    expect(reused.content[0].text).toMatch(/already used for a different request/);
    const outsider = await callTool("add_match_events", {
      ...request, idempotency_key: randomUUID(), events: [{ player_id: ids.Ana, type: "ace" }, { player_id: randomUUID(), type: "ace" }],
    });
    expect(outsider.content[0].text).toMatch(/four players.*Nothing was saved/);
    expect(await savedEvents()).toHaveLength(1 + events.length);

    // Straight to the database function: a non-member, and a retired type, are refused.
    const direct = { groupId, matchId, events: [{ playerId: ids.Ana, type: "ace" }], idempotencyKey: randomUUID() };
    const nonMember = await dataClient(stranger.jwt).rpc("add_match_events", { p_request: direct });
    expect(nonMember.data).toEqual({ status: "rejected", code: "MATCH_NOT_FOUND", message: "Match not found in this group." });
    const retired = await dataClient(oauthToken).rpc("add_match_events", {
      p_request: { ...direct, events: [{ playerId: ids.Ana, type: "vibora" }] },
    });
    expect(retired.data).toMatchObject({ status: "rejected", code: "INVALID_EVENTS" });
    expect(await savedEvents()).toHaveLength(1 + events.length);
  });

  it("removes exactly one event, refusing stale reads and replaying retries (MAR-159)", async () => {
    const created = await callTool("create_match", {
      group_id: groupId,
      team1: [ids.Ana, ids.Pablo],
      team2: [ids["Lucía"], ids.Marta],
      sets: [{ team1: 6, team2: 2 }],
      events: [{ player_id: ids.Ana, type: "ace" }, { player_id: ids.Ana, type: "ace" }, { player_id: ids.Pablo, type: "doble_falta" }],
      idempotency_key: randomUUID(),
    });
    const matchId = created.structuredContent.match.id;
    const savedIds = async () => (must(await admin.from("match_events").select("id")
      .eq("match_id", matchId).order("sequence")) as { id: string }[]).map((e) => e.id);
    const read = await callTool("get_match", { group_id: groupId, match_id: matchId });
    const [firstAce, secondAce, fault] = read.structuredContent.events.map((e: { id: string }) => e.id);
    const request = { group_id: groupId, match_id: matchId, event_id: firstAce, expected_version: read.structuredContent.version };

    // Another change after the read makes it stale: nothing is removed.
    await callTool("add_match_events", {
      group_id: groupId, match_id: matchId, events: [{ player_id: ids.Marta, type: "cinta" }], idempotency_key: randomUUID(),
    });
    const stale = await callTool("remove_match_event", request);
    expect(stale.content[0].text).toMatch(/changed since you read it.*Nothing was removed/);
    expect(await savedIds()).toHaveLength(4);

    // A fresh read removes exactly the targeted ace; two identical calls at once remove it once.
    const fresh = await callTool("get_match", { group_id: groupId, match_id: matchId });
    const current = { ...request, expected_version: fresh.structuredContent.version };
    const [one, two] = await Promise.all([callTool("remove_match_event", current), callTool("remove_match_event", current)]);
    expect(one.isError || two.isError).toBeFalsy();
    expect([one.structuredContent.status, two.structuredContent.status].sort()).toEqual(["already_removed", "removed"]);
    const remaining = await savedIds();
    expect(remaining).not.toContain(firstAce);
    expect(remaining.slice(0, 2)).toEqual([secondAce, fault]);
    expect(remaining).toHaveLength(3);
    expect(one.structuredContent).toMatchObject({
      removed: { id: firstAce, player: { id: ids.Ana }, type: "ace" },
      events: remaining.map((id) => ({ id })),
      url: `${ORIGIN}/matches/${matchId}`,
    });
    const after = await callTool("get_match", { group_id: groupId, match_id: matchId });
    expect(after.structuredContent.version).toBe(fresh.structuredContent.version + 1);

    // A later retry with the same request changes nothing.
    const retry = await callTool("remove_match_event", current);
    expect(retry.structuredContent).toMatchObject({ status: "already_removed", removed: { id: firstAce } });
    expect(await savedIds()).toEqual(remaining);
    expect((await callTool("get_match", { group_id: groupId, match_id: matchId })).structuredContent.version)
      .toBe(after.structuredContent.version);

    // Straight to the database function: a non-member and a missing event are refused.
    const direct = { groupId, matchId, eventId: secondAce, expectedVersion: after.structuredContent.version };
    const nonMember = await dataClient(stranger.jwt).rpc("remove_match_event", { p_request: direct });
    expect(nonMember.data).toEqual({ status: "rejected", code: "MATCH_NOT_FOUND", message: "Match not found in this group." });
    const missing = await dataClient(oauthToken).rpc("remove_match_event", { p_request: { ...direct, eventId: randomUUID() } });
    expect(missing.data).toMatchObject({ status: "rejected", code: "EVENT_NOT_FOUND" });
    expect(await savedIds()).toEqual(remaining);
  });

  describe("direct Data API access with the OAuth token (MAR-144)", () => {
    const forbidden = { code: "OAUTH_CLIENT_FORBIDDEN" };

    it("allows only the reads and the RPC the MCP tools use", async () => {
      const direct = dataClient(oauthToken);
      expect(must(await direct.from("groups").select("id"))).toEqual([{ id: groupId }]);
      expect(must(await direct.from("players").select("id").eq("group_id", groupId))).toHaveLength(4);
      const { count } = await direct.from("matches").select("id", { count: "exact", head: true }).eq("group_id", groupId);
      expect(count).toBeGreaterThan(0);
      // The rate limit counter (MAR-145), called before every MCP request.
      expect(must(await direct.rpc("hit_mcp_rate_limit"))).toMatchObject({
        client_requests: expect.any(Number), user_requests: expect.any(Number), retry_after: expect.any(Number),
      });
    });

    it("refuses other tables, writes and RPCs with 403", async () => {
      const direct = dataClient(oauthToken);
      const attempts = {
        "read group_members": await direct.from("group_members").select("*"),
        "read profiles": await direct.from("profiles").select("*"),
        "read match_events": await direct.from("match_events").select("*"),
        "insert a match": await direct.from("matches").insert({
          group_id: groupId, created_by: memberId, team1: [ids.Ana, ids.Pablo], team2: [ids["Lucía"], ids.Marta],
          sets: [{ team1Score: 6, team2Score: 0 }],
        }),
        "rename the group": await direct.from("groups").update({ name: "Hijacked" }).eq("id", groupId),
        "delete matches": await direct.from("matches").delete().eq("group_id", groupId),
        "call another RPC": await direct.rpc("join_group_by_code", { code: "NOPE0000" }),
      };
      for (const [attempt, result] of Object.entries(attempts)) {
        expect({ attempt, status: result.status, error: result.error }).toMatchObject({
          attempt, status: 403, error: forbidden,
        });
      }
      const group = must(await admin.from("groups").select("name").eq("id", groupId).single()) as { name: string };
      expect(group.name).toBe(`MCP ${run}`);
    });

    it("leaves the same user's ordinary app session unchanged", async () => {
      const session = dataClient(memberSessionJwt);
      expect(must(await session.from("group_members").select("user_id").eq("group_id", groupId)))
        .toEqual([{ user_id: memberId }]);
    });
  });

  it("answers 429 with Retry-After once the client's budget is spent (MAR-145)", async () => {
    vi.stubEnv("MCP_RATE_LIMIT_PER_CLIENT", "1");
    try {
      // Earlier tests already counted requests in this minute; a new minute
      // allows one more, so the third request is over the limit at the latest.
      let response: Response | undefined;
      for (let i = 0; i < 3 && response?.status !== 429; i++) {
        response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, oauthToken);
        await response.text();
      }
      expect(response!.status).toBe(429);
      expect(Number(response!.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    } finally {
      // Empty means the default limit.
      vi.stubEnv("MCP_RATE_LIMIT_PER_CLIENT", "");
    }
  });

  it("rejects the same user's ordinary app session with 401", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, memberSessionJwt);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });
});
