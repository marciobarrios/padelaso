// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const state = vi.hoisted(() => ({ member: true, keySet: undefined as unknown }));
vi.mock("jose", async (original) => {
  const actual = await original<typeof import("jose")>();
  return { ...actual, createRemoteJWKSet: () => state.keySet };
});
vi.mock("@/app/api/native/v1/_http", () => ({ createNativeClient: () => ({
  from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.member ? { group_id: "group" } : null, error: null }) }) }) }) }),
}) }));
vi.mock("@padelaso/data/queries", () => ({
  listMcpGroups: async () => [{ id: "group", name: "Friends", emoji: "🎾" }],
  listMcpPlayers: async () => [{ id: "00000000-0000-4000-8000-000000000001", name: "Ana", emoji: "🎾" }],
  listMcpMatches: async () => [{ id: "match", date: "2026-01-01", groupId: "group", team1: ["00000000-0000-4000-8000-000000000001", "b"], team2: ["c", "d"], sets: [{ team1Score: 6, team2Score: 2 }] }],
}));
import { handleMcp } from "./handler";
import { GET as metadata } from "@/app/.well-known/oauth-protected-resource/route";

let keys: Awaited<ReturnType<typeof generateKeyPair>>;
const user = "00000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  keys = await generateKeyPair("ES256");
  state.keySet = createLocalJWKSet({ keys: [{ ...await exportJWK(keys.publicKey), kid: "test" }] });
});
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("MCP_RESOURCE_URL", "https://app.padelaso.com/api/mcp");
  vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "client");
  vi.stubEnv("MCP_ALLOWED_USER_IDS", user);
  state.member = true;
});
async function token(claims: Record<string, unknown> = {}, issuer = "https://test.supabase.co/auth/v1", audience = "authenticated", expiry = "1h") {
  return new SignJWT({ role: "authenticated", client_id: "client", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "test" }).setSubject(user)
    .setIssuer(issuer).setAudience(audience)
    .setIssuedAt().setExpirationTime(expiry).sign(keys.privateKey);
}
async function call(body: unknown, bearer?: string, query = "") {
  return handleMcp(new Request(`https://app.padelaso.com/api/mcp${query}`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  }));
}
async function payload(response: Response) {
  const text = await response.text();
  return JSON.parse(text.startsWith("event:") || text.startsWith("data:") ? text.split("\n").find((line) => line.startsWith("data:"))!.slice(5) : text);
}
describe("MCP HTTP boundary", () => {
  it("publishes canonical resource and Supabase issuer", async () => {
    expect(await metadata(new Request("https://untrusted.example/.well-known/oauth-protected-resource")).json()).toMatchObject({ resource: "https://app.padelaso.com/api/mcp", authorization_servers: ["https://test.supabase.co/auth/v1"] });
  });
  it("requires a bearer header and never reads query tokens", async () => {
    const response = await call({}, undefined, `?access_token=${await token()}`);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('resource_metadata="https://app.padelaso.com/.well-known/oauth-protected-resource"');
  });
  it.each([{ client_id: undefined }, { client_id: "other" }, { role: "service_role" }])("rejects invalid OAuth principal %j", async (claims) => {
    expect([401, 403]).toContain((await call({}, await token(claims))).status);
  });
  it.each([
    ["https://wrong.example/auth/v1", "authenticated", "1h"],
    ["https://test.supabase.co/auth/v1", "other", "1h"],
    ["https://test.supabase.co/auth/v1", "authenticated", "-1h"],
  ])("rejects issuer/audience/expiry mismatch", async (issuer, audience, expiry) => {
    expect((await call({}, await token({}, issuer, audience, expiry))).status).toBe(401);
  });
  it("rejects tampered signatures", async () => {
    const signed = await token();
    const parts = signed.split(".");
    parts[1] = Buffer.from(JSON.stringify({ sub: user, client_id: "client", role: "authenticated" })).toString("base64url");
    expect((await call({}, parts.join("."))).status).toBe(401);
  });
  it("denies users and clients by default", async () => {
    vi.stubEnv("MCP_ALLOWED_USER_IDS", "");
    expect((await call({}, await token())).status).toBe(403);
  });
  it("returns an HTTP challenge for another group's tool call", async () => {
    state.member = false;
    const response = await call({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_players", arguments: { group_id: user } } }, await token());
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain("resource_metadata");
  });
  it("initializes through the legacy stateless protocol", async () => {
    const response = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "independent-test-client", version: "1" } } }, await token());
    expect(response.status).toBe(200);
    expect((await payload(response)).result.serverInfo.name).toBe("padelaso");
  });
  it("exposes exactly four annotated read tools", async () => {
    const response = await call({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, await token());
    const tools = (await payload(response)).result.tools;
    expect(tools.map((tool: { name: string }) => tool.name).sort()).toEqual(["get_player_stats", "list_groups", "list_matches", "list_players"]);
    for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
  });
  it("returns structured results and shared domain stats", async () => {
    const response = await call({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_player_stats", arguments: { group_id: user, player_id: user } } }, await token());
    expect((await payload(response)).result.structuredContent.stats).toMatchObject({ matches: 1, wins: 1, losses: 0, winRate: 1 });
  });
});
