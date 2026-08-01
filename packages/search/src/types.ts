/**
 * A single piece of evidence backing a search result: a text snippet
 * grounded in a specific document and character offset range, so results
 * can be traced back to (and highlighted in) the source document.
 */
export interface EvidenceSnippet {
  /** The matched/relevant text. */
  text: string;
  /** Id of the source document this snippet was extracted from. */
  sourceDocumentId: string;
  /** Character offset range within the source document, [start, end). */
  offset: {
    start: number;
    end: number;
  };
}
