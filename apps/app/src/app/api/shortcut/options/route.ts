import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { EVENT_CONFIGS } from "@padelaso/domain/events";
import { requireActiveMatch } from "../../_token";
import {
  buildEventOptions,
  buildPlayerOptions,
  eventOptionLabel,
} from "../_options";

// Feeds the Apple Watch shortcut's tap-driven pickers. Shortcuts treats
// dictionaries as unordered key/value rows, so each picker gets an ordered,
// label-only array that the mutation endpoint can resolve directly. The maps
// remain in the response for shortcuts created before label resolution moved
// to the server.
export async function GET(request: NextRequest) {
  const auth = await requireActiveMatch(request);
  if (auth instanceof Response) return auth;
  const { verified, matchId } = auth;

  const admin = createAdminSupabaseClient();
  const { data: match } = await admin
    .from("matches")
    .select("team1, team2, group_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) {
    return Response.json(
      { error: "Match not found", spoken: "Partido no encontrado." },
      { status: 404 }
    );
  }

  const orderedIds = [
    ...(match.team1 as string[]),
    ...(match.team2 as string[]),
  ];
  const [{ data: playerRows }, { data: eventRows }] = await Promise.all([
    admin.from("players").select("id, name, emoji, user_id").in("id", orderedIds),
    admin
      .from("match_events")
      .select("type, matches!inner(group_id)")
      .eq("matches.group_id", match.group_id as string),
  ]);

  // Sort the vocabulary by group-wide usage (config order as tie-breaker),
  // mirroring QuickEventRow, so the Watch list leads with the usual suspects.
  const counts = new Map<string, number>();
  for (const row of eventRows ?? []) {
    const t = row.type as string;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const sortedConfigs = EVENT_CONFIGS.map((cfg, originalIndex) => ({
    cfg,
    count: counts.get(cfg.type) ?? 0,
    originalIndex,
  })).sort((a, b) =>
    b.count !== a.count ? b.count - a.count : a.originalIndex - b.originalIndex
  );

  const eventTypes = buildEventOptions();
  const events = Object.fromEntries(
    sortedConfigs.map(({ cfg }) => {
      const label = eventOptionLabel(cfg);
      return [label, eventTypes[label]];
    })
  );
  const players = buildPlayerOptions(
    orderedIds,
    (playerRows ?? []).map((player) => ({
      id: player.id as string,
      name: player.name as string,
      emoji: player.emoji as string,
      userId: (player.user_id as string | null) ?? null,
    })),
    verified.createdBy
  );

  return Response.json({
    match: { id: matchId },
    eventOptions: Object.keys(events),
    events,
    playerOptions: Object.keys(players),
    players,
  });
}
