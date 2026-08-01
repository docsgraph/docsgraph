import type { SqlParam, SqlRow, SqliteAdapter } from './types';

/**
 * Browser SQLite adapter for the web client, backed by wa-sqlite running
 * over an OPFS (Origin Private File System) VFS. This is a stub: the real
 * implementation needs a `wa-sqlite` worker + OPFS access handle setup.
 *
 * TODO(web): implement using `wa-sqlite`'s `SQLiteESMFactory` plus an
 * `IDBBatchAtomicVFS`/OPFS VFS, run inside a dedicated Web Worker so
 * synchronous OPFS access handles don't block the main thread.
 */
export class WebSqliteAdapter implements SqliteAdapter {
  async query<T extends SqlRow = SqlRow>(_sql: string, _params?: SqlParam[]): Promise<T[]> {
    throw new Error('Not implemented: WebSqliteAdapter.query (requires wa-sqlite/OPFS)');
  }

  async exec(_sql: string, _params?: SqlParam[]): Promise<void> {
    throw new Error('Not implemented: WebSqliteAdapter.exec (requires wa-sqlite/OPFS)');
  }

  async transaction<T>(_fn: (tx: SqliteAdapter) => Promise<T>): Promise<T> {
    throw new Error('Not implemented: WebSqliteAdapter.transaction (requires wa-sqlite/OPFS)');
  }

  async close(): Promise<void> {
    throw new Error('Not implemented: WebSqliteAdapter.close (requires wa-sqlite/OPFS)');
  }
}
