/**
 * Manifest of known migrations, in application order.
 *
 * `sql` is inlined (rather than read from disk at runtime) so this module
 * works unmodified in both the native (Tauri, Node-less) and web
 * (browser, no filesystem) runtimes — callers pass `sql` straight to
 * whichever `SqliteAdapter.exec` they're using.
 */
import migration0001 from './migrations/0001_init.sql?raw';

export interface Migration {
  /** Sequential id, matches the file's numeric prefix. */
  id: number;
  /** Short human-readable name, matches the file's description segment. */
  name: string;
  /** Raw SQL to execute for this migration. */
  sql: string;
}

export const migrations: Migration[] = [{ id: 1, name: 'init', sql: migration0001 }];

/** Returns migrations with `id` greater than `afterId`, in order. */
export function pendingMigrations(afterId: number): Migration[] {
  return migrations.filter((m) => m.id > afterId).sort((a, b) => a.id - b.id);
}
