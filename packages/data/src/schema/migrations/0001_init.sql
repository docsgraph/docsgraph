-- Migration 0001: initial schema placeholder.
--
-- This is a scaffold placeholder, not the real schema. Once document,
-- graph-node, and sync-op tables are designed, replace this with the
-- actual `CREATE TABLE` statements. See ../README.md for the migration
-- convention this repo follows.

CREATE TABLE IF NOT EXISTS _docsgraph_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO _docsgraph_meta (key, value)
VALUES ('schema_version', '1')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
