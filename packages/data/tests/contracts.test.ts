import command from "../fixtures/command.json";
import ackFixture from "../fixtures/acknowledgement.json";
import errorFixture from "../fixtures/error.json";
import { describe, it, expect } from 'vitest';
import fixture from '../fixtures/snapshot.json';
import { snapshotSchema, commandSchema, acknowledgementSchema, errorSchema, scoreSchema, MAX_MATCH_SETS } from '../src/contracts';
import { mapMatch } from '../src/mappers';
import { applyScoreDelta, getSetWins } from '@padelaso/domain/matches';
import { listMatches, incrementMatchScore } from '../src/queries';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

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
  it('accepts the score collection limit and rejects the next set', () => {
    const sets = Array.from({ length: MAX_MATCH_SETS }, () => ({ team1Score: 0, team2Score: 0 }));
    expect(scoreSchema.parse(sets)).toEqual(sets);
    expect(mapMatch({ ...row, sets }).sets).toEqual(sets);
    const snapshot = { ...fixture, activeSetId: null, sets: sets.map((set, i) => ({ ...set, id: `set-${i}` })) };
    expect(snapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(scoreSchema.safeParse([...sets, sets[0]]).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...snapshot, sets: [...snapshot.sets, { ...sets[0], id: 'overflow' }] }).success).toBe(false);
  });
  it('rejects oversized score collections before reading any elements', () => {
    const sets = new Array(MAX_MATCH_SETS + 1);
    Object.defineProperty(sets, 0, { get() { throw new Error('Element validation must not run'); } });
    const oversized = { success: false, error: { issues: [{ code: 'too_big' }] } };
    expect(scoreSchema.safeParse(sets)).toMatchObject(oversized);
    expect(() => mapMatch({ ...row, sets })).toThrow(z.ZodError);
    expect(snapshotSchema.safeParse({ ...fixture, sets })).toMatchObject(oversized);
    expect(acknowledgementSchema.safeParse({ ...ackFixture, snapshot: { ...fixture, sets } })).toMatchObject(oversized);
  });
  it('bounds validation errors for malformed database rows and RPC responses', async () => {
    // This 30 KB payload previously allocated 20,000 validation issues.
    const sets = Array.from({ length: 10_000 }, () => ({}));
    for (const operation of [
      () => listMatches(client([{ ...row, sets }]), fixture.groupId),
      () => incrementMatchScore(client(sets), fixture.matchId, 1, 1),
    ]) {
      const error = await operation().then(() => null, error => error);
      expect(error).toBeInstanceOf(z.ZodError);
      expect(error.issues).toHaveLength(1);
      expect(error.issues[0].code).toBe('too_big');
    }
  });
  it('loads matches after their creator is deleted and normalizes missing creators', async () => {
    expect(mapMatch({ ...row, created_by: null }).createdBy).toBeUndefined();
    expect(mapMatch(row).createdBy).toBeUndefined();
    expect(mapMatch({ ...row, created_by: 'creator-a' }).createdBy).toBe('creator-a');
    const matches = await listMatches(client([row, { ...row, id: 'orphaned', created_by: null }]), fixture.groupId);
    expect(matches.map(match => match.id)).toEqual([fixture.matchId, 'orphaned']);
    expect(matches[1].createdBy).toBeUndefined();
    expect(() => mapMatch({ ...row, created_by: 42 })).toThrow();
  });
  it('reads retired events in snapshots and acknowledgements without allowing new ones', () => {
    const snapshot = { ...fixture, events: fixture.events.map(event => ({ ...event, type: 'bola_fuera' })) };
    expect(snapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(acknowledgementSchema.parse({ ...ackFixture, snapshot }).snapshot).toEqual(snapshot);
    const { kind, setId, team, delta, ...base } = command;
    void kind; void setId; void team; void delta;
    const eventCommand = { ...base, kind: 'event.create', eventId: 'event-new', playerId: 'ana' };
    expect(commandSchema.safeParse({ ...eventCommand, type: 'ace' }).success).toBe(true);
    expect(commandSchema.safeParse({ ...eventCommand, type: 'bola_fuera' }).success).toBe(false);
    expect(snapshotSchema.safeParse({ ...snapshot, events: [{ ...snapshot.events[0], type: 'unknown' }] }).success).toBe(false);
  });
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
