import { isAuthRetryableFetchError, type AuthError } from "@supabase/supabase-js";
import { OAuthError, OAuthErrorCode, type AuthInfo } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createAnonSupabaseClient } from "@/lib/supabase-user";
import { isAllowedMcpClient, isAllowedMcpUser, type McpConfig } from "./config";

export interface McpUser {
  userId: string;
}

const claimsSchema = z.object({
  iss: z.string(),
  sub: z.uuid(),
  aud: z.union([z.string(), z.array(z.string())]),
  role: z.string(),
  exp: z.number(),
  // Supabase adds client_id only to tokens its OAuth server issues. Ordinary
  // app sessions (web, native) lack it, so this rejects them.
  client_id: z.string().min(1).optional(),
  scope: z.string().optional(),
  is_anonymous: z.boolean().optional(),
});

const invalid = (description: string) => new OAuthError(OAuthErrorCode.InvalidToken, description);

function isUpstreamFailure(error: AuthError) {
  return isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500;
}

/**
 * Verifies a Supabase OAuth access token for the MCP resource.
 *
 * `getClaims` checks the signature against the project's JWKS (cached per
 * process) for asymmetric keys, and asks Supabase Auth for symmetric keys, then
 * checks expiry. This adds the issuer, audience and role checks, and requires an
 * allowlisted OAuth client.
 *
 * Throws `invalid_token` (401) when the token is unusable here, and
 * `insufficient_scope` (403) when it is valid but the account has no MCP access.
 */
export async function verifyMcpAccessToken(token: string | undefined, config: McpConfig): Promise<AuthInfo | undefined> {
  if (!token) return undefined;

  let payload: unknown;
  try {
    const { data, error } = await createAnonSupabaseClient().auth.getClaims(token);
    if (error) {
      if (isUpstreamFailure(error)) {
        throw new OAuthError(OAuthErrorCode.ServerError, "Token verification is temporarily unavailable");
      }
      throw invalid("The access token is invalid or expired");
    }
    payload = data?.claims;
  } catch (error) {
    if (error instanceof OAuthError) throw error;
    // getClaims throws plain errors for expired or malformed tokens.
    throw invalid("The access token is invalid or expired");
  }

  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) throw invalid("The access token is missing required claims");
  const claims = parsed.data;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];

  if (claims.iss !== config.issuer) throw invalid("The access token was issued by another server");
  if (!audiences.includes("authenticated") || claims.role !== "authenticated" || claims.is_anonymous) {
    throw invalid("The access token does not belong to a signed-in user");
  }
  if (claims.exp <= Date.now() / 1000) throw invalid("The access token has expired");
  if (!claims.client_id) throw invalid("An OAuth access token is required");
  if (!isAllowedMcpClient(claims.client_id)) {
    throw invalid("The access token was not issued to an allowed MCP client");
  }
  if (!isAllowedMcpUser(claims.sub)) {
    throw new OAuthError(OAuthErrorCode.InsufficientScope, "MCP access is not enabled for this account yet");
  }

  return {
    token,
    clientId: claims.client_id,
    scopes: claims.scope?.split(" ").filter(Boolean) ?? [],
    expiresAt: claims.exp,
    resource: new URL(config.resource),
    extra: { userId: claims.sub } satisfies McpUser,
  };
}

/** The verified user behind a tool call; `withMcpAuth` guarantees it exists. */
export function mcpUserFrom(authInfo: AuthInfo | undefined): McpUser & { token: string } {
  const userId = authInfo?.extra?.userId;
  if (!authInfo || typeof userId !== "string") throw new Error("Unauthenticated MCP tool call");
  return { userId, token: authInfo.token };
}
