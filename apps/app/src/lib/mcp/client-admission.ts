import * as Sentry from "@sentry/nextjs";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAllowedMcpClient } from "./config";

/** Destination policy, not proof of the client publisher's identity. */
function isChatGptCallback(uri: string): boolean {
  // Match the serialized URI itself: no URL normalization, credentials, ports,
  // query strings, fragments, encoded path separators or additional segments.
  return uri.trim() === uri && /^https:\/\/chatgpt\.com\/(?:connector_platform_oauth_redirect|connector\/oauth\/[A-Za-z0-9_-]+)$/.test(uri);
}

// Grok Bot (MAR-156) registers through Cursor's connector backend with both
// callbacks. The loopback is trusted only next to the Cursor callback.
const CURSOR_CALLBACK = "https://www.cursor.com/agents/mcp/oauth/callback";
const CURSOR_LOOPBACK = "http://localhost:8787/callback";

/** Every URI must pass: a trusted callback next to an attacker's is unsafe. */
function hasTrustedCallbacks(uris: string[]): boolean {
  return uris.length > 0 && uris.every((uri) => isChatGptCallback(uri) || uri === CURSOR_CALLBACK ||
    (uri === CURSOR_LOOPBACK && uris.includes(CURSOR_CALLBACK)));
}

/** Server-only admission shared by consent and the verified bearer boundary. */
export async function canUseMcpClient(clientId: string): Promise<boolean> {
  if (isAllowedMcpClient(clientId)) return true;
  if (process.env.MCP_SELF_SERVICE_ENABLED !== "true" ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(clientId)) return false;

  try {
    const { data: client, error } = await createAdminSupabaseClient().auth.admin.oauth.getClient(clientId);
    if (error?.status === 404) return false;
    if (error) throw error;
    return !!client && client.client_id === clientId && client.registration_type === "dynamic" &&
      hasTrustedCallbacks(client.redirect_uris);
  } catch {
    // Auth middleware handles this error before tool telemetry. Report a fixed
    // failure without raw admin errors, metadata or inherited request context.
    Sentry.withScope((scope) => {
      scope.clear();
      scope.addEventProcessor((event) => ({ event_id: event.event_id, timestamp: event.timestamp,
        platform: event.platform, level: event.level, exception: event.exception,
        fingerprint: ["mcp-client-registry"], tags: { operation: "mcp-client-registry" } }));
      Sentry.captureException(new Error("MCP client registry unavailable"));
    });
    throw new Error("Client verification is temporarily unavailable");
  }
}
