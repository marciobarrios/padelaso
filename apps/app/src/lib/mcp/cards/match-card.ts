import type { CardKit } from "./bridge";

/**
 * The scoreboard for `get_match`. Runs in the card's iframe and is serialized
 * with `toString()`, so it must not reference anything outside its own body.
 */
export function renderMatchCard(data: MatchCard, { el, timeZone }: CardKit): Node {
  type Player = { id: string; name: string | null };
  type Team = { players: Player[]; setsWon: number };
  const playerName = (p?: Player) => p?.name ?? "Jugador eliminado";
  const match = data.match ?? {};

  function formatDate(iso?: string) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" };
    try {
      return new Intl.DateTimeFormat("es-ES", { ...options, timeZone }).format(date);
    } catch {
      return new Intl.DateTimeFormat("es-ES", options).format(date);
    }
  }

  function teamRow(team: Team | undefined, key: "team1" | "team2") {
    const won = match.winner === key;
    const row = el("div", won ? "team won" : "team");
    const names = el("div", "names");
    names.append(el("span", "players", (team?.players ?? []).map(playerName).join(" y ")));
    if (won) names.append(el("span", "badge", "Ganan"));
    row.append(names);
    const sets = el("div", "sets");
    for (const set of match.sets ?? []) {
      const mine = set[key];
      const theirs = set[key === "team1" ? "team2" : "team1"];
      sets.append(el("span", mine > theirs ? "set set-won" : "set", String(mine)));
    }
    row.append(sets);
    return row;
  }

  const card = el("article", "card");
  card.setAttribute("aria-label", "Resultado del partido");

  const header = el("header");
  header.append(el("span", "group", [data.group?.emoji, data.group?.name].filter(Boolean).join(" ")));
  const details = [formatDate(match.date), match.court == null ? "" : `Pista ${match.court}`].filter(Boolean).join(" · ");
  header.append(el("span", "meta", details));
  card.append(header);

  card.append(teamRow(match.team1, "team1"), teamRow(match.team2, "team2"));
  if (!match.winner) card.append(el("p", "note", (match.sets ?? []).length ? "Sin ganador" : "Sin resultado"));

  const counts = new Map<string, { text: string; count: number }>();
  for (const event of data.events ?? []) {
    const text = `${event.label ?? ""} · ${playerName(event.player)}`;
    const key = `${event.label}|${event.player?.id}`;
    counts.set(key, { text, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  if (counts.size) {
    const section = el("section");
    section.append(el("h2", undefined, "Destacados"));
    const list = el("ul", "chips");
    for (const { text, count } of counts.values()) list.append(el("li", undefined, count > 1 ? `${text} ×${count}` : text));
    section.append(list);
    card.append(section);
  }
  return card;
}

/** The parts of `get_match`'s structured content the card reads. */
export interface MatchCard {
  group?: { name?: string; emoji?: string };
  match?: {
    date?: string;
    court?: number | null;
    team1?: { players: { id: string; name: string | null }[]; setsWon: number };
    team2?: { players: { id: string; name: string | null }[]; setsWon: number };
    sets?: { team1: number; team2: number }[];
    winner?: "team1" | "team2" | null;
  };
  events?: { player?: { id: string; name: string | null }; label?: string }[];
}

export const MATCH_CARD_STYLES = `
.meta{text-transform:capitalize}
.team{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:var(--pa-surface);margin-top:6px}
.team.won{outline:2px solid var(--pa-win)}
.names{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}.players{font-weight:var(--font-weight-semibold,600);overflow-wrap:anywhere}
.sets{display:flex;gap:6px;font-family:var(--font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums}
.set{min-width:1.6em;text-align:center;font-size:1.25em;color:var(--pa-muted)}.set-won{color:var(--pa-text);font-weight:var(--font-weight-bold,700)}
`;
