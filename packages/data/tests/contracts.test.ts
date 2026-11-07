import command from "../fixtures/command.json";
import ackFixture from "../fixtures/acknowledgement.json";
import errorFixture from "../fixtures/error.json";
import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/snapshot.json';
import { snapshotSchema, commandSchema, acknowledgementSchema, errorSchema } from '../src/contracts';
import { mapMatch } from '../src/mappers';
import { applyScoreDelta, getSetWins } from '@padelaso/domain/matches';
import { listMatches, incrementMatchScore } from '../src/queries';
import { createClient } from '@supabase/supabase-js';

const row = { id: fixture.matchId, date: fixture.date, created_at: fixture.date,
  group_id: fixture.groupId, team1: fixture.team1, team2: fixture.team2, sets: fixture.sets };
function client(payload: unknown, status = 200) {
  return createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async () => new Response(JSON.stringify(payload), { status,
      headers: { 'Content-Type': 'application/json' } }) },
  });
}
describe('portable native contract', () => {
  it('round trips Unicode, nulls, score transforms and win statistics', () => {
    const snapshot = snapshotSchema.parse(JSON.parse(JSON.stringify(fixture)));
    expect(snapshot).toEqual(fixture);
    const match = mapMatch(row);
    expect(getSetWins(match.sets)).toEqual({ team1Wins: 1, team2Wins: 1 });
    expect(applyScoreDelta(match.sets, 1, 1)[1]).toEqual({ team1Score: 3, team2Score: 3 });
  });
  it('rejects malformed scores, versions, references and event ordering', () => {
    for (const patch of [{version:2}, {activeSetId:'missing'}, {team1:['missing']},
      {sets:[{id:'s',team1Score:-1,team2Score:0}]}, {events:[...fixture.events,...fixture.events]}]) {
      expect(snapshotSchema.safeParse({...fixture,...patch}).success).toBe(false);
    }
  });
  it('validates commands and rejects ambiguous target/expiry/extra fields', () => {
    expect(commandSchema.parse(command)).toEqual(command);
    for (const patch of [{setId:null},{delta:0.5},{version:2},{expiresAt:command.createdAt},{extra:true}])
      expect(commandSchema.safeParse({...command,...patch}).success).toBe(false);
    for (const payload of [
      {kind:'score.correct',setId:'set-b',score:{team1Score:3,team2Score:3}},
      {kind:'set.create',afterSetId:'set-b',setId:'set-c'},
      {kind:'event.create',eventId:'e',playerId:'ana',type:'ace'},
      {kind:'event.undo',eventId:'e'}]) {
      const {kind,setId,team,delta,...base} = command;
      void kind; void setId; void team; void delta;
      expect(commandSchema.safeParse({...base,...payload}).success).toBe(true);
    }
  });
  it('checks acknowledgement binding and structured auth errors', () => {
    const ack = ackFixture;
    expect(errorSchema.safeParse(errorFixture).success).toBe(true);
    expect(acknowledgementSchema.safeParse(ack).success).toBe(true);
    expect(acknowledgementSchema.safeParse({...ack,matchId:'other'}).success).toBe(false);
    for (const code of ['AUTH_EXPIRED','AUTH_STALE']) expect(errorSchema.safeParse({version:1,
      commandId:null,occurredAt:fixture.generatedAt,code,message:'Authenticate again',
      retryAfterMs:null,canonicalRevision:null}).success).toBe(true);
  });
  it('queries through an injected Supabase client and rejects malformed responses', async () => {
    expect(await listMatches(client([row]), 'group-a')).toEqual([mapMatch(row)]);
    await expect(listMatches(client([{...row,sets:'bad'}]), 'group-a')).rejects.toThrow();
    await expect(listMatches(client({message:'denied'},403), 'group-a')).rejects.toBeDefined();
    expect(await incrementMatchScore(client([{team1Score:3,team2Score:3}]),'match-a',1,1))
      .toEqual([{team1Score:3,team2Score:3}]);
    await expect(incrementMatchScore(client(null),'match-a',1,1)).rejects.toThrow();
  });
});
