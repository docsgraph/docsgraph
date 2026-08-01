# Schema & migrations

SQLite schema for the local-first data layer lives here as plain `.sql`
migration files under `migrations/`.

## Convention

- Files are named `NNNN_short_description.sql`, zero-padded, sequential,
  starting at `0001`.
- Each file is applied exactly once, in order, tracked by the
  `_docsgraph_meta` table's `schema_version` key.
- Migrations are forward-only. To undo a mistake, add a new migration
  that reverses it — don't edit or delete an already-committed migration
  file.
- Keep each migration focused on one logical change (one new table, one
  column addition, etc.) so history stays readable and bisectable.
- Migrations must be idempotent-safe to re-run during development
  (`IF NOT EXISTS` / `ON CONFLICT` where practical), since the same file
  may be applied to a fresh local db multiple times while iterating.

`0001_init.sql` is a placeholder — it only sets up a metadata table used
to track schema version. The real document/graph/sync-op tables will be
added in subsequent migrations as the data model solidifies.
