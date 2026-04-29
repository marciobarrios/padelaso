import { EVENT_CONFIGS } from "@/lib/event-config";
import { MatchEventType } from "@/lib/types";
import type { RosterPlayer } from "../_match";

export type ResolveResult =
  | {
      ok: true;
      playerId: string;
      playerName: string;
      type: MatchEventType;
      eventLabel: string;
    }
  | {
      ok: false;
      error: "no_event" | "no_player" | "ambiguous_event" | "ambiguous_player";
      understood: {
        event?: { type: MatchEventType; label: string };
        eventCandidates?: { type: MatchEventType; label: string }[];
        playerCandidates?: { id: string; name: string }[];
      };
    };

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const SELF_TOKENS = new Set(["yo", "me", "mi", "mismo", "misma"]);
const STOPWORDS = new Set(["y", "para", "to", "a"]);

interface EventCandidate {
  type: MatchEventType;
  label: string;
  forms: string[][];
}

interface EventMatch {
  type: MatchEventType;
  label: string;
  startIdx: number;
  length: number;
  exact: boolean;
}

const EVENT_CANDIDATES: EventCandidate[] = EVENT_CONFIGS.map((cfg) => {
  const typeWords = normalize(cfg.type.replace(/_/g, " ")).split(" ");
  const labelWords = normalize(cfg.label).split(" ");
  const seen = new Set<string>();
  const forms: string[][] = [];
  for (const f of [typeWords, labelWords]) {
    const key = f.join(" ");
    if (key && !seen.has(key)) {
      seen.add(key);
      forms.push(f);
    }
  }
  return { type: cfg.type, label: cfg.label, forms };
});

function tryMatchAt(
  tokens: string[],
  startIdx: number,
  formWords: string[]
): { matches: boolean; exact: boolean } {
  if (startIdx + formWords.length > tokens.length) {
    return { matches: false, exact: false };
  }
  for (let j = 0; j < formWords.length - 1; j++) {
    if (tokens[startIdx + j] !== formWords[j]) {
      return { matches: false, exact: false };
    }
  }
  const lastIdx = startIdx + formWords.length - 1;
  const lastFormWord = formWords[formWords.length - 1];
  const lastToken = tokens[lastIdx];
  if (lastToken === lastFormWord) return { matches: true, exact: true };
  if (lastToken.length >= 2 && lastFormWord.startsWith(lastToken)) {
    return { matches: true, exact: false };
  }
  return { matches: false, exact: false };
}

function findEventMatches(tokens: string[]): EventMatch[] {
  const matches: EventMatch[] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (const cand of EVENT_CANDIDATES) {
      for (const form of cand.forms) {
        const { matches: ok, exact } = tryMatchAt(tokens, i, form);
        if (ok) {
          matches.push({
            type: cand.type,
            label: cand.label,
            startIdx: i,
            length: form.length,
            exact,
          });
        }
      }
    }
  }
  return matches;
}

function pickBestEvent(
  matches: EventMatch[]
): EventMatch | { ambiguous: EventMatch[] } | null {
  if (matches.length === 0) return null;
  const exact = matches.filter((m) => m.exact);
  const pool = exact.length > 0 ? exact : matches;
  const maxLen = Math.max(...pool.map((m) => m.length));
  const longest = pool.filter((m) => m.length === maxLen);
  const uniqueTypes = Array.from(new Set(longest.map((m) => m.type)));
  if (uniqueTypes.length === 1) {
    return longest.find((m) => m.type === uniqueTypes[0])!;
  }
  const seen = new Set<MatchEventType>();
  const dedup: EventMatch[] = [];
  for (const m of longest) {
    if (!seen.has(m.type)) {
      seen.add(m.type);
      dedup.push(m);
    }
  }
  return { ambiguous: dedup };
}

interface PlayerResolution {
  ok: true;
  player: RosterPlayer;
}
interface PlayerFailure {
  ok: false;
  error: "no_player" | "ambiguous_player";
  candidates?: RosterPlayer[];
}

function resolvePlayer(
  remainingTokens: string[],
  roster: RosterPlayer[],
  creatorUserId: string
): PlayerResolution | PlayerFailure {
  const tokens = remainingTokens.filter((t) => !STOPWORDS.has(t));
  if (tokens.length === 0) return { ok: false, error: "no_player" };

  if (tokens.some((t) => SELF_TOKENS.has(t))) {
    const self = roster.find((p) => p.userId === creatorUserId);
    if (self) return { ok: true, player: self };
    return { ok: false, error: "no_player" };
  }

  const phrase = tokens.join(" ");
  const indexed = roster.map((p) => ({
    player: p,
    norm: normalize(p.name),
  }));

  let matches = indexed.filter((p) => p.norm.startsWith(phrase));
  if (matches.length === 0) {
    matches = indexed.filter((p) =>
      p.norm.split(" ").some((w) => w.startsWith(phrase))
    );
  }
  if (matches.length === 0) {
    matches = indexed.filter((p) => p.norm.includes(phrase));
  }

  if (matches.length === 0) return { ok: false, error: "no_player" };
  if (matches.length === 1) return { ok: true, player: matches[0].player };
  return {
    ok: false,
    error: "ambiguous_player",
    candidates: matches.map((m) => m.player),
  };
}

export function resolveEventQuery(
  query: string,
  roster: RosterPlayer[],
  creatorUserId: string
): ResolveResult {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return { ok: false, error: "no_event", understood: {} };
  }

  const eventMatches = findEventMatches(tokens);
  const best = pickBestEvent(eventMatches);

  if (best === null) {
    return { ok: false, error: "no_event", understood: {} };
  }
  if ("ambiguous" in best) {
    return {
      ok: false,
      error: "ambiguous_event",
      understood: {
        eventCandidates: best.ambiguous.map((m) => ({
          type: m.type,
          label: m.label,
        })),
      },
    };
  }

  const remainingTokens = [
    ...tokens.slice(0, best.startIdx),
    ...tokens.slice(best.startIdx + best.length),
  ];
  const playerResult = resolvePlayer(remainingTokens, roster, creatorUserId);

  if (!playerResult.ok) {
    return {
      ok: false,
      error: playerResult.error,
      understood: {
        event: { type: best.type, label: best.label },
        playerCandidates: playerResult.candidates?.map((c) => ({
          id: c.id,
          name: c.name,
        })),
      },
    };
  }

  return {
    ok: true,
    playerId: playerResult.player.id,
    playerName: playerResult.player.name,
    type: best.type,
    eventLabel: best.label,
  };
}
