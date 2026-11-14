import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { getMemberGroup, listAllGroupMatches, listGroupMatchesPage, listGroupPlayers } from '../src/queries';

const GROUP = '33333333-3333-4333-8333-333333333333';
const PLAYER = '44444444-4444-4444-8444-444444444444';
const row = (i: number) => ({ id: `m${i}`, date: '2026-11-01T00:00:00Z', created_at: '2026-11-01T00:00:00Z',
  group_id: GROUP, team1: [PLAYER], team2: ['p2'], sets: [{ team1Score: 6, team2Score: 4 }] });

/** A PostgREST stub that caps every response at `maxRows`, like the API's max_rows setting. */
function capped(total: number, maxRows: number) {
  const requests: URL[] = [];
  const client = createClient('https://example.supabase.co', 'anon', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const from = Number(url.searchParams.get('offset') ?? 0);
      const limit = Number(url.searchParams.get('limit') ?? total);
      const end = Math.min(from + limit - 1, from + maxRows - 1, total - 1);
      const rows = Array.from({ length: Math.max(0, end - from + 1) }, (_, i) => row(from + i));
      return Response.json(rows, { headers: { 'Content-Range': `${from}-${end}/${total}` } });
    } },
  });
  return { client, requests };
}

describe('MCP read queries', () => {
  it('reads every match even when the API caps rows per response', async () => {
    const { client, requests } = capped(2350, 500);
    const matches = await listAllGroupMatches(client, GROUP);
    expect(matches).toHaveLength(2350);
    expect(new Set(matches.map((m) => m.id)).size).toBe(2350);
    expect(requests).toHaveLength(5);
  });

  it('pages with one look-ahead row', async () => {
    const { client } = capped(12, 1000);
    expect(await listGroupMatchesPage(client, GROUP, { limit: 10, offset: 0 }))
      .toMatchObject({ hasMore: true, matches: { length: 10 } });
    expect(await listGroupMatchesPage(client, GROUP, { limit: 10, offset: 10 }))
      .toMatchObject({ hasMore: false, matches: { length: 2 } });
  });

  it('refuses IDs that could alter the PostgREST filter', async () => {
    const { client, requests } = capped(1, 10);
    await expect(listAllGroupMatches(client, GROUP, { playerId: `${PLAYER}},id.neq.{x` })).rejects.toThrow();
    await expect(getMemberGroup(client, 'not-a-uuid')).rejects.toThrow();
    await expect(listGroupPlayers(client, `${GROUP},or`)).rejects.toThrow();
    expect(requests).toHaveLength(0);
  });
});
