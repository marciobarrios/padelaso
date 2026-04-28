import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { EVENT_CONFIGS } from "@/lib/event-config";
import { MatchEventType } from "@/lib/types";
import { requireActiveMatch } from "../_token";
import { fetchMatchTeams } from "../_match";

export const runtime = "nodejs";

const VALID_EVENT_TYPES = new Set<string>(EVENT_CONFIGS.map((e) => e.type));

interface EventRequestBody {
  playerId?: string;
  type?: MatchEventType;
}

export async function POST(request: NextRequest) {
  const auth = await requireActiveMatch(request);
  if (auth instanceof Response) return auth;
  const { verified, matchId } = auth;

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
  const teams = await fetchMatchTeams(admin, matchId);
  if (!teams) {
    return Response.json({ error: "Match not found" }, { status: 404 });
  }
  const matchPlayers = new Set<string>([...teams.team1Ids, ...teams.team2Ids]);
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

  return Response.json({
    match: { id: matchId },
    id: inserted.id,
    type,
    playerId,
  });
}
