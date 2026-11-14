import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/mcp/route";

/**
 * MAR-98 end to end on the local stack: a real OAuth 2.1 authorization-code
 * flow with PKCE through Supabase's OAuth server, then MCP calls with the
 * issued token, authorized by the real database policies.
 */

const ORIGIN = "https://padelaso.test";
const REDIRECT_URI = "http://127.0.0.1:8976/oauth/callback";
const PASSWORD = "integration-test-password";
const run = randomUUID().slice(0, 8);
const API = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;

let admin: SupabaseClient;
let clientId: string;
let memberId: string;
let memberSessionJwt: string;
let oauthToken: string;
let callback: URL;
let groupId: string;
let otherGroupId: string;
let ana: string;
const createdUsers: string[] = [];

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

function sessionClient() {
  return createClient(API(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
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
async function authorize(user: { client: SupabaseClient }) {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(`${API()}/auth/v1/oauth/authorize`);
  url.search = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: REDIRECT_URI, scope: "email",
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
  expect(details).toMatchObject({ authorization_id: authorizationId, client: { id: clientId } });
  const approved = must(await user.client.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true }));
  return { redirect: new URL(approved.redirect_url), verifier };
}

async function exchange(code: string, verifier: string) {
  const response = await fetch(`${API()}/auth/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI,
      client_id: clientId, code_verifier: verifier,
    }),
  });
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

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, oauthToken);
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
  const client = must(await admin.auth.admin.oauth.createClient({
    client_name: `MCP integration ${run}`,
    redirect_uris: [REDIRECT_URI],
    token_endpoint_auth_method: "none",
  }));
  clientId = client.client_id;

  const member = await createUser("member");
  const stranger = await createUser("stranger");
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
  must(await admin.from("matches").insert([
    { group_id: groupId, created_by: member.id, date: "2026-10-01T19:00:00Z", team1: [ana, id("Pablo")], team2: [id("Lucía"), id("Marta")], sets: [{ team1Score: 6, team2Score: 3 }, { team1Score: 6, team2Score: 4 }] },
    { group_id: groupId, created_by: member.id, date: "2026-10-08T19:00:00Z", team1: [ana, id("Lucía")], team2: [id("Pablo"), id("Marta")], sets: [{ team1Score: 2, team2Score: 6 }, { team1Score: 3, team2Score: 6 }] },
  ]));

  const flow = await authorize(member);
  callback = flow.redirect;
  oauthToken = (await exchange(callback.searchParams.get("code")!, flow.verifier)).access_token;

  vi.stubEnv("MCP_RESOURCE_URL", `${ORIGIN}/api/mcp`);
  vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", clientId);
  vi.stubEnv("MCP_ALLOWED_USER_IDS", member.id);
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
  if (clientId) await admin.auth.admin.oauth.deleteClient(clientId);
});

describe("MCP over Supabase OAuth on the real stack", () => {
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

  it("rejects the same user's ordinary app session with 401", async () => {
    const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, memberSessionJwt);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("rejects users outside the beta with 403", async () => {
    vi.stubEnv("MCP_ALLOWED_USER_IDS", "");
    try {
      const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, oauthToken);
      expect(response.status).toBe(403);
      expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    } finally {
      vi.stubEnv("MCP_ALLOWED_USER_IDS", memberId);
    }
  });
});
