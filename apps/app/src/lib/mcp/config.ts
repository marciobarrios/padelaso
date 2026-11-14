export const MCP_PATH = "/api/mcp";
/** RFC 9728 §3.1: the metadata URL inserts the well-known segment before the resource path. */
export const RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

export interface McpConfig {
  /** Supabase Auth issuer, the `iss` claim of every token it signs. */
  issuer: string;
  /** Canonical MCP server URL, the protected resource identifier. */
  resource: string;
  resourceMetadataUrl: string;
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * `MCP_RESOURCE_URL` pins the public URL in production. Without it (local and
 * preview deployments) the resource is derived from the request's own origin.
 */
function resolveResource(request: Request): URL {
  const configured = process.env.MCP_RESOURCE_URL?.trim();
  const url = new URL(configured || MCP_PATH, request.url);
  const secure = url.protocol === "https:" || (url.protocol === "http:" && isLocalhost(url.hostname));
  if (!secure || url.pathname !== MCP_PATH || url.search || url.hash || url.username || url.password) {
    throw new Error("MCP_RESOURCE_URL must be an https URL ending in /api/mcp");
  }
  return url;
}

export function getMcpConfig(request: Request): McpConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  const resource = resolveResource(request);
  return {
    issuer: `${supabaseUrl}/auth/v1`,
    resource: resource.href,
    resourceMetadataUrl: `${resource.origin}${RESOURCE_METADATA_PATH}`,
  };
}

function allowlist(value: string | undefined): ReadonlySet<string> {
  return new Set((value ?? "").split(/[\s,]+/).filter(Boolean));
}

/** Registered OAuth clients allowed to call the MCP server. Empty denies all. */
export function isAllowedMcpClient(clientId: string): boolean {
  return allowlist(process.env.MCP_ALLOWED_CLIENT_IDS).has(clientId);
}

/** Phase 1 (MAR-98) beta testers. Empty denies all until MAR-100 opens access. */
export function isAllowedMcpUser(userId: string): boolean {
  return allowlist(process.env.MCP_ALLOWED_USER_IDS).has(userId);
}
