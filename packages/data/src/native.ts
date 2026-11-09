import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  acknowledgementSchema, commandSchema, errorSchema, snapshotSchema,
  type NativeAcknowledgement, type NativeError, type NativeSnapshot,
} from './contracts';

export type NativeResult<T> = { ok: true; data: T } | { ok: false; error: NativeError };

export function nativeError(code: NativeError['code'], message: string,
  commandId: string | null = null): NativeError {
  return { version: 1, commandId, occurredAt: new Date().toISOString(), code, message,
    retryAfterMs: null, canonicalRevision: null };
}

function commandIdOf(input: unknown): string | null {
  const id = (input as { commandId?: unknown } | null)?.commandId;
  return z.uuid().safeParse(id).success ? id as string : null;
}

/** PostgREST rejects an expired or invalid JWT with one of these before running SQL. */
const AUTH_ERROR_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

async function callNativeRpc<S extends z.ZodType>(client: SupabaseClient, fn: string,
  args: Record<string, unknown>, schema: S, commandId: string | null,
): Promise<NativeResult<z.infer<S>>> {
  // INTERNAL_ERROR never establishes whether a command committed. Only an
  // identical retry of the command can resolve that.
  let response;
  try {
    response = await client.rpc(fn, args);
  } catch {
    return { ok: false, error: nativeError('INTERNAL_ERROR', 'Service unavailable', commandId) };
  }
  const { data, error, status } = response;
  if (error) {
    const expired = status === 401 || AUTH_ERROR_CODES.has(error.code);
    return { ok: false, error: nativeError(expired ? 'AUTH_EXPIRED' : 'INTERNAL_ERROR',
      expired ? 'Authenticate again' : 'Service unavailable', commandId) };
  }
  const rejected = errorSchema.safeParse(data);
  if (rejected.success) return { ok: false, error: rejected.data };
  const parsed = schema.safeParse(data);
  return parsed.success ? { ok: true, data: parsed.data }
    : { ok: false, error: nativeError('INTERNAL_ERROR', 'Invalid server response', commandId) };
}

/**
 * Atomically applies one command, or replays its saved result. Only this call may
 * receive an identical retry after an unknown outcome. The caller supplies a client
 * authenticated as the acting user; the database checks authorization on every call.
 */
export async function executeNativeCommand(client: SupabaseClient, input: unknown):
Promise<NativeResult<NativeAcknowledgement>> {
  const commandId = commandIdOf(input);
  const command = commandSchema.safeParse(input);
  if (!command.success) {
    const version = (input as { version?: unknown } | null)?.version;
    const unsupported = version !== undefined && version !== 1;
    return { ok: false, error: nativeError(unsupported ? 'UNSUPPORTED_VERSION' : 'INVALID_REQUEST',
      unsupported ? 'Unsupported command version' : 'Malformed command', commandId) };
  }
  return callNativeRpc(client, 'native_apply_command', { p_command: command.data },
    acknowledgementSchema, commandId);
}

export function fetchNativeSnapshot(client: SupabaseClient, matchId: string):
Promise<NativeResult<NativeSnapshot>> {
  return callNativeRpc(client, 'native_match_snapshot', { p_match_id: matchId }, snapshotSchema, null);
}

/** Invalidates commands queued against the current session. */
export function replaceNativeScoringSession(client: SupabaseClient, matchId: string):
Promise<NativeResult<NativeSnapshot>> {
  return callNativeRpc(client, 'native_replace_scoring_session', { p_match_id: matchId }, snapshotSchema, null);
}
