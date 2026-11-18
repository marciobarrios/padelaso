import * as Sentry from "@sentry/nextjs";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpAccessToken } from "./auth";
import { getMcpConfig, RESOURCE_METADATA_PATH } from "./config";
import { auditMcpRequest } from "./audit";
import { checkMcpRateLimit, rateLimitedResponse } from "./rate-limit";
import { registerTools } from "./tools";

const INSTRUCTIONS =
  "Padelaso tracks padel matches among groups of friends. Start with list_groups, " +
  "resolve player names with list_players, then use list_matches or get_player_stats. " +
  "get_match shows one match with its events and their IDs. " +
  "To record a finished match, resolve all four players to IDs (ask when a name is ambiguous or unknown), " +
  "confirm the teams, set scores and date with the user, then call create_match once. " +
  "To add highlights to a recorded match, find it with list_matches and get_match, confirm the match and " +
  "the events with the user, then call add_match_events once. " +
  "To remove one mistaken event, read the match with get_match, restate the match and that event to the user, " +
  "and only after they confirm call remove_match_event with the event ID and the version from that read. " +
  "To correct a recorded match's teams, score, date or court, read it with get_match, confirm the old and new " +
  "values with the user, then call update_match once with its version and only the fields that change. " +
  "You only see groups the signed-in user belongs to. Only remove_match_event removes data, one event at a time; " +
  "no tool deletes matches, players or groups.";

/**
 * Stateless: every request builds a fresh server, so there is no session store
 * or affinity. Tools read the verified token from the request context.
 */
const mcp = createMcpHandler(registerTools, {
  serverInfo: { name: "padelaso", version: "1.0.0" },
  instructions: INSTRUCTIONS,
  // Serverless functions cannot hold subscription streams open.
  maxSubscriptions: 0,
});

/**
 * Runs after the token is verified, so budgets are per verified user and
 * client. Over the limit, the request is answered here and never reaches a tool.
 */
async function rateLimited(request: Request & { auth?: AuthInfo }): Promise<Response> {
  const retryAfter = request.auth ? await checkMcpRateLimit(request.auth) : null;
  return retryAfter === null ? mcp(request) : rateLimitedResponse(retryAfter);
}

/**
 * Bearer tokens only, never cookies, so any origin may call the endpoint;
 * browser-based clients such as the MCP Inspector need these headers.
 */
export const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Retry-After, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

function withHeaders(response: Response, headers: Record<string, string>) {
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
}

export async function handleMcpRequest(request: Request): Promise<Response> {
  let response: Response;
  try {
    const config = getMcpConfig(request);
    const authenticated = withMcpAuth((req: Request & { auth?: AuthInfo }) => auditMcpRequest(req, req.auth, rateLimited), (_req, token) => verifyMcpAccessToken(token, config), {
      required: true,
      resourceUrl: new URL(config.resource).origin,
      resourceMetadataPath: RESOURCE_METADATA_PATH,
    });
    response = await authenticated(request);
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: "mcp-request" } });
    response = Response.json({ error: "server_error", error_description: "MCP server unavailable" }, { status: 500 });
  }
  return withHeaders(response, { ...MCP_CORS_HEADERS, "Cache-Control": "no-store" });
}

export function mcpPreflight(): Response {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
}
