import type { CardKit } from "./bridge";

/**
 * The ranking for `get_group_stats`: the ranked players and the top pairs.
 * Runs in the card's iframe and is serialized with `toString()`, so it must
 * not reference anything outside its own body.
 */
export function renderRankingCard(data: RankingCard, { el }: CardKit): Node {
  const ranges: Record<string, string> = { all: "Desde siempre", "90d": "Últimos 90 días", "30d": "Últimos 30 días" };
  const percent = (rate?: number) => `${Math.round((rate ?? 0) * 100)} %`;
  const record = (r: { wins?: number; losses?: number }) => `${r.wins ?? 0}–${r.losses ?? 0}`;

  const card = el("article", "card");
  card.setAttribute("aria-label", "Ranking del grupo");

  const header = el("header");
  header.append(el("span", "group", [data.group?.emoji, data.group?.name].filter(Boolean).join(" ")));
  const matches = data.matches ?? 0;
  const details = [ranges[data.range ?? "all"] ?? "", `${matches} ${matches === 1 ? "partido" : "partidos"}`];
  header.append(el("span", "meta", details.filter(Boolean).join(" · ")));
  card.append(header);

  const players = data.ranking?.players ?? [];
  if (!players.length) {
    card.append(el("p", "note", "Sin partidos en este periodo"));
    return card;
  }

  const list = el("ol", "ranking");
  for (const player of players) {
    const row = el("li", player.position === 1 ? "row first" : "row");
    row.append(el("span", "position", player.position == null ? "–" : String(player.position)));
    const name = el("span", "name", player.name ?? "");
    if (player.provisional) name.append(" ", el("span", "tag", "Provisional"));
    row.append(name);
    row.append(el("span", "stat", record(player)), el("span", "stat", percent(player.winRate)));
    list.append(row);
  }
  card.append(list);
  const minimum = data.ranking?.minimumMatches;
  if (players.some((p) => p.provisional) && minimum) {
    card.append(el("p", "note", `Provisional: menos de ${minimum} partidos, sin posición.`));
  }

  const pairs = (data.pairs?.top ?? []).slice(0, 3);
  if (pairs.length) {
    const section = el("section");
    section.append(el("h2", undefined, data.pairs?.by === "winRate" ? "Parejas que más ganan" : "Parejas que más juegan"));
    const pairList = el("ul", "pairs");
    for (const pair of pairs) {
      const row = el("li", "row");
      row.append(el("span", "name", pair.players.map((p) => p.name ?? "Jugador eliminado").join(" y ")));
      row.append(el("span", "stat", record(pair)), el("span", "stat", percent(pair.winRate)));
      pairList.append(row);
    }
    section.append(pairList);
    card.append(section);
  }
  return card;
}

/** The parts of `get_group_stats`' structured content the card reads. */
export interface RankingCard {
  group?: { name?: string; emoji?: string };
  range?: string;
  matches?: number;
  ranking?: {
    minimumMatches?: number;
    players?: { position: number | null; name?: string; wins?: number; losses?: number; winRate?: number; provisional?: boolean }[];
  };
  pairs?: {
    by?: "matches" | "winRate";
    top?: { players: { name: string | null }[]; wins?: number; losses?: number; winRate?: number }[];
  };
}

export const RANKING_CARD_STYLES = `
.ranking,.pairs{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.row{display:grid;grid-template-columns:2em 1fr auto 3.5em;align-items:center;gap:8px;padding:6px 10px;border-radius:10px;background:var(--pa-surface)}
.pairs .row{grid-template-columns:1fr auto 3.5em}
.row.first{outline:2px solid var(--pa-win)}
.position{font-weight:var(--font-weight-bold,700);text-align:center;font-variant-numeric:tabular-nums}
.name{font-weight:var(--font-weight-semibold,600);overflow-wrap:anywhere;min-width:0}
.stat{font-family:var(--font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums;color:var(--pa-muted);text-align:right}
.tag{font-size:var(--font-text-xs-size,12px);font-weight:var(--font-weight-normal,400);color:var(--pa-muted);border:1.5px solid var(--pa-border);border-radius:999px;padding:0 6px}
`;
