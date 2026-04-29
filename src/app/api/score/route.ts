import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { MatchSet } from "@/lib/types";
import { requireActiveMatch } from "../_token";
import { fetchMatchTeams, joinTeamNames, resolvePlayerNames } from "../_match";

export const runtime = "nodejs";

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
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const team = body.team;
  const delta = body.delta ?? 1;
  if (team !== 1 && team !== 2) {
    return Response.json({ error: "team must be 1 or 2" }, { status: 400 });
  }
  if (!Number.isFinite(delta) || delta < -10 || delta > 10) {
    return Response.json({ error: "delta must be between -10 and 10" }, { status: 400 });
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
    return Response.json({ error: error.message }, { status });
  }

  const updatedSets = data as MatchSet[];
  const last = updatedSets[updatedSets.length - 1];

  const teams = await fetchMatchTeams(admin, matchId);
  let label = "";
  if (teams) {
    const nameById = await resolvePlayerNames(admin, [
      ...teams.team1Ids,
      ...teams.team2Ids,
    ]);
    label = `${joinTeamNames(teams.team1Ids, nameById)} vs ${joinTeamNames(teams.team2Ids, nameById)}`;
  }

  const score = `${last.team1Score}-${last.team2Score}`;
  const teamWord = team === 1 ? "uno" : "dos";
  const spoken = body.newSet
    ? `Nuevo set. Marcador ${score}.`
    : delta > 0
      ? `Punto equipo ${teamWord}. Marcador ${score}.`
      : `Punto retirado equipo ${teamWord}. Marcador ${score}.`;

  return Response.json({
    match: { id: matchId, label },
    sets: updatedSets,
    score,
    setsSpoken: updatedSets
      .map((s) => `${s.team1Score}-${s.team2Score}`)
      .join(", "),
    spoken,
  });
}
