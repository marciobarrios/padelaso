// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { CARD_CSP, CARDS } from ".";

const result = {
  group: { id: "g", name: "Los del jueves", emoji: "🎾" },
  match: {
    id: "m", date: "2026-11-16T19:00:00.000Z", court: 4,
    team1: { players: [{ id: "a", name: "Ana" }, { id: "p", name: "Pablo" }], setsWon: 2 },
    team2: { players: [{ id: "l", name: "<img src=x onerror=alert(1)>" }, { id: "x", name: null }], setsWon: 1 },
    sets: [{ team1: 6, team2: 3 }, { team1: 4, team2: 6 }, { team1: 7, team2: 5 }],
    winner: "team1",
  },
  events: [
    { id: "e1", player: { id: "a", name: "Ana" }, type: "vibora", label: "Víbora letal" },
    { id: "e2", player: { id: "a", name: "Ana" }, type: "vibora", label: "Víbora letal" },
    { id: "e3", player: { id: "x", name: null }, type: "globo", label: "Globo perfecto" },
  ],
  version: 3,
  url: "https://padelaso.test/matches/m",
};

type CardWindow = Window & typeof globalThis;
// jsdom ships without types; this is the part the test uses.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options?: { runScripts?: "dangerously"; beforeParse?(window: CardWindow): void }) => { window: CardWindow };
};

/** Loads the card as a host would and returns what it posted and a way to answer. */
function mountCard(html: string = CARDS.match.html) {
  const host = new JSDOM("").window;
  const sent: Record<string, unknown>[] = [];
  host.postMessage = vi.fn((message: Record<string, unknown>) => { sent.push(message); });
  const card = new JSDOM(html, {
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window, "parent", { value: host });
    },
  }).window;
  const deliver = (data: unknown, source: Window | null = host) =>
    card.dispatchEvent(new card.MessageEvent("message", { data, source }));
  return { card, sent, deliver, text: () => card.document.getElementById("card")!.textContent ?? "" };
}

const toolResult = (structuredContent: unknown) =>
  ({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent, content: [] } });

describe.each(Object.entries(CARDS))("%s card document", (_, { html }) => {
  it("is self-contained, with a CSP and no external origins", () => {
    expect(CARD_CSP).toContain("default-src 'none'");
    expect(html).toContain(`content="${CARD_CSP}"`);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=/);
    expect(Buffer.byteLength(html)).toBeLessThan(20_000);
  });

  it("renders whatever the tool returns without throwing", () => {
    const { deliver, text } = mountCard(html);
    deliver(toolResult({}));
    expect(text()).not.toBe("");
  });
});

describe("match card", () => {

  it("initializes with the host, then applies its theme and variables", async () => {
    const { card, sent, deliver } = mountCard();
    const init = sent[0] as { id: number; method: string; params: { protocolVersion: string } };
    expect(init).toMatchObject({ jsonrpc: "2.0", method: "ui/initialize", params: { protocolVersion: "2026-01-26" } });

    deliver({ jsonrpc: "2.0", id: init.id, result: {
      protocolVersion: "2026-01-26", hostInfo: { name: "host", version: "1" }, hostCapabilities: {},
      hostContext: { theme: "dark", styles: { variables: { "--color-background-primary": "#000", color: "red" } } },
    } });
    await vi.waitFor(() => expect(sent.at(-1)).toMatchObject({ method: "ui/notifications/initialized" }));
    const root = card.document.documentElement;
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--color-background-primary")).toBe("#000");
    expect(root.style.getPropertyValue("color")).toBe("");

    deliver({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed", params: { theme: "light" } });
    expect(root.dataset.theme).toBe("light");
    expect(root.style.getPropertyValue("--color-background-primary")).toBe("#000");

    // New styles replace the old ones instead of piling up.
    deliver({ jsonrpc: "2.0", method: "ui/notifications/host-context-changed",
      params: { styles: { variables: { "--color-text-primary": "#111" } } } });
    expect(root.style.getPropertyValue("--color-background-primary")).toBe("");
    expect(root.style.getPropertyValue("--color-text-primary")).toBe("#111");
  });

  it("renders the scoreboard from the tool result, in Spanish", () => {
    const { card, sent, deliver, text } = mountCard();
    deliver(toolResult(result));

    expect(text()).toContain("🎾 Los del jueves");
    expect(text()).toContain("Pista 4");
    const teams = [...card.document.querySelectorAll(".team")];
    expect(teams.map((t) => t.querySelector(".players")?.textContent))
      .toEqual(["Ana y Pablo", "<img src=x onerror=alert(1)> y Jugador eliminado"]);
    // Names are text, never markup.
    expect(card.document.querySelector("img")).toBeNull();
    expect(teams[0].classList.contains("won")).toBe(true);
    expect(teams[0].textContent).toContain("Ganan");
    expect([...teams[0].querySelectorAll(".set")].map((s) => s.textContent)).toEqual(["6", "4", "7"]);
    expect([...card.document.querySelectorAll(".chips li")].map((li) => li.textContent))
      .toEqual(["Víbora letal · Ana ×2", "Globo perfecto · Jugador eliminado"]);
    expect(sent.at(-1)).toMatchObject({ method: "ui/notifications/size-changed" });
  });

  it("says when a match has no winner", () => {
    const { deliver, text } = mountCard();
    deliver(toolResult({ ...result, events: [], match: { ...result.match, winner: null, court: null } }));
    expect(text()).toContain("Sin ganador");
    expect(text()).not.toContain("Pista");
    expect(text()).not.toContain("Destacados");
  });

  it("ignores errors and messages that are not from the host", () => {
    const { deliver, text } = mountCard();
    deliver({ ...toolResult(result), params: { isError: true, content: [{ type: "text", text: "nope" }] } });
    deliver(toolResult(result), null);
    expect(text()).toBe("");
  });

  it("answers the host's ping and teardown requests", () => {
    const { sent, deliver } = mountCard();
    deliver({ jsonrpc: "2.0", id: 41, method: "ping" });
    deliver({ jsonrpc: "2.0", id: 42, method: "ui/resource-teardown", params: {} });
    expect(sent.slice(-2)).toEqual([{ jsonrpc: "2.0", id: 41, result: {} }, { jsonrpc: "2.0", id: 42, result: {} }]);
  });
});

describe("ranking card", () => {
  const stats = {
    group: { id: "g", name: "Los del jueves", emoji: "🎾" },
    range: "90d",
    matches: 12,
    ranking: {
      minimumMatches: 5,
      rankedPlayers: 3,
      players: [
        { position: 1, id: "a", name: "Ana", matches: 8, wins: 6, losses: 2, winRate: 0.75, undecided: 0, provisional: false },
        { position: 2, id: "p", name: "<b>Pablo</b>", matches: 7, wins: 3, losses: 4, winRate: 0.4286, undecided: 0, provisional: false },
        { position: null, id: "l", name: "Lucía", matches: 2, wins: 1, losses: 1, winRate: 0.5, undecided: 0, provisional: true },
      ],
    },
    pairs: {
      by: "winRate", minimumMatches: 3, total: 4,
      top: [1, 2, 3, 4].map((n) => ({
        players: [{ id: "a", name: "Ana" }, { id: `x${n}`, name: n === 1 ? null : `Jugador ${n}` }],
        matches: 4, wins: 4 - n + 1, losses: n - 1, winRate: (5 - n) / 4, currentStreak: 1,
      })),
    },
    rivalries: { total: 0, top: [] },
  };

  it("ranks players with record and win rate, in Spanish", () => {
    const { card, sent, deliver, text } = mountCard(CARDS.ranking.html);
    deliver(toolResult(stats));

    expect(text()).toContain("🎾 Los del jueves");
    expect(text()).toContain("Últimos 90 días · 12 partidos");
    const rows = [...card.document.querySelectorAll(".ranking li")].map((li) =>
      [...li.children].map((c) => c.textContent));
    expect(rows).toEqual([
      ["1", "Ana", "6–2", "75 %"],
      ["2", "<b>Pablo</b>", "3–4", "43 %"],
      ["–", "Lucía Provisional", "1–1", "50 %"],
    ]);
    expect(card.document.querySelector("b")).toBeNull();
    expect(text()).toContain("Provisional: menos de 5 partidos, sin posición.");
    expect(sent.at(-1)).toMatchObject({ method: "ui/notifications/size-changed" });
  });

  it("shows the top three pairs in the order the tool chose", () => {
    const { card, deliver, text } = mountCard(CARDS.ranking.html);
    deliver(toolResult(stats));
    expect(text()).toContain("Parejas que más ganan");
    expect([...card.document.querySelectorAll(".pairs .name")].map((n) => n.textContent))
      .toEqual(["Ana y Jugador eliminado", "Ana y Jugador 2", "Ana y Jugador 3"]);

    deliver(toolResult({ ...stats, pairs: { ...stats.pairs, by: "matches" } }));
    expect(text()).toContain("Parejas que más juegan");
  });

  it("says when the range has no matches", () => {
    const { card, deliver, text } = mountCard(CARDS.ranking.html);
    deliver(toolResult({ ...stats, range: "30d", matches: 0, ranking: { ...stats.ranking, players: [] },
      pairs: { ...stats.pairs, top: [] } }));
    expect(text()).toContain("Últimos 30 días · 0 partidos");
    expect(text()).toContain("Sin partidos en este periodo");
    expect(card.document.querySelector(".ranking")).toBeNull();
  });

  it("keeps the pairs when matches remain but no player is ranked", () => {
    const { card, deliver, text } = mountCard(CARDS.ranking.html);
    deliver(toolResult({ ...stats, ranking: { ...stats.ranking, players: [] } }));
    expect(text()).toContain("Sin jugadores en el ranking");
    expect(text()).not.toContain("Sin partidos");
    expect(card.document.querySelectorAll(".pairs li")).toHaveLength(3);
  });
});
