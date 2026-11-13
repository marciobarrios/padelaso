import { createRemoteJWKSet, jwtVerify } from "jose";
import { OAuthError, OAuthErrorCode, type AuthInfo } from "@modelcontextprotocol/server";

export const allowed = (value: string | undefined, id: string) =>
  (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean).includes(id);

export function mcpConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const resource = process.env.MCP_RESOURCE_URL?.trim();
  if (!supabaseUrl || !resource) throw new Error("Missing MCP configuration");
  const url = new URL(resource);
  if (url.pathname !== "/api/mcp" || url.search || url.hash || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("Invalid MCP_RESOURCE_URL");
  }
  return { issuer: `${supabaseUrl}/auth/v1`, resource: url.href, origin: url.origin };
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Only this adapter knows Supabase's OAuth claims and shared audience. */
export async function verifyMcpToken(_request: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  const { issuer } = mcpConfig();
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    keySets.set(issuer, keys);
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(token, keys, {
      issuer, audience: "authenticated", algorithms: ["ES256", "RS256"],
      requiredClaims: ["exp", "sub", "client_id", "iat"],
    }));
  } catch {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "Invalid OAuth access token");
  }
  if (typeof payload.client_id !== "string" || !payload.client_id || !payload.sub || payload.role !== "authenticated") {
    throw new OAuthError(OAuthErrorCode.InvalidToken, "OAuth user token required");
  }
  if (!allowed(process.env.MCP_ALLOWED_CLIENT_IDS, payload.client_id) ||
      !allowed(process.env.MCP_ALLOWED_USER_IDS, payload.sub)) {
    throw new OAuthError(OAuthErrorCode.InsufficientScope, "MCP access is not enabled for this connection");
  }
  return { token, clientId: payload.client_id, scopes: [], expiresAt: payload.exp, extra: { userId: payload.sub } };
}
