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

/** Compact read projections deliberately exclude invite codes and account IDs. */
export async function listMcpGroups(client: SupabaseClient) {
  const { data, error } = await client.from('groups').select('id,name,emoji').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function listMcpPlayers(client: SupabaseClient, groupId: string, name?: string) {
  const { data, error } = await client.from('players').select('id,name,emoji')
    .eq('group_id', groupId).order('name');
  if (error) throw error;
  // Literal substring search: SQL wildcard characters have no special meaning.
  return (data ?? []).filter((player) => !name || player.name.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
}

/** Read every page: PostgREST's row cap must not silently truncate stats. */
export async function listMcpMatches(client: SupabaseClient, groupId: string) {
  const matches = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from('matches').select('*').eq('group_id', groupId)
      .order('created_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1);
    if (error) throw error;
    matches.push(...(data ?? []).map(mapMatch));
    if (!data || data.length < pageSize) return matches;
  }
}
