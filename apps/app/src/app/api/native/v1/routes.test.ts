// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import command from "@padelaso/data/fixtures/command.json";
import acknowledgement from "@padelaso/data/fixtures/acknowledgement.json";
import snapshot from "@padelaso/data/fixtures/snapshot.json";
import { POST } from "./commands/route";
import { GET } from "./matches/[matchId]/snapshot/route";
import { POST as replaceSession } from "./matches/[matchId]/session/route";

const fresh = () => ({
  ...command,
  createdAt: new Date(Date.now() - 1000).toISOString(),
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
});
const rejection = (code: string, extra: object = {}) => ({
  version: 1,
  commandId: command.commandId,
  occurredAt: snapshot.generatedAt,
  code,
  message: code,
  retryAfterMs: null,
  canonicalRevision: 3,
  ...extra,
});

function post(body: string, headers: Record<string, string> = { authorization: "Bearer user-jwt" }) {
  return new Request("https://padelaso.test/api/native/v1/commands", {
    method: "POST",
    body,
    headers,
  });
}

function stubDatabase(payload: unknown, status = 200) {
  const database = vi.fn(async (..._args: Parameters<typeof fetch>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", database);
  return database;
}

describe("native v1 routes", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("requires a bearer credential and never reads one from the URL", async () => {
    const database = stubDatabase(acknowledgement);
    const response = await POST(
      new Request("https://padelaso.test/api/native/v1/commands?token=abc", {
        method: "POST",
        body: JSON.stringify(fresh()),
      })
    );
    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("AUTH_EXPIRED");
    expect(database).not.toHaveBeenCalled();
  });

  it("runs the command as the calling user and returns the acknowledgement", async () => {
    const database = stubDatabase(acknowledgement);
    const body = fresh();
    const response = await POST(post(JSON.stringify(body)));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(acknowledgement);

    const [url, init] = database.mock.calls[0];
    expect(String(url)).toBe("https://example.supabase.co/rest/v1/rpc/native_apply_command");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer user-jwt");
    expect(JSON.parse(String(init?.body))).toEqual({ p_command: body });
  });

  it("rejects malformed input before reaching the database", async () => {
    const database = stubDatabase(acknowledgement);
    const invalid = await POST(post("{not json"));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).code).toBe("INVALID_REQUEST");

    const extra = await POST(post(JSON.stringify({ ...fresh(), extra: true })));
    expect((await extra.json()).code).toBe("INVALID_REQUEST");

    const version = await POST(post(JSON.stringify({ ...fresh(), version: 2 })));
    const versionBody = await version.json();
    expect(versionBody.code).toBe("UNSUPPORTED_VERSION");
    expect(versionBody.commandId).toBe(command.commandId);
    expect(database).not.toHaveBeenCalled();
  });

  it.each([
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["STALE_SESSION", 409],
    ["STALE_REVISION", 409],
    ["STALE_SET", 409],
    ["OUT_OF_ORDER", 409],
    ["COMMAND_ID_REUSED", 409],
    ["COMMAND_EXPIRED", 410],
  ])("maps %s to HTTP %i and keeps the machine-readable body", async (code, status) => {
    stubDatabase(rejection(code));
    const response = await POST(post(JSON.stringify(fresh())));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code, canonicalRevision: 3 });
  });

  it("tells clients when an identical retry is allowed", async () => {
    stubDatabase(rejection("IN_FLIGHT", { retryAfterMs: 1000 }));
    const response = await POST(post(JSON.stringify(fresh())));
    expect(response.status).toBe(409);
    expect(response.headers.get("retry-after")).toBe("1");
  });

  it("maps a rejected JWT to AUTH_EXPIRED and other failures to INTERNAL_ERROR", async () => {
    stubDatabase({ code: "PGRST303", message: "JWT expired" }, 401);
    const expired = await POST(post(JSON.stringify(fresh())));
    expect(expired.status).toBe(401);
    expect((await expired.json()).code).toBe("AUTH_EXPIRED");

    stubDatabase({ code: "XX000", message: "secret detail" }, 500);
    const failed = await POST(post(JSON.stringify(fresh())));
    expect(failed.status).toBe(500);
    const body = await failed.json();
    expect(body).toMatchObject({ code: "INTERNAL_ERROR", commandId: command.commandId });
    expect(body.message).not.toContain("secret detail");
  });

  it("does not report success for a response that violates the contract", async () => {
    stubDatabase({ ...acknowledgement, matchId: "other" });
    const response = await POST(post(JSON.stringify(fresh())));
    expect(response.status).toBe(500);
    expect((await response.json()).code).toBe("INTERNAL_ERROR");
  });

  it("serves snapshots and session replacement through their RPCs", async () => {
    const params = Promise.resolve({ matchId: "match-a" });
    const headers = { authorization: "Bearer user-jwt" };

    let database = stubDatabase(snapshot);
    const read = await GET(
      new Request("https://padelaso.test/api/native/v1/matches/match-a/snapshot", { headers }),
      { params }
    );
    expect(await read.json()).toEqual(snapshot);
    expect(String(database.mock.calls[0][0])).toContain("/rpc/native_match_snapshot");

    database = stubDatabase(snapshot);
    const replaced = await replaceSession(
      new Request("https://padelaso.test/api/native/v1/matches/match-a/session", {
        method: "POST",
        headers,
      }),
      { params }
    );
    expect(replaced.status).toBe(200);
    expect(String(database.mock.calls[0][0])).toContain("/rpc/native_replace_scoring_session");
  });
});
