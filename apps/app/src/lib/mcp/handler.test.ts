// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { calculatePlayerStats } from "@padelaso/domain/stats";
import { mapMatch } from "@padelaso/data/mappers";
import { GET as metadata } from "@/app/.well-known/oauth-protected-resource/[[...resource]]/route";
import { OPTIONS, POST } from "@/app/api/mcp/route";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException, withScope: (fn: (scope: unknown) => void) =>
  fn({ clear() {}, addEventProcessor() {} }) }));

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

const MATCH_ID = "77777777-7777-4777-8777-777777777777";
type CreateRequest = { team1: string[]; team2: string[]; sets: unknown[]; events: { playerId: string; type: string }[] };
/** What create_match answers; tests replace it to simulate other outcomes. */
let createMatchAnswer: (request: CreateRequest) => unknown;
const savedAs = (status: string, minutesAgo = 0) => (request: CreateRequest) => ({
  status,
  match: {
    id: MATCH_ID, groupId: GROUP_ID, date: "2026-11-14T18:00:00.000Z",
    createdAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), courtNumber: null,
    team1: request.team1, team2: request.team2, sets: request.sets,
  },
  events: request.events.map((e, i) => ({ id: `88888888-8888-4888-8888-88888888888${i}`, ...e })),
});

/** What get_match_detail answers; tests replace it to simulate other outcomes. */
let matchDetailAnswer: (request: { p_group_id: string; p_match_id: string }) => unknown;
const EVENT_IDS = ["99999999-9999-4999-8999-999999999991", "99999999-9999-4999-8999-999999999992"];
const foundMatch = () => ({
  status: "found",
  match: {
    id: MATCH_ID, groupId: GROUP_ID, date: "2026-11-16T19:00:00.000Z", createdAt: "2026-11-16T21:00:00.000Z",
    courtNumber: 4, team1: [ANA, PABLO], team2: [LUCIA, GONE],
    sets: [{ team1Score: 6, team2Score: 3 }, { team1Score: 4, team2Score: 6 }, { team1Score: 7, team2Score: 5 }],
  },
  events: [
    { id: EVENT_IDS[0], playerId: ANA, type: "ace" },
    { id: EVENT_IDS[1], playerId: GONE, type: "old_event" },
  ],
  version: 12,
});

type AddRequest = { groupId: string; matchId: string; events: { playerId: string; type: string }[]; idempotencyKey: string };
/** What add_match_events answers; tests replace it to simulate other outcomes. */
let addEventsAnswer: (request: AddRequest) => unknown;
const ADDED_IDS = ["99999999-9999-4999-8999-999999999993", "99999999-9999-4999-8999-999999999994"];
const addedAs = (status: string) => (request: AddRequest) => {
  const before = foundMatch();
  const added = request.events.map((e, i) => ({ id: ADDED_IDS[i], ...e }));
  return { ...before, status, events: [...before.events, ...added], version: 14, addedEventIds: added.map((e) => e.id) };
};

type RemoveRequest = { groupId: string; matchId: string; eventId: string; expectedVersion: number };
/** What remove_match_event answers; tests replace it to simulate other outcomes. */
let removeEventAnswer: (request: RemoveRequest) => unknown;
const removedAs = (status: string) => (request: RemoveRequest) => {
  const before = foundMatch();
  const removed = before.events.find((e) => e.id === request.eventId)!;
  return { ...before, status, events: before.events.filter((e) => e !== removed), version: 13, removedEvent: removed };
};

type UpdateRequest = { groupId: string; matchId: string; expectedVersion: number; patch: Record<string, unknown>; idempotencyKey: string };
/** What update_match answers; tests replace it to simulate other outcomes. */
let updateMatchAnswer: (request: UpdateRequest) => unknown;
const updatedAs = (status: string, changed: string[]) => (request: UpdateRequest) => {
  const before = foundMatch();
  const { courtNumber, ...rest } = request.patch;
  return {
    ...before, status, changed, version: 13,
    match: { ...before.match, ...rest, ...(courtNumber === undefined ? {} : { courtNumber }) },
  };
};

/** Rate limit counters by window, as public.hit_mcp_rate_limit keeps them. */
let rateWindows: Map<string, number>;

function hitRateLimit(init: RequestInit | undefined) {
  const token = new Headers(init?.headers).get("authorization")!.replace(/^Bearer /, "");
  const { sub, client_id } = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  const count = (key: string) => {
    const next = (rateWindows.get(key) ?? 0) + 1;
    rateWindows.set(key, next);
    return next;
  };
  return { user_requests: count(`${sub}:`), client_requests: count(`${sub}:${client_id}`), retry_after: 42 };
}

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
    if (url.pathname === "/rest/v1/rpc/hit_mcp_rate_limit") return Response.json(hitRateLimit(init));
    if (url.pathname === "/rest/v1/rpc/get_match_detail") {
      return Response.json(matchDetailAnswer(JSON.parse(String(init?.body))));
    }
    if (url.pathname === "/rest/v1/rpc/add_match_events") {
      return Response.json(addEventsAnswer(JSON.parse(String(init?.body)).p_request));
    }
    if (url.pathname === "/rest/v1/rpc/remove_match_event") {
      return Response.json(removeEventAnswer(JSON.parse(String(init?.body)).p_request));
    }
    if (url.pathname === "/rest/v1/rpc/update_match") {
      return Response.json(updateMatchAnswer(JSON.parse(String(init?.body)).p_request));
    }
    if (url.pathname === "/rest/v1/rpc/create_match") {
      return Response.json(createMatchAnswer(JSON.parse(String(init?.body)).p_request));
    }
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

/** Data access by tools; the rate limit counter is left out. */
function restCalls() {
  return database.mock.calls.filter(([input]) =>
    String(input).includes("/rest/v1/") && !String(input).includes("/rpc/hit_mcp_rate_limit"));
}

function rateLimitCalls() {
  return database.mock.calls.filter(([input]) => String(input).includes("/rpc/hit_mcp_rate_limit"));
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  signingKey = pair.privateKey;
  jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  foreignKey = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])).privateKey;
});

beforeEach(() => {
  captureException.mockClear();
  vi.spyOn(console, "info").mockImplementation(() => {});
  rateWindows = new Map();
  createMatchAnswer = savedAs("created");
  matchDetailAnswer = foundMatch;
  addEventsAnswer = addedAs("added");
  removeEventAnswer = removedAs("removed");
  updateMatchAnswer = updatedAs("updated", ["sets"]);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("MCP_RESOURCE_URL", `${ORIGIN}/api/mcp`);
  vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", `other-client, ${CLIENT_ID}`);
  stubSupabase();
});

afterEach(() => {
  vi.restoreAllMocks();
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

  it("accepts valid users without a user allowlist", async () => {
    const response = await rpc(listTools, await sign(claims()));
    expect(response.status).toBe(200);
  });

  it("returns 403 insufficient_scope for clients that are not allowlisted", async () => {
    // A 401 would send the client back through sign-in, which cannot help.
    const response = await rpc(listTools, await sign(claims({ client_id: "99999999-9999-4999-8999-999999999999" })));
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
    expect(restCalls()).toHaveLength(0);
  });

  it("admits dynamic ChatGPT clients only after verifying their token", async () => {
    vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "true");
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    stubSupabase((url) => url.pathname === `/auth/v1/admin/oauth/clients/${CLIENT_ID}`
      ? Response.json({ client_id: CLIENT_ID, registration_type: "dynamic", redirect_uris: ["https://chatgpt.com/connector/oauth/test"] })
      : undefined);
    expect((await rpc(listTools, await sign(claims(), foreignKey))).status).toBe(401);
    expect(database.mock.calls.some(([url]) => String(url).includes("/admin/oauth/"))).toBe(false);
    expect((await rpc(listTools, await sign(claims()))).status).toBe(200);
  });

  it.each([
    ["an untrusted destination", 200, { client_id: CLIENT_ID, registration_type: "dynamic", redirect_uris: ["https://evil.test/callback"] }, 403],
    ["a removed registration", 404, { message: "not found" }, 403],
    ["a registry outage", 503, { message: "unavailable" }, 500],
  ])("refuses dynamic clients with %s", async (_label, status, body, expected) => {
    vi.stubEnv("MCP_SELF_SERVICE_ENABLED", "true");
    vi.stubEnv("MCP_ALLOWED_CLIENT_IDS", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    stubSupabase((url) => url.pathname.includes("/admin/oauth/") ? Response.json(body, { status: Number(status) }) : undefined);
    expect((await rpc(listTools, await sign(claims()))).status).toBe(expected);
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
  it("initializes and advertises the read tools and the write tools", async () => {
    const token = await sign(claims());
    const init = await rpc({
      jsonrpc: "2.0", id: 0, method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } },
    }, token);
    expect(init.status).toBe(200);
    expect((await payload(init)).result.serverInfo.name).toBe("padelaso");

    const { result } = await payload(await rpc(listTools, token));
    const tools = result.tools as { name: string; annotations: Record<string, boolean>; outputSchema?: object }[];
    expect(tools.map((t) => t.name).sort())
      .toEqual(["add_match_events", "create_match", "get_match", "get_player_stats", "list_groups", "list_matches", "list_players",
        "remove_match_event", "update_match"]);
    const writes = ["create_match", "add_match_events", "remove_match_event", "update_match"];
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: !writes.includes(tool.name),
        destructiveHint: ["remove_match_event", "update_match"].includes(tool.name),
        openWorldHint: false,
      });
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

describe("create_match", () => {
  const valid = {
    group_id: GROUP_ID,
    team1: [ANA, PABLO],
    team2: [LUCIA, MARTA],
    sets: [{ team1: 6, team2: 4 }, { team1: 3, team2: 6 }, { team1: 7, team2: 5 }],
  };
  const rpcCalls = () => restCalls().filter(([input]) => String(input).includes("/rpc/create_match"));

  it("saves through the create_match function as the caller", async () => {
    const token = await sign(claims());
    const result = await callTool("create_match", {
      ...valid,
      played_at: "2026-11-14T19:00:00+01:00",
      court: 3,
      events: [{ player_id: ANA, type: "ace" }, { player_id: MARTA, type: "salvada_top" }],
      idempotency_key: "c7c1a4f6-1f0e-4a8e-9f4c-3d1b2a6e5f70",
    }, token);

    expect(result.isError).toBeFalsy();
    const [[, init]] = rpcCalls();
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      p_request: {
        groupId: GROUP_ID,
        team1: [ANA, PABLO],
        team2: [LUCIA, MARTA],
        sets: [{ team1Score: 6, team2Score: 4 }, { team1Score: 3, team2Score: 6 }, { team1Score: 7, team2Score: 5 }],
        date: "2026-11-14T18:00:00.000Z",
        courtNumber: 3,
        events: [{ playerId: ANA, type: "ace" }, { playerId: MARTA, type: "salvada_top" }],
        idempotencyKey: "c7c1a4f6-1f0e-4a8e-9f4c-3d1b2a6e5f70",
      },
    });

    expect(result.structuredContent).toEqual({
      status: "created",
      message: "Match saved.",
      group: groupRow,
      match: {
        id: MATCH_ID, date: "2026-11-14T18:00:00.000Z", court: null,
        team1: { players: [{ id: ANA, name: "Ana" }, { id: PABLO, name: "Pablo" }], setsWon: 2 },
        team2: { players: [{ id: LUCIA, name: "Lucía" }, { id: MARTA, name: "Marta" }], setsWon: 1 },
        sets: [{ team1: 6, team2: 4 }, { team1: 3, team2: 6 }, { team1: 7, team2: 5 }],
        winner: "team1",
      },
      events: [
        { player: { id: ANA, name: "Ana" }, type: "ace", label: "Ace" },
        { player: { id: MARTA, name: "Marta" }, type: "salvada_top", label: "Salvada top" },
      ],
      url: `${ORIGIN}/matches/${MATCH_ID}`,
    });
  });

  it("lets the server date a match played just now", async () => {
    await callTool("create_match", valid);
    const request = JSON.parse(String(rpcCalls()[0][1]?.body)).p_request;
    expect(request).not.toHaveProperty("date");
    expect(request).not.toHaveProperty("idempotencyKey");
  });

  it.each([
    ["a player from outside the group", { team2: [LUCIA, GONE] }, /not players of Los del jueves: .*Use list_players/],
    ["the same player twice", { team2: [ANA, MARTA] }, /four different players/],
    ["a three-player team", { team1: [ANA, PABLO, LUCIA] }, /./],
    ["an unplayed set", { sets: [{ team1: 6, team2: 4 }, { team1: 0, team2: 0 }] }, /Set 2 has no score/],
    ["an impossible score", { sets: [{ team1: 100, team2: 4 }] }, /./],
    ["six sets", { sets: Array(6).fill({ team1: 6, team2: 4 }) }, /./],
    ["an event for a player outside the match", { events: [{ player_id: GONE, type: "ace" }] }, /four players/],
    ["a retired event type", { events: [{ player_id: ANA, type: "bola_fuera" }] }, /./],
    ["a date without a UTC offset", { played_at: "2026-11-14T19:00:00" }, /./],
    ["a player name instead of an ID", { team1: ["Ana", PABLO] }, /./],
    ["an idempotency key that is not a UUID", { idempotency_key: "ana-pablo-lucia-marta-6-4" }, /./],
  ])("never saves %s", async (_label, overrides, message) => {
    const result = await callTool("create_match", { ...valid, ...overrides });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(message);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("never saves into a group the caller cannot see", async () => {
    const result = await callTool("create_match", { ...valid, group_id: "66666666-6666-4666-8666-666666666666" });
    expect(result.content[0].text).toMatch(/Group not found/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("reports a retry that found the earlier match", async () => {
    createMatchAnswer = savedAs("duplicate", 3);
    const duplicate = await callTool("create_match", valid);
    expect(duplicate.structuredContent).toMatchObject({ status: "duplicate", url: `${ORIGIN}/matches/${MATCH_ID}` });
    expect(duplicate.structuredContent.message).toMatch(/recorded 3 min ago, so no new match was created/);

    createMatchAnswer = savedAs("replayed");
    const replayed = await callTool("create_match", { ...valid, idempotency_key: "0b6f3c1e-8d2a-4f5b-9c7e-1a2b3c4d5e6f" });
    expect(replayed.structuredContent.status).toBe("replayed");
    expect(replayed.structuredContent.message).toMatch(/No new match was created/);
  });

  it.each([
    ["IDEMPOTENCY_KEY_REUSED", /already used for a different match/],
    ["PLAYER_NOT_IN_GROUP", /Use list_players/],
    ["INVALID_DATE", /time zone/],
    ["INVALID_SETS", /Set 1: scores/],
  ])("explains a %s refusal from the database", async (code, message) => {
    createMatchAnswer = () => ({ status: "rejected", code, message: "Set 1: scores must be whole numbers from 0 to 99." });
    const result = await callTool("create_match", valid);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(message);
    expect(result.content[0].text).toMatch(/Nothing was saved/);
  });

  it("treats a missing user in the database as a server error", async () => {
    createMatchAnswer = () => ({ status: "rejected", code: "AUTH_REQUIRED", message: "Sign in again." });
    const result = await callTool("create_match", valid);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/temporarily unavailable/);
  });

  it("refuses an unexpected database answer instead of reporting success", async () => {
    createMatchAnswer = () => ({ status: "created" });
    const result = await callTool("create_match", valid);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe("get_match", () => {
  const args = { group_id: GROUP_ID, match_id: MATCH_ID };
  const rpcCalls = () => restCalls().filter(([input]) => String(input).includes("/rpc/get_match_detail"));

  it("returns the match with its event IDs and version, read as the caller", async () => {
    const token = await sign(claims());
    const result = await callTool("get_match", args, token);

    expect(result.isError).toBeFalsy();
    const [[, init]] = rpcCalls();
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({ p_group_id: GROUP_ID, p_match_id: MATCH_ID });

    expect(result.structuredContent).toEqual({
      group: groupRow,
      match: {
        id: MATCH_ID, date: "2026-11-16T19:00:00.000Z", court: 4,
        team1: { players: [{ id: ANA, name: "Ana" }, { id: PABLO, name: "Pablo" }], setsWon: 2 },
        team2: { players: [{ id: LUCIA, name: "Lucía" }, { id: GONE, name: null }], setsWon: 1 },
        sets: [{ team1: 6, team2: 3 }, { team1: 4, team2: 6 }, { team1: 7, team2: 5 }],
        winner: "team1",
      },
      events: [
        { id: EVENT_IDS[0], player: { id: ANA, name: "Ana" }, type: "ace", label: "Ace" },
        // Unknown types and deleted players still show, so they can be corrected.
        { id: EVENT_IDS[1], player: { id: GONE, name: null }, type: "old_event", label: "old_event" },
      ],
      version: 12,
      url: `${ORIGIN}/matches/${MATCH_ID}`,
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(USER_ID);
  });

  it("treats a match it cannot see as missing, without leaking whether it exists", async () => {
    matchDetailAnswer = () => ({ status: "rejected", code: "MATCH_NOT_FOUND", message: "Match not found in this group." });
    const result = await callTool("get_match", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Match not found in this group. Use list_matches/);
    expect(result.structuredContent).toBeUndefined();
  });

  it("treats another group as missing", async () => {
    const result = await callTool("get_match", { ...args, group_id: "66666666-6666-4666-8666-666666666666" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Group not found/);
  });

  it("validates IDs before touching the database", async () => {
    const result = await callTool("get_match", { ...args, match_id: "m3" });
    expect(result.isError).toBe(true);
    expect(restCalls()).toHaveLength(0);
  });

  it("treats a missing user in the database as a server error", async () => {
    matchDetailAnswer = () => ({ status: "rejected", code: "AUTH_REQUIRED", message: "Sign in to read matches." });
    const result = await callTool("get_match", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/temporarily unavailable/);
  });

  it("refuses an unexpected database answer", async () => {
    matchDetailAnswer = () => ({ ...foundMatch(), version: undefined });
    const result = await callTool("get_match", args);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe("add_match_events", () => {
  const KEY = "5f0c2a9e-3b7d-4c1e-8a6f-2d9b4e7c1a30";
  const args = {
    group_id: GROUP_ID,
    match_id: MATCH_ID,
    events: [{ player_id: ANA, type: "ace" }, { player_id: ANA, type: "ace" }],
    idempotency_key: KEY,
  };
  const rpcCalls = () => restCalls().filter(([input]) => String(input).includes("/rpc/add_match_events"));

  it("is an idempotent, non-destructive write", async () => {
    const { result } = await payload(await rpc(listTools, await sign(claims())));
    const tool = result.tools.find((t: { name: string }) => t.name === "add_match_events");
    expect(tool.annotations).toEqual({
      readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false,
    });
    expect(tool.inputSchema.required.sort()).toEqual(["events", "group_id", "idempotency_key", "match_id"]);
  });

  it("adds through the add_match_events function as the caller", async () => {
    const token = await sign(claims());
    const result = await callTool("add_match_events", args, token);

    expect(result.isError).toBeFalsy();
    const [[, init]] = rpcCalls();
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      p_request: {
        groupId: GROUP_ID,
        matchId: MATCH_ID,
        events: [{ playerId: ANA, type: "ace" }, { playerId: ANA, type: "ace" }],
        idempotencyKey: KEY,
      },
    });

    const ace = (id: string) => ({ id, player: { id: ANA, name: "Ana" }, type: "ace", label: "Ace" });
    expect(result.structuredContent).toEqual({
      status: "added",
      message: "2 events added.",
      group: groupRow,
      match: {
        id: MATCH_ID, date: "2026-11-16T19:00:00.000Z", court: 4,
        team1: { players: [{ id: ANA, name: "Ana" }, { id: PABLO, name: "Pablo" }], setsWon: 2 },
        team2: { players: [{ id: LUCIA, name: "Lucía" }, { id: GONE, name: null }], setsWon: 1 },
        sets: [{ team1: 6, team2: 3 }, { team1: 4, team2: 6 }, { team1: 7, team2: 5 }],
        winner: "team1",
      },
      added: [ace(ADDED_IDS[0]), ace(ADDED_IDS[1])],
      events: [
        ace(EVENT_IDS[0]),
        { id: EVENT_IDS[1], player: { id: GONE, name: null }, type: "old_event", label: "old_event" },
        ace(ADDED_IDS[0]),
        ace(ADDED_IDS[1]),
      ],
      version: 14,
      url: `${ORIGIN}/matches/${MATCH_ID}`,
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(USER_ID);
  });

  it("reports a retry that found the earlier call", async () => {
    addEventsAnswer = addedAs("replayed");
    const result = await callTool("add_match_events", args);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.status).toBe("replayed");
    expect(result.structuredContent.message).toMatch(/Nothing new was added/);
    expect(result.structuredContent.added.map((e: { id: string }) => e.id)).toEqual(ADDED_IDS);
  });

  it.each([
    ["no events", { events: [] }],
    ["51 events", { events: Array(51).fill({ player_id: ANA, type: "ace" }) }],
    ["a retired event type", { events: [{ player_id: ANA, type: "bola_fuera" }] }],
    ["an unknown event type", { events: [{ player_id: ANA, type: "smash" }] }],
    ["a player name instead of an ID", { events: [{ player_id: "Ana", type: "ace" }] }],
    ["a missing idempotency key", { idempotency_key: undefined }],
    ["an idempotency key that is not a UUID", { idempotency_key: "two-aces-for-ana" }],
    ["a match name instead of an ID", { match_id: "yesterday" }],
  ])("never saves %s", async (_label, overrides) => {
    const result = await callTool("add_match_events", { ...args, ...overrides });
    expect(result.isError).toBe(true);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("never saves into a group the caller cannot see", async () => {
    const result = await callTool("add_match_events", { ...args, group_id: "66666666-6666-4666-8666-666666666666" });
    expect(result.content[0].text).toMatch(/Group not found/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it.each([
    ["MATCH_NOT_FOUND", /Match not found in this group. Use list_matches/],
    ["INVALID_EVENTS", /four players.*Use get_match/],
    ["IDEMPOTENCY_KEY_REUSED", /already used for a different request/],
    ["TOO_MANY_EVENTS", /at most 50 events; this one has 49/],
    ["BUSY", /same idempotency_key/],
  ])("explains a %s refusal from the database", async (code, message) => {
    addEventsAnswer = () => ({ status: "rejected", code, message: "A match can have at most 50 events; this one has 49." });
    const result = await callTool("add_match_events", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(message);
    expect(result.content[0].text).toMatch(/Nothing was saved/);
    expect(result.structuredContent).toBeUndefined();
  });

  it("treats a missing user in the database as a server error", async () => {
    addEventsAnswer = () => ({ status: "rejected", code: "AUTH_REQUIRED", message: "Sign in again." });
    const result = await callTool("add_match_events", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/temporarily unavailable/);
  });

  it("refuses an unexpected database answer instead of reporting success", async () => {
    addEventsAnswer = (request) => ({ ...(addedAs("added")(request) as object), addedEventIds: undefined });
    const result = await callTool("add_match_events", args);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe("remove_match_event", () => {
  const args = { group_id: GROUP_ID, match_id: MATCH_ID, event_id: EVENT_IDS[0], expected_version: 12 };
  const rpcCalls = () => restCalls().filter(([input]) => String(input).includes("/rpc/remove_match_event"));

  it("is a destructive, idempotent write that asks for confirmation", async () => {
    const { result } = await payload(await rpc(listTools, await sign(claims())));
    const tool = result.tools.find((t: { name: string }) => t.name === "remove_match_event");
    expect(tool.annotations).toEqual({
      readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false,
    });
    expect(tool.inputSchema.required.sort()).toEqual(["event_id", "expected_version", "group_id", "match_id"]);
    expect(tool.description).toMatch(/call only after they confirm/);
    expect(tool.description).toMatch(/version from that get_match/);
  });

  it("removes through the remove_match_event function as the caller", async () => {
    const token = await sign(claims());
    const result = await callTool("remove_match_event", args, token);

    expect(result.isError).toBeFalsy();
    const [[, init]] = rpcCalls();
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      p_request: { groupId: GROUP_ID, matchId: MATCH_ID, eventId: EVENT_IDS[0], expectedVersion: 12 },
    });

    expect(result.structuredContent).toEqual({
      status: "removed",
      message: "Event removed.",
      group: groupRow,
      match: {
        id: MATCH_ID, date: "2026-11-16T19:00:00.000Z", court: 4,
        team1: { players: [{ id: ANA, name: "Ana" }, { id: PABLO, name: "Pablo" }], setsWon: 2 },
        team2: { players: [{ id: LUCIA, name: "Lucía" }, { id: GONE, name: null }], setsWon: 1 },
        sets: [{ team1: 6, team2: 3 }, { team1: 4, team2: 6 }, { team1: 7, team2: 5 }],
        winner: "team1",
      },
      removed: { id: EVENT_IDS[0], player: { id: ANA, name: "Ana" }, type: "ace", label: "Ace" },
      events: [{ id: EVENT_IDS[1], player: { id: GONE, name: null }, type: "old_event", label: "old_event" }],
      version: 13,
      url: `${ORIGIN}/matches/${MATCH_ID}`,
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(USER_ID);
  });

  it("removes a retired event type of a deleted player", async () => {
    const result = await callTool("remove_match_event", { ...args, event_id: EVENT_IDS[1] });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.removed).toEqual(
      { id: EVENT_IDS[1], player: { id: GONE, name: null }, type: "old_event", label: "old_event" });
  });

  it("reports a retry that found the event already removed", async () => {
    removeEventAnswer = removedAs("already_removed");
    const result = await callTool("remove_match_event", args);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.status).toBe("already_removed");
    expect(result.structuredContent.message).toMatch(/already been removed.*Nothing changed/);
    expect(result.structuredContent.removed.id).toBe(EVENT_IDS[0]);
  });

  it.each([
    ["an event name instead of an ID", { event_id: "ace" }],
    ["a missing version", { expected_version: undefined }],
    ["a negative version", { expected_version: -1 }],
    ["a fractional version", { expected_version: 12.5 }],
    ["a version as text", { expected_version: "12" }],
    ["a match name instead of an ID", { match_id: "yesterday" }],
  ])("never removes with %s", async (_label, overrides) => {
    const result = await callTool("remove_match_event", { ...args, ...overrides });
    expect(result.isError).toBe(true);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("never removes from a group the caller cannot see", async () => {
    const result = await callTool("remove_match_event", { ...args, group_id: "66666666-6666-4666-8666-666666666666" });
    expect(result.content[0].text).toMatch(/Group not found/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it.each([
    ["MATCH_NOT_FOUND", /Match not found in this group. Use list_matches/],
    ["EVENT_NOT_FOUND", /Event not found in this match. Use get_match/],
    ["STALE_VERSION", /changed since you read it. Call get_match again/],
    ["BUSY", /Try again in a moment/],
    ["INVALID_REQUEST", /expectedVersion must be the version/],
  ])("explains a %s refusal from the database", async (code, message) => {
    removeEventAnswer = () => ({ status: "rejected", code, message: "expectedVersion must be the version from get_match." });
    const result = await callTool("remove_match_event", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(message);
    expect(result.content[0].text).toMatch(/Nothing was removed/);
    expect(result.structuredContent).toBeUndefined();
  });

  it("treats a missing user in the database as a server error", async () => {
    removeEventAnswer = () => ({ status: "rejected", code: "AUTH_REQUIRED", message: "Sign in again." });
    const result = await callTool("remove_match_event", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/temporarily unavailable/);
  });

  it("refuses an unexpected database answer instead of reporting success", async () => {
    removeEventAnswer = (request) => ({ ...(removedAs("removed")(request) as object), removedEvent: undefined });
    const result = await callTool("remove_match_event", args);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe("update_match", () => {
  const KEY = "0b7e4f2a-6c1d-4e8b-9a3f-5d2c7b1e9a40";
  const args = {
    group_id: GROUP_ID,
    match_id: MATCH_ID,
    expected_version: 12,
    patch: { sets: [{ team1: 6, team2: 4 }, { team1: 6, team2: 2 }] },
    idempotency_key: KEY,
  };
  const rpcCalls = () => restCalls().filter(([input]) => String(input).includes("/rpc/update_match"));
  const sentRequest = () => JSON.parse(String(rpcCalls()[0][1]?.body)).p_request;

  it("is an idempotent, destructive write that needs a version and a key", async () => {
    const { result } = await payload(await rpc(listTools, await sign(claims())));
    const tool = result.tools.find((t: { name: string }) => t.name === "update_match");
    expect(tool.annotations).toEqual({
      readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false,
    });
    expect(tool.inputSchema.required.sort()).toEqual(["expected_version", "group_id", "idempotency_key", "match_id", "patch"]);
  });

  it("sends only the corrected fields to the update_match function, as the caller", async () => {
    const token = await sign(claims());
    const result = await callTool("update_match", args, token);

    expect(result.isError).toBeFalsy();
    const [[, init]] = rpcCalls();
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
    expect(JSON.parse(String(init?.body))).toEqual({
      p_request: {
        groupId: GROUP_ID,
        matchId: MATCH_ID,
        expectedVersion: 12,
        patch: { sets: [{ team1Score: 6, team2Score: 4 }, { team1Score: 6, team2Score: 2 }] },
        idempotencyKey: KEY,
      },
    });

    expect(result.structuredContent).toEqual({
      status: "updated",
      message: "Match corrected: sets changed.",
      changed: ["sets"],
      group: groupRow,
      match: {
        id: MATCH_ID, date: "2026-11-16T19:00:00.000Z", court: 4,
        team1: { players: [{ id: ANA, name: "Ana" }, { id: PABLO, name: "Pablo" }], setsWon: 2 },
        team2: { players: [{ id: LUCIA, name: "Lucía" }, { id: GONE, name: null }], setsWon: 0 },
        sets: [{ team1: 6, team2: 4 }, { team1: 6, team2: 2 }],
        winner: "team1",
      },
      events: [
        { id: EVENT_IDS[0], player: { id: ANA, name: "Ana" }, type: "ace", label: "Ace" },
        { id: EVENT_IDS[1], player: { id: GONE, name: null }, type: "old_event", label: "old_event" },
      ],
      version: 13,
      url: `${ORIGIN}/matches/${MATCH_ID}`,
    });
    expect(JSON.stringify(result.structuredContent)).not.toContain(USER_ID);
  });

  it("sends teams, date and a cleared court in the database's vocabulary", async () => {
    updateMatchAnswer = updatedAs("updated", ["team2", "date", "courtNumber"]);
    const result = await callTool("update_match", {
      ...args,
      patch: { team1: [ANA, PABLO], team2: [LUCIA, MARTA], played_at: "2026-11-15T20:00:00+01:00", court: null },
    });
    expect(result.isError).toBeFalsy();
    expect(sentRequest().patch).toEqual({
      team1: [ANA, PABLO], team2: [LUCIA, MARTA], date: "2026-11-15T19:00:00.000Z", courtNumber: null,
    });
    expect(result.structuredContent.changed).toEqual(["team2", "played_at", "court"]);
    expect(result.structuredContent.message).toBe("Match corrected: team2, played_at and court changed.");
    expect(result.structuredContent.match.court).toBeNull();
  });

  it.each([
    ["unchanged", [], /already had these values/],
    ["replayed", ["sets"], /already saved by an earlier call/],
  ])("reports a %s correction", async (status, changed, message) => {
    updateMatchAnswer = updatedAs(status, changed);
    const result = await callTool("update_match", args);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.status).toBe(status);
    expect(result.structuredContent.message).toMatch(message);
  });

  it.each([
    ["an empty patch", { patch: {} }],
    ["one team without the other", { patch: { team1: [ANA, MARTA] } }],
    ["a player on both teams", { patch: { team1: [ANA, PABLO], team2: [PABLO, MARTA] } }],
    ["a player outside the group", { patch: { team1: [ANA, PABLO], team2: [LUCIA, GONE] } }],
    ["a player name instead of an ID", { patch: { team1: ["Ana", PABLO], team2: [LUCIA, MARTA] } }],
    ["no sets", { patch: { sets: [] } }],
    ["an unplayed set", { patch: { sets: [{ team1: 6, team2: 4 }, { team1: 0, team2: 0 }] } }],
    ["a date without a UTC offset", { patch: { played_at: "2026-11-15T20:00:00" } }],
    ["court 0", { patch: { court: 0 } }],
    ["an unknown field next to a valid one", { patch: { court: 3, events: [] } }],
    ["a missing version", { expected_version: undefined }],
    ["a missing idempotency key", { idempotency_key: undefined }],
    ["an idempotency key that is not a UUID", { idempotency_key: "fix-score" }],
  ])("never saves %s", async (_label, overrides) => {
    const result = await callTool("update_match", { ...args, ...overrides });
    expect(result.isError).toBe(true);
    expect(rpcCalls()).toHaveLength(0);
  });

  it("never saves into a group the caller cannot see", async () => {
    const result = await callTool("update_match", { ...args, group_id: "66666666-6666-4666-8666-666666666666" });
    expect(result.content[0].text).toMatch(/Group not found/);
    expect(rpcCalls()).toHaveLength(0);
  });

  it.each([
    ["MATCH_NOT_FOUND", {}, /Match not found in this group. Use list_matches/],
    ["STALE_VERSION", { version: 15 }, /changed since it was read \(it is now at version 15\).*get_match.*new idempotency_key/],
    ["PLAYER_HAS_EVENTS", { playerIds: [LUCIA] }, /would leave the match but still have events in it: Lucía/],
    ["INVALID_DATE", {}, /within the last year/],
    ["IDEMPOTENCY_KEY_REUSED", {}, /already used for a different request/],
    ["BUSY", {}, /same idempotency_key/],
    ["INVALID_SETS", {}, /Set 1 has no score/],
  ])("explains a %s refusal from the database", async (code, extra, message) => {
    updateMatchAnswer = () => ({ status: "rejected", code, message: "Set 1 has no score.", ...extra });
    const result = await callTool("update_match", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(message);
    expect(result.content[0].text).toMatch(/Nothing was saved/);
    expect(result.structuredContent).toBeUndefined();
  });

  it("treats a missing user in the database as a server error", async () => {
    updateMatchAnswer = () => ({ status: "rejected", code: "AUTH_REQUIRED", message: "Sign in again." });
    const result = await callTool("update_match", args);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/temporarily unavailable/);
  });

  it("refuses an unexpected database answer instead of reporting success", async () => {
    updateMatchAnswer = (request) => ({ ...(updatedAs("updated", ["sets"])(request) as object), changed: undefined });
    const result = await callTool("update_match", args);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
  });
});

describe("rate limiting", () => {
  const OTHER_USER = "55555555-5555-4555-8555-555555555555";
  /** Reads the body, so a streamed tool call has finished before the next step. */
  const callList = async (token: string) => {
    const response = await rpc(
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_groups", arguments: {} } }, token);
    const body = await response.text();
    return { status: response.status, headers: response.headers, json: () => JSON.parse(body) };
  };

  beforeEach(() => {
    vi.stubEnv("MCP_RATE_LIMIT_PER_CLIENT", "3");
    vi.stubEnv("MCP_RATE_LIMIT_PER_USER", "5");
  });

  it("runs requests under the limit, counting each one as the caller", async () => {
    const token = await sign(claims());
    for (let i = 0; i < 3; i++) expect((await callList(token)).status).toBe(200);
    expect(rateLimitCalls()).toHaveLength(3);
    const [, init] = rateLimitCalls()[0];
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${token}`);
  });

  it("answers 429 with Retry-After over the limit, without running the tool", async () => {
    const token = await sign(claims());
    for (let i = 0; i < 3; i++) await callList(token);
    const toolCalls = restCalls().length;

    const response = await callList(token);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(response.headers.get("access-control-expose-headers")).toContain("Retry-After");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.json()).toMatchObject({
      jsonrpc: "2.0", error: { code: -32029, message: expect.stringContaining("42 seconds"), data: { retryAfter: 42 } },
    });
    expect(restCalls()).toHaveLength(toolCalls);
  });

  it("gives two users separate budgets", async () => {
    const first = await sign(claims());
    for (let i = 0; i < 3; i++) await callList(first);
    expect((await callList(first)).status).toBe(429);
    expect((await callList(await sign(claims({ sub: OTHER_USER })))).status).toBe(200);
  });

  it("gives each client of a user its own budget, under a shared user ceiling", async () => {
    const chatgpt = await sign(claims());
    const claude = await sign(claims({ client_id: "other-client" }));
    for (let i = 0; i < 3; i++) await callList(chatgpt);
    expect((await callList(chatgpt)).status).toBe(429);
    // The user total is now 4 of 5: the second client gets one request in.
    expect((await callList(claude)).status).toBe(200);
    expect((await callList(claude)).status).toBe(429);
  });

  it("only counts verified callers", async () => {
    expect((await rpc(listTools, await sign(claims(), foreignKey))).status).toBe(401);
    expect(rateLimitCalls()).toHaveLength(0);
  });

  it("lets requests through when the counter is unavailable", async () => {
    stubSupabase((url) =>
      url.pathname === "/rest/v1/rpc/hit_mcp_rate_limit" ? new Response("down", { status: 503 }) : undefined);
    expect((await callList(await sign(claims()))).status).toBe(200);
  });

  it.each([["0"], ["-1"], ["many"], [""]])("falls back to the default limits for %j", async (value) => {
    vi.stubEnv("MCP_RATE_LIMIT_PER_CLIENT", value);
    vi.stubEnv("MCP_RATE_LIMIT_PER_USER", value);
    const { getMcpRateLimits, DEFAULT_CLIENT_LIMIT, DEFAULT_USER_LIMIT } = await import("./rate-limit");
    expect(getMcpRateLimits()).toEqual({ perClient: DEFAULT_CLIENT_LIMIT, perUser: DEFAULT_USER_LIMIT });
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


describe("MCP tool audit", () => {
  function entry(outcome: string, tool: string) {
    expect(console.info).toHaveBeenCalledTimes(1);
    const value = JSON.parse(vi.mocked(console.info).mock.calls[0][0]);
    expect(value).toEqual({ event: "mcp-tool-call", userId: USER_ID, clientId: CLIENT_ID,
      tool, outcome, durationMs: expect.any(Number) });
    expect(value.durationMs).toBeGreaterThanOrEqual(0);
    return value;
  }

  it("logs only identity, tool, outcome and duration on success", async () => {
    await callTool("list_players", { group_id: GROUP_ID, name: "Ana" });
    entry("ok", "list_players");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("logs expected denials without Sentry or input data", async () => {
    await callTool("list_players", { group_id: "66666666-6666-4666-8666-666666666666", name: "private-name" });
    entry("denied", "list_players");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("audits invalid arguments as denied", async () => {
    await callTool("list_players", { group_id: "invalid" });
    entry("denied", "list_players");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("audits malformed wire parameters as denied", async () => {
    await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_players", arguments: "invalid" } }, await sign(claims()));
    entry("denied", "list_players");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("audits unknown tools without logging their arbitrary names", async () => {
    await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "private-name", arguments: {} } }, await sign(claims()));
    entry("denied", "unknown");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports output validation failures as errors", async () => {
    stubSupabase((url) => url.pathname === "/rest/v1/groups" ? Response.json([{ id: GROUP_ID, name: null, emoji: "x" }]) : undefined);
    await callTool("list_groups", {});
    entry("error", "list_groups");
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("reports unexpected failures without raw error payloads", async () => {
    stubSupabase((url) => url.pathname === "/rest/v1/groups"
      ? Response.json({ message: "private-database-payload" }, { status: 500 }) : undefined);
    await callTool("list_groups", {});
    entry("error", "list_groups");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "MCP tool failed" }),
      expect.objectContaining({ tags: { operation: "mcp-tool", tool: "list_groups", client: CLIENT_ID } }));
    expect(JSON.stringify(captureException.mock.calls)).not.toContain("private-database-payload");
  });
});
