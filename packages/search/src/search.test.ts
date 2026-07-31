import { describe, expect, it } from 'vitest';
import { search } from './search';

describe('search', () => {
  it('returns no results for an empty query', async () => {
    await expect(search('   ')).resolves.toEqual([]);
  });

  it('is an unimplemented stub for a real query', async () => {
    await expect(search('termination clause')).rejects.toThrow('Not implemented');
  });
});
