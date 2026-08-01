import type { SqlParam, SqlRow, SqliteAdapter } from './types';

/**
 * Native SQLite adapter for the desktop client, backed by Tauri's SQL
 * plugin (`@tauri-apps/plugin-sql`). This is a stub: the real
 * implementation belongs in `apps/desktop` once the Tauri SQL plugin is
 * wired up there (`invoke`-based binding to the Rust-side connection).
 *
 * TODO(desktop): implement using `@tauri-apps/plugin-sql`'s `Database`
 * handle, e.g. `Database.load('sqlite:docsgraph.db')`.
 */
export class NativeSqliteAdapter implements SqliteAdapter {
  async query<T extends SqlRow = SqlRow>(_sql: string, _params?: SqlParam[]): Promise<T[]> {
    throw new Error('Not implemented: NativeSqliteAdapter.query (requires Tauri SQL plugin)');
  }

  async exec(_sql: string, _params?: SqlParam[]): Promise<void> {
    throw new Error('Not implemented: NativeSqliteAdapter.exec (requires Tauri SQL plugin)');
  }

  async transaction<T>(_fn: (tx: SqliteAdapter) => Promise<T>): Promise<T> {
    throw new Error(
      'Not implemented: NativeSqliteAdapter.transaction (requires Tauri SQL plugin)',
    );
  }

  async close(): Promise<void> {
    throw new Error('Not implemented: NativeSqliteAdapter.close (requires Tauri SQL plugin)');
  }
}
