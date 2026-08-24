import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { HttpSyncClient } from './client';
import { SyncManager } from './manager';
import { LocalStore } from '../store';
import type { SqliteAdapter, SqlParam, SqlRow } from '../sqlite/types';
import type { RemoteSyncOp } from './types';

class MockSqliteAdapter implements SqliteAdapter {
  meta = new Map<string, string>();
  syncOps = new Map<string, SqlRow>();
  documents = new Map<string, SqlRow>();

  async query<T extends SqlRow = SqlRow>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const cleaned = sql.replace(/\s+/g, ' ').trim();
    if (cleaned.includes("SELECT value FROM _docsgraph_meta WHERE key = 'schema_version'")) {
      const val = this.meta.get('schema_version');
      return (val !== undefined ? [{ value: val }] : []) as unknown as T[];
    }
    if (cleaned.includes("SELECT value FROM _docsgraph_meta WHERE key = 'sync_cursor'")) {
      const val = this.meta.get('sync_cursor');
      return (val !== undefined ? [{ value: val }] : []) as unknown as T[];
    }
    if (cleaned.includes('SELECT id, kind, entity_type, entity_id, payload, client_timestamp FROM sync_ops WHERE seq IS NULL')) {
      const unsynced = Array.from(this.syncOps.values()).filter((op) => op.seq === null || op.seq === undefined);
      return unsynced as unknown as T[];
    }
    if (cleaned.includes('SELECT seq FROM sync_ops WHERE id = ?')) {
      const id = params[0] as string;
      const op = this.syncOps.get(id);
      return (op ? [{ seq: op.seq as number }] : []) as unknown as T[];
    }
    if (cleaned.includes('SELECT last_seq FROM documents WHERE id = ?')) {
      const id = params[0] as string;
      const doc = this.documents.get(id);
      return (doc ? [{ last_seq: doc.last_seq as number }] : []) as unknown as T[];
    }
    if (cleaned.includes('SELECT payload FROM sync_ops WHERE entity_type = ? AND entity_id = ? AND seq IS NULL')) {
      const entityType = params[0] as string;
      const entityId = params[1] as string;
      const filtered = Array.from(this.syncOps.values()).filter(
        (op) => op.entity_type === entityType && op.entity_id === entityId && (op.seq === null || op.seq === undefined)
      );
      return filtered.map((op) => ({ payload: op.payload as string })) as unknown as T[];
    }
    return [];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    const cleaned = sql.replace(/\s+/g, ' ').trim();
    if (cleaned.includes("_docsgraph_meta")) {
      let key = '';
      let val = '';
      if (cleaned.includes("'sync_cursor'")) {
        key = 'sync_cursor';
        val = params[0] as string;
      } else if (cleaned.includes("'schema_version'")) {
        key = 'schema_version';
        val = params[0] as string;
      }
      if (key) {
        this.meta.set(key, val);
      }
      return;
    }
    if (cleaned.includes("INSERT OR IGNORE INTO sync_ops")) {
      const id = params[0] as string;
      this.syncOps.set(id, {
        id,
        kind: params[1] as string,
        entity_type: params[2] as string,
        entity_id: params[3] as string,
        payload: params[4] as string,
        client_timestamp: params[5] as string,
        seq: params[6] === undefined ? null : (params[6] as number),
      });
      return;
    }
    if (cleaned.includes("UPDATE sync_ops SET seq = ? WHERE id = ?")) {
      const seq = params[0] as number;
      const id = params[1] as string;
      const op = this.syncOps.get(id);
      if (op) {
        op.seq = seq;
      }
      return;
    }
    if (cleaned.includes("INSERT INTO documents")) {
      const id = params[0] as string;
      this.documents.set(id, {
        id,
        last_seq: params[5] as number,
      });
      return;
    }
    if (cleaned.includes("UPDATE documents SET")) {
      const id = params[params.length - 1] as string;
      const doc = this.documents.get(id);
      if (doc) {
        doc.last_seq = params[0] as number;
      }
      return;
    }
  }

  async transaction<T>(fn: (tx: SqliteAdapter) => Promise<T>): Promise<T> {
    return await fn(this);
  }

  async close(): Promise<void> {}
}

describe('Sync client & SyncManager tests', () => {
  const originalFetch = globalThis.fetch;

  let fetchMock: ReturnType<typeof vi.fn>;
  let windowListeners: Map<string, Array<() => void>>;
  let mockNavigator: { onLine: boolean };
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;
  let originalWindowDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    windowListeners = new Map();
    const mockWindow = {
      addEventListener: (event: string, cb: () => void) => {
        const list = windowListeners.get(event) || [];
        list.push(cb);
        windowListeners.set(event, list);
      },
      removeEventListener: (event: string, cb: () => void) => {
        const list = windowListeners.get(event) || [];
        const idx = list.indexOf(cb);
        if (idx !== -1) {
          list.splice(idx, 1);
        }
        windowListeners.set(event, list);
      },
    };

    mockNavigator = {
      onLine: true,
    };

    originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      value: mockWindow,
      configurable: true,
      writable: true,
    });

    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: mockNavigator,
      configurable: true,
      writable: true,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;

    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
    } else {
      delete (globalThis as unknown as Record<string, unknown>).window;
    }

    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalNavigatorDescriptor);
    } else {
      delete (globalThis as unknown as Record<string, unknown>).navigator;
    }
  });

  describe('HttpSyncClient', () => {
    it('sets authentication headers correctly', async () => {
      const client = new HttpSyncClient({
        baseUrl: 'http://localhost:8000',
        token: 'test-token-value',
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ acks: [], cursor: 12 }),
      });

      await client.push([], 5);

      expect(fetchMock).toHaveBeenCalled();
      const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
      expect(options).toBeDefined();
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-token-value');
    });

    it('evaluates dynamic token function', async () => {
      let currentToken = 'initial-token';
      const client = new HttpSyncClient({
        baseUrl: 'http://localhost:8000',
        token: () => currentToken,
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ops: [], cursor: 10, hasMore: false }),
      });

      await client.pull(5);
      expect((fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>)
        .toHaveProperty('Authorization', 'Bearer initial-token');

      currentToken = 'updated-token';
      await client.pull(10);
      expect((fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<string, string>)
        .toHaveProperty('Authorization', 'Bearer updated-token');
    });
  });

  describe('SyncManager', () => {
    it('successfully pushes local mutations and pulls remote changes', async () => {
      const adapter = new MockSqliteAdapter();
      const store = new LocalStore(adapter);
      await store.initialize();

      // Pre-populate with local unsynced change
      await adapter.exec(
        `INSERT OR IGNORE INTO sync_ops (id, kind, entity_type, entity_id, payload, client_timestamp, seq)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        ['op-local-1', 'create', 'document', 'doc-1', '{"title":"Local"}', '2026-08-23T12:00:00Z']
      );

      const client = new HttpSyncClient({
        baseUrl: 'http://localhost:8000',
        token: 'test',
      });

      // 1st fetch call: push
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ acks: [{ op_id: 'op-local-1', seq: 10 }], cursor: 10 }),
      });

      // 2nd fetch call: pull
      const remoteOp: RemoteSyncOp = {
        id: 'op-remote-2',
        kind: 'update',
        entityType: 'document',
        entityId: 'doc-2',
        payload: { title: 'Remote Title' },
        clientTimestamp: '2026-08-23T12:05:00Z',
        sequence: 15,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ops: [
            {
              op_id: remoteOp.id,
              entity_type: remoteOp.entityType,
              entity_id: remoteOp.entityId,
              operation: remoteOp.kind,
              payload: remoteOp.payload,
              client_timestamp: remoteOp.clientTimestamp,
              seq: remoteOp.sequence,
            }
          ],
          cursor: 15,
        }),
      });

      const manager = new SyncManager({ store, client });
      await manager.sync();

      expect(manager.getStatus()).toBe('idle');
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Verify remote op got applied and cursor advanced
      const cursor = await store.getSyncCursor();
      expect(cursor).toBe(15);
    });

    it('degrades gracefully to offline status on network errors', async () => {
      const adapter = new MockSqliteAdapter();
      const store = new LocalStore(adapter);
      await store.initialize();

      const client = new HttpSyncClient({
        baseUrl: 'http://localhost:8000',
        token: 'test',
      });

      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      const manager = new SyncManager({ store, client });
      await manager.sync();

      expect(manager.getStatus()).toBe('offline');
    });

    it('resumes sync on browser online event', async () => {
      const adapter = new MockSqliteAdapter();
      const store = new LocalStore(adapter);
      await store.initialize();

      const client = new HttpSyncClient({
        baseUrl: 'http://localhost:8000',
        token: 'test',
      });

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ ops: [], cursor: 10, hasMore: false }),
      });

      const manager = new SyncManager({ store, client });
      expect(manager.getStatus()).toBe('idle');

      // Trigger online event
      const list = windowListeners.get('online');
      expect(list).toBeDefined();
      expect(list!.length).toBeGreaterThan(0);

      const handleOnline = list![0];
      expect(handleOnline).toBeDefined();
      handleOnline!();

      // Give microtasks time to run
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
