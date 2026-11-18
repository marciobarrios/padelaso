import { EVENT_CONFIGS } from "./events";
import type { MatchSet, Player, PlayerId } from "./types";

export function getSetWins(sets: MatchSet[]) {
  let team1Wins = 0;
  let team2Wins = 0;
  for (const set of sets) {
    if (set.team1Score > set.team2Score) team1Wins++;
    else if (set.team2Score > set.team1Score) team2Wins++;
  }
  return { team1Wins, team2Wins };
}

export function buildPlayerMap(players: Player[]): Map<PlayerId, Player> {
  return new Map(players.map((player) => [player.id, player]));
}

export function applyScoreDelta(
  sets: MatchSet[],
  team: 1 | 2,
  delta: number,
): MatchSet[] {
  const base = sets.length ? sets : [{ team1Score: 0, team2Score: 0 }];
  const last = base.length - 1;
  const field = team === 1 ? "team1Score" : "team2Score";

  return base.map((set, index) =>
    index === last
      ? { ...set, [field]: Math.max(0, set[field] + delta) }
      : set,
  );
}

// ---------- Recording a finished match ----------
// The create_match and update_match database functions enforce the same rules,
// so keep supabase/migrations/*_create_match.sql and *_update_match.sql in step
// with these values.

export const MAX_RECORDED_SETS = 5;
export const MAX_SET_SCORE = 99;
export const MAX_RECORDED_EVENTS = 50;

export interface MatchDraft {
  team1: PlayerId[];
  team2: PlayerId[];
  sets: MatchSet[];
  events?: { playerId: PlayerId; type: string }[];
}

export interface MatchDraftIssue {
  code: "INVALID_TEAMS" | "INVALID_SETS" | "INVALID_EVENTS";
  message: string;
}

const RECORDABLE_EVENT_TYPES: ReadonlySet<string> = new Set(EVENT_CONFIGS.map((event) => event.type));

const isScore = (value: number) => Number.isInteger(value) && value >= 0 && value <= MAX_SET_SCORE;

/**
 * Two teams of two distinct players. The team rule of validateMatchDraft, also
 * used alone when a correction changes only the teams (update_match).
 */
export function validateMatchTeams(team1: PlayerId[], team2: PlayerId[]): MatchDraftIssue | null {
  if (team1.length !== 2 || team2.length !== 2) {
    return { code: "INVALID_TEAMS", message: "Each team must have exactly two players." };
  }
  if (new Set([...team1, ...team2]).size !== 4) {
    return { code: "INVALID_TEAMS", message: "A match needs four different players." };
  }
  return null;
}

/**
 * 1 to 5 played sets with whole scores. The set rule of validateMatchDraft,
 * also used alone when a correction changes only the score (update_match).
 */
export function validateMatchSets(sets: MatchSet[]): MatchDraftIssue | null {
  if (sets.length < 1 || sets.length > MAX_RECORDED_SETS) {
    return { code: "INVALID_SETS", message: `A match has between 1 and ${MAX_RECORDED_SETS} sets.` };
  }
  for (const [index, set] of sets.entries()) {
    if (!isScore(set.team1Score) || !isScore(set.team2Score)) {
      return { code: "INVALID_SETS", message: `Set ${index + 1}: scores must be whole numbers from 0 to ${MAX_SET_SCORE}.` };
    }
    if (set.team1Score === 0 && set.team2Score === 0) {
      return { code: "INVALID_SETS", message: `Set ${index + 1} has no score. Remove sets that were not played.` };
    }
  }
  return null;
}

/**
 * Checks a finished match before it is recorded: two teams of two distinct
 * players, 1 to 5 played sets, and events only for players in the match with a
 * current (not retired) event type. Returns the first problem, or null.
 */
export function validateMatchDraft(draft: MatchDraft): MatchDraftIssue | null {
  const players = [...draft.team1, ...draft.team2];
  const issue = validateMatchTeams(draft.team1, draft.team2) ?? validateMatchSets(draft.sets);
  if (issue) return issue;

  const events = draft.events ?? [];
  if (events.length > MAX_RECORDED_EVENTS) {
    return { code: "INVALID_EVENTS", message: `A match can have at most ${MAX_RECORDED_EVENTS} events.` };
  }
  for (const event of events) {
    if (!players.includes(event.playerId)) {
      return { code: "INVALID_EVENTS", message: "Every event must belong to one of the match's four players." };
    }
    if (!RECORDABLE_EVENT_TYPES.has(event.type)) {
      return { code: "INVALID_EVENTS", message: `Unknown event type: ${event.type}.` };
    }
  }
  return null;
}
