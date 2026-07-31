import { describe, expect, it } from 'vitest';
import { StubSyncClient } from './client';
import type { RemoteSyncOp, SyncOp } from './types';

describe('sync types', () => {
  it('SyncOp accepts the documented shape', () => {
    const op: SyncOp = {
      id: 'op_01',
      kind: 'update',
      entityType: 'document',
      entityId: 'doc_01',
      payload: { title: 'New title' },
      clientTimestamp: new Date(0).toISOString(),
    };

    expect(op.kind).toBe('update');
    expect(op.payload).toEqual({ title: 'New title' });
  });

  it('RemoteSyncOp extends SyncOp with a server sequence number', () => {
    const remoteOp: RemoteSyncOp = {
      id: 'op_01',
      kind: 'create',
      entityType: 'document',
      entityId: 'doc_01',
      payload: null,
      clientTimestamp: new Date(0).toISOString(),
      sequence: 42,
    };

    expect(remoteOp.sequence).toBe(42);
  });
});

describe('StubSyncClient', () => {
  it('push is an unimplemented stub', async () => {
    const client = new StubSyncClient();
    await expect(client.push([], 0)).rejects.toThrow('Not implemented');
  });

  it('pull is an unimplemented stub', async () => {
    const client = new StubSyncClient();
    await expect(client.pull(0)).rejects.toThrow('Not implemented');
  });
});
