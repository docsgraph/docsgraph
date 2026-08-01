/**
 * A single bound SQL parameter. Kept intentionally narrow so both the
 * native (Tauri) and browser (wa-sqlite) backends can support the same
 * surface without lossy conversions.
 */
export type SqlParam = string | number | boolean | null | Uint8Array;

/** A row returned from a query, keyed by column name. */
export type SqlRow = Record<string, SqlParam>;

/**
 * Storage-agnostic interface for docsgraph's local-first SQLite layer.
 *
 * Two implementations are expected:
 *  - a native one backed by Tauri's SQL plugin (desktop, `apps/desktop`)
 *  - a browser one backed by wa-sqlite over OPFS (web, `apps/web`)
 *
 * Both are stubs in this scaffold — see `native.ts` and `web.ts`.
 */
export interface SqliteAdapter {
  /** Run a read query and return all matching rows. */
  query<T extends SqlRow = SqlRow>(sql: string, params?: SqlParam[]): Promise<T[]>;

  /** Run a write statement (INSERT/UPDATE/DELETE/DDL) with no result rows. */
  exec(sql: string, params?: SqlParam[]): Promise<void>;

  /**
   * Run `fn` inside a database transaction. If `fn` throws, the
   * transaction is rolled back; otherwise it is committed.
   */
  transaction<T>(fn: (tx: SqliteAdapter) => Promise<T>): Promise<T>;

  /** Release any underlying connection/handle. */
  close(): Promise<void>;
}
