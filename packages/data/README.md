# Shared data and native wire contract (MAR-45)

`@padelaso/data/mappers` and `/selects` preserve the web mapping entry points.
`/queries` accepts a caller-owned Supabase client: web supplies its authenticated
browser client; future mobile auth supplies its own client/storage adapter.
No credentials, cookies, React, Next.js, DOM or native APIs live here. RLS remains
responsible for authorization. The mobile demo uses the same match mapper; it is
not connected to production. Web SWR keys, invalidation and server auth stay local.

`/contracts` exports Zod validators and inferred types. Parse unknown JSON before
using it. Match rows and legacy score RPC responses are validated at the extracted
boundaries. Other existing mappers retain their trusted database-row behavior.
Match creators may be null after account deletion and map to `undefined` in the
domain model. Snapshots accept historical event types, including retired ones;
event creation commands accept only the currently active event vocabulary.

## Native v1 semantics

MAR-46 implements this contract at the routes below, backed by the
`native_apply_command`, `native_match_snapshot` and `native_replace_scoring_session`
database functions. `@padelaso/data/native` calls the same functions through a
caller-owned client. Never send these commands to Shortcut routes. The legacy
increment RPC is not idempotent; do not automatically retry it.

| Route | Purpose |
| --- | --- |
| `GET /api/native/v1/matches/{matchId}/snapshot` | Canonical state, returned as the snapshot JSON |
| `POST /api/native/v1/commands` | Apply or replay one command, returned as an acknowledgement |
| `POST /api/native/v1/matches/{matchId}/session` | Replace the scoring session, returned as a snapshot |

Routes take a Supabase user access token in `Authorization: Bearer` and run as that
user. Shortcut score tokens are rejected; Watch credential enrollment is MAR-52.
The path carries the major version: a 404 from a `/v1` route means disable native
commands. Failures use the error JSON, with `Retry-After` on `IN_FLIGHT`.

Execution details clients can rely on:

- Legacy and web writes advance the same revision, so they make queued commands
  `STALE_REVISION`. Set IDs follow array position when those writers change sets.
- `score.delta` targets only the active (latest) set; `score.correct` targets any set.
  `set.create` requires `afterSetId` to be the latest set.
- A decrement at zero, or a correction to the same score, is acknowledged at the
  unchanged revision and consumes the command ID and sequence.
- `event.create` and `event.undo` event IDs and player IDs must be UUIDs when executed.
- Sequence must increase per user, session and client. Gaps are allowed, and a
  rejected command does not consume its sequence.
- Command IDs are scoped per user. Only applied commands save a receipt; a retried
  rejection is evaluated again and, because revisions only move forward, cannot apply.
- `expiresAt` may be at most 24 hours and 5 minutes past the server clock.
- A replay after its session was replaced returns `STALE_SESSION`, because its
  acknowledgement could not describe the current session.
- `IN_FLIGHT` means the match lock was not acquired within 3 seconds; nothing applied.

Wire timestamps are UTC ISO-8601 strings. IDs are opaque, nonempty strings;
command IDs are UUIDs generated once per user intent. Nullable fields are required
and explicitly `null`, never omitted. Scores are nonnegative safe integers per set,
not tennis point labels. Revisions and event sequences are safe nonnegative integers.
Score arrays have a resource limit of 100 sets, shared by database-row mapping,
legacy score RPC responses, native snapshots and acknowledgements. This leaves
room for long scoring sessions beyond the normal match format. Oversized arrays
are rejected before their elements are read, with one size error rather than an
error per malformed score field. This requires the pinned Zod version 4.6.6 or later.
Snapshots carry the full roster, team IDs, stable set IDs, current set ID, ordered
events and canonical revision missing from Shortcut options. Event order is strictly
increasing sequence; gaps are allowed after undo. Array order defines set order.
A null active set means no active scoring target. A null auth expiry means the server
did not supply one; it does not promise indefinite authorization.

Version 1 readers ignore additive response fields. Commands reject unknown fields
to avoid silently discarding intent. New required fields, enum values or changed
semantics require a new major version; unknown versions fail before applying changes.
Clients must negotiate support before enabling native commands.

Commands bind match + session, client sequence, expected revision and explicit set
or event identity. `set.create` uses a client-generated stable new set ID and nullable
predecessor (null only for the first set). Event undo targets one exact event ID.
Session identity changes when a scoring session is replaced; never resolve a queued
command through a token's mutable current-match selection. Authorization must be
checked again at execution, including membership and permissions.

One database transaction authorizes, deduplicates, checks session/revision/sequence/target,
applies, and saves the receipt. Same command ID and payload replays its result;
same ID with different payload yields COMMAND_ID_REUSED. IN_FLIGHT permits retry of
the identical command after retryAfterMs. Distinct taps get distinct IDs. Dispatch
one command at a time per client/session; reconcile canonical state before dispatching
the next. Do not silently rebase stale corrections or new-set actions.

The supported retry window is 24 hours from createdAt, enforced by expiresAt;
server clocks are authoritative. Deduplication receipts must survive at least that
window plus clock skew (minimum 48 hours). Expired commands must be rejected even
after receipt eviction. A timeout is an unknown outcome: only the future idempotent
command endpoint may receive an identical retry. AUTH_EXPIRED/AUTH_STALE require renewed
authorization; stale session/set/revision/order requires resynchronization and a new
explicit user intent. FORBIDDEN and COMMAND_ID_REUSED are terminal. INTERNAL_ERROR
alone does not establish whether a mutation committed. Never retry the legacy RPC.

Acknowledgements include appliedRevision and a canonical snapshot whose revision
may be newer on replay. Clients discard snapshots older than their current revision.
Errors contain stable codes, a display message, nullable command correlation,
nullable canonical revision and nullable retry delay; messages are not control flow.

`fixtures/snapshot.json` is plain UTF-8 JSON consumable by TypeScript and Swift
Foundation JSONDecoder/JSONSerialization. Tests cover serialization, score transforms,
win statistics, malformed input, and injected Supabase HTTP responses. Authorization
and database concurrency are covered by `supabase/tests/native_commands_test.sql`.
`pnpm test:integration` runs the native and Shortcut route handlers against the local
Supabase stack, with real JWTs (`pnpm exec supabase start` first).

## Rollout and rollback

Migration `20261109113655_native_scoring_commands` is additive, so deployed web and
Shortcut code keeps working before and after it. Apply it before enabling any native
client. Until it is applied, the `/v1` routes return `INTERNAL_ERROR` and change nothing.
Shortcut routes keep their request and response contracts and are still not idempotent.

Supabase migrations only roll forward, so to revert, first disable native clients:
dropping receipts removes deduplication for any command still being retried. Then ship
a new migration containing:

```sql
drop function public.native_apply_command(jsonb);
drop function public.native_replace_scoring_session(text);
drop function public.native_match_snapshot(text);
drop schema native_private cascade; -- also drops the triggers on matches and match_events
alter table public.match_events drop column sequence;
```

This permanently deletes receipts, session and set identities, revisions and event
sequences. Scores and events themselves are untouched, and re-applying the forward
migration creates new identities, so clients must fetch a new snapshot.
