import type { SqlParam, SqlRow, SqliteAdapter } from './types';

/**
 * An in-memory SQLite database emulator. Emulates standard SQL CRUD operations
 * for documents, clauses, parties, and relationships, facilitating offline testing
 * and a web browser preview experience when native Tauri or WASM bindings are unavailable.
 */
export class InMemorySqliteAdapter implements SqliteAdapter {
  private tables: {
    _docsgraph_meta: SqlRow[];
    documents: SqlRow[];
    clauses: SqlRow[];
    parties: SqlRow[];
    relationships: SqlRow[];
    sync_ops: SqlRow[];
  } = {
    _docsgraph_meta: [],
    documents: [],
    clauses: [],
    parties: [],
    relationships: [],
    sync_ops: [],
  };

  async query<T extends SqlRow = SqlRow>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const cleaned = sql.replace(/\s+/g, ' ').trim();

    if (cleaned.includes('FROM _docsgraph_meta')) {
      if (cleaned.includes("WHERE key = 'schema_version'")) {
        const row = this.tables._docsgraph_meta.find((r) => r.key === 'schema_version');
        return (row ? [row] : []) as unknown as T[];
      }
      if (cleaned.includes("WHERE key = 'sync_cursor'")) {
        const row = this.tables._docsgraph_meta.find((r) => r.key === 'sync_cursor');
        return (row ? [row] : []) as unknown as T[];
      }
      return this.tables._docsgraph_meta as unknown as T[];
    }

    if (cleaned.includes('FROM documents')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const row = this.tables.documents.find((r) => r.id === id);
        return (row ? [row] : []) as unknown as T[];
      }
      return this.tables.documents as unknown as T[];
    }

    if (cleaned.includes('FROM clauses')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const row = this.tables.clauses.find((r) => r.id === id);
        return (row ? [row] : []) as unknown as T[];
      }
      if (cleaned.includes('WHERE document_id = ?')) {
        const docId = params[0] as string;
        const rows = this.tables.clauses.filter((r) => r.document_id === docId);
        return rows as unknown as T[];
      }
      return this.tables.clauses as unknown as T[];
    }

    if (cleaned.includes('FROM parties')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const row = this.tables.parties.find((r) => r.id === id);
        return (row ? [row] : []) as unknown as T[];
      }
      return this.tables.parties as unknown as T[];
    }

    if (cleaned.includes('FROM relationships')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const row = this.tables.relationships.find((r) => r.id === id);
        return (row ? [row] : []) as unknown as T[];
      }
      return this.tables.relationships as unknown as T[];
    }

    if (cleaned.includes('FROM sync_ops')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const row = this.tables.sync_ops.find((r) => r.id === id);
        return (row ? [row] : []) as unknown as T[];
      }
      if (cleaned.includes('WHERE seq IS NULL')) {
        return this.tables.sync_ops.filter((r) => r.seq === null || r.seq === undefined) as unknown as T[];
      }
      return this.tables.sync_ops as unknown as T[];
    }

    return [];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    const cleaned = sql.replace(/\s+/g, ' ').trim();

    if (cleaned.includes('INSERT INTO _docsgraph_meta') || cleaned.includes('ON CONFLICT (key) DO UPDATE')) {
      let key = '';
      let val = '';
      if (cleaned.includes("'sync_cursor'")) {
        key = 'sync_cursor';
        val = params[0] as string;
      } else if (cleaned.includes("'schema_version'")) {
        key = 'schema_version';
        val = params[0] as string;
      } else {
        key = params[0] as string;
        val = params[1] as string;
      }
      const existing = this.tables._docsgraph_meta.find((r) => r.key === key);
      if (existing) {
        existing.value = val;
      } else {
        this.tables._docsgraph_meta.push({ key, value: val });
      }
      return;
    }

    if (cleaned.includes('INSERT INTO documents')) {
      this.tables.documents.push({
        id: params[0] as string,
        title: params[1] as string,
        content: params[2] as string,
        created_at: params[3] as string,
        updated_at: params[4] as string,
        last_seq: params[5] as number,
      });
      return;
    }

    if (cleaned.startsWith('UPDATE documents SET')) {
      const setPart = cleaned.substring('UPDATE documents SET'.length, cleaned.indexOf('WHERE')).trim();
      const id = params[params.length - 1] as string;
      const idx = this.tables.documents.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const current = this.tables.documents[idx];
        if (current) {
          const assignments = setPart.split(',').map((s) => s.trim().split('=')[0]?.trim() || '');
          assignments.forEach((field, i) => {
            if (field === 'title') current.title = params[i] as string;
            else if (field === 'content') current.content = params[i] as string;
            else if (field === 'created_at') current.created_at = params[i] as string;
            else if (field === 'updated_at') current.updated_at = params[i] as string;
            else if (field === 'last_seq') current.last_seq = params[i] as number;
          });
        }
      }
      return;
    }

    if (cleaned.includes('DELETE FROM documents')) {
      const id = params[0] as string;
      this.tables.documents = this.tables.documents.filter((r) => r.id !== id);
      return;
    }

    if (cleaned.includes('INSERT INTO clauses')) {
      this.tables.clauses.push({
        id: params[0] as string,
        document_id: params[1] as string,
        title: params[2] as string,
        text: params[3] as string,
        created_at: params[4] as string,
        updated_at: params[5] as string,
        last_seq: params[6] as number,
      });
      return;
    }

    if (cleaned.startsWith('UPDATE clauses SET')) {
      const setPart = cleaned.substring('UPDATE clauses SET'.length, cleaned.indexOf('WHERE')).trim();
      const id = params[params.length - 1] as string;
      const idx = this.tables.clauses.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const current = this.tables.clauses[idx];
        if (current) {
          const assignments = setPart.split(',').map((s) => s.trim().split('=')[0]?.trim() || '');
          assignments.forEach((field, i) => {
            if (field === 'title') current.title = params[i] as string;
            else if (field === 'text') current.text = params[i] as string;
            else if (field === 'document_id') current.document_id = params[i] as string;
            else if (field === 'created_at') current.created_at = params[i] as string;
            else if (field === 'updated_at') current.updated_at = params[i] as string;
            else if (field === 'last_seq') current.last_seq = params[i] as number;
          });
        }
      }
      return;
    }

    if (cleaned.includes('DELETE FROM clauses')) {
      const id = params[0] as string;
      this.tables.clauses = this.tables.clauses.filter((r) => r.id !== id);
      return;
    }

    if (cleaned.includes('INSERT INTO parties')) {
      this.tables.parties.push({
        id: params[0] as string,
        name: params[1] as string,
        email: params[2] as string,
        created_at: params[3] as string,
        updated_at: params[4] as string,
        last_seq: params[5] as number,
      });
      return;
    }

    if (cleaned.startsWith('UPDATE parties SET')) {
      const setPart = cleaned.substring('UPDATE parties SET'.length, cleaned.indexOf('WHERE')).trim();
      const id = params[params.length - 1] as string;
      const idx = this.tables.parties.findIndex((r) => r.id === id);
      if (idx !== -1) {
        const current = this.tables.parties[idx];
        if (current) {
          const assignments = setPart.split(',').map((s) => s.trim().split('=')[0]?.trim() || '');
          assignments.forEach((field, i) => {
            if (field === 'name') current.name = params[i] as string;
            else if (field === 'email') current.email = params[i] as string;
            else if (field === 'created_at') current.created_at = params[i] as string;
            else if (field === 'updated_at') current.updated_at = params[i] as string;
            else if (field === 'last_seq') current.last_seq = params[i] as number;
          });
        }
      }
      return;
    }

    if (cleaned.includes('DELETE FROM parties')) {
      const id = params[0] as string;
      this.tables.parties = this.tables.parties.filter((r) => r.id !== id);
      return;
    }

    if (cleaned.includes('INSERT INTO relationships')) {
      this.tables.relationships.push({
        id: params[0] as string,
        source_id: params[1] as string,
        source_type: params[2] as string,
        target_id: params[3] as string,
        target_type: params[4] as string,
        type: params[5] as string,
        created_at: params[6] as string,
        updated_at: params[7] as string,
        last_seq: params[8] as number,
      });
      return;
    }

    if (cleaned.includes('DELETE FROM relationships')) {
      const id = params[0] as string;
      this.tables.relationships = this.tables.relationships.filter((r) => r.id !== id);
      return;
    }

    if (cleaned.includes('INSERT OR IGNORE INTO sync_ops')) {
      this.tables.sync_ops.push({
        id: params[0] as string,
        kind: params[1] as string,
        entity_type: params[2] as string,
        entity_id: params[3] as string,
        payload: params[4] as string,
        client_timestamp: params[5] as string,
        seq: params[6] === undefined ? null : (params[6] as number),
      });
      return;
    }

    if (cleaned.includes('UPDATE sync_ops SET seq = ? WHERE id = ?')) {
      const seq = params[0] as number;
      const id = params[1] as string;
      const op = this.tables.sync_ops.find((r) => r.id === id);
      if (op) {
        op.seq = seq;
      }
      return;
    }
  }

  async transaction<T>(fn: (tx: SqliteAdapter) => Promise<T>): Promise<T> {
    return await fn(this);
  }

  async close(): Promise<void> {}
}
