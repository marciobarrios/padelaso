# Richer MCP experiences: feasibility (MAR-102)

Status: proposal, November 2026. Nothing here is built yet.

MAR-102 is the deferred, optional Phase 5 of the Padelaso MCP server (MAR-97).
Its acceptance criteria ask for feasibility, maintenance cost and UX
trade-offs to be written down before any item is built, and for nothing to
block or change the generic MCP server. This document covers the four items
and recommends an order. Each item becomes its own sub-issue.

## Where we start from

- `apps/app/src/lib/mcp/`: a stateless Streamable HTTP server at `/api/mcp`
  (`mcp-handler` 2.3, `@modelcontextprotocol/server` 2.4, Zod 4). Nine tools:
  five read (`list_groups`, `list_players`, `list_matches`, `get_match`,
  `get_player_stats`) and four write (`create_match`, `add_match_events`,
  `remove_match_event`, `update_match`).
- Every tool calls Supabase as the user (RLS is the authority) and returns
  `structuredContent` plus a JSON text copy, so any client can use it.
- Supabase Auth's OAuth 2.1 server issues the tokens. ChatGPT, Claude and
  Grok Bot are the tested clients; the guides live at
  `padelaso.com/asistentes`, and the app's Settings → Integrations lists and
  revokes connections.
- `@padelaso/domain` already computes everything the web stats page shows:
  `getRankedPlayerStats`, `getPairStats`, `getHeadToHeadStats`,
  `getEventLeaderboards`, `getEventRecords`, `getMvpRankings`,
  `computeFunAwards`, `getRecentForm`.

## Rules that hold for every item

1. **Generic first.** A new capability is a normal tool with
   `structuredContent` and a text fallback. Client-specific extras are
   additive metadata; a client that ignores them loses nothing but looks.
2. **No new logic outside `@padelaso/domain`.** The MCP layer only selects
   and shapes what the domain package computes, so the app, the mobile app
   and the assistants always agree.
3. **Read as the user.** No service-role access. New read tools are
   `READ_ONLY` and need no new grant.
4. **Small payloads.** Assistants pay for every token. Cap lists the way
   `get_player_stats` caps partners, and round rates.

## 1. `get_group_stats` and pair and rivalry comparisons

**What.** Answers like "who's top of the group?", "which pair wins most?",
"how do Ana and Luis do against Pedro and Marta?", "who has the most
smashes this year?".

**Feasibility: high.** All the maths exists in `@padelaso/domain` and runs on
the same inputs as `get_player_stats` (`listGroupPlayers`,
`listAllGroupMatches`). Leaderboards and MVP rankings also need all of the group's
events and votes. The web stats page loads them with client hooks;
`@padelaso/data` has no group-wide events or votes query yet, so the first
slice adds one (RLS already scopes both tables to members). Proposed tools, all read-only:

| Tool | Returns | Domain functions |
| --- | --- | --- |
| `get_group_stats` | Ranking (position, record, win rate, provisional flag), top pairs, top rivalries, event leaderboards, optional time range | `getRankedPlayerStats`, `getPairStats`, `getHeadToHeadStats`, `getEventLeaderboards` |
| `compare_players` | Two players side by side: records, as partners, against each other | `calculatePlayerStats`, `getPartnerStats`, filtered `getHeadToHeadStats` |
| `get_pair_stats` | One pair (two player IDs): record, streak, its rivalries | `getPairStats`, `getHeadToHeadStats` |

`compare_players` and `get_pair_stats` could start as optional arguments of
`get_group_stats` to keep the tool list short; decide in the sub-issue after
trying both in ChatGPT and Claude.

**Maintenance: low.** Same pattern as `get_player_stats`: an output Zod
schema, a handler and tests in `handler.test.ts`. The risk is drift from the web stats page,
whose time ranges (`all`, `30d`, `90d`) and filtering live inline in
`stats-page-content.tsx`. Move that filter into `@padelaso/domain` and use it
from both, so a tool's `range` argument means the same as the page's.

**UX trade-offs.**
- Plus: the questions people actually ask an assistant about a group, and
  the assistant no longer has to page through `list_matches` and do the
  maths itself (slow, costly and often wrong).
- Minus: a large group's full output can be big. Cap each list (top 10
  ranking, top 5 pairs and rivalries) and let the model ask for more.
- No new permissions, no new screens, no migration.

**Recommendation: build first.** Highest value for the lowest cost, and the
cards in item 2 need these tools anyway.

## 2. Match and ranking cards (MCP Apps)

**What.** Rendered cards in the chat: a match scoreboard after `get_match` or
`create_match`, a ranking table after `get_group_stats`.

**Standard.** MCP Apps (`io.modelcontextprotocol/ui`, spec 2026-01-26): the
server registers a `ui://` resource of type `text/html;profile=mcp-app`, and
a tool links to it with `_meta.ui.resourceUri`. The host renders the HTML in
a sandboxed iframe and passes it the tool result. ChatGPT and Claude both
render MCP Apps; ChatGPT also offers `window.openai` extras, which we do not
need. The SDK is `@modelcontextprotocol/ext-apps` (2.0.4 at the time of
writing), which builds on `@modelcontextprotocol/server` v2, the version we
already use.

**Feasibility: medium.**
- The server side is small: register one resource per card and add `_meta`
  to the existing tools. Tools keep returning the same `structuredContent`,
  so clients without MCP Apps see no change. That meets "nothing here
  changes the generic server".
- The work is the card itself: a self-contained HTML bundle (no access to
  the app's cookies, its own CSS, ideally under ~100 KB) built from a small
  React or plain-TS entry, served as a resource string. It needs a build
  step inside `apps/app` or a small new package, plus a Content Security
  Policy declared in the resource metadata (no external origins needed if
  fonts and icons are inlined).
- Check before building: that `mcp-handler` 2.3 passes resource `_meta`
  through unchanged, and how Vercel serves the bundled HTML (a build-time
  string import is simplest).

**Maintenance: medium.** A second UI surface to keep in step with the web
app's look (`PRODUCT.md`: playful, retro), light and dark themes from the
host, and two hosts with slightly different iframe sizes and behaviour. Each
schema change to a tool's output must update its card. Tests: unit-test the
card's render from fixture `structuredContent`, plus a manual check in
ChatGPT and Claude per release.

**UX trade-offs.**
- Plus: scores and rankings are easier to read as a card than as model
  prose, and the brand shows up inside the chat.
- Minus: the model often restates the card in text anyway; cards take
  vertical space on mobile; interactive cards (buttons that call tools) add
  write paths that need the same confirmation rules as today's write tools.
  Start with **display-only** cards.
- Card text should follow the user's language like the model's replies; the
  web app is Spanish-only, so start with Spanish labels and revisit.

**Recommendation: second, display-only.** One scoreboard card for
`get_match` first; add the ranking card once `get_group_stats` exists.

## 3. Entry points from the product ("Analyze with ChatGPT")

**What.** A button on the stats or match page that opens an assistant with a
ready prompt, e.g. "Analiza mi grupo de pádel en Padelaso".

**Feasibility: high, but fragile.** ChatGPT fills its input box from
`https://chatgpt.com/?q=<prompt>`. This is not a documented integration, so
it can change without notice, and it does not submit the prompt. Claude has
`https://claude.ai/new?q=<prompt>`, also undocumented; verify it in a
browser before relying on it. Neither link can choose our connector; the
assistant only uses Padelaso if the user already connected it.

**Maintenance: low** (two URL templates and a prompt string), but the links
must be checked from time to time because they are undocumented.

**UX trade-offs.**
- Plus: discovery. People who never read the guides learn that the
  assistants can answer questions about their group.
- Minus: a user who has not connected Padelaso gets a generic answer with no
  data, which feels broken. The button should therefore open the connection
  guide (`padelaso.com/asistentes#conectar`) when the user has no grant in
  Settings → Integrations (the app can list grants already), and the prompt
  link only when a grant exists.
- The prompt must not include personal data (names, scores): it ends up in
  the assistant's URL and history. Group and player IDs are fine because the
  tools need them and they are useless without the user's token.
- Mobile app: the same links open the ChatGPT or Claude apps through
  universal links; check this on device.

**Recommendation: third, small.** Worth doing once item 1 makes the answers
good. Put it in one place first (stats page), measure clicks, then decide.

## 4. Sign in with ChatGPT as an optional identity provider

**What.** "Continue with ChatGPT" on the login page, next to Google.

**Status.** OpenAI's Sign in with ChatGPT went to beta in July 2026 and was
expanded at DevDay (29 September 2026), mainly so third-party apps can spend
a subscriber's ChatGPT plan usage. Access for hosted apps is by
application; it is not a self-serve OAuth/OIDC provider like Google.
Supabase Auth has no built-in ChatGPT provider, so it would need a custom
OIDC provider (if OpenAI exposes standard OIDC) or our own token exchange.

**Feasibility: low today.** Blocked on OpenAI granting access, and on
whether it exposes standard OIDC that Supabase can use.

**Maintenance: high for the benefit.** A third identity provider means
account-linking rules (same email as a Google account?), a new path in the
web and mobile login flows (`apps/mobile/AUTH.md`), and a new review area
under the merge rules.

**UX trade-offs.** It saves one step only for people who have ChatGPT and not
Google, which is rare among our users. It does not help MCP: the connector
still uses Padelaso's own OAuth (MAR-97 is explicit that it never replaces
MCP OAuth). We do not need plan usage because Padelaso runs no LLM.

**Recommendation: don't build.** Keep it in Backlog and revisit only if
OpenAI opens it as self-serve OIDC and users ask for it.

## Proposed order and sub-issues

1. **Group stats, pair and rivalry tools for the MCP server** (item 1).
2. **Display-only MCP Apps cards: match scoreboard, then ranking** (item 2;
   ranking card after 1).
3. **"Analizar con ChatGPT / Claude" entry point on the stats page** (item 3;
   after 1).
4. **Sign in with ChatGPT: revisit when self-serve** (item 4; no build).

MAR-102 closes when 1–3 ship and 4 is parked with its reason.

## Sources

- [MCP Apps specification, 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)
- [`@modelcontextprotocol/ext-apps` on npm](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps)
- [Sign in with ChatGPT and plan usage (The New Stack)](https://thenewstack.io/sign-in-with-chatgpt/)
- [ChatGPT `?q=` prompt links (OpenAI community)](https://community.openai.com/t/how-to-open-chatgpt-with-a-predefined-prompt-already-in-the-chat-box/998558)
