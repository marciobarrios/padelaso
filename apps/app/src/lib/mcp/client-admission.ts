import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { isAllowedMcpClient } from "./config";

/** Destination policy, not proof of the client publisher's identity. */
function isChatGptCallback(uri: string): boolean {
  // Match the serialized URI itself: no URL normalization, credentials, ports,
  // query strings, fragments, encoded path separators or additional segments.
  return uri.trim() === uri && /^https:\/\/chatgpt\.com\/(?:connector_platform_oauth_redirect|connector\/oauth\/[A-Za-z0-9_-]+)$/.test(uri);
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
    // Every URI must pass: a trusted callback next to an attacker's is unsafe.
    return !!client && client.client_id === clientId && client.registration_type === "dynamic" &&
      client.redirect_uris.length > 0 && client.redirect_uris.every(isChatGptCallback);
  } catch {
    // Do not log raw admin API errors, metadata, credentials or tokens.
    throw new Error("Client verification is temporarily unavailable");
  }
}
