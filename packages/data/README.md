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

This is a contract, not a deployed endpoint. MAR-46 implements native snapshot
access and atomic command execution. Never send these commands to Shortcut routes.
The legacy increment RPC is not idempotent; do not automatically retry it.

Wire timestamps are UTC ISO-8601 strings. IDs are opaque, nonempty strings;
command IDs are UUIDs generated once per user intent. Nullable fields are required
and explicitly `null`, never omitted. Scores are nonnegative safe integers per set,
not tennis point labels. Revisions and event sequences are safe nonnegative integers.
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

MAR-46 must atomically authorize, deduplicate, check session/revision/sequence/target,
apply, and save the acknowledgement. Same command ID and payload replays its result;
same ID with different payload yields COMMAND_ID_REUSED. IN_FLIGHT permits retry of
the identical command after retryAfterMs. Distinct taps get distinct IDs. Dispatch
one command at a time per client/session; reconcile canonical state before dispatching
the next. Do not silently rebase stale corrections or new-set actions.

The supported retry window is 24 hours from createdAt, enforced by expiresAt;
server clocks are authoritative. Deduplication receipts must survive at least that
window plus clock skew (minimum 48 hours). Expired commands must be rejected even
after receipt eviction. A timeout is an unknown outcome: only the future idempotent
endpoint may receive an identical retry. AUTH_EXPIRED/AUTH_STALE require renewed
authorization; stale session/set/revision/order requires resynchronization and a new
explicit user intent. FORBIDDEN and COMMAND_ID_REUSED are terminal. INTERNAL_ERROR
alone does not establish whether a mutation committed. Never retry the legacy RPC.

Acknowledgements include appliedRevision and a canonical snapshot whose revision
may be newer on replay. Clients discard snapshots older than their current revision.
Errors contain stable codes, a display message, nullable command correlation,
nullable canonical revision and nullable retry delay; messages are not control flow.

`fixtures/snapshot.json` is plain UTF-8 JSON consumable by TypeScript and Swift
Foundation JSONDecoder/JSONSerialization. Tests cover serialization, score transforms,
win statistics, malformed input, and injected Supabase HTTP responses. These tests
do not prove live RLS or database concurrency; those are MAR-46 validation gates.
