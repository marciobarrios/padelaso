import { z } from 'zod';
import { EVENT_CONFIGS, EVENT_MAP } from '@padelaso/domain/events';

const id = z.string().min(1).max(128);
const integer = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const timestamp = z.iso.datetime();
export const setSchema = z.object({ team1Score: integer, team2Score: integer });
export const scoreSchema = z.array(setSchema);
const eventType = z.enum(EVENT_CONFIGS.map(event => event.type));
const historicalEventType = z.enum([...EVENT_MAP.keys()]);
const envelope = { version: z.literal(1), matchId: id, sessionId: id };
export const snapshotSchema = z.object({
  ...envelope, groupId: id, revision: integer, generatedAt: timestamp,
  authorizationExpiresAt: timestamp.nullable(), date: timestamp,
  courtNumber: integer.nullable(),
  roster: z.array(z.object({ id, name: z.string(), emoji: z.string() })),
  team1: z.array(id), team2: z.array(id),
  sets: z.array(setSchema.extend({ id })), activeSetId: id.nullable(),
  events: z.array(z.object({ id, playerId: id, type: historicalEventType,
    sequence: integer, createdAt: timestamp })),
}).superRefine((value, ctx) => {
  const roster = new Set(value.roster.map(p => p.id));
  const sets = new Set(value.sets.map(s => s.id));
  const team = [...value.team1, ...value.team2];
  if (roster.size !== value.roster.length || sets.size !== value.sets.length ||
      new Set(team).size !== team.length || team.some(p => !roster.has(p)) ||
      (value.activeSetId !== null && !sets.has(value.activeSetId)) ||
      new Set(value.events.map(e => e.id)).size !== value.events.length ||
      value.events.some((e, i) => !roster.has(e.playerId) ||
        (i > 0 && e.sequence <= value.events[i - 1].sequence))) {
    ctx.addIssue({ code: 'custom', message: 'Invalid snapshot identity or ordering' });
  }
});
const commandBase = { ...envelope, commandId: z.uuid(), clientId: id,
  sequence: integer, expectedRevision: integer, createdAt: timestamp,
  expiresAt: timestamp };
export const commandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...commandBase, kind: z.literal('score.delta'), setId: id,
    team: z.union([z.literal(1), z.literal(2)]), delta: z.union([z.literal(-1), z.literal(1)]) }),
  z.strictObject({ ...commandBase, kind: z.literal('score.correct'), setId: id, score: setSchema.strict() }),
  z.strictObject({ ...commandBase, kind: z.literal('set.create'), afterSetId: id.nullable(), setId: id }),
  z.strictObject({ ...commandBase, kind: z.literal('event.create'), eventId: id, playerId: id, type: eventType }),
  z.strictObject({ ...commandBase, kind: z.literal('event.undo'), eventId: id }),
]).refine(c => {
  const lifetime = Date.parse(c.expiresAt) - Date.parse(c.createdAt);
  return lifetime > 0 && lifetime <= 86_400_000;
}, 'Command lifetime must be between zero and 24 hours');
export const acknowledgementSchema = z.object({ ...envelope, commandId: z.uuid(),
  status: z.enum(['applied', 'replayed']), appliedRevision: integer,
  acknowledgedAt: timestamp, snapshot: snapshotSchema,
}).refine(a => a.snapshot.matchId === a.matchId && a.snapshot.sessionId === a.sessionId &&
  a.snapshot.revision >= a.appliedRevision, 'Acknowledgement identity/revision mismatch');
export const errorSchema = z.object({ version: z.literal(1), commandId: z.uuid().nullable(),
  occurredAt: timestamp, code: z.enum(['INVALID_REQUEST', 'UNSUPPORTED_VERSION',
    'AUTH_EXPIRED', 'AUTH_STALE', 'FORBIDDEN', 'NOT_FOUND', 'STALE_SESSION',
    'STALE_REVISION', 'STALE_SET', 'OUT_OF_ORDER', 'COMMAND_EXPIRED',
    'COMMAND_ID_REUSED', 'IN_FLIGHT', 'INTERNAL_ERROR']), message: z.string(),
  retryAfterMs: integer.nullable(), canonicalRevision: integer.nullable(),
});
export type NativeSnapshot = z.infer<typeof snapshotSchema>;
export type NativeCommand = z.infer<typeof commandSchema>;
export type NativeAcknowledgement = z.infer<typeof acknowledgementSchema>;
export type NativeError = z.infer<typeof errorSchema>;
