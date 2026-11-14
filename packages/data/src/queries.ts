import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { mapMatch } from './mappers';
import { scoreSchema } from './contracts';

/** The caller supplies an authenticated client; RLS remains authoritative. */
export async function listMatches(client: SupabaseClient, groupId: string) {
  const { data, error } = await client.from('matches').select('*')
    .eq('group_id', groupId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapMatch);
}

/** Legacy RPC: NOT idempotent. Never automatically retry after an unknown outcome. */
export async function incrementMatchScore(client: SupabaseClient, matchId: string,
  team: 1 | 2, delta: number, newSet = false) {
  z.string().min(1).parse(matchId);
  z.union([z.literal(1), z.literal(2)]).parse(team);
  z.number().int().safe().parse(delta);
  const { data, error } = await client.rpc('increment_match_score', {
    p_match_id: matchId, p_team: team, p_delta: delta, p_new_set: newSet,
  });
  if (error) throw error;
  return scoreSchema.parse(data);
}

/** Display fields only: invite codes and account IDs never leave these reads. */
export interface GroupSummary {
  id: string;
  name: string;
  emoji: string;
}

export interface PlayerSummary {
  id: string;
  name: string;
  emoji: string;
  userId: string | null;
}

const uuid = z.uuid();
const MATCH_ORDER = [
  ['date', { ascending: false }],
  ['created_at', { ascending: false }],
  ['id', { ascending: false }],
] as const;

/** RLS limits this to groups the caller belongs to. */
export async function listMemberGroups(client: SupabaseClient): Promise<GroupSummary[]> {
  const { data, error } = await client.from('groups').select('id,name,emoji')
    .order('name').order('id');
  if (error) throw error;
  return (data ?? []) as GroupSummary[];
}

/** Null when the group does not exist or the caller is not a member (indistinguishable by design). */
export async function getMemberGroup(client: SupabaseClient, groupId: string): Promise<GroupSummary | null> {
  const { data, error } = await client.from('groups').select('id,name,emoji')
    .eq('id', uuid.parse(groupId)).maybeSingle();
  if (error) throw error;
  return (data as GroupSummary | null) ?? null;
}

export async function listGroupPlayers(client: SupabaseClient, groupId: string): Promise<PlayerSummary[]> {
  const { data, error } = await client.from('players').select('id,name,emoji,user_id')
    .eq('group_id', uuid.parse(groupId)).order('name').order('id');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    emoji: row.emoji as string,
    userId: (row.user_id as string | null) ?? null,
  }));
}

function groupMatches(client: SupabaseClient, groupId: string, playerId: string | undefined,
  count?: 'exact') {
  let query = client.from('matches').select('*', count ? { count } : undefined)
    .eq('group_id', uuid.parse(groupId));
  if (playerId) {
    const id = uuid.parse(playerId);
    query = query.or(`team1.cs.{${id}},team2.cs.{${id}}`);
  }
  for (const [column, options] of MATCH_ORDER) query = query.order(column, options);
  return query;
}

/** One page of a group's matches, newest first, optionally only those a player played. */
export async function listGroupMatchesPage(client: SupabaseClient, groupId: string,
  { playerId, limit, offset }: { playerId?: string; limit: number; offset: number }) {
  // Fetch one extra row to learn whether another page exists without counting.
  const { data, error } = await groupMatches(client, groupId, playerId)
    .range(offset, offset + limit);
  if (error) throw error;
  const rows = data ?? [];
  return { matches: rows.slice(0, limit).map(mapMatch), hasMore: rows.length > limit };
}

/**
 * Every match of a group (or of one player in it). Pages until the exact count is
 * reached, so the API's max_rows cap can never silently truncate stats.
 */
export async function listAllGroupMatches(client: SupabaseClient, groupId: string,
  { playerId }: { playerId?: string } = {}) {
  const matches = [];
  let total = Infinity;
  while (matches.length < total) {
    const offset = matches.length;
    const { data, error, count } = await groupMatches(client, groupId, playerId, 'exact')
      .range(offset, offset + 999);
    if (error) throw error;
    total = count ?? 0;
    if (!data?.length) break;
    matches.push(...data.map(mapMatch));
  }
  return matches;
}
