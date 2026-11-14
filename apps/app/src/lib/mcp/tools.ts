import * as Sentry from "@sentry/nextjs";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  getMemberGroup,
  listAllGroupMatches,
  listGroupMatchesPage,
  listGroupPlayers,
  listMemberGroups,
  type PlayerSummary,
} from "@padelaso/data/queries";
import { getSetWins } from "@padelaso/domain/matches";
import {
  calculatePlayerStats,
  getMinimumMatchesForRanking,
  getPartnerStats,
  getRankedPlayerStats,
  getRecentForm,
} from "@padelaso/domain/stats";
import type { Match } from "@padelaso/domain/types";
import { createUserSupabaseClient } from "@/lib/supabase-user";
import { mcpUserFrom } from "./auth";

/** Every tool only reads the caller's own groups, so all share these hints. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const MAX_PARTNERS = 5;

/** An expected failure the model can act on; its message is shown as-is. */
class ToolInputError extends Error {}

interface Caller {
  client: SupabaseClient;
  userId: string;
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
function run<A, R extends Record<string, unknown>>(name: string, body: (caller: Caller, args: A) => Promise<R>) {
  return async (args: A, ctx: ServerContext): Promise<CallToolResult> => {
    try {
      const { userId, token } = mcpUserFrom(ctx.http?.authInfo);
      const result = await body({ client: createUserSupabaseClient(token), userId }, args);
      return { structuredContent: result, content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (error) {
      if (error instanceof ToolInputError) return errorResult(error.message);
      Sentry.captureException(error, { tags: { operation: "mcp-tool", tool: name } });
      return errorResult("Padelaso data is temporarily unavailable. Try again shortly.");
    }
  };
}

export function registerReadTools(server: McpServer) {
  server.registerTool("list_groups", {
    title: "List groups",
    description: "List the Padelaso groups you belong to. Call this first: every other tool needs a group ID.",
    inputSchema: z.object({}),
    outputSchema: outputs.list_groups,
    annotations: READ_ONLY,
  }, run("list_groups", (caller) => listGroups(caller)));

  server.registerTool("list_players", {
    title: "List players",
    description: "List a group's players, or find them by name to get their IDs. isYou marks the signed-in user's player.",
    inputSchema: z.object({
      group_id: groupId,
      name: z.string().trim().min(1).max(100).optional()
        .describe("Part of a player's name. Case and accents are ignored."),
    }),
    outputSchema: outputs.list_players,
    annotations: READ_ONLY,
  }, run("list_players", listPlayers));

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
  }, run("list_matches", listMatches));

  server.registerTool("get_player_stats", {
    title: "Get player stats",
    description: "A player's all-time stats in a group: record, win rate, streaks, recent form, group ranking and most frequent partners. Uses Padelaso's own scoring rules.",
    inputSchema: z.object({ group_id: groupId, player_id: playerId }),
    outputSchema: outputs.get_player_stats,
    annotations: READ_ONLY,
  }, run("get_player_stats", getPlayerStats));
}

export const READ_TOOL_NAMES = ["list_groups", "list_players", "list_matches", "get_player_stats"] as const;
