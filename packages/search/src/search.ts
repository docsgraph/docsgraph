import type { EvidenceSnippet } from './types';

/**
 * Evidence-grounded search placeholder. Real implementation will query
 * the local SQLite index (`@docsgraph/data`) and return snippets grounded
 * in specific documents/offsets rather than opaque relevance scores.
 *
 * TODO(search): wire up an actual full-text/embedding index once
 * `@docsgraph/data`'s schema for documents lands.
 */
export async function search(query: string): Promise<EvidenceSnippet[]> {
  if (query.trim().length === 0) {
    return [];
  }
  throw new Error('Not implemented: search (no index wired up yet)');
}
