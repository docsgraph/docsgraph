import { describe, expect, it } from 'vitest';
import { search } from './search';
import type { LocalStore } from '@docsgraph/data';

describe('Search offline index tests', () => {
  it('returns matching snippets with correct offsets', async () => {
    const mockStore = {
      getDocuments: async () => [
        {
          id: 'doc-1',
          title: 'Master Agreement',
          content: 'This is the master agreement between Acme and Beta. Payment terms are 30 days.',
          createdAt: '',
          updatedAt: '',
          lastSeq: 0,
        },
      ],
    } as unknown as LocalStore;

    const results = await search(mockStore, 'Payment terms');
    expect(results).toHaveLength(1);
    expect(results[0]?.sourceDocumentId).toBe('doc-1');
    expect(results[0]?.offset.start).toBe(52);
    expect(results[0]?.offset.end).toBe(65);
    expect(results[0]?.text).toContain('Payment terms');
  });

  it('returns empty array on empty query', async () => {
    const mockStore = {} as unknown as LocalStore;
    const results = await search(mockStore, '   ');
    expect(results).toEqual([]);
  });
});
