import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { MatchSet } from "@padelaso/domain/types";
import { requireActiveMatch } from "../_token";

interface ScoreRequestBody {
  team?: 1 | 2;
  delta?: number;
  newSet?: boolean;
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveMatch(request);
  if (auth instanceof Response) return auth;
  const { matchId } = auth;

  let body: ScoreRequestBody;
  try {
    body = (await request.json()) as ScoreRequestBody;
  } catch {
    return Response.json(
      {
        ok: false,
        error: "Body must be JSON",
        spoken: "No pude leer los datos enviados por el atajo.",
      },
      { status: 400 }
    );
  }

  const team = body.team;
  const delta = body.delta ?? 1;
  if (team !== 1 && team !== 2) {
    return Response.json(
      {
        ok: false,
        error: "team must be 1 or 2",
        spoken: "El equipo no es válido. Revisa el cuerpo del atajo.",
      },
      { status: 400 }
    );
  }
  if (!Number.isFinite(delta) || delta < -10 || delta > 10) {
    return Response.json(
      {
        ok: false,
        error: "delta must be between -10 and 10",
        spoken: "El cambio de puntuación no es válido.",
      },
      { status: 400 }
    );
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin.rpc("increment_match_score", {
    p_match_id: matchId,
    p_team: team,
    p_delta: delta,
    p_new_set: body.newSet ?? false,
  });
  if (error) {
    const status = error.code === "P0002" ? 404 : 500;
    return Response.json(
      {
        ok: false,
        error: error.message,
        spoken:
          status === 404
            ? "No encuentro el partido activo."
            : "No pude actualizar el marcador.",
      },
      { status }
    );
  }

  const updatedSets = data as MatchSet[];
  const last = updatedSets[updatedSets.length - 1];

  const score = `${last.team1Score}-${last.team2Score}`;
  const spoken = score;

  return Response.json({
    ok: true,
    match: { id: matchId },
    sets: updatedSets,
    score,
    setsSpoken: updatedSets
      .map((s) => `${s.team1Score}-${s.team2Score}`)
      .join(", "),
    spoken,
  });
}
