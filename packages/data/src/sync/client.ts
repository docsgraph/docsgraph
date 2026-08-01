import type { PullResult, PushResult, SyncClient, SyncCursor, SyncOp } from './types';

/**
 * Stub sync client. No network calls happen here — this exists so
 * `packages/data` consumers (and future `docsgraph-server` integration
 * work) have a concrete, typed implementation to build against.
 *
 * TODO(sync): implement real HTTP calls to
 * `POST /api/v1/sync/push` and `GET /api/v1/sync/pull?since=<cursor>`
 * once `docsgraph-server` exposes them.
 */
export class StubSyncClient implements SyncClient {
  async push(_ops: SyncOp[], _cursor: SyncCursor): Promise<PushResult> {
    throw new Error('Not implemented: StubSyncClient.push (no transport wired up yet)');
  }

  async pull(_cursor: SyncCursor): Promise<PullResult> {
    throw new Error('Not implemented: StubSyncClient.pull (no transport wired up yet)');
  }
}
