import { toolAudit } from "./audit";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  createMatchRecord,
  getMemberGroup,
  listAllGroupMatches,
  listGroupMatchesPage,
  listGroupPlayers,
  listMemberGroups,
  type CreateMatchResult,
  type PlayerSummary,
} from "@padelaso/data/queries";
import { EVENT_CONFIGS, getEventConfig } from "@padelaso/domain/events";
import {
  getSetWins,
  MAX_RECORDED_EVENTS,
  MAX_RECORDED_SETS,
  MAX_SET_SCORE,
  validateMatchDraft,
} from "@padelaso/domain/matches";
import {
  calculatePlayerStats,
  getMinimumMatchesForRanking,
  getPartnerStats,
  getRankedPlayerStats,
  getRecentForm,
} from "@padelaso/domain/stats";
import type { Match, MatchEventType } from "@padelaso/domain/types";
import { createUserSupabaseClient } from "@/lib/supabase-user";
import { mcpUserFrom } from "./auth";

/** Read tools only read the caller's own groups, so all share these hints. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Adds a match and never changes or removes existing data. Not idempotent: an
 * identical call after the duplicate window records a second match. Clients
 * ask the user to confirm non-read-only tools.
 */
const RECORDS_MATCH = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const MAX_PARTNERS = 5;

/** An expected failure the model can act on; its message is shown as-is. */
class ToolInputError extends Error {}

interface Caller {
  client: SupabaseClient;
  userId: string;
  /** Origin of the product app, for links. */
  appOrigin: string;
}

// ---------- Schemas ----------

const groupId = z.uuid().describe("Group ID from list_groups.");
const playerId = z.uuid().describe("Player ID from list_players.");

const group = z.object({ id: z.string(), name: z.string(), emoji: z.string() });
const player = z.object({
  id: z.string(),
  name: z.string(),
  emoji: z.string(),
  isYou: z.boolean().describe("True for the player linked to the signed-in user."),
});
const teamMember = z.object({
  id: z.string(),
  name: z.string().nullable().describe("Null when the player was deleted."),
});
const team = z.object({ players: z.array(teamMember), setsWon: z.number() });
const match = z.object({
  id: z.string(),
  date: z.string().describe("ISO 8601 date and time the match was played."),
  court: z.number().nullable(),
  team1: team,
  team2: team,
  sets: z.array(z.object({ team1: z.number(), team2: z.number() })),
  winner: z.enum(["team1", "team2"]).nullable().describe("Null for ties and unfinished matches."),
});

const score = z.number().int().min(0).max(MAX_SET_SCORE);
const recordableEvents = EVENT_CONFIGS.map((e) => `${e.type} (${e.label})`).join(", ");
const savedEvent = z.object({
  player: teamMember,
  type: z.string(),
  label: z.string().describe("Display name of the event in Padelaso."),
});

const outputs = {
  list_groups: z.object({ groups: z.array(group) }),
  list_players: z.object({ group, players: z.array(player) }),
  list_matches: z.object({
    group,
    matches: z.array(match),
    nextOffset: z.number().nullable().describe("Pass as offset to get older matches; null when there are none."),
  }),
  get_player_stats: z.object({
    group,
    player,
    matches: z.number(),
    wins: z.number(),
    losses: z.number(),
    undecided: z.number().describe("Ties and unfinished matches, counted in matches but not in wins or losses."),
    winRate: z.number().describe("wins / matches, from 0 to 1."),
    currentStreak: z.number().describe("Positive for consecutive wins, negative for consecutive losses."),
    bestStreak: z.number(),
    recentForm: z.array(z.enum(["W", "L"])).describe("Last decided results among the five most recent matches, oldest first."),
    ranking: z.object({
      position: z.number().nullable().describe("1-based group ranking position; null without matches."),
      rankedPlayers: z.number(),
      provisional: z.boolean().describe("True until the player reaches minimumMatches; provisional players rank last."),
      minimumMatches: z.number(),
    }),
    partners: z.array(z.object({
      id: z.string(),
      name: z.string().nullable(),
      matches: z.number(),
      wins: z.number(),
      winRate: z.number(),
    })).describe(`Most frequent partners, up to ${MAX_PARTNERS}.`),
  }),
  create_match: z.object({
    status: z.enum(["created", "replayed", "duplicate"]).describe(
      "created: saved now. replayed: this idempotency_key had already saved this match. " +
      "duplicate: an identical match was recorded minutes ago, so no new one was created."),
    message: z.string().describe("What happened, to tell the user."),
    group,
    match,
    events: z.array(savedEvent),
    url: z.string().describe("Link to the match in Padelaso."),
  }),
};

// ---------- Projections ----------

const round = (value: number) => Math.round(value * 1000) / 1000;

function toPlayer(p: PlayerSummary, userId: string): z.infer<typeof player> {
  return { id: p.id, name: p.name, emoji: p.emoji, isYou: p.userId === userId };
}

function toMatch(m: Match, names: Map<string, string>): z.infer<typeof match> {
  const { team1Wins, team2Wins } = getSetWins(m.sets);
  const members = (ids: string[]) => ids.map((id) => ({ id, name: names.get(id) ?? null }));
  return {
    id: m.id,
    date: new Date(m.date).toISOString(),
    court: m.courtNumber ?? null,
    team1: { players: members(m.team1), setsWon: team1Wins },
    team2: { players: members(m.team2), setsWon: team2Wins },
    sets: m.sets.map((s) => ({ team1: s.team1Score, team2: s.team2Score })),
    winner: team1Wins === team2Wins ? null : team1Wins > team2Wins ? "team1" : "team2",
  };
}

/** Accent- and case-insensitive, so "jose" finds "José". */
const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es");

// ---------- Tool bodies ----------

async function requireGroup(caller: Caller, id: string) {
  const found = await getMemberGroup(caller.client, id);
  // RLS hides groups the caller is not in, so "missing" and "forbidden" look the same.
  if (!found) throw new ToolInputError("Group not found. Use list_groups to see your groups.");
  return found;
}

function requirePlayer(players: PlayerSummary[], id: string) {
  const found = players.find((p) => p.id === id);
  if (!found) throw new ToolInputError("Player not found in this group. Use list_players to find player IDs.");
  return found;
}

type Rejection = Extract<CreateMatchResult, { status: "rejected" }>;

/** Guidance for the model, replacing the database's terser messages. */
const REJECTION_HINTS: Partial<Record<Rejection["code"], string>> = {
  GROUP_NOT_FOUND: "Group not found. Use list_groups to see your groups.",
  PLAYER_NOT_IN_GROUP: "Some players are not in this group. Use list_players to find player IDs.",
  INVALID_DATE: "The match date is invalid: it must be within the last year and not in the future. Check the date and time zone with the user.",
  IDEMPOTENCY_KEY_REUSED: "This idempotency_key was already used for a different match. Use a new key for each new match.",
  BUSY: "Padelaso is saving another match for this group. Try again in a moment.",
};

const NOTHING_SAVED = " Nothing was saved.";

function savedMessage(result: Exclude<CreateMatchResult, Rejection>) {
  switch (result.status) {
    case "created":
      return "Match saved.";
    case "replayed":
      return "This match was already saved by an earlier call with the same idempotency_key. No new match was created.";
    case "duplicate": {
      const minutes = Math.max(1, Math.round((Date.now() - Date.parse(result.match.createdAt)) / 60_000));
      return `An identical match (same group, teams and score) was recorded ${minutes} min ago, so no new match was created. ` +
        "This is usually a retry. If the user confirms it was a separate match with the same result, record it again in 15 minutes.";
    }
  }
}

async function createMatch(caller: Caller, args: {
  group_id: string;
  team1: string[];
  team2: string[];
  sets: { team1: number; team2: number }[];
  played_at?: string;
  court?: number;
  events?: { player_id: string; type: MatchEventType }[];
  idempotency_key?: string;
}) {
  const [found, players] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
  ]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const sets = args.sets.map((s) => ({ team1Score: s.team1, team2Score: s.team2 }));
  const events = (args.events ?? []).map((e) => ({ playerId: e.player_id, type: e.type }));

  // Checked here for clear messages; create_match checks everything again.
  const issue = validateMatchDraft({ team1: args.team1, team2: args.team2, sets, events });
  if (issue) throw new ToolInputError(issue.message + NOTHING_SAVED);
  const unknown = [...args.team1, ...args.team2].filter((id) => !names.has(id));
  if (unknown.length > 0) {
    throw new ToolInputError(
      `These IDs are not players of ${found.name}: ${unknown.join(", ")}. Use list_players to find player IDs, ` +
      "and ask the user when a name matches several players or none." + NOTHING_SAVED);
  }

  const result = await createMatchRecord(caller.client, {
    groupId: found.id,
    team1: args.team1,
    team2: args.team2,
    sets,
    date: args.played_at ? new Date(args.played_at).toISOString() : undefined,
    courtNumber: args.court,
    events,
    idempotencyKey: args.idempotency_key,
  });
  if (result.status === "rejected") {
    // The token was verified moments ago, so this is a server fault, not bad input.
    if (result.code === "AUTH_REQUIRED") throw new Error("create_match saw no user");
    throw new ToolInputError((REJECTION_HINTS[result.code] ?? result.message) + NOTHING_SAVED);
  }

  const saved = result.match;
  return {
    status: result.status,
    message: savedMessage(result),
    group: found,
    match: toMatch(saved, names),
    events: result.events.map((e) => ({
      player: { id: e.playerId, name: names.get(e.playerId) ?? null },
      type: e.type,
      label: getEventConfig(e.type as MatchEventType).label,
    })),
    url: `${caller.appOrigin}/matches/${saved.id}`,
  };
}

async function listGroups(caller: Caller) {
  return { groups: await listMemberGroups(caller.client) };
}

async function listPlayers(caller: Caller, args: { group_id: string; name?: string }) {
  const [found, players] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
  ]);
  const needle = args.name ? fold(args.name) : "";
  return {
    group: found,
    players: players.filter((p) => fold(p.name).includes(needle)).map((p) => toPlayer(p, caller.userId)),
  };
}

async function listMatches(caller: Caller,
  args: { group_id: string; player_id?: string; limit: number; offset: number }) {
  const [found, players, page] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
    listGroupMatchesPage(caller.client, args.group_id, {
      playerId: args.player_id, limit: args.limit, offset: args.offset,
    }),
  ]);
  if (args.player_id) requirePlayer(players, args.player_id);
  const names = new Map(players.map((p) => [p.id, p.name]));
  return {
    group: found,
    matches: page.matches.map((m) => toMatch(m, names)),
    nextOffset: page.hasMore ? args.offset + args.limit : null,
  };
}

async function getPlayerStats(caller: Caller, args: { group_id: string; player_id: string }) {
  const [found, players, matches] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
    listAllGroupMatches(caller.client, args.group_id),
  ]);
  const subject = requirePlayer(players, args.player_id);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const stats = calculatePlayerStats(subject.id, matches);

  // Same all-time ranking as the stats page: active players with matches.
  const minimumMatches = getMinimumMatchesForRanking(matches.length);
  const ranked = getRankedPlayerStats(
    players.map((p) => calculatePlayerStats(p.id, matches)).filter((s) => s.matches > 0),
    minimumMatches,
  );
  const index = ranked.findIndex((s) => s.playerId === subject.id);

  return {
    group: found,
    player: toPlayer(subject, caller.userId),
    matches: stats.matches,
    wins: stats.wins,
    losses: stats.losses,
    undecided: stats.matches - stats.wins - stats.losses,
    winRate: round(stats.winRate),
    currentStreak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    recentForm: getRecentForm(subject.id, matches),
    ranking: {
      position: index === -1 ? null : index + 1,
      rankedPlayers: ranked.length,
      provisional: stats.matches < minimumMatches,
      minimumMatches,
    },
    partners: getPartnerStats(subject.id, matches).slice(0, MAX_PARTNERS).map((p) => ({
      id: p.partnerId,
      name: names.get(p.partnerId) ?? null,
      matches: p.matches,
      wins: p.wins,
      winRate: round(p.winRate),
    })),
  };
}

// ---------- Registration ----------

function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/** Runs a tool as the verified caller and converts failures into safe results. */
function run<A, R extends Record<string, unknown>>(body: (caller: Caller, args: A) => Promise<R>) {
  return async (args: A, ctx: ServerContext): Promise<CallToolResult> => {
    try {
      const { userId, token, appOrigin } = mcpUserFrom(ctx.http?.authInfo);
      const result = await body({ client: createUserSupabaseClient(token), userId, appOrigin }, args);
      return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      const audit = toolAudit.getStore();
      if (error instanceof ToolInputError) {
        if (audit) audit.outcome = "denied";
        return errorResult(error.message);
      }
      if (audit) audit.outcome = "error";
      return errorResult("Padelaso data is temporarily unavailable. Try again shortly.");
    }
  };
}

export function registerTools(server: McpServer) {
  server.registerTool("list_groups", {
    title: "List groups",
    description: "List the Padelaso groups you belong to. Call this first: every other tool needs a group ID.",
    inputSchema: z.object({}),
    outputSchema: outputs.list_groups,
    annotations: READ_ONLY,
  }, run((caller) => listGroups(caller)));

  server.registerTool("list_players", {
    title: "List players",
    description: "List a group's players, or find them by name to get their IDs. isYou marks the signed-in user's player. " +
      "When a name matches several players or none, show the candidates and ask the user; never guess.",
    inputSchema: z.object({
      group_id: groupId,
      name: z.string().trim().min(1).max(100).optional()
        .describe("Part of a player's name. Case and accents are ignored."),
    }),
    outputSchema: outputs.list_players,
    annotations: READ_ONLY,
  }, run(listPlayers));

  server.registerTool("list_matches", {
    title: "List matches",
    description: "List a group's match history, newest first, with teams, set scores and winner. Optionally only one player's matches.",
    inputSchema: z.object({
      group_id: groupId,
      player_id: playerId.optional().describe("Only matches this player played."),
      limit: z.number().int().min(1).max(50).default(10),
      offset: z.number().int().min(0).max(10_000).default(0).describe("nextOffset from the previous page."),
    }),
    outputSchema: outputs.list_matches,
    annotations: READ_ONLY,
  }, run(listMatches));

  server.registerTool("get_player_stats", {
    title: "Get player stats",
    description: "A player's all-time stats in a group: record, win rate, streaks, recent form, group ranking and most frequent partners. Uses Padelaso's own scoring rules.",
    inputSchema: z.object({ group_id: groupId, player_id: playerId }),
    outputSchema: outputs.get_player_stats,
    annotations: READ_ONLY,
  }, run(getPlayerStats));

  server.registerTool("create_match", {
    title: "Record match",
    description:
      "Record a finished match in a group: both teams, the games of every set and optional highlights. " +
      "Before calling: (1) resolve every player with list_players and pass their IDs; when a name matches several " +
      "players or none, show the candidates and ask the user, never guess. (2) Restate the group, both teams, " +
      "every set score and the date to the user, and call only after they confirm. Generate one random UUID as " +
      "idempotency_key per confirmed match and reuse it if you retry. Returns what was saved and a link to the match.",
    inputSchema: z.object({
      group_id: groupId,
      team1: z.array(playerId).length(2).describe("The two players of team 1, as IDs from list_players."),
      team2: z.array(playerId).length(2).describe("The two players of team 2, as IDs from list_players."),
      sets: z.array(z.object({ team1: score, team2: score })).min(1).max(MAX_RECORDED_SETS)
        .describe("Games won by each team in every played set, in order. Example: 6-4, 3-6, 7-5."),
      played_at: z.iso.datetime({ offset: true }).optional().describe(
        "When the match was played, ISO 8601 with a UTC offset, e.g. 2026-11-14T19:00:00+01:00. " +
        "Omit when it was just played: Padelaso uses the current time."),
      court: z.number().int().min(1).max(99).optional().describe("Court number, if the user mentions one."),
      events: z.array(z.object({
        player_id: playerId.describe("One of the four match players."),
        type: z.enum(EVENT_CONFIGS.map((e) => e.type)),
      })).max(MAX_RECORDED_EVENTS).optional()
        .describe(`Optional highlights the user mentions, one entry per occurrence. Types: ${recordableEvents}.`),
      // A UUID, not free text: a key the model builds from player names reads as user
      // data hidden in an identifier, and ChatGPT warns before running the call.
      idempotency_key: z.uuid().optional().describe(
        "A random UUID generated once for each confirmed match. Reuse it only to retry the same call. " +
        "Never put names, scores or other details in it."),
    }),
    outputSchema: outputs.create_match,
    annotations: RECORDS_MATCH,
  }, run(createMatch));
}

export const TOOL_NAMES = ["list_groups", "list_players", "list_matches", "get_player_stats", "create_match"] as const;
