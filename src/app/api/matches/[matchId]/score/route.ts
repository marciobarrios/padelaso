import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { MatchSet } from "@/lib/types";
import { extractToken, verifyScoreToken } from "../_token";

export const runtime = "nodejs";

interface ScoreRequestBody {
  team?: 1 | 2;
  delta?: number;
  newSet?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;

  const token = extractToken(request);
  const verified = await verifyScoreToken(matchId, token);
  if (!verified) {
    return Response.json({ error: "Invalid or expired token" }, { status: 401 });
  }

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
  // Atomic increment via Postgres RPC with SELECT ... FOR UPDATE — the DB
  // serializes concurrent writes (pinned scorer + Siri Shortcut), so we
  // never lose a point to a read-modify-write race.
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
  return Response.json({
    sets: updatedSets,
    score: `${last.team1Score}-${last.team2Score}`,
    setsSpoken: updatedSets
      .map((s) => `${s.team1Score}-${s.team2Score}`)
      .join(", "),
  });
}
