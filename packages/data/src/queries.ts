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
