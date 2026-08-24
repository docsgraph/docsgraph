import type { SqliteAdapter, SqlParam, SqlRow } from './sqlite/types';
import type { Document, Party, Clause, Relationship } from './types/models';
import type { SyncOp, RemoteSyncOp, SyncOpKind } from './sync/types';
import { pendingMigrations } from './schema/migrations';

export class LocalStore {
  private readonly allowedColumns: Record<string, Set<string>> = {
    documents: new Set(['id', 'title', 'content', 'created_at', 'updated_at', 'last_seq']),
    parties: new Set(['id', 'name', 'email', 'created_at', 'updated_at', 'last_seq']),
    clauses: new Set(['id', 'document_id', 'title', 'text', 'created_at', 'updated_at', 'last_seq']),
    relationships: new Set(['id', 'source_id', 'source_type', 'target_id', 'target_type', 'type', 'created_at', 'updated_at', 'last_seq']),
  };

  constructor(private adapter: SqliteAdapter) {}

  /**
   * Run pending migrations to set up or update the SQLite schema.
   */
  async initialize(): Promise<void> {
    let currentVersion = 0;
    try {
      const rows = await this.adapter.query<{ value: string }>(
        "SELECT value FROM _docsgraph_meta WHERE key = 'schema_version'"
      );
      const firstRow = rows[0];
      if (firstRow) {
        currentVersion = parseInt(firstRow.value, 10);
      }
    } catch {
      // Table doesn't exist yet, version is 0
      currentVersion = 0;
    }

    const pending = pendingMigrations(currentVersion);
    if (pending.length === 0) {
      return;
    }

    await this.adapter.transaction(async (tx) => {
      for (const migration of pending) {
        // Split migration by semicolon to run statements sequentially.
        const statements = migration.sql
          .split(';')
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const statement of statements) {
          await tx.exec(statement);
        }
      }
    });
  }

  // --- Document CRUD ---

  async createDocument(doc: Omit<Document, 'createdAt' | 'updatedAt' | 'lastSeq'>): Promise<Document> {
    const now = new Date().toISOString();
    const fullDoc: Document = {
      ...doc,
      createdAt: now,
      updatedAt: now,
      lastSeq: 0,
    };

    await this.adapter.transaction(async (tx) => {
      await tx.exec(
        `INSERT INTO documents (id, title, content, created_at, updated_at, last_seq)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [fullDoc.id, fullDoc.title, fullDoc.content, fullDoc.createdAt, fullDoc.updatedAt]
      );
      await this.recordOp(tx, 'create', 'document', fullDoc.id, {
        title: fullDoc.title,
        content: fullDoc.content,
      });
    });

    return fullDoc;
  }

  async getDocument(id: string): Promise<Document | null> {
    const rows = await this.adapter.query(
      'SELECT id, title, content, created_at, updated_at, last_seq FROM documents WHERE id = ?',
      [id]
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return this.mapDbToDocument(row);
  }

  async getDocuments(): Promise<Document[]> {
    const rows = await this.adapter.query(
      'SELECT id, title, content, created_at, updated_at, last_seq FROM documents'
    );
    return rows.map((r) => this.mapDbToDocument(r));
  }

  async updateDocument(
    id: string,
    updates: Partial<Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'lastSeq'>>
  ): Promise<Document> {
    const now = new Date().toISOString();
    return await this.adapter.transaction(async (tx) => {
      const existing = await tx.query(
        'SELECT id, title, content, created_at, updated_at, last_seq FROM documents WHERE id = ?',
        [id]
      );
      const row = existing[0];
      if (!row) {
        throw new Error(`Document with id ${id} not found`);
      }
      const current = this.mapDbToDocument(row);
      const updated = {
        ...current,
        ...updates,
        updatedAt: now,
      };

      const keys = Object.keys(updates) as Array<keyof typeof updates>;
      if (keys.length > 0) {
        const setClause = keys.map((k) => `${this.camelToSnake(k)} = ?`).join(', ');
        const values = keys.map((k) => updates[k] as SqlParam);
        await tx.exec(
          `UPDATE documents SET ${setClause}, updated_at = ? WHERE id = ?`,
          [...values, now, id]
        );
        await this.recordOp(tx, 'update', 'document', id, updates);
      }

      return updated;
    });
  }

  async deleteDocument(id: string): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      await tx.exec('DELETE FROM documents WHERE id = ?', [id]);
      await this.recordOp(tx, 'delete', 'document', id, null);
    });
  }

  // --- Party CRUD ---

  async createParty(party: Omit<Party, 'createdAt' | 'updatedAt' | 'lastSeq'>): Promise<Party> {
    const now = new Date().toISOString();
    const fullParty: Party = {
      ...party,
      createdAt: now,
      updatedAt: now,
      lastSeq: 0,
    };

    await this.adapter.transaction(async (tx) => {
      await tx.exec(
        `INSERT INTO parties (id, name, email, created_at, updated_at, last_seq)
         VALUES (?, ?, ?, ?, ?, 0)`,
        [fullParty.id, fullParty.name, fullParty.email, fullParty.createdAt, fullParty.updatedAt]
      );
      await this.recordOp(tx, 'create', 'party', fullParty.id, {
        name: fullParty.name,
        email: fullParty.email,
      });
    });

    return fullParty;
  }

  async getParty(id: string): Promise<Party | null> {
    const rows = await this.adapter.query(
      'SELECT id, name, email, created_at, updated_at, last_seq FROM parties WHERE id = ?',
      [id]
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return this.mapDbToParty(row);
  }

  async getParties(): Promise<Party[]> {
    const rows = await this.adapter.query(
      'SELECT id, name, email, created_at, updated_at, last_seq FROM parties'
    );
    return rows.map((r) => this.mapDbToParty(r));
  }

  async updateParty(
    id: string,
    updates: Partial<Omit<Party, 'id' | 'createdAt' | 'updatedAt' | 'lastSeq'>>
  ): Promise<Party> {
    const now = new Date().toISOString();
    return await this.adapter.transaction(async (tx) => {
      const existing = await tx.query(
        'SELECT id, name, email, created_at, updated_at, last_seq FROM parties WHERE id = ?',
        [id]
      );
      const row = existing[0];
      if (!row) {
        throw new Error(`Party with id ${id} not found`);
      }
      const current = this.mapDbToParty(row);
      const updated = {
        ...current,
        ...updates,
        updatedAt: now,
      };

      const keys = Object.keys(updates) as Array<keyof typeof updates>;
      if (keys.length > 0) {
        const setClause = keys.map((k) => `${this.camelToSnake(k)} = ?`).join(', ');
        const values = keys.map((k) => updates[k] as SqlParam);
        await tx.exec(
          `UPDATE parties SET ${setClause}, updated_at = ? WHERE id = ?`,
          [...values, now, id]
        );
        await this.recordOp(tx, 'update', 'party', id, updates);
      }

      return updated;
    });
  }

  async deleteParty(id: string): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      await tx.exec('DELETE FROM parties WHERE id = ?', [id]);
      await this.recordOp(tx, 'delete', 'party', id, null);
    });
  }

  // --- Clause CRUD ---

  async createClause(clause: Omit<Clause, 'createdAt' | 'updatedAt' | 'lastSeq'>): Promise<Clause> {
    const now = new Date().toISOString();
    const fullClause: Clause = {
      ...clause,
      createdAt: now,
      updatedAt: now,
      lastSeq: 0,
    };

    await this.adapter.transaction(async (tx) => {
      await tx.exec(
        `INSERT INTO clauses (id, document_id, title, text, created_at, updated_at, last_seq)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [
          fullClause.id,
          fullClause.documentId,
          fullClause.title,
          fullClause.text,
          fullClause.createdAt,
          fullClause.updatedAt,
        ]
      );
      await this.recordOp(tx, 'create', 'clause', fullClause.id, {
        documentId: fullClause.documentId,
        title: fullClause.title,
        text: fullClause.text,
      });
    });

    return fullClause;
  }

  async getClause(id: string): Promise<Clause | null> {
    const rows = await this.adapter.query(
      'SELECT id, document_id, title, text, created_at, updated_at, last_seq FROM clauses WHERE id = ?',
      [id]
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return this.mapDbToClause(row);
  }

  async getClausesByDocument(documentId: string): Promise<Clause[]> {
    const rows = await this.adapter.query(
      'SELECT id, document_id, title, text, created_at, updated_at, last_seq FROM clauses WHERE document_id = ?',
      [documentId]
    );
    return rows.map((r) => this.mapDbToClause(r));
  }

  async getClauses(): Promise<Clause[]> {
    const rows = await this.adapter.query(
      'SELECT id, document_id, title, text, created_at, updated_at, last_seq FROM clauses'
    );
    return rows.map((r) => this.mapDbToClause(r));
  }

  async updateClause(
    id: string,
    updates: Partial<Omit<Clause, 'id' | 'documentId' | 'createdAt' | 'updatedAt' | 'lastSeq'>>
  ): Promise<Clause> {
    const now = new Date().toISOString();
    return await this.adapter.transaction(async (tx) => {
      const existing = await tx.query(
        'SELECT id, document_id, title, text, created_at, updated_at, last_seq FROM clauses WHERE id = ?',
        [id]
      );
      const row = existing[0];
      if (!row) {
        throw new Error(`Clause with id ${id} not found`);
      }
      const current = this.mapDbToClause(row);
      const updated = {
        ...current,
        ...updates,
        updatedAt: now,
      };

      const keys = Object.keys(updates) as Array<keyof typeof updates>;
      if (keys.length > 0) {
        const setClause = keys.map((k) => `${this.camelToSnake(k)} = ?`).join(', ');
        const values = keys.map((k) => updates[k] as SqlParam);
        await tx.exec(
          `UPDATE clauses SET ${setClause}, updated_at = ? WHERE id = ?`,
          [...values, now, id]
        );
        await this.recordOp(tx, 'update', 'clause', id, updates);
      }

      return updated;
    });
  }

  async deleteClause(id: string): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      await tx.exec('DELETE FROM clauses WHERE id = ?', [id]);
      await this.recordOp(tx, 'delete', 'clause', id, null);
    });
  }

  // --- Relationship CRUD ---

  async createRelationship(
    rel: Omit<Relationship, 'createdAt' | 'updatedAt' | 'lastSeq'>
  ): Promise<Relationship> {
    const now = new Date().toISOString();
    const fullRel: Relationship = {
      ...rel,
      createdAt: now,
      updatedAt: now,
      lastSeq: 0,
    };

    await this.adapter.transaction(async (tx) => {
      await tx.exec(
        `INSERT INTO relationships (id, source_id, source_type, target_id, target_type, type, created_at, updated_at, last_seq)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          fullRel.id,
          fullRel.sourceId,
          fullRel.sourceType,
          fullRel.targetId,
          fullRel.targetType,
          fullRel.type,
          fullRel.createdAt,
          fullRel.updatedAt,
        ]
      );
      await this.recordOp(tx, 'create', 'relationship', fullRel.id, {
        sourceId: fullRel.sourceId,
        sourceType: fullRel.sourceType,
        targetId: fullRel.targetId,
        targetType: fullRel.targetType,
        type: fullRel.type,
      });
    });

    return fullRel;
  }

  async getRelationship(id: string): Promise<Relationship | null> {
    const rows = await this.adapter.query(
      'SELECT id, source_id, source_type, target_id, target_type, type, created_at, updated_at, last_seq FROM relationships WHERE id = ?',
      [id]
    );
    const row = rows[0];
    if (!row) {
      return null;
    }
    return this.mapDbToRelationship(row);
  }

  async getRelationships(): Promise<Relationship[]> {
    const rows = await this.adapter.query(
      'SELECT id, source_id, source_type, target_id, target_type, type, created_at, updated_at, last_seq FROM relationships'
    );
    return rows.map((r) => this.mapDbToRelationship(r));
  }

  async deleteRelationship(id: string): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      await tx.exec('DELETE FROM relationships WHERE id = ?', [id]);
      await this.recordOp(tx, 'delete', 'relationship', id, null);
    });
  }

  // --- Sync Mechanics ---

  async getUnsyncedOps(): Promise<SyncOp[]> {
    const rows = await this.adapter.query(
      'SELECT id, kind, entity_type, entity_id, payload, client_timestamp FROM sync_ops WHERE seq IS NULL ORDER BY client_timestamp ASC'
    );
    return rows.map((r) => this.mapDbToSyncOp(r));
  }

  async applyAck(opId: string, seq: number): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      await tx.exec('UPDATE sync_ops SET seq = ? WHERE id = ?', [seq, opId]);

      const opRows = await tx.query<{ entity_type: string; entity_id: string }>(
        'SELECT entity_type, entity_id FROM sync_ops WHERE id = ?',
        [opId]
      );
      const firstOpRow = opRows[0];
      if (firstOpRow) {
        const { entity_type: entityType, entity_id: entityId } = firstOpRow;
        const tableName = this.entityTypeToTable(entityType);
        if (tableName) {
          await tx.exec(
            `UPDATE ${tableName} SET last_seq = MAX(COALESCE(last_seq, 0), ?) WHERE id = ?`,
            [seq, entityId]
          );
        }
      }
    });
  }

  async getSyncCursor(): Promise<number> {
    const rows = await this.adapter.query<{ value: string }>(
      "SELECT value FROM _docsgraph_meta WHERE key = 'sync_cursor'"
    );
    const firstRow = rows[0];
    if (!firstRow) {
      return 0;
    }
    return parseInt(firstRow.value, 10);
  }

  async setSyncCursor(cursor: number): Promise<void> {
    await this.adapter.exec(
      `INSERT INTO _docsgraph_meta (key, value)
       VALUES ('sync_cursor', ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      [cursor.toString()]
    );
  }

  /**
   * Apply remote operations from the sync server, resolving conflicts
   * via field-level Last-Write-Wins (LWW) and preserving offline edits.
   */
  async applyRemoteOps(ops: RemoteSyncOp[]): Promise<void> {
    await this.adapter.transaction(async (tx) => {
      for (const op of ops) {
        // 1. Check if we already recorded this op ID in our local log
        const existingOp = await tx.query(
          'SELECT seq FROM sync_ops WHERE id = ?',
          [op.id]
        );

        if (existingOp.length > 0) {
          // This is a local op acked by the server. Update its sequence.
          await tx.exec('UPDATE sync_ops SET seq = ? WHERE id = ?', [op.sequence, op.id]);

          const tableName = this.entityTypeToTable(op.entityType);
          if (tableName) {
            await tx.exec(
              `UPDATE ${tableName} SET last_seq = ? WHERE id = ?`,
              [op.sequence, op.entityId]
            );
          }
          continue;
        }

        // 2. This is a remote op from another client/device.
        const tableName = this.entityTypeToTable(op.entityType);
        if (!tableName) continue;

        if (op.kind === 'delete') {
          // Check if there are local unsynced edits for this entity
          const unsynced = await tx.query(
            'SELECT id FROM sync_ops WHERE entity_type = ? AND entity_id = ? AND seq IS NULL',
            [op.entityType, op.entityId]
          );
          if (unsynced.length === 0) {
            // Safe to delete locally
            await tx.exec(`DELETE FROM ${tableName} WHERE id = ?`, [op.entityId]);
          }

          // Save the remote op to local log
          await tx.exec(
            `INSERT OR IGNORE INTO sync_ops (id, kind, entity_type, entity_id, payload, client_timestamp, seq)
             VALUES (?, ?, ?, ?, NULL, ?, ?)`,
            [op.id, op.kind, op.entityType, op.entityId, op.clientTimestamp, op.sequence]
          );
        } else {
          // 'create' or 'update'
          const existingEntity = await tx.query(
            `SELECT last_seq FROM ${tableName} WHERE id = ?`,
            [op.entityId]
          );

          if (existingEntity.length === 0) {
            // Insert new entity
            const payload = op.payload || {};
            const tableAllowed = this.allowedColumns[tableName];
            if (!tableAllowed) {
              throw new Error(`Unauthorized table name: ${tableName}`);
            }
            const keys = Object.keys(payload).filter((k) => tableAllowed.has(this.camelToSnake(k)));
            const columns = ['id', ...keys.map((k) => this.camelToSnake(k)), 'created_at', 'updated_at', 'last_seq'];
            const placeholders = columns.map(() => '?').join(', ');
            const now = new Date().toISOString();
            const createdAtVal = (payload.createdAt as string | undefined) || now;
            const updatedAtVal = (payload.updatedAt as string | undefined) || now;
            const values: SqlParam[] = [
              op.entityId,
              ...keys.map((k) => payload[k] as SqlParam),
              createdAtVal,
              updatedAtVal,
              op.sequence,
            ];

            await tx.exec(
              `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`,
              values
            );
          } else {
            // Entity exists locally: run field-level LWW against offline updates.
            const unsyncedOps = await tx.query<{ payload: string }>(
              'SELECT payload FROM sync_ops WHERE entity_type = ? AND entity_id = ? AND seq IS NULL',
              [op.entityType, op.entityId]
            );

            // Collect all fields modified offline locally
            const locallyModifiedFields = new Set<string>();
            for (const uOp of unsyncedOps) {
              if (uOp.payload) {
                try {
                  const uPayload = JSON.parse(uOp.payload) as Record<string, unknown>;
                  for (const key of Object.keys(uPayload)) {
                    locallyModifiedFields.add(key);
                  }
                } catch {
                  // Ignore parse errors
                }
              }
            }

            // Apply updates for fields not modified locally offline
            const remotePayload = op.payload || {};
            const updateKeys: string[] = [];
            const updateValues: SqlParam[] = [];
            const tableAllowed = this.allowedColumns[tableName];
            if (!tableAllowed) {
              throw new Error(`Unauthorized table name: ${tableName}`);
            }
            for (const key of Object.keys(remotePayload)) {
              const snakeKey = this.camelToSnake(key);
              if (!locallyModifiedFields.has(key) && tableAllowed.has(snakeKey)) {
                updateKeys.push(`${snakeKey} = ?`);
                updateValues.push(remotePayload[key] as SqlParam);
              }
            }

            // Always advance last_seq
            updateKeys.push('last_seq = ?');
            updateValues.push(op.sequence);

            // Update updated_at if any field actually changed
            if (updateKeys.length > 1) {
              updateKeys.push('updated_at = ?');
              updateValues.push(new Date().toISOString());
            }

            await tx.exec(
              `UPDATE ${tableName} SET ${updateKeys.join(', ')} WHERE id = ?`,
              [...updateValues, op.entityId]
            );
          }

          // Save the remote op to local log
          const payloadStr = op.payload ? JSON.stringify(op.payload) : null;
          await tx.exec(
            `INSERT OR IGNORE INTO sync_ops (id, kind, entity_type, entity_id, payload, client_timestamp, seq)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [op.id, op.kind, op.entityType, op.entityId, payloadStr, op.clientTimestamp, op.sequence]
          );
        }
      }
    });
  }

  // --- Internal Helpers ---

  private async recordOp(
    tx: SqliteAdapter,
    kind: SyncOpKind,
    entityType: string,
    entityId: string,
    payload: Record<string, unknown> | null
  ): Promise<void> {
    const opId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2) + Date.now().toString(36);
    const clientTimestamp = new Date().toISOString();
    const payloadStr = payload ? JSON.stringify(payload) : null;

    await tx.exec(
      `INSERT INTO sync_ops (id, kind, entity_type, entity_id, payload, client_timestamp, seq)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      [opId, kind, entityType, entityId, payloadStr, clientTimestamp]
    );
  }

  private entityTypeToTable(entityType: string): string | null {
    switch (entityType) {
      case 'document':
        return 'documents';
      case 'party':
        return 'parties';
      case 'clause':
        return 'clauses';
      case 'relationship':
        return 'relationships';
      default:
        return null;
    }
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private mapDbToDocument(row: SqlRow): Document {
    return {
      id: row.id as string,
      title: row.title as string,
      content: row.content as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastSeq: row.last_seq as number,
    };
  }

  private mapDbToParty(row: SqlRow): Party {
    return {
      id: row.id as string,
      name: row.name as string,
      email: (row.email as string | null) || null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastSeq: row.last_seq as number,
    };
  }

  private mapDbToClause(row: SqlRow): Clause {
    return {
      id: row.id as string,
      documentId: row.document_id as string,
      title: (row.title as string | null) || null,
      text: row.text as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastSeq: row.last_seq as number,
    };
  }

  private mapDbToRelationship(row: SqlRow): Relationship {
    return {
      id: row.id as string,
      sourceId: row.source_id as string,
      sourceType: row.source_type as 'document' | 'party' | 'clause',
      targetId: row.target_id as string,
      targetType: row.target_type as 'document' | 'party' | 'clause',
      type: row.type as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      lastSeq: row.last_seq as number,
    };
  }

  private mapDbToSyncOp(row: SqlRow): SyncOp {
    return {
      id: row.id as string,
      kind: row.kind as SyncOpKind,
      entityType: row.entity_type as string,
      entityId: row.entity_id as string,
      payload: row.payload ? (JSON.parse(row.payload as string) as Record<string, unknown>) : null,
      clientTimestamp: row.client_timestamp as string,
    };
  }
}
