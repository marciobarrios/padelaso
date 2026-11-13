import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listMcpGroups, listMcpPlayers, listMcpMatches } from "@padelaso/data/queries";
import { calculatePlayerStats } from "@padelaso/domain/stats";
import { executeNativeCommand } from "@padelaso/data/native";
import type { NativeSnapshot } from "@padelaso/data/contracts";
import { POST as postEvent } from "./events/route";
import { POST as postCommand } from "./native/v1/commands/route";
import { POST as replaceSession } from "./native/v1/matches/[matchId]/session/route";
import { GET as getSnapshot } from "./native/v1/matches/[matchId]/snapshot/route";
import { POST as postScore } from "./score/route";
import { GET as getOptions } from "./shortcut/options/route";

const ORIGIN = "https://padelaso.test";
const PASSWORD = "integration-test-password";
const run = randomUUID().slice(0, 8);

let admin: SupabaseClient;
let groupId: string;
let ana: string;
let pablo: string;
let outsiderPlayer: string;
const createdUsers: string[] = [];

interface TestUser {
  id: string;
  jwt: string;
  client: SupabaseClient;
}
let member: TestUser;
let outsider: TestUser;
const scoreToken = `integration-${run}`;

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

function publicClient(jwt?: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined,
    }
  );
}

async function createUser(name: string): Promise<TestUser> {
  const email = `${name}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  createdUsers.push(data.user.id);
  const session = await publicClient().auth.signInWithPassword({ email, password: PASSWORD });
  if (session.error) throw session.error;
  const jwt = session.data.session.access_token;
  return { id: data.user.id, jwt, client: publicClient(jwt) };
}

async function join(user: TestUser) {
  must(await admin.from("group_members").insert({ group_id: groupId, user_id: user.id, role: "member" }));
}

async function newMatch(sets: unknown = [{ team1Score: 0, team2Score: 0 }]): Promise<string> {
  const row = must(
    await admin
      .from("matches")
      .insert({ team1: [ana], team2: [pablo], sets, group_id: groupId, created_by: member.id })
      .select("id")
      .single()
  ) as { id: string };
  return row.id;
}

async function matchSets(matchId: string) {
  const row = must(
    await admin.from("matches").select("sets").eq("id", matchId).single()
  ) as { sets: { team1Score: number; team2Score: number }[] };
  return row.sets;
}

async function eventCount(matchId: string) {
  const { count, error } = await admin
    .from("match_events")
    .select("id", { count: "exact", head: true })
    .eq("match_id", matchId);
  if (error) throw error;
  return count;
}

function send(body: unknown, jwt: string | null = member.jwt) {
  return postCommand(
    new Request(`${ORIGIN}/api/native/v1/commands`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: jwt ? { authorization: `Bearer ${jwt}` } : {},
    })
  );
}

async function snapshot(matchId: string, jwt = member.jwt): Promise<NativeSnapshot> {
  const response = await getSnapshot(
    new Request(`${ORIGIN}/api/native/v1/matches/${matchId}/snapshot`, {
      headers: { authorization: `Bearer ${jwt}` },
    }),
    { params: Promise.resolve({ matchId }) }
  );
  expect(response.status).toBe(200);
  return (await response.json()) as NativeSnapshot;
}

function command(state: NativeSnapshot, sequence: number, fields: Record<string, unknown>) {
  const now = Date.now();
  return {
    version: 1,
    matchId: state.matchId,
    sessionId: state.sessionId,
    commandId: randomUUID(),
    clientId: "integration-watch",
    sequence,
    expectedRevision: state.revision,
    createdAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    ...fields,
  };
}

const tap = (state: NativeSnapshot, sequence: number, team: 1 | 2 = 1) =>
  command(state, sequence, { kind: "score.delta", setId: state.activeSetId, team, delta: 1 });

function shortcut(path: string, body?: unknown, token: string | null = scoreToken, raw?: string) {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: body === undefined && raw === undefined ? "GET" : "POST",
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function pointToken(matchId: string | null) {
  must(await admin.from("score_tokens").update({ current_match_id: matchId }).eq("token", scoreToken));
}

function signedJwt(user: TestUser, expiresInSeconds: number) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    role: "authenticated",
    sub: user.id,
    iat: now - 7200,
    exp: now + expiresInSeconds,
  })}`;
  const signature = createHmac("sha256", process.env.SUPABASE_JWT_SECRET!)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

beforeAll(async () => {
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  member = await createUser("member");
  outsider = await createUser("outsider");

  const group = must(
    await admin
      .from("groups")
      .insert({ name: `Integration ${run}`, emoji: "P", invite_code: run, created_by: member.id })
      .select("id")
      .single()
  ) as { id: string };
  groupId = group.id;
  await join(member);

  const players = must(
    await admin
      .from("players")
      .insert([
        { name: "Ana", emoji: "A", group_id: groupId },
        { name: "Pablo", emoji: "P", group_id: groupId },
        { name: "Fuera", emoji: "F", group_id: groupId },
      ])
      .select("id, name")
  ) as { id: string; name: string }[];
  const idOf = (name: string) => players.find((player) => player.name === name)!.id;
  ana = idOf("Ana");
  pablo = idOf("Pablo");
  outsiderPlayer = idOf("Fuera");

  must(await admin.from("score_tokens").insert({ token: scoreToken, created_by: member.id }));
});

afterAll(async () => {
  if (!admin) return;
  if (groupId) {
    await admin.from("matches").delete().eq("group_id", groupId);
    await admin.from("players").delete().eq("group_id", groupId);
    await admin.from("groups").delete().eq("id", groupId);
  }
  for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
});

describe("native routes on the real stack", () => {
  it("returns a contract-valid snapshot with stable identities", async () => {
    const matchId = await newMatch([
      { team1Score: 6, team2Score: 4 },
      { team1Score: 1, team2Score: 2 },
    ]);
    const first = await snapshot(matchId);
    expect(first).toMatchObject({ matchId, groupId, revision: 0, team1: [ana], team2: [pablo] });
    expect(first.sets).toHaveLength(2);
    expect(first.activeSetId).toBe(first.sets[1].id);
    expect((await snapshot(matchId)).sets.map((set) => set.id)).toEqual(first.sets.map((set) => set.id));
  });

  it("replays a retry after a lost response, with one mutation", async () => {
    const matchId = await newMatch();
    const body = tap(await snapshot(matchId), 1);

    const applied = await send(body);
    expect(applied.status).toBe(200);
    const acknowledgement = await applied.json();
    expect(acknowledgement).toMatchObject({ status: "applied", appliedRevision: 1, commandId: body.commandId });

    // The client never saw the first response and retries the identical command.
    const retried = await send(body);
    expect(retried.status).toBe(200);
    expect(await retried.json()).toMatchObject({ status: "replayed", appliedRevision: 1 });
    expect(await matchSets(matchId)).toEqual([{ team1Score: 1, team2Score: 0 }]);
  });

  it("applies once when one command arrives concurrently through several paths", async () => {
    const matchId = await newMatch();
    const state = await snapshot(matchId);
    const body = command(state, 1, {
      kind: "event.create",
      eventId: randomUUID(),
      playerId: ana,
      type: "ace",
    });

    const results = await Promise.all([
      ...Array.from({ length: 4 }, async () => (await send(body)).json()),
      executeNativeCommand(member.client, body).then((result) => {
        if (!result.ok) throw new Error(result.error.code);
        return result.data;
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "applied",
      "replayed",
      "replayed",
      "replayed",
      "replayed",
    ]);
    expect(await eventCount(matchId)).toBe(1);
  });

  it("keeps distinct taps distinct and rejects a tap based on an old revision", async () => {
    const matchId = await newMatch();
    const state = await snapshot(matchId);
    expect((await send(tap(state, 1))).status).toBe(200);
    expect((await send(tap(await snapshot(matchId), 2))).status).toBe(200);
    expect(await matchSets(matchId)).toEqual([{ team1Score: 2, team2Score: 0 }]);

    const stale = await send(tap(state, 3));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "STALE_REVISION", canonicalRevision: 2 });
    expect(await matchSets(matchId)).toEqual([{ team1Score: 2, team2Score: 0 }]);
  });

  it("cannot score the wrong set after a new set or a correction", async () => {
    const matchId = await newMatch();
    const before = await snapshot(matchId);
    const oldSetId = before.activeSetId!;
    const newSetId = `set-${randomUUID()}`;
    expect(
      (await send(command(before, 1, { kind: "set.create", afterSetId: oldSetId, setId: newSetId }))).status
    ).toBe(200);

    const after = await snapshot(matchId);
    expect(after.activeSetId).toBe(newSetId);
    const wrongSet = await send(
      command(after, 2, { kind: "score.delta", setId: oldSetId, team: 1, delta: 1 })
    );
    expect(wrongSet.status).toBe(409);
    expect((await wrongSet.json()).code).toBe("STALE_SET");

    const corrected = await send(
      command(after, 2, { kind: "score.correct", setId: oldSetId, score: { team1Score: 6, team2Score: 3 } })
    );
    expect(corrected.status).toBe(200);
    expect(await matchSets(matchId)).toEqual([
      { team1Score: 6, team2Score: 3 },
      { team1Score: 0, team2Score: 0 },
    ]);
  });

  it("creates and undoes one exact event", async () => {
    const matchId = await newMatch();
    const eventId = randomUUID();
    const state = await snapshot(matchId);
    expect(
      (await send(command(state, 1, { kind: "event.create", eventId, playerId: pablo, type: "ace" }))).status
    ).toBe(200);
    const created = await snapshot(matchId);
    expect(created.events.map((event) => event.id)).toEqual([eventId]);

    const outside = await send(
      command(created, 2, { kind: "event.create", eventId: randomUUID(), playerId: outsiderPlayer, type: "ace" })
    );
    expect((await outside.json()).code).toBe("INVALID_REQUEST");

    expect((await send(command(created, 2, { kind: "event.undo", eventId }))).status).toBe(200);
    expect(await eventCount(matchId)).toBe(0);
  });

  it("rejects the same ID with a different payload", async () => {
    const matchId = await newMatch();
    const state = await snapshot(matchId);
    const body = tap(state, 1);
    expect((await send(body)).status).toBe(200);
    const reused = await send({ ...tap(await snapshot(matchId), 2, 2), commandId: body.commandId });
    expect(reused.status).toBe(409);
    expect((await reused.json()).code).toBe("COMMAND_ID_REUSED");
    expect(await matchSets(matchId)).toEqual([{ team1Score: 1, team2Score: 0 }]);
  });

  it("never lets a queued action follow a repointed token to another match", async () => {
    const matchA = await newMatch();
    const matchB = await newMatch();
    await pointToken(matchA);
    const queued = tap(await snapshot(matchA), 1);

    await pointToken(matchB);
    expect((await send(queued)).status).toBe(200);
    expect(await matchSets(matchA)).toEqual([{ team1Score: 1, team2Score: 0 }]);
    expect(await matchSets(matchB)).toEqual([{ team1Score: 0, team2Score: 0 }]);

    // A's session cannot be pointed at B by rewriting the match ID either.
    const stateB = await snapshot(matchB);
    const crossed = await send({ ...tap(stateB, 2), sessionId: queued.sessionId });
    expect(crossed.status).toBe(409);
    expect((await crossed.json()).code).toBe("STALE_SESSION");
    expect(await matchSets(matchB)).toEqual([{ team1Score: 0, team2Score: 0 }]);
  });

  it("makes queued commands stale when a Shortcut write or session change lands first", async () => {
    const matchId = await newMatch();
    await pointToken(matchId);
    const queued = tap(await snapshot(matchId), 1);

    expect((await postScore(shortcut("/api/score", { team: 2 }))).status).toBe(200);
    const stale = await send(queued);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: "STALE_REVISION", canonicalRevision: 1 });

    const beforeReplacement = tap(await snapshot(matchId), 2);
    const replaced = await replaceSession(
      new Request(`${ORIGIN}/api/native/v1/matches/${matchId}/session`, {
        method: "POST",
        headers: { authorization: `Bearer ${member.jwt}` },
      }),
      { params: Promise.resolve({ matchId }) }
    );
    expect(replaced.status).toBe(200);
    const afterReplacement = await send(beforeReplacement);
    expect(afterReplacement.status).toBe(409);
    expect((await afterReplacement.json()).code).toBe("STALE_SESSION");
    expect(await matchSets(matchId)).toEqual([{ team1Score: 0, team2Score: 1 }]);
  });

  it("rejects unauthorized users and credentials before anything changes", async () => {
    const matchId = await newMatch();
    const state = await snapshot(matchId);

    const forbidden = await send(tap(state, 1), outsider.jwt);
    expect(forbidden.status).toBe(403);
    expect((await forbidden.json()).code).toBe("FORBIDDEN");

    for (const credential of [
      null,
      "not-a-jwt",
      scoreToken,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      `${member.jwt}tampered`,
    ]) {
      const response = await send(tap(state, 1), credential);
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe("AUTH_EXPIRED");
    }
    expect(await matchSets(matchId)).toEqual([{ team1Score: 0, team2Score: 0 }]);
  });

  it("distinguishes an expired JWT from a valid one signed the same way", async () => {
    const matchId = await newMatch();
    const state = await snapshot(matchId);

    const expired = await send(tap(state, 1), signedJwt(member, -60));
    expect(expired.status).toBe(401);
    expect((await expired.json()).code).toBe("AUTH_EXPIRED");
    expect(await matchSets(matchId)).toEqual([{ team1Score: 0, team2Score: 0 }]);

    expect((await send(tap(state, 1), signedJwt(member, 600))).status).toBe(200);
  });

  it("checks membership again at mutation time, including on replay", async () => {
    const removed = await createUser("removed");
    await join(removed);
    const matchId = await newMatch();
    const body = tap(await snapshot(matchId, removed.jwt), 1);
    expect((await send(body, removed.jwt)).status).toBe(200);

    must(await admin.from("group_members").delete().eq("user_id", removed.id));
    const replay = await send(body, removed.jwt);
    expect(replay.status).toBe(403);
    expect((await replay.json()).code).toBe("FORBIDDEN");
  });

  it("rejects a still-valid JWT once its account is deleted", async () => {
    const deleted = await createUser("deleted");
    await join(deleted);
    const matchId = await newMatch();
    const state = await snapshot(matchId, deleted.jwt);

    const { error } = await admin.auth.admin.deleteUser(deleted.id);
    if (error) throw error;
    const response = await send(tap(state, 1), deleted.jwt);
    expect(response.status).toBe(403);
    expect(await matchSets(matchId)).toEqual([{ team1Score: 0, team2Score: 0 }]);
  });
});

describe("existing Shortcut routes keep their contract", () => {
  it("scores the token's current match", async () => {
    const matchId = await newMatch([{ team1Score: 6, team2Score: 4 }, { team1Score: 2, team2Score: 3 }]);
    await pointToken(matchId);
    const response = await postScore(shortcut("/api/score", { team: 1 }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      match: { id: matchId },
      sets: [{ team1Score: 6, team2Score: 4 }, { team1Score: 3, team2Score: 3 }],
      score: "3-3",
      setsSpoken: "6-4, 3-3",
      spoken: "3-3",
    });
  });

  it("starts a new set and accepts the token in the query string", async () => {
    const matchId = await newMatch();
    await pointToken(matchId);
    const response = await postScore(
      shortcut(`/api/score?token=${scoreToken}`, { team: 2, newSet: true }, null)
    );
    expect((await response.json()).sets).toEqual([
      { team1Score: 0, team2Score: 0 },
      { team1Score: 0, team2Score: 1 },
    ]);
  });

  it("returns its existing score errors", async () => {
    await pointToken(await newMatch());
    const cases: [NextRequest, number, string][] = [
      [shortcut("/api/score", undefined, scoreToken, "{not json"), 400, "No pude leer los datos enviados por el atajo."],
      [shortcut("/api/score", { team: 3 }), 400, "El equipo no es válido. Revisa el cuerpo del atajo."],
      [shortcut("/api/score", { team: 1, delta: 11 }), 400, "El cambio de puntuación no es válido."],
      [shortcut("/api/score", { team: 1 }, "wrong-token"), 401, "Token inválido."],
      [shortcut("/api/score", { team: 1 }, null), 401, "Token inválido."],
    ];
    for (const [request, status, spoken] of cases) {
      const response = await postScore(request);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ ok: false, spoken });
    }
  });

  it("reports no active match and the rate limit", async () => {
    await pointToken(null);
    const dormant = await postScore(shortcut("/api/score", { team: 1 }));
    expect(dormant.status).toBe(409);
    expect(await dormant.json()).toMatchObject({ ok: false, spoken: "No hay ningún partido activo." });

    await pointToken(await newMatch());
    must(
      await admin
        .from("score_tokens")
        .update({ rate_window_started_at: new Date().toISOString(), rate_request_count: 120 })
        .eq("token", scoreToken)
    );
    const limited = await postScore(shortcut("/api/score", { team: 1 }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    must(
      await admin
        .from("score_tokens")
        .update({ rate_window_started_at: null, rate_request_count: 0 })
        .eq("token", scoreToken)
    );
  });

  it("serves picker options and resolves their labels into an event", async () => {
    const matchId = await newMatch();
    await pointToken(matchId);
    const options = await getOptions(shortcut("/api/shortcut/options"));
    expect(options.status).toBe(200);
    const body = await options.json();
    expect(body).toMatchObject({ ok: true, match: { id: matchId } });
    expect(body.playerOptions).toEqual(["A Ana", "P Pablo"]);
    expect(body.eventOptions.length).toBeGreaterThan(0);

    const eventOption = body.eventOptions[0] as string;
    const created = await postEvent(
      shortcut("/api/events", { eventOption, playerOption: "A Ana" })
    );
    expect(created.status).toBe(200);
    expect(await created.json()).toMatchObject({
      ok: true,
      match: { id: matchId },
      type: body.events[eventOption],
      playerId: ana,
      playerName: "Ana",
    });
    expect(await eventCount(matchId)).toBe(1);
  });

  it("creates an event from explicit IDs and keeps doing so on every request", async () => {
    const matchId = await newMatch();
    await pointToken(matchId);
    const event = { playerId: pablo, type: "ace" };
    for (const expected of [1, 2]) {
      const response = await postEvent(shortcut("/api/events", event));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, playerId: pablo, type: "ace", playerName: "Pablo" });
      expect(await eventCount(matchId)).toBe(expected);
    }
  });

  it("returns its existing event errors", async () => {
    const matchId = await newMatch();
    await pointToken(matchId);
    const cases: [NextRequest, number, string][] = [
      [shortcut("/api/events", undefined, scoreToken, "{not json"), 400, "Cuerpo de la petición no válido."],
      [shortcut("/api/events", {}), 400, "Faltan datos del evento."],
      [shortcut("/api/events", { playerId: pablo, type: "nope" }), 400, "Tipo de evento desconocido."],
      [shortcut("/api/events", { playerId: outsiderPlayer, type: "ace" }), 400, "El jugador no está en este partido."],
      [shortcut("/api/events", { eventOption: "nope", playerOption: "A Ana" }), 400, "Tipo de evento desconocido."],
    ];
    for (const [request, status, spoken] of cases) {
      const response = await postEvent(request);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ ok: false, spoken });
    }
    expect(await eventCount(matchId)).toBe(0);
  });
});


describe("MCP read projections on the real stack", () => {
  it("lists membership-scoped groups and hides other groups through RLS", async () => {
    expect((await listMcpGroups(member.client)).some((group) => group.id === groupId)).toBe(true);
    expect((await listMcpGroups(outsider.client)).some((group) => group.id === groupId)).toBe(false);
    expect(await listMcpPlayers(outsider.client, groupId)).toEqual([]);
    expect(await listMcpMatches(outsider.client, groupId)).toEqual([]);
  });

  it("resolves literal names, returns compact data, and computes shared stats", async () => {
    const players = await listMcpPlayers(member.client, groupId, "aNA");
    expect(players).toEqual([{ id: ana, name: "Ana", emoji: "A" }]);
    expect(await listMcpPlayers(member.client, groupId, "%")).toEqual([]);
    const matchId = await newMatch([{ team1Score: 6, team2Score: 2 }]);
    const matches = await listMcpMatches(member.client, groupId);
    const match = matches.find((entry) => entry.id === matchId)!;
    expect(calculatePlayerStats(ana, [match])).toMatchObject({ matches: 1, wins: 1, losses: 0, winRate: 1 });
  });
});
