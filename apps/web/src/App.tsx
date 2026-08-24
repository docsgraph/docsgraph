import { useState, useEffect, useRef } from 'react';
import { GraphView } from '@docsgraph/graph-view';
import type { GraphEdge, GraphNode } from '@docsgraph/graph-view';
import { Button } from '@docsgraph/ui';
import { LocalStore, InMemorySqliteAdapter, SyncManager, HttpSyncClient } from '@docsgraph/data';
import type { Party, Clause, Relationship, Conflict, SyncStatus } from '@docsgraph/data';
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

let syncStatusListener: ((status: SyncStatus) => void) | null = null;

const syncClient = new HttpSyncClient({
  baseUrl: 'http://localhost:8000',
});
const syncManager = new SyncManager({
  store,
  client: syncClient,
  onStatusChange: (status) => {
    if (syncStatusListener) {
      syncStatusListener(status);
    }
  },
});

export function App() {
  const [dbInitialized, setDbInitialized] = useState(false);
  const [documents, setDocuments] = useState<Array<{ id: string; title: string; content: string }>>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<EvidenceSnippet[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedSnippet, setSelectedSnippet] = useState<EvidenceSnippet | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  // State to track if any node in the graph needs focusing
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);

  // Status mapping for contract analysis
  const [docStatuses, setDocStatuses] = useState<Record<string, 'completed' | 'pending' | 'failed'>>({
    'doc-1': 'completed',
    'doc-2': 'pending',
    'doc-3': 'failed',
  });

  // State for document title editing and offline edit tracking
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleText, setEditingTitleText] = useState('');

  // Network and Sync States
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'conflict' | 'offline'>('synced');
  const [activeConflicts, setActiveConflicts] = useState<Conflict[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);

  // Derived state to avoid undefined indexing warnings
  const currentConflict = activeConflicts[0];

  const isOnlineRef = useRef(isOnline);
  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  // Intercept window.fetch to simulate offline behavior and direct sync calls to backend
  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isOnlineRef.current) {
        throw new TypeError('Failed to fetch');
      }
      return originalFetch(input, init);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Synchronize syncStatus with SyncManager
  useEffect(() => {
    syncStatusListener = (status) => {
      if (status === 'offline') {
        setSyncStatus('offline');
      } else if (status === 'syncing') {
        setSyncStatus('syncing');
      } else if (status === 'error') {
        setSyncStatus('offline');
      } else if (status === 'idle') {
        const storeConflicts = store.getActiveConflicts();
        if (storeConflicts.length > 0) {
          setActiveConflicts(storeConflicts);
          setSyncStatus('conflict');
          setShowConflictModal(true);
        } else {
          setSyncStatus('synced');
        }
      }
    };

    const handleOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    const currentStatus = syncManager.getStatus();
    syncStatusListener(currentStatus);

    return () => {
      syncStatusListener = null;
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, []);

  // Network toggler using actual SyncManager and pre-push conflict detection
  const handleToggleNetwork = async () => {
    if (isOnline) {
      setIsOnline(false);
      setSyncStatus('offline');
    } else {
      setIsOnline(true);
      setSyncStatus('syncing');

      try {
        const currentCursor = await store.getSyncCursor();
        const pullResult = await syncClient.pull(currentCursor);
        if (pullResult.ops.length > 0) {
          await store.applyRemoteOps(pullResult.ops);
        }
        await store.setSyncCursor(pullResult.cursor);
      } catch (err) {
        console.warn('Pre-sync pull failed or skipped:', err);
      }

      const storeConflicts = store.getActiveConflicts();
      if (storeConflicts.length > 0) {
        setActiveConflicts(storeConflicts);
        setSyncStatus('conflict');
        setShowConflictModal(true);
      } else {
        await syncManager.sync();
        await loadData();
      }
    }
  };

  // Trigger Mock Sync Conflict by applying a simulated remote divergent operation
  const handleTriggerMockConflict = async () => {
    if (!selectedDocId) return;
    const doc = documents.find((d) => d.id === selectedDocId);
    if (!doc) return;

    // Ensure we have an offline edit for this document to trigger the LWW conflict path
    await store.updateDocument(doc.id, { title: doc.title });

    const conflictOp = {
      id: `mock-conflict-op-${Date.now()}`,
      kind: 'update' as const,
      entityType: 'document',
      entityId: doc.id,
      payload: { title: `${doc.title} (Remote Divergent Edit)` },
      clientTimestamp: new Date().toISOString(),
      sequence: 999,
    };

    await store.applyRemoteOps([conflictOp]);

    const storeConflicts = store.getActiveConflicts();
    if (storeConflicts.length > 0) {
      setActiveConflicts(storeConflicts);
      setSyncStatus('conflict');
      setShowConflictModal(true);
    }
  };

  // Resolve sync conflict per LWW policy and resume sync
  const handleResolveConflict = async (resolution: 'local' | 'remote') => {
    if (!currentConflict) return;

    if (resolution === 'remote') {
      await store.updateDocument(currentConflict.entityId, {
        [currentConflict.fieldName]: currentConflict.remoteValue,
      });
      await loadData();
    }

    store.clearConflicts();
    setActiveConflicts([]);
    setShowConflictModal(false);
    setSyncStatus('syncing');

    await syncManager.sync();
    await loadData();
  };

  // Save document title updates and track offline changes
  const handleSaveTitle = async () => {
    if (!selectedDocId) return;
    await store.updateDocument(selectedDocId, { title: editingTitleText });
    await loadData();
    setIsEditingTitle(false);
  };

  // Automatically clear graph highlight when opening or switching documents
  useEffect(() => {
    if (selectedDocId) {
      setHighlightNodeId(null);
    }
  }, [selectedDocId]);

  // Query parties associated with a document
  const getDocParties = (docId: string) => {
    const partyIds = relationships
      .filter((r) => r.sourceId === docId && r.targetType === 'party')
      .map((r) => r.targetId);
    return parties.filter((p) => partyIds.includes(p.id));
  };

  // Query clauses associated with a document
  const getDocClauses = (docId: string) => {
    return clauses.filter((c) => c.documentId === docId);
  };

  // Highlight specific clause passage in the reader
  const handleHighlightClause = (clause: Clause) => {
    const doc = documents.find((d) => d.id === clause.documentId);
    if (doc) {
      const start = doc.content.indexOf(clause.text);
      const end = start !== -1 ? start + clause.text.length : 0;
      setSelectedSnippet({
        text: clause.text,
        sourceDocumentId: clause.documentId,
        offset: { start: Math.max(0, start), end: Math.max(0, end) },
      });
    }
  };

  // Focus specific entity in the graph
  const handleFocusInGraph = (entityId: string) => {
    setHighlightNodeId(entityId);
    setShowGraph(true);
    setSelectedDocId(null);
    setSelectedSnippet(null);
  };

  // Trigger analysis retry simulation
  const handleRetryAnalysis = (docId: string) => {
    setDocStatuses((prev) => ({ ...prev, [docId]: 'pending' }));
    setTimeout(() => {
      setDocStatuses((prev) => ({ ...prev, [docId]: 'completed' }));
    }, 2000);
  };

  // Helper to load all entities from local store
  async function loadData() {
    const docs = await store.getDocuments();
    const prts = await store.getParties();
    const cls = await store.getClauses();
    const rels = await store.getRelationships();
    setDocuments(docs);
    setParties(prts);
    setClauses(cls);
    setRelationships(rels);
  }

  // Initialize DB and seed
  useEffect(() => {
    async function init() {
      await store.initialize();
      const existing = await store.getDocuments();
      if (existing.length === 0) {
        // Seed documents
        for (const doc of SEED_DOCS) {
          await store.createDocument({
            id: doc.id,
            title: doc.title,
            content: doc.content,
          });
        }

        // Seed parties
        await store.createParty({ id: 'party-1', name: 'Acme Corp', email: 'contact@acme.com' });
        await store.createParty({ id: 'party-2', name: 'Beta LLC', email: 'contact@beta.com' });

        // Seed clauses
        await store.createClause({
          id: 'clause-1',
          documentId: 'doc-1',
          title: 'Payment Terms',
          text: 'all invoices must be paid within 30 days of receipt.',
        });
        await store.createClause({
          id: 'clause-2',
          documentId: 'doc-2',
          title: 'Term',
          text: 'the confidentiality obligations shall survive for a period of 5 years.',
        });
        await store.createClause({
          id: 'clause-3',
          documentId: 'doc-3',
          title: 'Deliverables',
          text: 'Provider shall deliver the final design specifications by September 15, 2026.',
        });

        // Seed relationships
        await store.createRelationship({
          id: 'rel-1',
          sourceId: 'doc-1',
          sourceType: 'document',
          targetId: 'party-1',
          targetType: 'party',
          type: 'signed_by',
        });
        await store.createRelationship({
          id: 'rel-2',
          sourceId: 'doc-1',
          sourceType: 'document',
          targetId: 'party-2',
          targetType: 'party',
          type: 'signed_by',
        });
        await store.createRelationship({
          id: 'rel-3',
          sourceId: 'doc-1',
          sourceType: 'document',
          targetId: 'clause-1',
          targetType: 'clause',
          type: 'contains',
        });
        await store.createRelationship({
          id: 'rel-4',
          sourceId: 'doc-2',
          sourceType: 'document',
          targetId: 'clause-2',
          targetType: 'clause',
          type: 'contains',
        });
        await store.createRelationship({
          id: 'rel-5',
          sourceId: 'doc-3',
          sourceType: 'document',
          targetId: 'clause-3',
          targetType: 'clause',
          type: 'contains',
        });
        await store.createRelationship({
          id: 'rel-6',
          sourceId: 'doc-2',
          sourceType: 'document',
          targetId: 'party-1',
          targetType: 'party',
          type: 'signed_by',
        });
        await store.createRelationship({
          id: 'rel-7',
          sourceId: 'doc-2',
          sourceType: 'document',
          targetId: 'party-2',
          targetType: 'party',
          type: 'signed_by',
        });
      }
      await loadData();
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

  // Dynamic mapping of DB entities to knowledge graph nodes and edges
  const graphNodes: GraphNode[] = [
    ...documents.map((doc) => ({
      id: doc.id,
      label: doc.title,
      type: 'document' as const,
    })),
    ...parties.map((p) => ({
      id: p.id,
      label: p.name,
      type: 'party' as const,
    })),
    ...clauses.map((c) => ({
      id: c.id,
      label: c.title || c.id,
      type: 'clause' as const,
    })),
  ];

  const graphEdges: GraphEdge[] = relationships.map((r) => ({
    source: r.sourceId,
    target: r.targetId,
    type: r.type,
  }));

  // Handle clicking on a graph node to navigate to the source document/passage
  const handleNodeClick = (nodeId: string, nodeType: 'document' | 'party' | 'clause') => {
    setHighlightNodeId(null);
    if (nodeType === 'document') {
      setSelectedDocId(nodeId);
      setSelectedSnippet(null);
      setShowGraph(false);
    } else if (nodeType === 'clause') {
      const matched = clauses.find((c) => c.id === nodeId);
      if (matched) {
        setSelectedDocId(matched.documentId);
        const doc = documents.find((d) => d.id === matched.documentId);
        if (doc) {
          const start = doc.content.indexOf(matched.text);
          const end = start !== -1 ? start + matched.text.length : 0;
          setSelectedSnippet({
            text: matched.text,
            sourceDocumentId: matched.documentId,
            offset: { start: Math.max(0, start), end: Math.max(0, end) },
          });
        }
        setShowGraph(false);
      }
    } else if (nodeType === 'party') {
      const rel = relationships.find((r) => r.targetId === nodeId && r.sourceType === 'document');
      if (rel) {
        setSelectedDocId(rel.sourceId);
        setSelectedSnippet(null);
        setShowGraph(false);
      }
    }
  };

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
        <div className="flex gap-2 items-center">
          <Button variant="primary">New document</Button>
          <Button variant="secondary" onClick={() => setShowGraph(!showGraph)}>
            {showGraph ? 'Show Document Workspace' : 'Toggle Knowledge Graph'}
          </Button>

          {/* Simulated Network Toggle */}
          <button
            onClick={handleToggleNetwork}
            className={`px-3 py-1 text-xs font-semibold rounded-full border transition flex items-center gap-1.5 ${
              isOnline
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
            title="Click to toggle simulated connection state"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
            {isOnline ? 'Simulate Offline' : 'Simulate Online'}
          </button>

          {/* Sync Status Indicators */}
          {syncStatus === 'synced' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Online & Synced
            </span>
          )}
          {syncStatus === 'syncing' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse">
              <span className="h-2 w-2 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></span>
              Syncing Changes...
            </span>
          )}
          {syncStatus === 'offline' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-slate-800/10 bg-slate-800 text-slate-400 border border-slate-700">
              Offline Mode
            </span>
          )}
          {syncStatus === 'conflict' && (
            <button
              onClick={() => setShowConflictModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-full bg-red-500/15 text-red-400 border border-red-500/35 hover:bg-red-500/25"
            >
              ⚡ Sync Conflict!
            </button>
          )}

          {/* Trigger Mock Conflict button */}
          {isOnline && syncStatus === 'synced' && (
            <button
              onClick={handleTriggerMockConflict}
              className="px-2.5 py-1 text-xs border border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-350 rounded"
              title="Manually force a sync conflict for testing"
            >
              Force Conflict
            </button>
          )}
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
              <GraphView
                nodes={graphNodes}
                edges={graphEdges}
                width={640}
                height={400}
                onNodeClick={handleNodeClick}
                highlightNodeId={highlightNodeId || undefined}
              />
            </div>
          </div>

          {!showGraph && (
            activeDoc ? (
              <article className="max-w-5xl mx-auto bg-slate-950/50 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col gap-4 max-h-[75vh] min-h-[500px]">
                {/* Reader Header */}
                <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-shrink-0">
                  <div className="flex flex-col gap-1">
                    {isEditingTitle ? (
                      <div className="flex gap-2 items-center">
                        <input
                          value={editingTitleText}
                          onChange={(e) => setEditingTitleText(e.target.value)}
                          className="bg-slate-900 border border-slate-700 px-2 py-1 rounded text-sm text-slate-100 focus:outline-none"
                        />
                        <button
                          onClick={handleSaveTitle}
                          className="bg-blue-600 hover:bg-blue-500 text-xs font-semibold px-2 py-1 rounded text-white"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setIsEditingTitle(false)}
                          className="bg-slate-800 hover:bg-slate-700 text-xs font-semibold px-2 py-1 rounded text-slate-300"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-slate-100">{activeDoc.title}</h2>
                        <button
                          onClick={() => { setIsEditingTitle(true); setEditingTitleText(activeDoc.title); }}
                          className="text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          Rename
                        </button>
                      </div>
                    )}
                    <span className="text-xs text-slate-500 font-mono">ID: {activeDoc.id}</span>
                  </div>
                  <Button variant="secondary" onClick={() => { setSelectedDocId(null); setSelectedSnippet(null); setIsEditingTitle(false); }}>
                    Close Reader
                  </Button>
                </div>

                {/* Main Split-Pane Content Area */}
                <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
                  {/* Left: Scrollable Contract text body */}
                  <div className="flex-1 overflow-y-auto pr-6 border-r border-slate-800/60">
                    <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                      Document Body
                    </h3>
                    {selectedSnippet && selectedSnippet.sourceDocumentId === activeDoc.id && (
                      <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs p-3 rounded-lg flex flex-col gap-1 mb-4">
                        <span className="font-bold">Active Passage Reference:</span>
                        <p className="italic">"... {selectedSnippet.text} ..."</p>
                      </div>
                    )}
                    <div className="bg-slate-900/60 p-4 rounded-lg border border-slate-850">
                      {renderHighlightedContent(activeDoc.content, selectedSnippet)}
                    </div>
                  </div>

                  {/* Right: Contract Intelligence Detail View */}
                  <div className="w-80 flex flex-col gap-4 overflow-y-auto pl-2 flex-shrink-0">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                        Contract Intelligence
                      </h3>
                      {/* Dynamic Status Badges */}
                      {docStatuses[activeDoc.id] === 'completed' && (
                        <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Completed
                        </span>
                      )}
                      {docStatuses[activeDoc.id] === 'pending' && (
                        <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                          Processing
                        </span>
                      )}
                      {docStatuses[activeDoc.id] === 'failed' && (
                        <span className="bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Failed
                        </span>
                      )}
                    </div>

                    {/* Pending State UI */}
                    {docStatuses[activeDoc.id] === 'pending' && (
                      <div className="flex-1 flex flex-col items-center justify-center py-12 text-center gap-3">
                        <div className="h-8 w-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-slate-350">Analyzing contract structure...</span>
                          <span className="text-[11px] text-slate-500 mt-1">Extracting signatory parties and clauses.</span>
                        </div>
                      </div>
                    )}

                    {/* Failed State UI */}
                    {docStatuses[activeDoc.id] === 'failed' && (
                      <div className="flex-1 flex flex-col items-center justify-center py-8 text-center gap-3 bg-red-950/10 border border-red-900/30 rounded-lg p-4">
                        <span className="text-2xl">⚠️</span>
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-red-400">Analysis Failed</span>
                          <span className="text-[11px] text-slate-400 mt-1">
                            An error occurred during clause extraction. Timeout limit exceeded.
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          className="mt-2 text-xs border-red-900/50 hover:bg-red-950/20"
                          onClick={() => handleRetryAnalysis(activeDoc.id)}
                        >
                          Retry Analysis
                        </Button>
                      </div>
                    )}

                    {/* Completed State UI */}
                    {docStatuses[activeDoc.id] === 'completed' && (
                      <div className="flex flex-col gap-4">
                        {/* Extracted Parties */}
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Extracted Parties
                          </span>
                          {getDocParties(activeDoc.id).length === 0 ? (
                            <span className="text-xs text-slate-600 italic">No signatories detected.</span>
                          ) : (
                            <div className="flex flex-col gap-1.5">
                              {getDocParties(activeDoc.id).map((party) => (
                                <div
                                  key={party.id}
                                  className="bg-slate-900/60 border border-slate-800 rounded p-2 flex items-center justify-between hover:border-slate-700 transition"
                                >
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-semibold text-slate-200 truncate">
                                      {party.name}
                                    </span>
                                    <span className="text-[10px] text-slate-500 truncate">
                                      {party.email || 'No email registered'}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => handleFocusInGraph(party.id)}
                                    className="text-[10px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-0.5 hover:underline flex-shrink-0"
                                    title="View in Graph"
                                  >
                                    🌐 Graph
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Extracted Clauses */}
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Extracted Clauses
                          </span>
                          {getDocClauses(activeDoc.id).length === 0 ? (
                            <span className="text-xs text-slate-600 italic">No clauses detected.</span>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {getDocClauses(activeDoc.id).map((clause) => (
                                <div
                                  key={clause.id}
                                  className="bg-slate-900/60 border border-slate-800 rounded p-2.5 flex flex-col gap-1.5 hover:border-slate-700 transition"
                                >
                                  <div className="flex items-center justify-between border-b border-slate-800/65 pb-1">
                                    <span className="text-xs font-bold text-amber-400">
                                      {clause.title}
                                    </span>
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleHighlightClause(clause)}
                                        className="text-[9px] text-blue-400 hover:text-blue-300 font-semibold hover:underline"
                                      >
                                        🔍 Show
                                      </button>
                                      <button
                                        onClick={() => handleFocusInGraph(clause.id)}
                                        className="text-[9px] text-purple-400 hover:text-purple-300 font-semibold hover:underline"
                                      >
                                        🌐 Graph
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-[11px] text-slate-400 line-clamp-2 italic">
                                    "{clause.text}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Key Terms / Summary */}
                        <div className="flex flex-col gap-2 bg-slate-900/40 border border-slate-800/80 rounded-lg p-3">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Key Details & Deadlines
                          </span>
                          <div className="flex flex-col gap-2 text-xs">
                            {activeDoc.id === 'doc-1' && (
                              <>
                                <div className="flex justify-between border-b border-slate-850 pb-1">
                                  <span className="text-slate-400">Payment Window:</span>
                                  <span className="font-semibold text-slate-200">30 Days</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Late Interest Fee:</span>
                                  <span className="font-semibold text-slate-200">1.5% Monthly</span>
                                </div>
                              </>
                            )}
                            {activeDoc.id === 'doc-2' && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">Survival Period:</span>
                                <span className="font-semibold text-slate-200">5 Years</span>
                              </div>
                            )}
                            {activeDoc.id === 'doc-3' && (
                              <div className="flex justify-between">
                                <span className="text-slate-400">Target Delivery Date:</span>
                                <span className="font-semibold text-slate-200">Sept 15, 2026</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
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

      {/* Conflict Resolution Modal */}
      {showConflictModal && syncStatus === 'conflict' && currentConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <span className="text-xl">⚡</span>
              <div>
                <h3 className="text-md font-bold text-slate-100">Sync Conflict Detected</h3>
                <span className="text-xs text-slate-500 font-mono">
                  Entity: {currentConflict.entityType} ({currentConflict.entityId})
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              The field <code className="text-amber-400 font-mono">{currentConflict.fieldName}</code> was modified locally while offline, but diverging updates were also found on the server.
            </p>

            {/* Side-by-Side Comparison */}
            <div className="grid grid-cols-2 gap-4 mt-2">
              {/* Local version card */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                  Local (Your Offline Edit)
                </span>
                <div className="bg-slate-900 p-2.5 rounded text-xs text-slate-200 min-h-[60px] font-mono break-all">
                  {currentConflict.localValue}
                </div>
                <span className="text-[9px] text-slate-500">
                  Preserved offline. No data loss.
                </span>
              </div>

              {/* Remote version card */}
              <div className="bg-slate-950/50 border border-slate-800 rounded-lg p-3 flex flex-col gap-2">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Remote (Server Changes)
                </span>
                <div className="bg-slate-950/50 p-2.5 rounded text-xs text-slate-200 min-h-[60px] font-mono break-all">
                  {currentConflict.remoteValue}
                </div>
                <span className="text-[9px] text-slate-500">
                  Last Write Wins server sequence.
                </span>
              </div>
            </div>

            {/* Resolution Options */}
            <div className="flex flex-col gap-2 mt-2">
              <button
                onClick={() => handleResolveConflict('local')}
                className="w-full text-left p-3 bg-blue-950/20 hover:bg-blue-950/40 border border-blue-900/40 hover:border-blue-800 rounded-lg flex items-center justify-between text-xs transition"
              >
                <div>
                  <span className="font-semibold text-blue-300 block">Keep Local (Offline Edit)</span>
                  <span className="text-[10px] text-slate-400">Keep your offline modifications and push to server.</span>
                </div>
                <span className="text-blue-400 font-bold">→</span>
              </button>

              <button
                onClick={() => handleResolveConflict('remote')}
                className="w-full text-left p-3 bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-900/40 hover:border-emerald-800 rounded-lg flex items-center justify-between text-xs transition"
              >
                <div>
                  <span className="font-semibold text-emerald-300 block">Keep Remote (Accept Server)</span>
                  <span className="text-[10px] text-slate-400">Discard your offline modifications and accept server.</span>
                </div>
                <span className="text-emerald-400 font-bold">→</span>
              </button>
            </div>

            <div className="flex justify-between items-center border-t border-slate-800 pt-3 mt-1">
              <span className="text-[10px] text-slate-500">
                Documented policy: Field-level LWW
              </span>
              <Button variant="secondary" onClick={() => setShowConflictModal(false)}>
                Resolve Later
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
