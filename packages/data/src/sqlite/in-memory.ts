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
      if (cleaned.includes('entity_type = ?') && cleaned.includes('entity_id = ?') && cleaned.includes('seq IS NULL')) {
        const entityType = params[0] as string;
        const entityId = params[1] as string;
        const rows = this.tables.sync_ops.filter(
          (r) => r.entity_type === entityType && r.entity_id === entityId && (r.seq === null || r.seq === undefined)
        );
        return rows as unknown as T[];
      }
      if (cleaned.includes('seq IS NULL') || cleaned.includes('seq is null')) {
        return this.tables.sync_ops.filter((r) => r.seq === null || r.seq === undefined) as unknown as T[];
      }
      return this.tables.sync_ops as unknown as T[];
    }

    throw new Error(`Unrecognized SQL query: ${sql}`);
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    const cleaned = sql.replace(/\s+/g, ' ').trim();

    // 1. DDL Statements: bypass validation
    if (
      cleaned.includes('CREATE TABLE') ||
      cleaned.includes('CREATE INDEX') ||
      cleaned.includes('DROP TABLE') ||
      cleaned.startsWith('PRAGMA')
    ) {
      return;
    }

    // 2. Specialized Key-Value metadata store handling
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

    // 3. Generic UPDATE handler: parses assignments and executes changes dynamically
    if (cleaned.includes('UPDATE ')) {
      const updateMatch = cleaned.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+id\s*=\s*\?/i);
      if (updateMatch && updateMatch[1] && updateMatch[2]) {
        const tableName = updateMatch[1].toLowerCase();
        const assignmentsStr = updateMatch[2];
        const id = params[params.length - 1] as string;
        const table = this.tables[tableName as keyof typeof this.tables];
        if (!table) {
          throw new Error(`Table '${tableName}' does not exist in InMemorySqliteAdapter`);
        }

        const row = table.find((r) => r.id === id);
        if (row) {
          const assignments: string[] = [];
          let currentExpr = '';
          let parenDepth = 0;
          for (let i = 0; i < assignmentsStr.length; i++) {
            const char = assignmentsStr[i];
            if (char === '(') parenDepth++;
            else if (char === ')') parenDepth--;

            if (char === ',' && parenDepth === 0) {
              assignments.push(currentExpr.trim());
              currentExpr = '';
            } else {
              currentExpr += char;
            }
          }
          if (currentExpr.trim()) {
            assignments.push(currentExpr.trim());
          }

          let paramIdx = 0;
          for (const assignment of assignments) {
            const eqIdx = assignment.indexOf('=');
            if (eqIdx === -1) continue;
            const column = this.camelToSnake(assignment.substring(0, eqIdx).trim()).toLowerCase();
            const valueExpr = assignment.substring(eqIdx + 1).trim();

            const placeholdersCount = (valueExpr.match(/\?/g) || []).length;
            if (placeholdersCount === 1) {
              const val = params[paramIdx++] ?? null;
              if (valueExpr.toLowerCase().includes('max(')) {
                const currentVal = (row[column] as number) || 0;
                row[column] = Math.max(currentVal, val as number);
              } else {
                row[column] = val;
              }
            } else if (placeholdersCount === 0) {
              // E.g. static values or NULL if needed
            } else {
              paramIdx += placeholdersCount;
            }
          }
        }
        return;
      }
    }

    // 4. Generic DELETE handler
    if (cleaned.includes('DELETE FROM ')) {
      const deleteMatch = cleaned.match(/^DELETE\s+FROM\s+(\w+)\s+WHERE\s+id\s*=\s*\?/i);
      if (deleteMatch && deleteMatch[1]) {
        const tableName = deleteMatch[1].toLowerCase();
        const id = params[0] as string;
        const table = this.tables[tableName as keyof typeof this.tables];
        if (table) {
          this.tables[tableName as keyof typeof this.tables] = table.filter((r) => r.id !== id);
        }
        return;
      }
    }

    // 5. Generic INSERT handler: handles column-to-parameter binding, literals, and NULLs
    if (cleaned.startsWith('INSERT ')) {
      const insertMatch = cleaned.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
      if (insertMatch && insertMatch[1] && insertMatch[2] && insertMatch[3]) {
        const tableName = insertMatch[1].toLowerCase();
        const columns = insertMatch[2].split(',').map((c) => this.camelToSnake(c.trim()).toLowerCase());
        const valuesExprs = insertMatch[3].split(',').map((v) => v.trim());

        const row: SqlRow = {};
        let paramIdx = 0;
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          const expr = valuesExprs[i];
          if (!col || !expr) continue;

          if (expr === '?') {
            row[col] = params[paramIdx++] ?? null;
          } else if (expr.toLowerCase() === 'null') {
            row[col] = null;
          } else if (!isNaN(Number(expr))) {
            row[col] = Number(expr);
          } else {
            row[col] = expr.replace(/^['"]|['"]$/g, '');
          }
        }

        const table = this.tables[tableName as keyof typeof this.tables];
        if (!table) {
          throw new Error(`Table '${tableName}' does not exist in InMemorySqliteAdapter`);
        }

        if (cleaned.includes('OR IGNORE')) {
          const exists = table.some((r) => r.id === row.id);
          if (!exists) {
            table.push(row);
          }
        } else {
          table.push(row);
        }
        return;
      }
    }

    throw new Error(`Unrecognized SQL exec query: ${sql}`);
  }

  async transaction<T>(fn: (tx: SqliteAdapter) => Promise<T>): Promise<T> {
    return await fn(this);
  }

  async close(): Promise<void> {}
}
