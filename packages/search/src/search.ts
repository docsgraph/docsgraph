import type { LocalStore } from '@docsgraph/data';
import type { EvidenceSnippet } from './types';

/**
 * Searches across documents fully offline against the local index.
 * Matches are returned as EvidenceSnippets containing matching text snippets
 * along with their source document IDs and character offset ranges.
 */
export async function search(store: LocalStore, query: string): Promise<EvidenceSnippet[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const lowercaseQuery = trimmed.toLowerCase();
  const results: EvidenceSnippet[] = [];

  const documents = await store.getDocuments();

  for (const doc of documents) {
    const content = doc.content || '';
    const lowercaseContent = content.toLowerCase();

    let index = lowercaseContent.indexOf(lowercaseQuery);
    while (index !== -1) {
      // Determine snippet context window
      const snippetStart = Math.max(0, index - 50);
      const snippetEnd = Math.min(content.length, index + trimmed.length + 50);

      let snippetText = content.substring(snippetStart, snippetEnd);
      if (snippetStart > 0) {
        snippetText = '...' + snippetText;
      }
      if (snippetEnd < content.length) {
        snippetText = snippetText + '...';
      }

      results.push({
        text: snippetText,
        sourceDocumentId: doc.id,
        offset: {
          start: index,
          end: index + trimmed.length,
        },
      });

      // Find next match
      index = lowercaseContent.indexOf(lowercaseQuery, index + 1);
    }
  }

  return results;
}
