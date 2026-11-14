import * as Sentry from "@sentry/nextjs";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpAccessToken } from "./auth";
import { getMcpConfig, RESOURCE_METADATA_PATH } from "./config";
import { registerReadTools } from "./tools";

const INSTRUCTIONS =
  "Padelaso tracks padel matches among groups of friends. Start with list_groups, " +
  "resolve player names with list_players, then use list_matches or get_player_stats. " +
  "You only see groups the signed-in user belongs to. These tools cannot change data.";

/**
 * Stateless: every request builds a fresh server, so there is no session store
 * or affinity. Tools read the verified token from the request context.
 */
const mcp = createMcpHandler(registerReadTools, {
  serverInfo: { name: "padelaso", version: "1.0.0" },
  instructions: INSTRUCTIONS,
  // Serverless functions cannot hold subscription streams open.
  maxSubscriptions: 0,
});

/**
 * Bearer tokens only, never cookies, so any origin may call the endpoint;
 * browser-based clients such as the MCP Inspector need these headers.
 */
export const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
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
    const authenticated = withMcpAuth(mcp, (_req, token) => verifyMcpAccessToken(token, config), {
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
