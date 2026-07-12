import { NextRequest } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { EVENT_CONFIGS } from "@/lib/event-config";
import { requireActiveMatch } from "../../_token";

// Feeds the Apple Watch shortcut's tap-driven pickers. Both `events` and
// `players` are JSON dictionaries because the Shortcuts app's "Choose from
// List" action, given a dictionary, displays the keys and resolves the
// chosen item to its value — so the Watch shows "🐍 Víbora letal" while the
// shortcut gets back the machine-readable `vibora` with zero parsing actions.
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

  const events: Record<string, string> = {};
  for (const { cfg } of sortedConfigs) {
    events[`${cfg.emoji} ${cfg.label}`] = cfg.type;
  }

  const byId = new Map((playerRows ?? []).map((p) => [p.id as string, p]));
  const players: Record<string, string> = {};
  for (const id of orderedIds) {
    const p = byId.get(id);
    if (!p) continue;
    const self = (p.user_id as string | null) === verified.createdBy;
    let key = `${p.emoji as string} ${p.name as string}${self ? " (yo)" : ""}`;
    // Duplicate emoji+name pairs would silently merge as dictionary keys.
    while (key in players) key += " ²";
    players[key] = id;
  }

  return Response.json({ match: { id: matchId }, events, players });
}
