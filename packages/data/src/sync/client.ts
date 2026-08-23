import type { PullResult, PushResult, SyncClient, SyncCursor, SyncOp } from './types';

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

  async push(ops: SyncOp[], cursor: SyncCursor): Promise<PushResult> {
    const response = await fetch(`${this.baseUrl}/api/v1/sync/push`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ ops, cursor }),
    });

    if (!response.ok) {
      throw new Error(`Push failed with status ${response.status}: ${response.statusText}`);
    }

    return (await response.json()) as PushResult;
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

    return (await response.json()) as PullResult;
  }
}
