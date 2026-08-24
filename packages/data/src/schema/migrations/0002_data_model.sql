-- Migration 0002: Core local-first data model.
--
-- Sets up tables for offline-first documents, parties, clauses, and their
-- graph relationships, along with an append-only sync_ops log to track mutations.

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seq INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seq INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clauses (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seq INTEGER DEFAULT 0,
  FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS relationships (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seq INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sync_ops (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  client_timestamp TEXT NOT NULL,
  seq INTEGER
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_clauses_document_id ON clauses (document_id);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships (source_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships (target_id);
CREATE INDEX IF NOT EXISTS idx_sync_ops_seq ON sync_ops (seq);
CREATE INDEX IF NOT EXISTS idx_sync_ops_unsynced ON sync_ops (id) WHERE seq IS NULL;

-- Update schema version metadata
INSERT INTO _docsgraph_meta (key, value)
VALUES ('schema_version', '2')
ON CONFLICT (key) DO UPDATE SET value = excluded.value;
