import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { listMcpMatches } from './queries';

const row = (id: string) => ({ id, date: '2026-01-01', team1: ['a', 'b'], team2: ['c', 'd'], sets: [{ team1Score: 6, team2Score: 2 }], group_id: 'group', created_at: '2026-01-01' });

describe('complete MCP match history', () => {
  it('reads past a PostgREST page instead of silently truncating stats', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => row(String(i))), error: null })
      .mockResolvedValueOnce({ data: [row('last')], error: null });
    const query = { select: () => query, eq: () => query, order: () => query, range };
    const client = { from: () => query } as unknown as SupabaseClient;
    const matches = await listMcpMatches(client, 'group');
    expect(matches).toHaveLength(501);
    expect(matches.at(-1)?.id).toBe('last');
    expect(range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });

  it('does not return partial history when a later page fails', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => row(String(i))), error: null })
      .mockResolvedValueOnce({ data: null, error: new Error('unavailable') });
    const query = { select: () => query, eq: () => query, order: () => query, range };
    await expect(listMcpMatches({ from: () => query } as unknown as SupabaseClient, 'group')).rejects.toThrow('unavailable');
  });
});
