import type { PullResult, PushResult, SyncClient, SyncCursor, SyncOp, SyncOpKind } from './types';

/**
 * Stub sync client. No network calls happen here — this exists so
 * `packages/data` consumers (and future `docsgraph-server` integration
 * work) have a concrete, typed implementation to build against.
 */
export class StubSyncClient implements SyncClient {
  async push(_ops: SyncOp[], _cursor: SyncCursor): Promise<PushResult> {
    throw new Error('Not implemented: StubSyncClient.push (no transport wired up yet)');
  }

  async pull(_cursor: SyncCursor): Promise<PullResult> {
    throw new Error('Not implemented: StubSyncClient.pull (no transport wired up yet)');
  }
}

export interface HttpSyncClientOptions {
  /** The base URL of the self-hosted docsgraph-server instance */
  baseUrl: string;
  /** Optional static token or dynamic function returning the token */
  token?: string | (() => string | null) | null;
}

/**
 * Production-ready SyncClient implementation communicating with the
 * self-hosted docsgraph-server instance using standard HTTP request APIs.
 */
export class HttpSyncClient implements SyncClient {
  private baseUrl: string;
  private token: string | (() => string | null) | null;

  constructor(options: HttpSyncClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token || null;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const t = typeof this.token === 'function' ? this.token() : this.token;
    if (t) {
      headers['Authorization'] = `Bearer ${t}`;
    }
    return headers;
  }

  private getClientId(): string {
    const key = 'docsgraph_client_id';
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(key);
      if (stored) return stored;
    }
    const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, uuid);
    }
    return uuid;
  }

  async push(ops: SyncOp[], cursor: SyncCursor): Promise<PushResult> {
    const serializedOps = ops.map((op) => ({
      op_id: op.id,
      entity_type: op.entityType,
      entity_id: op.entityId,
      operation: op.kind,
      payload: op.payload,
      client_timestamp: op.clientTimestamp,
      seq: null,
    }));

    const response = await fetch(`${this.baseUrl}/api/v1/sync/push`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        client_id: this.getClientId(),
        cursor,
        ops: serializedOps,
      }),
    });

    if (!response.ok) {
      throw new Error(`Push failed with status ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      cursor: number;
      acks: Array<{ op_id: string; seq: number }>;
    };

    return {
      cursor: data.cursor,
      acks: data.acks.map((ack) => ({
        opId: ack.op_id,
        seq: ack.seq,
      })),
    };
  }

  async pull(cursor: SyncCursor): Promise<PullResult> {
    const url = `${this.baseUrl}/api/v1/sync/pull?since=${cursor}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Pull failed with status ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as {
      cursor: number;
      ops: Array<{
        op_id: string;
        entity_type: string;
        entity_id: string;
        operation: string;
        payload: Record<string, unknown> | null;
        client_timestamp: string;
        seq: number;
      }>;
    };

    const ops = data.ops.map((op) => ({
      id: op.op_id,
      entityType: op.entity_type,
      entityId: op.entity_id,
      kind: op.operation as SyncOpKind,
      payload: op.payload,
      clientTimestamp: op.client_timestamp,
      sequence: op.seq,
    }));

    return {
      ops,
      cursor: data.cursor,
      hasMore: false,
    };
  }
}
