import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { EVENT_CONFIGS } from "@/lib/event-config";
import { MatchEventType } from "@/lib/types";
import { extractToken, verifyScoreToken } from "../_token";

export const runtime = "nodejs";

const VALID_EVENT_TYPES = new Set<string>(EVENT_CONFIGS.map((e) => e.type));

interface EventRequestBody {
  playerId?: string;
  type?: MatchEventType;
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

  let body: EventRequestBody;
  try {
    body = (await request.json()) as EventRequestBody;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const { playerId, type } = body;
  if (!playerId || !type) {
    return Response.json(
      { error: "playerId and type are required" },
      { status: 400 }
    );
  }
  if (!VALID_EVENT_TYPES.has(type)) {
    return Response.json({ error: `Unknown event type: ${type}` }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // Verify the player belongs to the match (one of the 4 team members)
  const { data: match } = await admin
    .from("matches")
    .select("team1, team2")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }
  const matchPlayers = new Set<string>([
    ...(match.team1 as string[]),
    ...(match.team2 as string[]),
  ]);
  if (!matchPlayers.has(playerId)) {
    return Response.json(
      { error: "playerId is not part of this match" },
      { status: 400 }
    );
  }

  const { data: inserted, error } = await admin
    .from("match_events")
    .insert({
      match_id: matchId,
      player_id: playerId,
      type,
      created_by: verified.createdBy,
    })
    .select("id")
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ id: inserted.id, type, playerId });
}
