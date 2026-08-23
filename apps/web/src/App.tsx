import { useState, useEffect } from 'react';
import { GraphView } from '@docsgraph/graph-view';
import type { GraphEdge, GraphNode } from '@docsgraph/graph-view';
import { Button } from '@docsgraph/ui';
import { LocalStore, InMemorySqliteAdapter } from '@docsgraph/data';
import { search } from '@docsgraph/search';
import type { EvidenceSnippet } from '@docsgraph/search';

// Seed documents
const SEED_DOCS = [
  {
    id: 'doc-1',
    title: 'Master Services Agreement',
    content: 'This Master Services Agreement ("Agreement") is entered into by and between Acme Corp ("Client") and Beta LLC ("Provider"). Under Section 4.2 (Payment Terms), all invoices must be paid within 30 days of receipt. Late payments will incur a 1.5% monthly interest fee.',
  },
  {
    id: 'doc-2',
    title: 'Non-Disclosure Agreement',
    content: 'This Non-Disclosure Agreement governs the exchange of confidential information between Acme Corp and Beta LLC. Under Section 6.1 (Term), the confidentiality obligations shall survive for a period of 5 years from the date of disclosure.',
  },
  {
    id: 'doc-3',
    title: 'Statement of Work #4',
    content: 'Statement of Work #4 is effective as of August 2026. Under Section 2.3 (Deliverables), Provider shall deliver the final design specifications by September 15, 2026.',
  },
];

// Initialize local offline store
const adapter = new InMemorySqliteAdapter();
const store = new LocalStore(adapter);

export function App() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [documents, setDocuments] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EvidenceSnippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedSnippet, setSelectedSnippet] = useState<EvidenceSnippet | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  // Initialize DB and seed
  useEffect(() => {
    async function init() {
      await store.initialize();
      const existing = await store.getDocuments();
      if (existing.length === 0) {
        for (const doc of SEED_DOCS) {
          await store.createDocument({
            id: doc.id,
            title: doc.title,
            content: doc.content,
          });
        }
      }
      const docs = await store.getDocuments();
      setDocuments(docs);
      setDbInitialized(true);
    }
    init().catch(console.error);
  }, []);

  // Handle live search
  useEffect(() => {
    if (!dbInitialized) return;

    const trimmed = searchQuery.trim();
    if (trimmed.length === 0) {
      setSearchResults([]);
      return;
    }

    setLoading(true);
    const delayDebounce = setTimeout(async () => {
      try {
        const results = await search(store, trimmed);
        setSearchResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, dbInitialized]);

  const activeDoc = documents.find((d) => d.id === selectedDocId);

  // Graph nodes based on database
  const graphNodes: GraphNode[] = documents.map((doc) => ({
    id: doc.id,
    label: doc.title,
  }));

  const graphEdges: GraphEdge[] = [
    { source: 'doc-1', target: 'doc-2' },
    { source: 'doc-1', target: 'doc-3' },
  ];

  // Helper to render text with highlighted passage
  const renderHighlightedContent = (content: string, snippet: EvidenceSnippet | null) => {
    if (!snippet || snippet.sourceDocumentId !== selectedDocId) {
      return <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{content}</p>;
    }
    const { start, end } = snippet.offset;
    const before = content.substring(0, start);
    const match = content.substring(start, end);
    const after = content.substring(end);

    return (
      <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
        {before}
        <mark className="bg-amber-200 text-amber-950 font-semibold px-1 rounded shadow-sm border border-amber-300 animate-pulse">
          {match}
        </mark>
        {after}
      </p>
    );
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            docsgraph
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Local-first semantic document workspace & offline search
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="primary">New document</Button>
          <Button variant="secondary" onClick={() => setShowGraph(!showGraph)}>
            {showGraph ? 'Show Document Workspace' : 'Toggle Knowledge Graph'}
          </Button>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            Offline Mode
          </span>
        </div>
      </header>

      {/* Main Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Search Pane */}
        <aside className="w-80 border-r border-slate-800 bg-slate-950/40 p-4 flex flex-col gap-4 overflow-y-auto">
          <div>
            <label htmlFor="search" className="block text-sm font-semibold text-slate-300 mb-2">
              Search Local Library
            </label>
            <div className="relative">
              <input
                id="search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Type query to find passage..."
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Search Result States */}
          <div className="flex-1 flex flex-col gap-2">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Search Results
            </h3>

            {loading ? (
              <div className="py-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                <span className="h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>
                Searching offline index...
              </div>
            ) : searchQuery.trim() && searchResults.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                No matching passages found.
              </div>
            ) : !searchQuery.trim() ? (
              <div className="py-8 text-center text-slate-600 text-sm">
                Enter search query to locate exact document passages.
              </div>
            ) : (
              <div className="flex flex-col gap-2 overflow-y-auto max-h-[70vh]">
                {searchResults.map((result, idx) => {
                  const doc = documents.find((d) => d.id === result.sourceDocumentId);
                  return (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedDocId(result.sourceDocumentId);
                        setSelectedSnippet(result);
                      }}
                      className={`text-left p-3 rounded-lg border text-sm transition-all ${
                        selectedSnippet === result
                          ? 'bg-blue-600/20 border-blue-500 text-slate-100'
                          : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <span className="block text-xs font-semibold text-blue-400 mb-1">
                        {doc?.title || 'Unknown Document'}
                      </span>
                      <p className="line-clamp-3 text-slate-300 text-xs italic">
                        "{result.text}"
                      </p>
                      <span className="block text-[10px] text-slate-500 mt-2 font-mono">
                        Offset: {result.offset.start} - {result.offset.end}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Content Viewer Panel */}
        <section className="flex-1 p-6 overflow-y-auto bg-slate-900">
          <div className={showGraph ? 'h-full flex flex-col gap-4' : 'hidden'}>
            <h2 className="text-lg font-bold text-slate-200">Knowledge Graph Exploration</h2>
            <div className="flex-1 rounded-lg border border-slate-800 bg-slate-950 p-4 flex items-center justify-center">
              <GraphView nodes={graphNodes} edges={graphEdges} width={640} height={400} />
            </div>
          </div>

          {!showGraph && (
            activeDoc ? (
              <article className="max-w-3xl mx-auto bg-slate-950/50 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-100">{activeDoc.title}</h2>
                    <span className="text-xs text-slate-500 font-mono">ID: {activeDoc.id}</span>
                  </div>
                  <Button variant="secondary" onClick={() => { setSelectedDocId(null); setSelectedSnippet(null); }}>
                    Close Reader
                  </Button>
                </div>

                {selectedSnippet && selectedSnippet.sourceDocumentId === activeDoc.id && (
                  <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs p-3 rounded-lg flex flex-col gap-1">
                    <span className="font-bold">Active Passage Reference:</span>
                    <p className="italic">"... {selectedSnippet.text} ..."</p>
                  </div>
                )}

                <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-850">
                  {renderHighlightedContent(activeDoc.content, selectedSnippet)}
                </div>
              </article>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto gap-4">
                <div className="h-16 w-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                  📄
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-200">No Document Opened</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Select a document from the left list or search for passages to open them instantly in the document reader view.
                  </p>
                </div>
                <div className="flex flex-col gap-2 w-full mt-2">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider text-left mb-1">
                    Available Documents
                  </h4>
                  {documents.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDocId(doc.id)}
                      className="w-full text-left px-3 py-2 bg-slate-800/40 border border-slate-700/60 hover:bg-slate-800/80 rounded-lg text-sm text-slate-300 flex justify-between items-center transition-all"
                    >
                      <span>{doc.title}</span>
                      <span className="text-xs text-slate-500 font-mono">Open →</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </section>
      </div>
    </main>
  );
}
