import { describe, expect, it, beforeEach } from 'vitest';
import { LocalStore } from './store';
import type { SqliteAdapter, SqlParam, SqlRow } from './sqlite/types';
import type { RemoteSyncOp } from './sync/types';

// In-Memory SQLite Simulator for Vitest
class InMemorySqliteAdapter implements SqliteAdapter {
  meta = new Map<string, string>();
  documents = new Map<string, SqlRow>();
  parties = new Map<string, SqlRow>();
  clauses = new Map<string, SqlRow>();
  relationships = new Map<string, SqlRow>();
  syncOps = new Map<string, SqlRow>();

  private cleanSql(sql: string): string {
    return sql
      .split('\n')
      .map((line) => {
        const commentIdx = line.indexOf('--');
        return commentIdx !== -1 ? line.substring(0, commentIdx) : line;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async query<T extends SqlRow = SqlRow>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const cleaned = this.cleanSql(sql);

    if (cleaned.startsWith('SELECT value FROM _docsgraph_meta')) {
      const key = (params[0] as string) || (cleaned.includes("'schema_version'") ? 'schema_version' : 'sync_cursor');
      const val = this.meta.get(key);
      if (val === undefined) return [];
      return [{ value: val }] as unknown as T[];
    }

    if (cleaned.startsWith('SELECT id, title, content, created_at, updated_at, last_seq FROM documents')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const doc = this.documents.get(id);
        return doc ? ([doc] as unknown as T[]) : [];
      }
      return Array.from(this.documents.values()) as unknown as T[];
    }

    if (cleaned.startsWith('SELECT id, name, email, created_at, updated_at, last_seq FROM parties')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const party = this.parties.get(id);
        return party ? ([party] as unknown as T[]) : [];
      }
      return Array.from(this.parties.values()) as unknown as T[];
    }

    if (cleaned.startsWith('SELECT id, document_id, title, text, created_at, updated_at, last_seq FROM clauses')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const clause = this.clauses.get(id);
        return clause ? ([clause] as unknown as T[]) : [];
      }
      if (cleaned.includes('WHERE document_id = ?')) {
        const docId = params[0] as string;
        return Array.from(this.clauses.values()).filter((c) => c.document_id === docId) as unknown as T[];
      }
      return Array.from(this.clauses.values()) as unknown as T[];
    }

    if (cleaned.startsWith('SELECT id, source_id, source_type, target_id, target_type, type, created_at, updated_at, last_seq FROM relationships')) {
      if (cleaned.includes('WHERE id = ?')) {
        const id = params[0] as string;
        const rel = this.relationships.get(id);
        return rel ? ([rel] as unknown as T[]) : [];
      }
      return Array.from(this.relationships.values()) as unknown as T[];
    }

    if (cleaned.startsWith('SELECT id, kind, entity_type, entity_id, payload, client_timestamp FROM sync_ops WHERE seq IS NULL')) {
      const unsynced = Array.from(this.syncOps.values()).filter((op) => op.seq === null || op.seq === undefined);
      unsynced.sort((a, b) => {
        const aTime = (a.client_timestamp as string) || '';
        const bTime = (b.client_timestamp as string) || '';
        return aTime.localeCompare(bTime);
      });
      return unsynced as unknown as T[];
    }

    if (cleaned.startsWith('SELECT entity_type, entity_id FROM sync_ops WHERE id = ?')) {
      const id = params[0] as string;
      const op = this.syncOps.get(id);
      return op ? ([{ entity_type: op.entity_type as string, entity_id: op.entity_id as string }] as unknown as T[]) : [];
    }

    if (cleaned.startsWith('SELECT seq FROM sync_ops WHERE id = ?')) {
      const id = params[0] as string;
      const op = this.syncOps.get(id);
      return op ? ([{ seq: op.seq as number }] as unknown as T[]) : [];
    }

    if (cleaned.startsWith('SELECT payload FROM sync_ops WHERE entity_type = ? AND entity_id = ? AND seq IS NULL')) {
      const entityType = params[0] as string;
      const entityId = params[1] as string;
      const filtered = Array.from(this.syncOps.values()).filter(
        (op) => op.entity_type === entityType && op.entity_id === entityId && (op.seq === null || op.seq === undefined)
      );
      return filtered.map((op) => ({ payload: op.payload as string })) as unknown as T[];
    }

    const lastSeqMatch = cleaned.match(/SELECT last_seq FROM (\w+) WHERE id = \?/i);
    if (lastSeqMatch && lastSeqMatch[1]) {
      const table = lastSeqMatch[1].toLowerCase();
      const id = params[0] as string;
      const adapterRecord = this as unknown as Record<string, Map<string, SqlRow> | undefined>;
      const map = adapterRecord[table];
      const item = map?.get(id);
      return item ? ([{ last_seq: item.last_seq as number }] as unknown as T[]) : [];
    }

    return [];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<void> {
    const cleaned = this.cleanSql(sql);

    if (cleaned.startsWith('CREATE TABLE') || cleaned.startsWith('CREATE INDEX')) {
      return;
    }

    if (cleaned.startsWith('INSERT INTO _docsgraph_meta') || cleaned.startsWith('INSERT OR IGNORE INTO _docsgraph_meta')) {
      let key = (params[0] as string) || '';
      let val = (params[1] as string) || '';
      if (!key) {
        const match = cleaned.match(/VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/i);
        if (match) {
          key = match[1] || '';
          val = match[2] || '';
        }
      }
      this.meta.set(key, val);
      return;
    }

    if (cleaned.startsWith('INSERT INTO documents') || cleaned.startsWith('INSERT OR IGNORE INTO documents')) {
      const id = params[0] as string;
      this.documents.set(id, {
        id,
        title: params[1] as string,
        content: params[2] as string,
        created_at: params[3] as string,
        updated_at: params[4] as string,
        last_seq: (params[5] as number) || 0,
      });
      return;
    }
    if (cleaned.startsWith('UPDATE documents SET')) {
      this.updateTable(this.documents, cleaned, params);
      return;
    }
    if (cleaned.startsWith('DELETE FROM documents WHERE id = ?')) {
      const id = params[0] as string;
      this.documents.delete(id);
      return;
    }

    if (cleaned.startsWith('INSERT INTO parties') || cleaned.startsWith('INSERT OR IGNORE INTO parties')) {
      const id = params[0] as string;
      this.parties.set(id, {
        id,
        name: params[1] as string,
        email: params[2] as string,
        created_at: params[3] as string,
        updated_at: params[4] as string,
        last_seq: (params[5] as number) || 0,
      });
      return;
    }
    if (cleaned.startsWith('UPDATE parties SET')) {
      this.updateTable(this.parties, cleaned, params);
      return;
    }
    if (cleaned.startsWith('DELETE FROM parties WHERE id = ?')) {
      const id = params[0] as string;
      this.parties.delete(id);
      return;
    }

    if (cleaned.startsWith('INSERT INTO clauses') || cleaned.startsWith('INSERT OR IGNORE INTO clauses')) {
      const id = params[0] as string;
      this.clauses.set(id, {
        id,
        document_id: params[1] as string,
        title: params[2] as string,
        text: params[3] as string,
        created_at: params[4] as string,
        updated_at: params[5] as string,
        last_seq: (params[6] as number) || 0,
      });
      return;
    }
    if (cleaned.startsWith('UPDATE clauses SET')) {
      this.updateTable(this.clauses, cleaned, params);
      return;
    }
    if (cleaned.startsWith('DELETE FROM clauses WHERE id = ?')) {
      const id = params[0] as string;
      this.clauses.delete(id);
      return;
    }

    if (cleaned.startsWith('INSERT INTO relationships') || cleaned.startsWith('INSERT OR IGNORE INTO relationships')) {
      const id = params[0] as string;
      this.relationships.set(id, {
        id,
        source_id: params[1] as string,
        source_type: params[2] as string,
        target_id: params[3] as string,
        target_type: params[4] as string,
        type: params[5] as string,
        created_at: params[6] as string,
        updated_at: params[7] as string,
        last_seq: (params[8] as number) || 0,
      });
      return;
    }
    if (cleaned.startsWith('UPDATE relationships SET')) {
      this.updateTable(this.relationships, cleaned, params);
      return;
    }
    if (cleaned.startsWith('DELETE FROM relationships WHERE id = ?')) {
      const id = params[0] as string;
      this.relationships.delete(id);
      return;
    }

    if (cleaned.startsWith('INSERT INTO sync_ops') || cleaned.startsWith('INSERT OR IGNORE INTO sync_ops')) {
      const id = params[0] as string;
      this.syncOps.set(id, {
        id,
        kind: params[1] as string,
        entity_type: params[2] as string,
        entity_id: params[3] as string,
        payload: params[4] as string,
        client_timestamp: params[5] as string,
        seq: params[6] === undefined ? null : (params[6] as number),
      });
      return;
    }
    if (cleaned.startsWith('UPDATE sync_ops SET')) {
      const id = params[1] as string;
      const existing = this.syncOps.get(id);
      if (existing) {
        existing.seq = params[0] as number;
        this.syncOps.set(id, existing);
      }
      return;
    }
  }

  private updateTable(tableMap: Map<string, SqlRow>, cleaned: string, params: SqlParam[]): void {
    const id = params[params.length - 1] as string;
    const existing = tableMap.get(id);
    if (!existing) return;

    if (cleaned.includes('last_seq = MAX')) {
      const newSeq = params[0] as number;
      existing.last_seq = Math.max((existing.last_seq as number) || 0, newSeq);
    } else {
      const setPart = cleaned.substring(cleaned.indexOf('SET') + 4, cleaned.indexOf('WHERE')).trim();
      const keys = setPart.split(',').map((k) => (k.split('=')[0] || '').trim());
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const val = params[i];
        if (key && val !== undefined) {
          existing[key] = val;
        }
      }
    }
    tableMap.set(id, existing);
  }

  async transaction<T>(fn: (tx: SqliteAdapter) => Promise<T>): Promise<T> {
    return await fn(this);
  }

  async close(): Promise<void> {}
}

describe('LocalStore Core Model & Persistence', () => {
  let adapter: InMemorySqliteAdapter;
  let store: LocalStore;

  beforeEach(async () => {
    adapter = new InMemorySqliteAdapter();
    store = new LocalStore(adapter);
    await store.initialize();
  });

  describe('Offline Migration', () => {
    it('sets up schema version metadata correctly', async () => {
      const version = await adapter.meta.get('schema_version');
      expect(version).toBe('2');
    });
  });

  describe('Document CRUD', () => {
    it('can create, read, update, and delete documents fully offline', async () => {
      // 1. Create offline
      const doc = await store.createDocument({
        id: 'doc-abc',
        title: 'Confidentiality Agreement',
        content: 'This agreement governs confidentiality...',
      });

      expect(doc.id).toBe('doc-abc');
      expect(doc.title).toBe('Confidentiality Agreement');
      expect(doc.createdAt).toBeDefined();
      expect(doc.updatedAt).toBeDefined();

      // Verify recorded sync operation
      let unsynced = await store.getUnsyncedOps();
      expect(unsynced).toHaveLength(1);
      const op0 = unsynced[0];
      expect(op0).toBeDefined();
      expect(op0!.kind).toBe('create');
      expect(op0!.entityType).toBe('document');
      expect(op0!.entityId).toBe('doc-abc');
      expect(op0!.payload).toEqual({
        title: 'Confidentiality Agreement',
        content: 'This agreement governs confidentiality...',
      });

      // 2. Read offline
      const fetched = await store.getDocument('doc-abc');
      expect(fetched).not.toBeNull();
      expect(fetched!.title).toBe('Confidentiality Agreement');

      // 3. Update offline
      const updated = await store.updateDocument('doc-abc', {
        title: 'Updated Confidentiality Agreement',
      });
      expect(updated.title).toBe('Updated Confidentiality Agreement');

      // Verify update sync op logged
      unsynced = await store.getUnsyncedOps();
      expect(unsynced).toHaveLength(2);
      const op1 = unsynced[1];
      expect(op1).toBeDefined();
      expect(op1!.kind).toBe('update');
      expect(op1!.payload).toEqual({
        title: 'Updated Confidentiality Agreement',
      });

      // 4. Delete offline
      await store.deleteDocument('doc-abc');
      const deleted = await store.getDocument('doc-abc');
      expect(deleted).toBeNull();

      // Verify delete sync op logged
      unsynced = await store.getUnsyncedOps();
      expect(unsynced).toHaveLength(3);
      const op2 = unsynced[2];
      expect(op2).toBeDefined();
      expect(op2!.kind).toBe('delete');
      expect(op2!.payload).toBeNull();
    });
  });

  describe('Parties, Clauses, and Relationships CRUD', () => {
    it('supports offline CRUD on parties', async () => {
      const party = await store.createParty({
        id: 'party-1',
        name: 'Alice Smith',
        email: 'alice@example.com',
      });
      expect(party.name).toBe('Alice Smith');

      const fetched = await store.getParty('party-1');
      expect(fetched).not.toBeNull();

      const updated = await store.updateParty('party-1', { email: 'alice.smith@example.com' });
      expect(updated.email).toBe('alice.smith@example.com');

      await store.deleteParty('party-1');
      expect(await store.getParty('party-1')).toBeNull();
    });

    it('supports offline CRUD on clauses', async () => {
      const clause = await store.createClause({
        id: 'clause-1',
        documentId: 'doc-1',
        title: 'Governing Law',
        text: 'This contract shall be governed by Delaware law.',
      });
      expect(clause.title).toBe('Governing Law');

      const fetched = await store.getClause('clause-1');
      expect(fetched).not.toBeNull();

      const updated = await store.updateClause('clause-1', { title: 'Jurisdiction & Governing Law' });
      expect(updated.title).toBe('Jurisdiction & Governing Law');

      await store.deleteClause('clause-1');
      expect(await store.getClause('clause-1')).toBeNull();
    });

    it('supports offline CRUD on relationships', async () => {
      const rel = await store.createRelationship({
        id: 'rel-1',
        sourceId: 'doc-1',
        sourceType: 'document',
        targetId: 'party-1',
        targetType: 'party',
        type: 'signatory',
      });
      expect(rel.type).toBe('signatory');

      const fetched = await store.getRelationship('rel-1');
      expect(fetched).not.toBeNull();

      await store.deleteRelationship('rel-1');
      expect(await store.getRelationship('rel-1')).toBeNull();
    });
  });

  describe('Sync & Conflict Resolution (LWW)', () => {
    it('applies server acks by updating operation sequence and entity last_seq', async () => {
      await store.createDocument({
        id: 'doc-xyz',
        title: 'Service Level Agreement',
        content: 'Uptime SLA definition',
      });

      const unsynced = await store.getUnsyncedOps();
      const firstOp = unsynced[0];
      expect(firstOp).toBeDefined();
      const localOpId = firstOp!.id;

      // Simulate pull/ack from server assigning sequence number 42
      await store.applyAck(localOpId, 42);

      // Verify local op log is updated
      const opInDb = adapter.syncOps.get(localOpId);
      expect(opInDb).toBeDefined();
      expect(opInDb!.seq).toBe(42);

      // Verify target entity's last_seq is updated
      const updatedDoc = await store.getDocument('doc-xyz');
      expect(updatedDoc!.lastSeq).toBe(42);
    });

    it('applies remote operations correctly and preserves offline edits on overlap', async () => {
      // 1. Setup a synchronized document (synced up to seq 10)
      await adapter.exec(
        `INSERT INTO documents (id, title, content, created_at, updated_at, last_seq)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['doc-shared', 'Initial Title', 'Initial Content', '2026-08-23T00:00:00Z', '2026-08-23T00:00:00Z', 10]
      );

      // 2. Perform an offline modification on the client (not yet pushed/synced)
      // Changing 'title' offline
      await store.updateDocument('doc-shared', {
        title: 'Offline Edited Title',
      });

      // 3. Pull a remote operation from the server with seq 15 that updates BOTH title and content
      const remoteOp: RemoteSyncOp = {
        id: 'op-remote-15',
        kind: 'update',
        entityType: 'document',
        entityId: 'doc-shared',
        payload: {
          title: 'Remote Edited Title',
          content: 'Remote Edited Content',
        },
        clientTimestamp: '2026-08-23T01:00:00Z',
        sequence: 15,
      };

      await store.applyRemoteOps([remoteOp]);

      // 4. Verify field-level resolution:
      // - The local update to 'title' was offline-pending, so 'title' must retain the local offline edit.
      // - The local client did not touch 'content' offline, so 'content' must accept the remote value.
      const doc = await store.getDocument('doc-shared');
      expect(doc).not.toBeNull();
      expect(doc!.title).toBe('Offline Edited Title'); // Kept local offline edit
      expect(doc!.content).toBe('Remote Edited Content'); // Applied remote update
      expect(doc!.lastSeq).toBe(15); // Entity advanced to latest server sequence
    });
  });
});
