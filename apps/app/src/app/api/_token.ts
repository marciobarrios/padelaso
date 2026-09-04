import { createAdminSupabaseClient } from "@/lib/supabase-admin";

export interface VerifiedToken {
  token: string;
  createdBy: string;
  currentMatchId: string | null;
  rateLimited: boolean;
}

const REQUESTS_PER_MINUTE = 120;

interface AuthorizedTokenRow {
  created_by: string;
  current_match_id: string | null;
  rate_limited: boolean;
}

export async function verifyTokenAndGetMatch(
  token: string | null
): Promise<VerifiedToken | null> {
  if (!token) return null;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .rpc("authorize_score_token", {
      p_token: token,
      p_rate_limit: REQUESTS_PER_MINUTE,
      p_window_seconds: 60,
    })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as AuthorizedTokenRow;
  return {
    token,
    createdBy: row.created_by,
    currentMatchId: row.current_match_id,
    rateLimited: row.rate_limited,
  };
}

export function extractToken(request: Request): string | null {
  const url = new URL(request.url);
  const q = url.searchParams.get("token");
  if (q) return q;
  const auth = request.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export interface ActiveMatchAuth {
  verified: VerifiedToken;
  matchId: string;
}

export async function requireActiveMatch(
  request: Request
): Promise<ActiveMatchAuth | Response> {
  const token = extractToken(request);
  let verified: VerifiedToken | null;
  try {
    verified = await verifyTokenAndGetMatch(token);
  } catch (error) {
    console.error("[shortcut token authorization]", error);
    return Response.json(
      {
        ok: false,
        error: "Token authorization unavailable",
        spoken: "El servicio no está disponible. Inténtalo de nuevo.",
      },
      { status: 503 }
    );
  }
  if (!verified) {
    return Response.json(
      {
        ok: false,
        error: "Invalid token",
        spoken: "Token inválido.",
      },
      { status: 401 }
    );
  }
  if (verified.rateLimited) {
    return Response.json(
      {
        ok: false,
        error: "Rate limit exceeded",
        spoken: "Demasiadas peticiones. Espera un minuto.",
      },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }
  if (!verified.currentMatchId) {
    return Response.json(
      {
        ok: false,
        error: "No hay partido activo",
        spoken: "No hay ningún partido activo.",
      },
      { status: 409 }
    );
  }
  return { verified, matchId: verified.currentMatchId };
}
