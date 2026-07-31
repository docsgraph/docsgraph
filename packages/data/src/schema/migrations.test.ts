import { describe, expect, it } from 'vitest';
import { migrations, pendingMigrations } from './migrations';

describe('migrations', () => {
  it('starts at id 1 and is sorted', () => {
    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations[0]?.id).toBe(1);
    const ids = migrations.map((m) => m.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it('embeds non-empty SQL for every migration', () => {
    for (const migration of migrations) {
      expect(migration.sql.trim().length).toBeGreaterThan(0);
      expect(migration.name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it('pendingMigrations filters and orders by id', () => {
    expect(pendingMigrations(0)).toEqual(migrations);
    expect(pendingMigrations(1)).toEqual([]);
  });
});
