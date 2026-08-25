/**
 * Types for docsgraph's client-side sync interface. These mirror the
 * contract described in `/docs/sync-protocol.md` — see that doc for the
 * conceptual model (append-only op log, server-assigned sequence
 * numbers, last-write-wins conflict handling for now).
 */

/** The kind of mutation an op represents. */
export type SyncOpKind = 'create' | 'update' | 'delete';

/**
 * A single locally-recorded change, queued for push to the server.
 * Mirrors one row of the client's append-only op log / changelog.
 */
export interface SyncOp {
  /** Client-generated unique id (e.g. ULID) for this op. */
  id: string;
  /** The kind of mutation this op represents. */
  kind: SyncOpKind;
  /** Logical entity type this op mutates, e.g. "document", "graph_node". */
  entityType: string;
  /** Id of the entity this op mutates. */
  entityId: string;
  /** Changed fields and their new values (for create/update ops). */
  payload: Record<string, unknown> | null;
  /** Client-side wall clock time the op was recorded, ISO-8601. */
  clientTimestamp: string;
}

/**
 * An op as returned by the server after being applied to the source of
 * truth: includes the server-assigned global monotonic sequence number
 * used as the sync cursor.
 */
export interface RemoteSyncOp extends SyncOp {
  /** Global monotonic sequence number assigned by the server. */
  sequence: number;
}

/** Opaque cursor marking "last sequence number this client has seen". */
export type SyncCursor = number;

export interface SyncPushAck {
  opId: string;
  seq: number;
}

/** Result of a successful push. */
export interface PushResult {
  /** The highest sequence number assigned to ops in this push. */
  cursor: SyncCursor;
  /** Individual acknowledgements for each pushed op. */
  acks: SyncPushAck[];
}

/** Result of a successful pull. */
export interface PullResult {
  /** Ops with sequence greater than the requested cursor. */
  ops: RemoteSyncOp[];
  /** Cursor the client should advance to after applying `ops`. */
  cursor: SyncCursor;
  /** Whether more ops remain beyond this page (for paginated pulls). */
  hasMore: boolean;
}

/**
 * Client-side sync transport. Implementations talk to
 * `docsgraph-server`'s `/api/v1/sync/{push,pull}` endpoints; this
 * package only defines the shape, no networking happens here.
 */
export interface SyncClient {
  /** POST /api/v1/sync/push — send local ops since `cursor`. */
  push(ops: SyncOp[], cursor: SyncCursor): Promise<PushResult>;

  /** GET /api/v1/sync/pull?since=cursor — fetch remote ops since `cursor`. */
  pull(cursor: SyncCursor): Promise<PullResult>;
}
