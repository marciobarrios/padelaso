// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import { MATCH_CARD_CSP, MATCH_CARD_HTML } from "./match-card";

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
function mountCard() {
  const host = new JSDOM("").window;
  const sent: Record<string, unknown>[] = [];
  host.postMessage = vi.fn((message: Record<string, unknown>) => { sent.push(message); });
  const card = new JSDOM(MATCH_CARD_HTML, {
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

describe("match card", () => {
  it("is one self-contained document with a CSP and no external origins", () => {
    expect(MATCH_CARD_CSP).toContain("default-src 'none'");
    expect(MATCH_CARD_HTML).toContain(`content="${MATCH_CARD_CSP}"`);
    expect(MATCH_CARD_HTML).not.toMatch(/https?:\/\//);
    expect(MATCH_CARD_HTML).not.toMatch(/<(script|link)[^>]+(src|href)=/);
    expect(Buffer.byteLength(MATCH_CARD_HTML)).toBeLessThan(20_000);
  });

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
    expect([...card.document.querySelectorAll(".events li")].map((li) => li.textContent))
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
