import { GraphView } from '@docsgraph/graph-view';
import type { GraphEdge, GraphNode } from '@docsgraph/graph-view';
import { Button } from '@docsgraph/ui';

// Fake data proving the @docsgraph/graph-view <-> @docsgraph/ui <-> web
// workspace wiring works end to end. Replace with real documents/links
// once @docsgraph/data and @docsgraph/search are wired up.
const fakeNodes: GraphNode[] = [
  { id: 'doc-1', label: 'Master Services Agreement' },
  { id: 'doc-2', label: 'NDA — Acme Corp' },
  { id: 'doc-3', label: 'SOW #4' },
];

const fakeEdges: GraphEdge[] = [
  { source: 'doc-1', target: 'doc-2' },
  { source: 'doc-1', target: 'doc-3' },
];

export function App() {
  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <h1 className="text-2xl font-semibold">docsgraph</h1>
      <p className="mt-1 text-slate-600">
        Local-first document management, knowledge-graph exploration, and contract analysis.
      </p>

      <div className="mt-4 flex gap-2">
        <Button variant="primary">New document</Button>
        <Button variant="secondary">Import</Button>
      </div>

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <GraphView nodes={fakeNodes} edges={fakeEdges} width={480} height={320} />
      </div>
    </main>
  );
}
