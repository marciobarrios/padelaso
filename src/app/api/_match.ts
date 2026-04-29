import { createAdminSupabaseClient } from "@/lib/supabase-admin";

type AdminClient = ReturnType<typeof createAdminSupabaseClient>;

export interface MatchTeams {
  team1Ids: string[];
  team2Ids: string[];
}

export async function fetchMatchTeams(
  admin: AdminClient,
  matchId: string
): Promise<MatchTeams | null> {
  const { data } = await admin
    .from("matches")
    .select("team1, team2")
    .eq("id", matchId)
    .maybeSingle();
  if (!data) return null;
  return {
    team1Ids: data.team1 as string[],
    team2Ids: data.team2 as string[],
  };
}

export async function resolvePlayerNames(
  admin: AdminClient,
  ids: string[]
): Promise<Map<string, string>> {
  const { data } = await admin
    .from("players")
    .select("id, name")
    .in("id", ids);
  return new Map<string, string>(
    (data ?? []).map((p) => [p.id as string, p.name as string])
  );
}

export function joinTeamNames(
  ids: string[],
  nameById: Map<string, string>
): string {
  return ids.map((id) => nameById.get(id) ?? "?").join("·");
}
