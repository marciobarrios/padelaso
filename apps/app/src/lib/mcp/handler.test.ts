// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calculatePlayerStats } from "@padelaso/domain/stats";
import { mapMatch } from "@padelaso/data/mappers";
import { GET as metadata } from "@/app/.well-known/oauth-protected-resource/[[...resource]]/route";
import { OPTIONS, POST } from "@/app/api/mcp/route";

const SUPABASE = "https://project.supabase.co";
const ISSUER = `${SUPABASE}/auth/v1`;
const ORIGIN = "https://padelaso.test";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const GROUP_ID = "33333333-3333-4333-8333-333333333333";
const [ANA, PABLO, LUCIA, MARTA, GONE] = [
  "44444444-4444-4444-8444-444444444441",
  "44444444-4444-4444-8444-444444444442",
  "44444444-4444-4444-8444-444444444443",
  "44444444-4444-4444-8444-444444444444",
  "44444444-4444-4444-8444-444444444445",
];

let signingKey: CryptoKey;
let foreignKey: CryptoKey;
let jwk: JsonWebKey;

const base64url = (bytes: Uint8Array | string) =>
  Buffer.from(bytes).toString("base64url");

async function sign(claims: Record<string, unknown>, key = signingKey) {
  const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "test-key" }));
  const body = base64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${base64url(new Uint8Array(signature))}`;
}

function claims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER, sub: USER_ID, aud: "authenticated", role: "authenticated",
    iat: now, exp: now + 3600, client_id: CLIENT_ID, session_id: "session", ...overrides,
  };
}

const groupRow = { id: GROUP_ID, name: "Los del jueves", emoji: "🎾" };
const players = [
  { id: ANA, name: "Ana", emoji: "🦊", user_id: USER_ID },
  { id: PABLO, name: "Pablo", emoji: "🐻", user_id: null },
  { id: LUCIA, name: "Lucía", emoji: "🦄", user_id: null },
  { id: MARTA, name: "Marta", emoji: "🐯", user_id: null },
];
const match = (id: string, date: string, team1: string[], team2: string[], sets: [number, number][]) => ({
  id, date, created_at: date, court_number: 2, group_id: GROUP_ID, created_by: USER_ID, team1, team2,
  sets: sets.map(([team1Score, team2Score]) => ({ team1Score, team2Score })),
});
const matches = [
  match("m3", "2026-11-10T19:00:00Z", [ANA, PABLO], [LUCIA, MARTA], [[6, 4], [6, 3]]),
  match("m2", "2026-11-03T19:00:00Z", [ANA, LUCIA], [PABLO, GONE], [[3, 6], [4, 6]]),
  match("m1", "2026-10-27T19:00:00Z", [ANA, PABLO], [LUCIA, MARTA], [[6, 2], [2, 6], [7, 5]]),
];

type Route = (url: URL, init: RequestInit | undefined) => Response | undefined;
let database: ReturnType<typeof vi.fn<typeof fetch>>;

function stubSupabase(overrides: Route = () => undefined) {
  database = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const custom = overrides(url, init);
    if (custom) return custom;
    if (url.pathname === "/auth/v1/.well-known/jwks.json") {
      return Response.json({ keys: [{ ...jwk, kid: "test-key", alg: "ES256", use: "sig" }] });
    }
    const json = (body: unknown, headers: Record<string, string> = {}) =>
      Response.json(body, { headers: { "Content-Range": `0-0/${Array.isArray(body) ? body.length : 1}`, ...headers } });
    if (url.pathname === "/rest/v1/groups") {
      // RLS: only the caller's group is visible, whatever ID is requested.
      const visible = !url.searchParams.has("id") || url.searchParams.get("id") === `eq.${GROUP_ID}`;
      return json(visible ? [groupRow] : []);
    }
    if (url.pathname === "/rest/v1/players") return json(players);
    if (url.pathname === "/rest/v1/matches") {
      return Response.json(matches, { headers: { "Content-Range": `0-${matches.length - 1}/${matches.length}` } });
    }
    return new Response("unexpected", { status: 500 });
  });
  vi.stubGlobal("fetch", database);
}

async function rpc(body: unknown, token?: string, url = `${ORIGIN}/api/mcp`) {
  return POST(new Request(url, {
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

async function payload(response: Response) {
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return JSON.parse(text);
  const data = text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => line.slice(6));
  return JSON.parse(data.at(-1)!);
}

async function callTool(name: string, args: Record<string, unknown> = {}, token?: string) {
  const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    token ?? await sign(claims()));
  expect(response.status).toBe(200);
  return (await payload(response)).result;
}

function restCalls() {
  return database.mock.calls.filter(([input]) => String(input).includes("/rest/v1/"));
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  signingKey = pair.privateKey;
  jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  foreignKey = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])).privateKey;
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("MCP_RESOURCE_URL", `${ORIGIN}/api/mcp`);
  vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", `other-client, ${CLIENT_ID}`);
  vi.stubEnv("MCP_ALLOWED_USER_IDS", USER_ID);
  stubSupabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list" };

describe("MCP authorization boundary", () => {
  it("challenges unauthenticated requests with the path-aware metadata URL", async () => {
    const response = await rpc(listTools);
    expect(response.status).toBe(401);
    const challenge = response.headers.get("www-authenticate")!;
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    expect(restCalls()).toHaveLength(0);
  });

  it("never reads a token from the query string", async () => {
    const token = await sign(claims());
    const response = await rpc(listTools, undefined, `${ORIGIN}/api/mcp?access_token=${token}&token=${token}`);
    expect(response.status).toBe(401);
  });

  it.each([
    ["an ordinary app session (no client_id)", { client_id: undefined }],
    ["another issuer", { iss: "https://evil.supabase.co/auth/v1" }],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 10 }],
    ["an anonymous user", { is_anonymous: true }],
    ["a service role", { role: "service_role" }],
    ["another audience", { aud: "https://other.example" }],
  ])("rejects %s with 401 invalid_token", async (_label, overrides) => {
    const response = await rpc(listTools, await sign(claims(overrides)));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
    // Refused from the claims alone: no call to Supabase, so no amplification.
    expect(database).not.toHaveBeenCalled();
  });

  it("refuses forged tokens that could never pass without calling Supabase", async () => {
    // An unknown kid and an HS256 token both make getClaims ask Supabase Auth.
    const forge = (header: Record<string, string>, overrides: Record<string, unknown>) =>
      `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims(overrides)))}.${base64url("forged")}`;
    const tokens = [
      forge({ alg: "ES256", typ: "JWT", kid: "unknown-key" }, { iss: "https://evil.supabase.co/auth/v1" }),
      forge({ alg: "HS256", typ: "JWT" }, { client_id: undefined }),
      forge({ alg: "HS256", typ: "JWT" }, { client_id: "99999999-9999-4999-8999-999999999999" }),
      "a.b.c",
    ];
    for (const token of tokens) expect([401, 403]).toContain((await rpc(listTools, token)).status);
    expect(database).not.toHaveBeenCalled();
  });

  it("still verifies the signature of tokens whose claims look right", async () => {
    const forged = `${base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "test-key" }))}.${base64url(JSON.stringify(claims()))}.${base64url("forged")}`;
    expect((await rpc(listTools, forged)).status).toBe(401);
    expect(restCalls()).toHaveLength(0);
  });

  it("rejects tokens signed by another key and tampered tokens", async () => {
    expect((await rpc(listTools, await sign(claims(), foreignKey))).status).toBe(401);
    const [header, , signature] = (await sign(claims())).split(".");
    const forged = `${header}.${base64url(JSON.stringify(claims({ sub: "55555555-5555-4555-8555-555555555555" })))}.${signature}`;
    expect((await rpc(listTools, forged)).status).toBe(401);
    expect((await rpc(listTools, "not-a-jwt")).status).toBe(401);
  });

  it("returns 403 insufficient_scope for valid users outside the beta allowlist", async () => {
    vi.stubEnv("MCP_ALLOWED_USER_IDS", "");
    const response = await rpc(listTools, await sign(claims()));
    expect(response.status).toBe(403);
    const challenge = response.headers.get("www-authenticate")!;
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain("resource_metadata=");
  });

  it("returns 403 insufficient_scope for clients that are not allowlisted", async () => {
    // A 401 would send the client back through sign-in, which cannot help.
    const response = await rpc(listTools, await sign(claims({ client_id: "99999999-9999-4999-8999-999999999999" })));
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(restCalls()).toHaveLength(0);
  });

  it("denies every client when the client allowlist is empty", async () => {
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "");
    expect((await rpc(listTools, await sign(claims()))).status).toBe(403);
  });

  it("answers 500, not 401, when the signing keys cannot be fetched", async () => {
    // A 401 would make clients discard a valid token and restart sign-in.
    stubSupabase((url) => url.pathname.endsWith("jwks.json") ? new Response("down", { status: 503 }) : undefined);
    // Use a fresh kid so the process-wide JWKS cache cannot answer.
    const header = base64url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: "rotated-key" }));
    const [, body, signature] = (await sign(claims())).split(".");
    const response = await rpc(listTools, `${header}.${body}.${signature}`);
    expect(response.status).toBe(500);
  });

  it("answers CORS preflights", async () => {
    const response = OPTIONS();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});

describe("MCP protocol and tools", () => {
  it("initializes and advertises exactly the four read-only tools", async () => {
    const token = await sign(claims());
    const init = await rpc({
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }, token);
    expect(init.status).toBe(200);
    expect((await payload(init)).result.serverInfo.name).toBe("padelaso");

    const { result } = await payload(await rpc(listTools, token));
    const tools = result.tools as { name: string; annotations: Record<string, boolean>; outputSchema?: object }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["get_player_stats", "list_groups", "list_matches", "list_players"]);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      expect(tool.outputSchema).toBeDefined();
    }
  });

  it("reads as the caller, with the caller's token and the public key only", async () => {
    const token = await sign(claims());
    const result = await callTool("list_groups", {}, token);
    expect(result.structuredContent).toEqual({ groups: [groupRow] });
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);

    const [, init] = restCalls()[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("apikey")).toBe("anon-key");
  });

  it("finds players ignoring case and accents and marks the caller", async () => {
    const result = await callTool("list_players", { group_id: GROUP_ID, name: "LUCIA" });
    expect(result.structuredContent.players).toEqual([{ id: LUCIA, name: "Lucía", emoji: "🦄", isYou: false }]);
    const all = await callTool("list_players", { group_id: GROUP_ID });
    expect(all.structuredContent.players.find((p: { isYou: boolean }) => p.isYou).id).toBe(ANA);
    expect(JSON.stringify(all.structuredContent)).not.toContain(USER_ID);
  });

  it("lists matches with names, winners and paging", async () => {
    const result = await callTool("list_matches", { group_id: GROUP_ID, limit: 2 });
    const { matches: listed, nextOffset } = result.structuredContent;
    expect(nextOffset).toBe(2);
    expect(listed).toHaveLength(2);
    expect(listed[0]).toEqual({
      id: "m3", date: "2026-11-10T19:00:00.000Z", court: 2,
      team1: { players: [{ id: ANA, name: "Ana" }, { id: PABLO, name: "Pablo" }], setsWon: 2 },
      team2: { players: [{ id: LUCIA, name: "Lucía" }, { id: MARTA, name: "Marta" }], setsWon: 0 },
      sets: [{ team1: 6, team2: 4 }, { team1: 6, team2: 3 }],
      winner: "team1",
    });
    expect(listed[1].team2.players[1]).toEqual({ id: GONE, name: null });

    const [input] = restCalls().find(([u]) => String(u).includes("/matches"))!;
    const url = new URL(String(input));
    expect(url.searchParams.get("group_id")).toBe(`eq.${GROUP_ID}`);
    expect(url.searchParams.get("order")).toBe("date.desc,created_at.desc,id.desc");
  });

  it("filters matches by player inside the database query", async () => {
    await callTool("list_matches", { group_id: GROUP_ID, player_id: PABLO });
    const [input] = restCalls().find(([u]) => String(u).includes("/matches"))!;
    expect(new URL(String(input)).searchParams.get("or")).toBe(`(team1.cs.{${PABLO}},team2.cs.{${PABLO}})`);
  });

  it("computes stats with the shared domain rules", async () => {
    const result = await callTool("get_player_stats", { group_id: GROUP_ID, player_id: ANA });
    const expected = calculatePlayerStats(ANA, matches.map(mapMatch));
    const stats = result.structuredContent;
    expect(stats).toMatchObject({
      player: { id: ANA, name: "Ana", isYou: true },
      matches: expected.matches, wins: expected.wins, losses: expected.losses,
      currentStreak: expected.currentStreak, bestStreak: expected.bestStreak,
      undecided: 0, winRate: 0.667, recentForm: ["W", "L", "W"],
    });
    // Pablo won all three matches, so Ana (2 of 3) ranks second.
    expect(stats.ranking).toEqual({ position: 2, rankedPlayers: 4, provisional: false, minimumMatches: 2 });
    expect(stats.partners[0]).toEqual({ id: PABLO, name: "Pablo", matches: 2, wins: 2, winRate: 1 });
  });

  it("treats other groups as missing, without leaking whether they exist", async () => {
    const other = "66666666-6666-4666-8666-666666666666";
    const result = await callTool("get_player_stats", { group_id: other, player_id: ANA });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Group not found/);
    expect(result.structuredContent).toBeUndefined();
  });

  it("rejects players from outside the group", async () => {
    const result = await callTool("get_player_stats", { group_id: GROUP_ID, player_id: GONE });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Player not found/);
  });

  it("validates arguments before touching the database", async () => {
    const result = await callTool("list_matches", { group_id: "not-a-uuid" });
    expect(result.isError).toBe(true);
    expect(restCalls()).toHaveLength(0);
  });

  it("hides database errors from the client", async () => {
    stubSupabase((url) => url.pathname === "/rest/v1/groups"
      ? Response.json({ message: "relation secret_table does not exist", code: "42P01" }, { status: 500 })
      : undefined);
    const result = await callTool("list_groups");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("secret_table");
  });
});

describe("protected resource metadata", () => {
  const get = (path: string, resource?: string[]) =>
    metadata(new Request(`${ORIGIN}${path}`), { params: Promise.resolve({ resource }) });

  it("points MCP clients at Supabase Auth", async () => {
    for (const response of [
      await get("/.well-known/oauth-protected-resource/api/mcp", ["api", "mcp"]),
      await get("/.well-known/oauth-protected-resource"),
    ]) {
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        resource: `${ORIGIN}/api/mcp`,
        authorization_servers: [ISSUER],
        bearer_methods_supported: ["header"],
      });
    }
  });

  it("only describes the MCP resource", async () => {
    expect((await get("/.well-known/oauth-protected-resource/api/score", ["api", "score"])).status).toBe(404);
  });

  it("derives the resource from the deployment when no canonical URL is set", async () => {
    vi.stubEnv("MCP_RESOURCE_URL", "");
    const response = await metadata(new Request("https://preview-123.vercel.app/.well-known/oauth-protected-resource"),
      { params: Promise.resolve({}) });
    expect((await response.json()).resource).toBe("https://preview-123.vercel.app/api/mcp");
  });

  it("requires the canonical URL in production instead of trusting the request", async () => {
    vi.stubEnv("MCP_RESOURCE_URL", "");
    vi.stubEnv("VERCEL_ENV", "production");
    expect((await rpc(listTools, await sign(claims()))).status).toBe(500);
    await expect(get("/.well-known/oauth-protected-resource")).rejects.toThrow("MCP_RESOURCE_URL");
  });

  it("refuses a misconfigured canonical URL", async () => {
    vi.stubEnv("MCP_RESOURCE_URL", "http://padelaso.com/api/mcp");
    expect((await rpc(listTools, await sign(claims()))).status).toBe(500);
  });
});
