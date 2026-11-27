import { toolAudit } from "./audit";
import type { CallToolResult, McpServer, ServerContext } from "@modelcontextprotocol/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  addMatchEvents,
  createMatchRecord,
  getMatchDetail,
  getMemberGroup,
  listAllGroupMatches,
  listGroupMatchesPage,
  listGroupPlayers,
  listMemberGroups,
  removeMatchEvent,
  updateMatch,
  type AddMatchEventsResult,
  type CreateMatchResult,
  type MatchField,
  type RemoveMatchEventResult,
  type PlayerSummary,
  type UpdateMatchRequest,
  type UpdateMatchResult,
} from "@padelaso/data/queries";
import { EVENT_CONFIGS, getEventConfig } from "@padelaso/domain/events";
import {
  getSetWins,
  MAX_RECORDED_EVENTS,
  MAX_RECORDED_SETS,
  MAX_SET_SCORE,
  validateMatchDraft,
  validateMatchSets,
  validateMatchTeams,
} from "@padelaso/domain/matches";
import {
  calculatePlayerStats,
  canonicalPairKey as pairKey,
  filterMatchesFrom,
  getGroupRanking,
  getHeadToHeadStats,
  getPairStats,
  getPartnerStats,
  getPlayerVersusStats,
  getRecentForm,
  getTimeRangeCutoff,
  MIN_MATCHES_FOR_RATE,
  sortPairStats,
  TIME_RANGES,
  type PairOrder,
  type TimeRange,
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

/**
 * Adds events to a match and never changes or removes existing data. With the
 * required idempotency_key, repeating a call adds nothing more.
 */
const ADDS_EVENTS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Removes one event, so it is destructive. Repeating a call removes nothing
 * more: the retry reports already_removed.
 */
const REMOVES_EVENT = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

/**
 * Overwrites a match's teams, score, date or court: destructive, so clients
 * confirm it. With the required idempotency_key, repeating a call changes
 * nothing more.
 */
const CORRECTS_MATCH = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const MAX_PARTNERS = 5;
const MAX_RANKING = 10;
const MAX_PAIRS = 5;
const MAX_RIVALRIES = 5;

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
const matchId = z.uuid().describe("Match ID from list_matches.");

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
const identifiedEvent = savedEvent.extend({
  id: z.string().describe("Event ID, to name this exact event in a later correction."),
});
const matchVersion = z.number().describe(
  "Changes whenever the match or its events change. Pass it to edit tools so a stale read is refused.");
const playedAt = z.iso.datetime({ offset: true });
/** update_match's field names, as the tool's input calls them. */
const correctable = z.enum(["team1", "team2", "sets", "played_at", "court"]);
const timeRange = z.enum(TIME_RANGES).default("all").describe(
  "Period: all (every match), 90d or 30d (matches played in the last 90 or 30 days), as on Padelaso's stats page.");
const record = {
  matches: z.number(),
  wins: z.number(),
  losses: z.number(),
  winRate: z.number().describe("wins / matches, from 0 to 1."),
};
const pairRecord = {
  matches: z.number().describe("Decided matches the pair played together; ties are left out."),
  wins: z.number(),
  losses: z.number(),
  winRate: z.number().describe("wins / matches, from 0 to 1."),
  currentStreak: z.number().describe("Positive for consecutive wins, negative for consecutive losses."),
};
const rivalry = z.object({
  pair1: z.array(teamMember),
  pair2: z.array(teamMember),
  matches: z.number().describe("Decided matches between these exact pairs."),
  pair1Wins: z.number(),
  pair2Wins: z.number(),
});
const newEvents = z.array(z.object({
  player_id: playerId.describe("One of the four match players."),
  type: z.enum(EVENT_CONFIGS.map((e) => e.type)),
}));

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
  get_group_stats: z.object({
    group,
    range: z.enum(TIME_RANGES),
    matches: z.number().describe("Matches played in the range."),
    ranking: z.object({
      minimumMatches: z.number().describe("Matches a player needs to rank normally; provisional players rank last."),
      rankedPlayers: z.number().describe("Players with at least one match in the range."),
      players: z.array(z.object({
        position: z.number(),
        id: z.string(),
        name: z.string(),
        ...record,
        undecided: z.number().describe("Ties and unfinished matches, counted in matches but not in wins or losses."),
        provisional: z.boolean(),
      })).describe(`The top ${MAX_RANKING}, as Padelaso's stats page ranks them.`),
    }),
    pairs: z.object({
      by: z.enum(["matches", "winRate"]),
      minimumMatches: z.number().nullable().describe("Matches a pair needs to be listed when ordered by winRate; null otherwise."),
      total: z.number().describe("Pairs that meet the order's conditions."),
      top: z.array(z.object({ players: z.array(teamMember), ...pairRecord })).describe(`Up to ${MAX_PAIRS}.`),
    }),
    rivalries: z.object({
      total: z.number().describe("Distinct pair-against-pair matchups with a decided match."),
      top: z.array(rivalry).describe(`The ${MAX_RIVALRIES} most played.`),
    }),
  }),
  compare_players: z.object({
    group,
    range: z.enum(TIME_RANGES),
    players: z.array(player.extend({
      ...record,
      undecided: z.number().describe("Ties and unfinished matches, counted in matches but not in wins or losses."),
    })).describe("Each player's own record in the range, in the order asked."),
    together: z.object(pairRecord).describe("Their record as partners."),
    against: z.object({
      matches: z.number().describe("Decided matches on opposite teams, whoever their partners were."),
      player1Wins: z.number().describe("Won by the first player's team."),
      player2Wins: z.number().describe("Won by the second player's team."),
    }),
  }),
  get_pair_stats: z.object({
    group,
    range: z.enum(TIME_RANGES),
    players: z.array(player),
    ...pairRecord,
    rivalries: z.object({
      total: z.number().describe("Distinct opposing pairs this pair has a decided match against."),
      top: z.array(z.object({
        opponents: z.array(teamMember),
        matches: z.number(),
        wins: z.number().describe("Won by this pair."),
        losses: z.number(),
      })).describe(`The ${MAX_RIVALRIES} most played.`),
    }),
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
  get_match: z.object({
    group,
    match,
    events: z.array(identifiedEvent).describe("Every recorded event, in the order it was recorded."),
    version: matchVersion,
    url: z.string().describe("Link to the match in Padelaso."),
  }),
  add_match_events: z.object({
    status: z.enum(["added", "replayed"]).describe(
      "added: saved now. replayed: this idempotency_key had already added these events, so nothing new was added."),
    message: z.string().describe("What happened, to tell the user."),
    group,
    match,
    added: z.array(identifiedEvent).describe("The events this request added, in order."),
    events: z.array(identifiedEvent).describe("Every event of the match now, in the order it was recorded."),
    version: matchVersion,
    url: z.string().describe("Link to the match in Padelaso."),
  }),
  remove_match_event: z.object({
    status: z.enum(["removed", "already_removed"]).describe(
      "removed: removed now. already_removed: an earlier identical request had already removed it, so nothing changed."),
    message: z.string().describe("What happened, to tell the user."),
    group,
    match,
    removed: identifiedEvent.describe("The event that was removed."),
    events: z.array(identifiedEvent).describe("Every event of the match now, in the order it was recorded."),
    version: matchVersion,
    url: z.string().describe("Link to the match in Padelaso."),
  }),
  update_match: z.object({
    status: z.enum(["updated", "unchanged", "replayed"]).describe(
      "updated: saved now. unchanged: the match already had these values, so nothing changed. " +
      "replayed: this idempotency_key had already made this correction, so nothing more changed."),
    message: z.string().describe("What happened, to tell the user."),
    changed: z.array(correctable).describe("The fields this request changed."),
    group,
    match,
    events: z.array(identifiedEvent).describe("Every event of the match, unchanged by this tool."),
    version: matchVersion,
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

async function getMatch(caller: Caller, args: { group_id: string; match_id: string }) {
  const [found, players, result] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
    getMatchDetail(caller.client, args.group_id, args.match_id),
  ]);
  if (result.status === "rejected") {
    // The token was verified moments ago, so this is a server fault, not bad input.
    if (result.code === "AUTH_REQUIRED") throw new Error("get_match_detail saw no user");
    throw new ToolInputError("Match not found in this group. Use list_matches to find match IDs.");
  }
  const names = new Map(players.map((p) => [p.id, p.name]));
  return {
    group: found,
    match: toMatch(result.match, names),
    events: result.events.map((e) => ({
      id: e.id,
      player: { id: e.playerId, name: names.get(e.playerId) ?? null },
      type: e.type,
      label: getEventConfig(e.type as MatchEventType).label,
    })),
    version: result.version,
    url: `${caller.appOrigin}/matches/${result.match.id}`,
  };
}

type EventsRejection = Extract<AddMatchEventsResult, { status: "rejected" }>;

const EVENTS_REJECTION_HINTS: Partial<Record<EventsRejection["code"], string>> = {
  MATCH_NOT_FOUND: "Match not found in this group. Use list_matches to find match IDs.",
  INVALID_EVENTS: "Every event must be for one of the match's four players and a current event type. " +
    "Use get_match to see the match's players.",
  IDEMPOTENCY_KEY_REUSED: "This idempotency_key was already used for a different request. Use a new key for each new request.",
  BUSY: "Padelaso is saving another change to this match. Try again in a moment with the same idempotency_key.",
};

async function addEvents(caller: Caller, args: {
  group_id: string;
  match_id: string;
  events: { player_id: string; type: MatchEventType }[];
  idempotency_key: string;
}) {
  const [found, players] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
  ]);
  const result = await addMatchEvents(caller.client, {
    groupId: found.id,
    matchId: args.match_id,
    events: args.events.map((e) => ({ playerId: e.player_id, type: e.type })),
    idempotencyKey: args.idempotency_key,
  });
  if (result.status === "rejected") {
    // The token was verified moments ago, so this is a server fault, not bad input.
    if (result.code === "AUTH_REQUIRED") throw new Error("add_match_events saw no user");
    throw new ToolInputError((EVENTS_REJECTION_HINTS[result.code] ?? result.message) + NOTHING_SAVED);
  }

  const names = new Map(players.map((p) => [p.id, p.name]));
  const events = result.events.map((e) => ({
    id: e.id,
    player: { id: e.playerId, name: names.get(e.playerId) ?? null },
    type: e.type,
    label: getEventConfig(e.type as MatchEventType).label,
  }));
  const added = new Set(result.addedEventIds);
  return {
    status: result.status,
    message: result.status === "added"
      ? `${result.addedEventIds.length === 1 ? "1 event" : `${result.addedEventIds.length} events`} added.`
      : "These events were already added by an earlier call with the same idempotency_key. Nothing new was added.",
    group: found,
    match: toMatch(result.match, names),
    // A replay names the events the first call added that still exist.
    added: events.filter((e) => added.has(e.id)),
    events,
    version: result.version,
    url: `${caller.appOrigin}/matches/${result.match.id}`,
  };
}

type RemovalRejection = Extract<RemoveMatchEventResult, { status: "rejected" }>;

const REMOVAL_REJECTION_HINTS: Partial<Record<RemovalRejection["code"], string>> = {
  MATCH_NOT_FOUND: "Match not found in this group. Use list_matches to find match IDs.",
  EVENT_NOT_FOUND: "Event not found in this match. Use get_match to see the match's events and their IDs.",
  STALE_VERSION: "The match changed since you read it. Call get_match again, check the event with the user " +
    "against the current events, and retry with the new version only if they still want it removed.",
  BUSY: "Padelaso is saving another change to this match. Try again in a moment.",
};

const NOTHING_REMOVED = " Nothing was removed.";

async function removeEvent(caller: Caller, args: {
  group_id: string;
  match_id: string;
  event_id: string;
  expected_version: number;
}) {
  const [found, players] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
  ]);
  const result = await removeMatchEvent(caller.client, {
    groupId: found.id,
    matchId: args.match_id,
    eventId: args.event_id,
    expectedVersion: args.expected_version,
  });
  if (result.status === "rejected") {
    // The token was verified moments ago, so this is a server fault, not bad input.
    if (result.code === "AUTH_REQUIRED") throw new Error("remove_match_event saw no user");
    throw new ToolInputError((REMOVAL_REJECTION_HINTS[result.code] ?? result.message) + NOTHING_REMOVED);
  }

  const names = new Map(players.map((p) => [p.id, p.name]));
  const toEvent = (e: { id: string; playerId: string; type: string }) => ({
    id: e.id,
    player: { id: e.playerId, name: names.get(e.playerId) ?? null },
    type: e.type,
    label: getEventConfig(e.type as MatchEventType).label,
  });
  return {
    status: result.status,
    message: result.status === "removed"
      ? "Event removed."
      : "This event had already been removed by an earlier identical request. Nothing changed.",
    group: found,
    match: toMatch(result.match, names),
    removed: toEvent(result.removedEvent),
    events: result.events.map(toEvent),
    version: result.version,
    url: `${caller.appOrigin}/matches/${result.match.id}`,
  };
}

type UpdateRejection = Extract<UpdateMatchResult, { status: "rejected" }>;

const UPDATE_REJECTION_HINTS: Partial<Record<UpdateRejection["code"], string>> = {
  MATCH_NOT_FOUND: "Match not found in this group. Use list_matches to find match IDs.",
  PLAYER_NOT_IN_GROUP: "Some players are not in this group. Use list_players to find player IDs.",
  INVALID_DATE: REJECTION_HINTS.INVALID_DATE,
  IDEMPOTENCY_KEY_REUSED: "This idempotency_key was already used for a different request. Use a new key for each new request.",
  BUSY: "Padelaso is saving another change to this match. Try again in a moment with the same idempotency_key.",
};

const FIELD_NAMES: Record<MatchField, z.infer<typeof correctable>> = {
  team1: "team1", team2: "team2", sets: "sets", date: "played_at", courtNumber: "court",
};

function updateRejection(result: UpdateRejection, names: Map<string, string>) {
  const who = (ids: string[] = []) => ids.map((id) => names.get(id) ?? id).join(", ");
  switch (result.code) {
    case "STALE_VERSION":
      return `The match changed since it was read (it is now at version ${result.version}). ` +
        "Read it again with get_match, show the user what it holds now, confirm the correction again, " +
        "and retry with the new version and a new idempotency_key.";
    case "PLAYER_HAS_EVENTS":
      return `These players would leave the match but still have events in it: ${who(result.playerIds)}. ` +
        "Ask the user whether to keep them in the match or to remove their events first.";
    default:
      return UPDATE_REJECTION_HINTS[result.code] ?? result.message;
  }
}

const listFields = (fields: string[]) => fields.join(", ").replace(/, ([^,]*)$/, " and $1");

async function correctMatch(caller: Caller, args: {
  group_id: string;
  match_id: string;
  expected_version: number;
  patch: {
    team1?: string[];
    team2?: string[];
    sets?: { team1: number; team2: number }[];
    played_at?: string;
    court?: number | null;
  };
  idempotency_key: string;
}) {
  const [found, players] = await Promise.all([
    requireGroup(caller, args.group_id),
    listGroupPlayers(caller.client, args.group_id),
  ]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const { team1, team2, sets, played_at, court } = args.patch;

  // Checked here for clear messages; update_match checks everything again.
  const patch: UpdateMatchRequest["patch"] = {};
  if (team1 || team2) {
    if (!team1 || !team2) {
      throw new ToolInputError("Give both teams when changing players, even if one stays the same." + NOTHING_SAVED);
    }
    const issue = validateMatchTeams(team1, team2);
    if (issue) throw new ToolInputError(issue.message + NOTHING_SAVED);
    const unknown = [...team1, ...team2].filter((id) => !names.has(id));
    if (unknown.length > 0) {
      throw new ToolInputError(
        `These IDs are not players of ${found.name}: ${unknown.join(", ")}. Use list_players to find player IDs, ` +
        "and ask the user when a name matches several players or none." + NOTHING_SAVED);
    }
    Object.assign(patch, { team1, team2 });
  }
  if (sets) {
    patch.sets = sets.map((s) => ({ team1Score: s.team1, team2Score: s.team2 }));
    const issue = validateMatchSets(patch.sets);
    if (issue) throw new ToolInputError(issue.message + NOTHING_SAVED);
  }
  if (played_at) patch.date = new Date(played_at).toISOString();
  if (court !== undefined) patch.courtNumber = court;
  if (Object.keys(patch).length === 0) {
    throw new ToolInputError("The patch has nothing to change: give at least one of team1 and team2, sets, played_at or court." +
      NOTHING_SAVED);
  }

  const result = await updateMatch(caller.client, {
    groupId: found.id,
    matchId: args.match_id,
    expectedVersion: args.expected_version,
    patch,
    idempotencyKey: args.idempotency_key,
  });
  if (result.status === "rejected") {
    // The token was verified moments ago, so this is a server fault, not bad input.
    if (result.code === "AUTH_REQUIRED") throw new Error("update_match saw no user");
    throw new ToolInputError(updateRejection(result, names) + NOTHING_SAVED);
  }

  const changed = result.changed.map((field) => FIELD_NAMES[field]);
  return {
    status: result.status,
    message: result.status === "updated"
      ? `Match corrected: ${listFields(changed)} changed.`
      : result.status === "unchanged"
        ? "The match already had these values. Nothing changed."
        : "This correction was already saved by an earlier call with the same idempotency_key. Nothing more changed.",
    changed,
    group: found,
    match: toMatch(result.match, names),
    events: result.events.map((e) => ({
      id: e.id,
      player: { id: e.playerId, name: names.get(e.playerId) ?? null },
      type: e.type,
      label: getEventConfig(e.type as MatchEventType).label,
    })),
    version: result.version,
    url: `${caller.appOrigin}/matches/${result.match.id}`,
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

  // Same all-time ranking as the stats page.
  const { minimumMatches, ranked } = getGroupRanking(players.map((p) => p.id), matches);
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

/** Players and the matches of a range, as the stats page reads them. */
async function readStats(caller: Caller, groupId: string, range: TimeRange) {
  const [found, players, matches] = await Promise.all([
    requireGroup(caller, groupId),
    listGroupPlayers(caller.client, groupId),
    listAllGroupMatches(caller.client, groupId),
  ]);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const members = (ids: string[]) => ids.map((id) => ({ id, name: names.get(id) ?? null }));
  return { found, players, names, members, matches: filterMatchesFrom(matches, getTimeRangeCutoff(range)) };
}

function requireTwoPlayers(players: PlayerSummary[], ids: string[]) {
  if (ids[0] === ids[1]) throw new ToolInputError("Give two different players.");
  return [requirePlayer(players, ids[0]), requirePlayer(players, ids[1])] as const;
}

const toRecord = (s: { matches: number; wins: number; losses: number; winRate: number }) => ({
  matches: s.matches, wins: s.wins, losses: s.losses, winRate: round(s.winRate),
});

function findPair(matches: Match[], a: string, b: string) {
  const key = pairKey(a, b);
  const found = getPairStats(matches).find((p) => pairKey(p.player1Id, p.player2Id) === key);
  const { matches: played = 0, wins = 0, losses = 0, winRate = 0, currentStreak = 0 } = found ?? {};
  return { matches: played, wins, losses, winRate: round(winRate), currentStreak };
}

async function getGroupStats(caller: Caller, args: { group_id: string; range: TimeRange; pairs_by: PairOrder }) {
  const { found, players, names, members, matches } = await readStats(caller, args.group_id, args.range);
  const { minimumMatches, ranked } = getGroupRanking(players.map((p) => p.id), matches);
  const pairs = sortPairStats(getPairStats(matches), args.pairs_by);
  const rivalries = getHeadToHeadStats(matches);
  return {
    group: found,
    range: args.range,
    matches: matches.length,
    ranking: {
      minimumMatches,
      rankedPlayers: ranked.length,
      players: ranked.slice(0, MAX_RANKING).map((s, i) => ({
        position: i + 1,
        id: s.playerId,
        name: names.get(s.playerId)!,
        ...toRecord(s),
        undecided: s.matches - s.wins - s.losses,
        provisional: s.provisional,
      })),
    },
    pairs: {
      by: args.pairs_by,
      minimumMatches: args.pairs_by === "winRate" ? MIN_MATCHES_FOR_RATE : null,
      total: pairs.length,
      top: pairs.slice(0, MAX_PAIRS).map((p) => ({
        players: members([p.player1Id, p.player2Id]),
        ...toRecord(p),
        currentStreak: p.currentStreak,
      })),
    },
    rivalries: {
      total: rivalries.length,
      top: rivalries.slice(0, MAX_RIVALRIES).map((h) => ({
        pair1: members(h.pair1), pair2: members(h.pair2),
        matches: h.matches, pair1Wins: h.pair1Wins, pair2Wins: h.pair2Wins,
      })),
    },
  };
}

async function comparePlayers(caller: Caller, args: { group_id: string; player_ids: string[]; range: TimeRange }) {
  const { found, players, matches } = await readStats(caller, args.group_id, args.range);
  const [first, second] = requireTwoPlayers(players, args.player_ids);
  return {
    group: found,
    range: args.range,
    players: [first, second].map((p) => {
      const stats = calculatePlayerStats(p.id, matches);
      return { ...toPlayer(p, caller.userId), ...toRecord(stats), undecided: stats.matches - stats.wins - stats.losses };
    }),
    together: findPair(matches, first.id, second.id),
    against: getPlayerVersusStats(first.id, second.id, matches),
  };
}

async function getPairStatsTool(caller: Caller, args: { group_id: string; player_ids: string[]; range: TimeRange }) {
  const { found, players, members, matches } = await readStats(caller, args.group_id, args.range);
  const [first, second] = requireTwoPlayers(players, args.player_ids);
  const key = pairKey(first.id, second.id);
  const rivalries = getHeadToHeadStats(matches).flatMap((h) => {
    const isPair1 = pairKey(...h.pair1) === key;
    if (!isPair1 && pairKey(...h.pair2) !== key) return [];
    return [{
      opponents: members(isPair1 ? h.pair2 : h.pair1),
      matches: h.matches,
      wins: isPair1 ? h.pair1Wins : h.pair2Wins,
      losses: isPair1 ? h.pair2Wins : h.pair1Wins,
    }];
  });
  return {
    group: found,
    range: args.range,
    players: [toPlayer(first, caller.userId), toPlayer(second, caller.userId)],
    ...findPair(matches, first.id, second.id),
    rivalries: { total: rivalries.length, top: rivalries.slice(0, MAX_RIVALRIES) },
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
    description: "List a group's match history, newest first, with teams, set scores and winner. Optionally only one player's matches. " +
      "Use get_match for one match's events.",
    inputSchema: z.object({
      group_id: groupId,
      player_id: playerId.optional().describe("Only matches this player played."),
      limit: z.number().int().min(1).max(50).default(10),
      offset: z.number().int().min(0).max(10_000).default(0).describe("nextOffset from the previous page."),
    }),
    outputSchema: outputs.list_matches,
    annotations: READ_ONLY,
  }, run(listMatches));

  server.registerTool("get_match", {
    title: "Get match",
    description: "One match of a group with every recorded event and its ID, plus a version. " +
      "Find the match with list_matches first; when several matches fit what the user said, show them and ask. " +
      "Use the event IDs and version to target an exact event or match in a correction.",
    inputSchema: z.object({ group_id: groupId, match_id: matchId }),
    outputSchema: outputs.get_match,
    annotations: READ_ONLY,
  }, run(getMatch));

  server.registerTool("get_player_stats", {
    title: "Get player stats",
    description: "A player's all-time stats in a group: record, win rate, streaks, recent form, group ranking and most frequent partners. Uses Padelaso's own scoring rules.",
    inputSchema: z.object({ group_id: groupId, player_id: playerId }),
    outputSchema: outputs.get_player_stats,
    annotations: READ_ONLY,
  }, run(getPlayerStats));

  server.registerTool("get_group_stats", {
    title: "Get group stats",
    description: `A group's ranking (top ${MAX_RANKING}), top pairs and most played pair-against-pair rivalries, ` +
      "for all time or the last 90 or 30 days, computed with Padelaso's own rules as on its stats page. " +
      "Use it for \"who's top?\" or \"which pair wins most?\" (pairs_by winRate); use compare_players for two players " +
      "and get_pair_stats for one pair.",
    inputSchema: z.object({
      group_id: groupId,
      range: timeRange,
      pairs_by: z.enum(["matches", "winRate"]).default("matches").describe(
        `matches: pairs who play together most. winRate: pairs who win most, among pairs with at least ` +
        `${MIN_MATCHES_FOR_RATE} matches together.`),
    }),
    outputSchema: outputs.get_group_stats,
    annotations: READ_ONLY,
  }, run(getGroupStats));

  server.registerTool("compare_players", {
    title: "Compare players",
    description: "Two players of a group side by side: each one's record, their record as partners, and how they do " +
      "against each other whoever their partners were. For all time or the last 90 or 30 days.",
    inputSchema: z.object({
      group_id: groupId,
      player_ids: z.array(playerId).length(2).describe("The two players, as IDs from list_players."),
      range: timeRange,
    }),
    outputSchema: outputs.compare_players,
    annotations: READ_ONLY,
  }, run(comparePlayers));

  server.registerTool("get_pair_stats", {
    title: "Get pair stats",
    description: "One pair of a group playing together: record, current streak and the opposing pairs they play most. " +
      "For all time or the last 90 or 30 days.",
    inputSchema: z.object({
      group_id: groupId,
      player_ids: z.array(playerId).length(2).describe("The pair's two players, as IDs from list_players."),
      range: timeRange,
    }),
    outputSchema: outputs.get_pair_stats,
    annotations: READ_ONLY,
  }, run(getPairStatsTool));

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
      played_at: playedAt.optional().describe(
        "When the match was played, ISO 8601 with a UTC offset, e.g. 2026-11-14T19:00:00+01:00. " +
        "Omit when it was just played: Padelaso uses the current time."),
      court: z.number().int().min(1).max(99).optional().describe("Court number, if the user mentions one."),
      events: newEvents.max(MAX_RECORDED_EVENTS).optional()
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

  server.registerTool("add_match_events", {
    title: "Add match events",
    description:
      "Add highlights (aces, double faults, …) to a match that is already recorded. It only adds: it never " +
      "changes or removes existing events. Before calling: (1) find the match with list_matches and read it " +
      "with get_match; when several matches fit what the user said, show them and ask. (2) Resolve every player " +
      "to one of the match's four players; when a name matches several or none, ask, never guess. (3) Restate " +
      "the match (date and teams) and every event to add to the user, and call only after they confirm. " +
      "Generate one random UUID as idempotency_key per confirmed request and reuse it if you retry. " +
      "Returns the events added, the updated match and a link to it.",
    inputSchema: z.object({
      group_id: groupId,
      match_id: matchId,
      events: newEvents.min(1).max(MAX_RECORDED_EVENTS).describe(
        `The events to add, one entry per occurrence: "two aces" is two entries. ` +
        `A match holds at most ${MAX_RECORDED_EVENTS} events. Types: ${recordableEvents}.`),
      idempotency_key: z.uuid().describe(
        "A random UUID generated once for each confirmed request. Reuse it only to retry the same call. " +
        "Never put names or other details in it."),
    }),
    outputSchema: outputs.add_match_events,
    annotations: ADDS_EVENTS,
  }, run(addEvents));

  server.registerTool("remove_match_event", {
    title: "Remove match event",
    description:
      "Remove one mistaken highlight (an ace, a double fault, …) from a recorded match. It removes exactly the " +
      "event you name and nothing else; it cannot be undone except by adding the event again. Before calling: " +
      "(1) find the match with list_matches and read it with get_match; when several matches fit what the user " +
      "said, show them and ask. (2) Pick the event by its ID from get_match; ask when it's unclear which player " +
      "or type the user means. (3) Restate the match (date and teams) and the event to remove (player and type; " +
      "when that player has several events of that type, also which one in get_match order, e.g. \"the second " +
      "of Ana's two aces\") to the user, and call only after they confirm. Pass the version from that get_match " +
      "read: if the match changed since, nothing is removed and you must read it again. Retrying the same call " +
      "is safe. Returns the removed event, the updated match and a link to it.",
    inputSchema: z.object({
      group_id: groupId,
      match_id: matchId,
      event_id: z.uuid().describe("ID of the event to remove, from get_match."),
      expected_version: z.number().int().min(0).describe("The version returned by the get_match read the user confirmed."),
    }),
    outputSchema: outputs.remove_match_event,
    annotations: REMOVES_EVENT,
  }, run(removeEvent));
  server.registerTool("update_match", {
    title: "Correct match",
    description:
      "Correct a recorded match's teams, set scores, date or court. Only the fields in patch change; " +
      "everything else, events included, stays as it is. Before calling: (1) find the match with list_matches " +
      "and read it with get_match for its version; when several matches fit what the user said, show them and " +
      "ask. (2) Resolve every new player with list_players; when a name matches several players or none, ask, " +
      "never guess. (3) Restate the match and the exact change (old and new values) to the user, and call only " +
      "after they confirm. Players who leave the match must have no events: remove those first. " +
      "Generate one random UUID as idempotency_key per confirmed correction and reuse it if you retry. " +
      "Returns what changed, the updated match and a link to it.",
    inputSchema: z.object({
      group_id: groupId,
      match_id: matchId,
      expected_version: z.number().int().min(0).describe(
        "The version get_match returned. If the match changed since, nothing is saved and you must read it again."),
      patch: z.object({
        team1: z.array(playerId).length(2).optional()
          .describe("The two players of team 1. Give team1 and team2 together, even if one stays the same."),
        team2: z.array(playerId).length(2).optional().describe("The two players of team 2."),
        sets: z.array(z.object({ team1: score, team2: score })).min(1).max(MAX_RECORDED_SETS).optional()
          .describe("Every played set, in order: replaces the whole score. team1 is the games of team 1."),
        played_at: playedAt.optional().describe(
          "When the match was played, ISO 8601 with a UTC offset, e.g. 2026-11-14T19:00:00+01:00."),
        court: z.number().int().min(1).max(99).nullable().optional().describe("Court number, or null to clear it."),
      }).strict().describe("Only the fields to change. Leave out everything that stays the same."),
      idempotency_key: z.uuid().describe(
        "A random UUID generated once for each confirmed correction. Reuse it only to retry the same call. " +
        "Never put names or other details in it."),
    }),
    outputSchema: outputs.update_match,
    annotations: CORRECTS_MATCH,
  }, run(correctMatch));
}

export const TOOL_NAMES = [
  "list_groups", "list_players", "list_matches", "get_match", "get_player_stats", "get_group_stats",
  "compare_players", "get_pair_stats", "create_match",
  "add_match_events", "remove_match_event", "update_match",
] as const;
