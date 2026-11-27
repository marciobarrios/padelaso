/**
 * The MCP Apps scoreboard card for `get_match`: one self-contained HTML
 * document that the host renders in a sandboxed iframe and feeds the tool
 * result over postMessage. Display-only, no network, Spanish labels.
 */

import type { McpServer } from "@modelcontextprotocol/server";

export const MATCH_CARD_URI = "ui://padelaso/match-card.html";
const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/**
 * Tool `_meta` that links a tool to its card. Attached for every client: our
 * stateless server can't see the `initialize` capabilities on `tools/list`,
 * and the spec lets clients without MCP Apps ignore unknown `_meta`.
 * `ui/resourceUri` is the older key some hosts still read.
 */
export const MATCH_CARD_TOOL_META = { ui: { resourceUri: MATCH_CARD_URI }, "ui/resourceUri": MATCH_CARD_URI };

/**
 * Runs inside the card's iframe. It is serialized with `toString()`, so it must
 * not reference anything outside its own body (no imports, no module scope).
 */
export function matchCardMain(win: Window) {
  type Player = { id: string; name: string | null };
  type Team = { players: Player[]; setsWon: number };
  type MatchCard = {
    group?: { name?: string; emoji?: string };
    match?: {
      date?: string;
      court?: number | null;
      team1?: Team;
      team2?: Team;
      sets?: { team1: number; team2: number }[];
      winner?: "team1" | "team2" | null;
    };
    events?: { player?: Player; label?: string }[];
  };
  type HostContext = { theme?: string; timeZone?: string; styles?: { variables?: Record<string, string | undefined> } };

  const doc = win.document;
  const root = doc.getElementById("card")!;
  let timeZone: string | undefined;
  let last: MatchCard | undefined;
  let nextId = 1;
  const pending = new Map<number, (result: unknown) => void>();

  const send = (message: Record<string, unknown>) => win.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
  const request = (method: string, params: unknown) => {
    const id = nextId++;
    send({ id, method, params });
    return new Promise<unknown>((resolve) => pending.set(id, resolve));
  };

  const el = (tag: string, className?: string, text?: string) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    // textContent, never innerHTML: names come from users.
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const playerName = (p?: Player) => p?.name ?? "Jugador eliminado";

  function applyContext(context?: HostContext) {
    if (!context) return;
    if (context.theme === "light" || context.theme === "dark") {
      doc.documentElement.dataset.theme = context.theme;
      doc.documentElement.style.colorScheme = context.theme;
    }
    for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
      if (name.startsWith("--") && typeof value === "string") doc.documentElement.style.setProperty(name, value);
    }
    if (context.timeZone) timeZone = context.timeZone;
    if (last) render(last);
  }

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

  function teamRow(team: Team | undefined, key: "team1" | "team2", data: MatchCard) {
    const match = data.match ?? {};
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

  function render(data: MatchCard) {
    last = data;
    const match = data.match ?? {};
    const card = el("article", "scoreboard");
    card.setAttribute("aria-label", "Resultado del partido");

    const header = el("header");
    const group = [data.group?.emoji, data.group?.name].filter(Boolean).join(" ");
    header.append(el("span", "group", group));
    const details = [formatDate(match.date), match.court == null ? "" : `Pista ${match.court}`].filter(Boolean).join(" · ");
    header.append(el("span", "meta", details));
    card.append(header);

    card.append(teamRow(match.team1, "team1", data), teamRow(match.team2, "team2", data));
    if (!match.winner) card.append(el("p", "result", (match.sets ?? []).length ? "Sin ganador" : "Sin resultado"));

    const counts = new Map<string, { text: string; count: number }>();
    for (const event of data.events ?? []) {
      const text = `${event.label ?? ""} · ${playerName(event.player)}`;
      const key = `${event.label}|${event.player?.id}`;
      counts.set(key, { text, count: (counts.get(key)?.count ?? 0) + 1 });
    }
    if (counts.size) {
      const section = el("section", "events");
      section.append(el("h2", undefined, "Destacados"));
      const list = el("ul");
      for (const { text, count } of counts.values()) list.append(el("li", undefined, count > 1 ? `${text} ×${count}` : text));
      section.append(list);
      card.append(section);
    }

    root.replaceChildren(card);
    reportSize();
  }

  // The content's own height: scrollHeight never drops below the iframe's.
  let reported = -1;
  function reportSize() {
    const height = Math.ceil(doc.documentElement.getBoundingClientRect().height);
    if (height === reported) return;
    reported = height;
    send({ method: "ui/notifications/size-changed", params: { height } });
  }
  if (typeof win.ResizeObserver === "function") new win.ResizeObserver(reportSize).observe(doc.documentElement);

  win.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== win.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.method === undefined && pending.has(message.id)) {
      pending.get(message.id)!(message.result);
      pending.delete(message.id);
      return;
    }
    if (message.method === "ui/notifications/tool-result") {
      const content = message.params?.structuredContent;
      if (content && typeof content === "object" && !message.params?.isError) render(content as MatchCard);
    } else if (message.method === "ui/notifications/host-context-changed") {
      applyContext(message.params);
    } else if (message.id !== undefined && (message.method === "ping" || message.method === "ui/resource-teardown")) {
      send({ id: message.id, result: {} });
    }
  });

  void request("ui/initialize", {
    appInfo: { name: "padelaso-match-card", version: "1.0.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26",
  }).then((result) => {
    applyContext((result as { hostContext?: HostContext } | undefined)?.hostContext);
    send({ method: "ui/notifications/initialized", params: {} });
  });
}

// Host variables first, Padelaso's own palette as the fallback.
const STYLES = `
:root{color-scheme:light dark;--pa-bg:var(--color-background-primary,#fffaf0);--pa-surface:var(--color-background-secondary,#f6eedd);
--pa-text:var(--color-text-primary,#1f1a14);--pa-muted:var(--color-text-secondary,#6b5f4f);--pa-border:var(--color-border-primary,#e3d6bd);
--pa-accent:#d9480f;--pa-win:var(--color-text-success,#2b8a3e);--pa-radius:var(--border-radius-lg,14px)}
:root[data-theme=dark]{--pa-bg:var(--color-background-primary,#1c1a17);--pa-surface:var(--color-background-secondary,#26231f);
--pa-text:var(--color-text-primary,#f5efe4);--pa-muted:var(--color-text-secondary,#b7ab98);--pa-border:var(--color-border-primary,#3a352e);
--pa-accent:#ff8a4c;--pa-win:var(--color-text-success,#69db7c)}
@media (prefers-color-scheme:dark){:root:not([data-theme]){--pa-bg:#1c1a17;--pa-surface:#26231f;--pa-text:#f5efe4;--pa-muted:#b7ab98;--pa-border:#3a352e;--pa-accent:#ff8a4c;--pa-win:#69db7c}}
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{padding:0 4px 4px 0}
body{font-family:var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);color:var(--pa-text);font-size:var(--font-text-md-size,15px);line-height:1.4}
.scoreboard{background:var(--pa-bg);border:2px solid var(--pa-border);border-radius:var(--pa-radius);padding:14px 16px;box-shadow:4px 4px 0 var(--pa-border)}
header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;margin-bottom:10px}
.group{font-weight:var(--font-weight-bold,700)}.meta{color:var(--pa-muted);font-size:var(--font-text-sm-size,13px);text-transform:capitalize}
.team{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-radius:10px;background:var(--pa-surface);margin-top:6px}
.team.won{outline:2px solid var(--pa-win)}
.names{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}.players{font-weight:var(--font-weight-semibold,600);overflow-wrap:anywhere}
.badge{font-size:var(--font-text-xs-size,12px);font-weight:var(--font-weight-bold,700);color:var(--pa-win);border:1.5px solid currentColor;border-radius:999px;padding:0 8px}
.sets{display:flex;gap:6px;font-family:var(--font-mono,ui-monospace,monospace);font-variant-numeric:tabular-nums}
.set{min-width:1.6em;text-align:center;font-size:1.25em;color:var(--pa-muted)}.set-won{color:var(--pa-text);font-weight:var(--font-weight-bold,700)}
.result{margin:10px 0 0;color:var(--pa-muted);font-size:var(--font-text-sm-size,13px)}
.events{margin-top:12px}.events h2{margin:0 0 6px;font-size:var(--font-text-sm-size,13px);color:var(--pa-accent);text-transform:uppercase;letter-spacing:.06em}
.events ul{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.events li{font-size:var(--font-text-sm-size,13px);border:1.5px solid var(--pa-border);border-radius:999px;padding:2px 10px}
`;

/** No external origins: inline styles and script only. */
export const MATCH_CARD_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:";

export const MATCH_CARD_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${MATCH_CARD_CSP}">
<title>Partido · Padelaso</title>
<style>${STYLES}</style>
</head>
<body>
<main id="card" aria-live="polite"></main>
<script>(${matchCardMain.toString()})(window);</script>
</body>
</html>`;

/** No external origins: the host's CSP blocks all network access from the card. */
const RESOURCE_UI_META = { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false } };

/** Registers the card's `ui://` resource. It is static HTML with no user data. */
export function registerCards(server: McpServer) {
  server.registerResource("match_card", MATCH_CARD_URI, {
    title: "Tarjeta de partido",
    description: "Scoreboard card that MCP Apps hosts show for get_match.",
    mimeType: MCP_APP_MIME_TYPE,
    _meta: RESOURCE_UI_META,
  }, (uri) => ({
    contents: [{ uri: uri.href, mimeType: MCP_APP_MIME_TYPE, text: MATCH_CARD_HTML, _meta: RESOURCE_UI_META }],
  }));
}
