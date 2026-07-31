# Sync protocol

docsgraph is local-first: every client (web, desktop) keeps a full SQLite
copy of its data plus an append-only local **op log** (changelog) of every
mutation made offline. Sync reconciles that op log with `docsgraph-server`'s
Postgres source of truth over a small custom op-based protocol.

This doc is the contract `docsgraph-server`'s `sync/` module implements
against. The TypeScript types living in `packages/data/src/sync/types.ts`
mirror it directly.

## Model

- Every local mutation (create/update/delete) is recorded as a `SyncOp` in
  the client's local op log, alongside applying it to the local SQLite copy
  immediately (so the UI never waits on the network).
- Each client tracks a **cursor**: the highest server-assigned sequence
  number it has fully applied.

## Push

`POST /api/v1/sync/push`

The client sends every `SyncOp` recorded since its last successful push.
The server assigns each incoming op a **global monotonic sequence number**,
applies it to the Postgres source of truth, and acks with the new cursor
(the highest sequence number assigned in that batch) plus how many ops were
accepted.

## Pull

`GET /api/v1/sync/pull?since=<cursor>`

The client requests all ops with sequence number greater than its current
cursor. The server returns them in sequence order (possibly paginated via
`hasMore`); the client applies each to its local SQLite copy and advances
its cursor to match.

## Conflict handling

Starting point: **last-write-wins per field**, using server-assigned
sequence order as the tiebreaker — an op with a higher sequence number
always wins over a conflicting op with a lower one for the same field.

This is deliberately simple and not final. It's easy to reason about and
enough to get multi-device sync working correctly for the common case
(one user editing from one device at a time). It breaks down for genuinely
concurrent edits to the same field from two offline clients, where one
edit silently disappears. If that turns out to matter in practice, the
natural next step is moving specific high-contention fields (or the whole
op log) to an op-based CRDT merge strategy instead, without changing the
push/pull transport shape above.

## Non-goals here

This document describes the client-server contract only. It does not
cover authentication, encryption at rest/in transit, or the Postgres
schema on the server — those live in `docsgraph-server`.
