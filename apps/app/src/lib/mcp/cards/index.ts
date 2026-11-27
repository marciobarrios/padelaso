/**
 * MCP Apps cards: self-contained HTML documents that hosts such as ChatGPT
 * and Claude render in a sandboxed iframe and feed a tool's result over
 * postMessage. Display-only, no network, Spanish labels.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { cardBridge, type CardRender } from "./bridge";
import { MATCH_CARD_STYLES, renderMatchCard } from "./match-card";
import { RANKING_CARD_STYLES, renderRankingCard } from "./ranking-card";

const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

/** No external origins: inline styles and script only. */
export const CARD_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:";

// Host variables first, Padelaso's own palette as the fallback.
const BASE_STYLES = `
:root{color-scheme:light dark;--pa-bg:var(--color-background-primary,#fffaf0);--pa-surface:var(--color-background-secondary,#f6eedd);
--pa-text:var(--color-text-primary,#1f1a14);--pa-muted:var(--color-text-secondary,#6b5f4f);--pa-border:var(--color-border-primary,#e3d6bd);
--pa-accent:#d9480f;--pa-win:var(--color-text-success,#2b8a3e);--pa-radius:var(--border-radius-lg,14px)}
:root[data-theme=dark]{--pa-bg:var(--color-background-primary,#1c1a17);--pa-surface:var(--color-background-secondary,#26231f);
--pa-text:var(--color-text-primary,#f5efe4);--pa-muted:var(--color-text-secondary,#b7ab98);--pa-border:var(--color-border-primary,#3a352e);
--pa-accent:#ff8a4c;--pa-win:var(--color-text-success,#69db7c)}
@media (prefers-color-scheme:dark){:root:not([data-theme]){--pa-bg:#1c1a17;--pa-surface:#26231f;--pa-text:#f5efe4;--pa-muted:#b7ab98;--pa-border:#3a352e;--pa-accent:#ff8a4c;--pa-win:#69db7c}}
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{padding:0 4px 4px 0}
body{font-family:var(--font-sans,system-ui,-apple-system,"Segoe UI",sans-serif);color:var(--pa-text);font-size:var(--font-text-md-size,15px);line-height:1.4}
.card{background:var(--pa-bg);border:2px solid var(--pa-border);border-radius:var(--pa-radius);padding:14px 16px;box-shadow:4px 4px 0 var(--pa-border)}
header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;margin-bottom:10px}
.group{font-weight:var(--font-weight-bold,700)}.meta{color:var(--pa-muted);font-size:var(--font-text-sm-size,13px)}
.badge{font-size:var(--font-text-xs-size,12px);font-weight:var(--font-weight-bold,700);color:var(--pa-win);border:1.5px solid currentColor;border-radius:999px;padding:0 8px}
.note{margin:10px 0 0;color:var(--pa-muted);font-size:var(--font-text-sm-size,13px)}
section{margin-top:12px}h2{margin:0 0 6px;font-size:var(--font-text-sm-size,13px);color:var(--pa-accent);text-transform:uppercase;letter-spacing:.06em}
.chips{margin:0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}
.chips li{font-size:var(--font-text-sm-size,13px);border:1.5px solid var(--pa-border);border-radius:999px;padding:2px 10px}
`;

function cardHtml(title: string, appName: string, styles: string, render: CardRender) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CARD_CSP}">
<title>${title} · Padelaso</title>
<style>${BASE_STYLES}${styles}</style>
</head>
<body>
<main id="card" aria-live="polite"></main>
<script>(${cardBridge.toString()})(window, ${JSON.stringify(appName)}, ${render.toString()});</script>
</body>
</html>`;
}

export const CARDS = {
  match: {
    uri: "ui://padelaso/match-card.html",
    name: "match_card",
    title: "Tarjeta de partido",
    description: "Scoreboard card that MCP Apps hosts show for get_match.",
    html: cardHtml("Partido", "padelaso-match-card", MATCH_CARD_STYLES, renderMatchCard),
  },
  ranking: {
    uri: "ui://padelaso/ranking-card.html",
    name: "ranking_card",
    title: "Tarjeta de ranking",
    description: "Ranking card that MCP Apps hosts show for get_group_stats.",
    html: cardHtml("Ranking", "padelaso-ranking-card", RANKING_CARD_STYLES, renderRankingCard),
  },
} as const;

/**
 * Tool `_meta` that links a tool to its card. Attached for every client: our
 * stateless server can't see the `initialize` capabilities on `tools/list`,
 * and the spec lets clients without MCP Apps ignore unknown `_meta`.
 * `ui/resourceUri` is the older key some hosts still read.
 */
export function cardToolMeta(card: keyof typeof CARDS) {
  const uri = CARDS[card].uri;
  return { ui: { resourceUri: uri }, "ui/resourceUri": uri };
}

/** No external origins: the host's CSP blocks all network access from the card. */
const RESOURCE_UI_META = { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: false } };

/** Registers each card's `ui://` resource. They are static HTML with no user data. */
export function registerCards(server: McpServer) {
  for (const card of Object.values(CARDS)) {
    server.registerResource(card.name, card.uri, {
      title: card.title,
      description: card.description,
      mimeType: MCP_APP_MIME_TYPE,
      _meta: RESOURCE_UI_META,
    }, (uri) => ({
      contents: [{ uri: uri.href, mimeType: MCP_APP_MIME_TYPE, text: card.html, _meta: RESOURCE_UI_META }],
    }));
  }
}
