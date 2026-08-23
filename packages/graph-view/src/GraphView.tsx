import { forceCenter, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { useEffect, useRef, useState } from 'react';

export interface GraphNode {
  id: string;
  label?: string;
  type: 'document' | 'party' | 'clause';
}

export interface GraphEdge {
  source: string;
  target: string;
  type?: string; // Relationship type (e.g. 'signed_by', 'contains')
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
  onNodeClick?: (nodeId: string, nodeType: 'document' | 'party' | 'clause') => void;
  highlightNodeId?: string;
}

interface SimNode extends GraphNode, SimulationNodeDatum {}
type SimLink = SimulationLinkDatum<SimNode> & { type?: string };

const NODE_RADIUS = 7;

export function GraphView({
  nodes,
  edges,
  width = 640,
  height = 400,
  onNodeClick,
  highlightNodeId,
}: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Filter states
  const [showDocs, setShowDocs] = useState(true);
  const [showParties, setShowParties] = useState(true);
  const [showClauses, setShowClauses] = useState(true);

  // Pan and zoom transform state
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const isPanningRef = useRef(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Node drag reference
  const draggedNodeRef = useRef<SimNode | null>(null);
  const hasDraggedRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });

  // Cache node positions to maintain stability during filter toggles or document updates
  const positionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  // Redraw callback ref for triggering render on non-tick interaction frames
  const drawRef = useRef<() => void>();

  // Filter nodes & edges dynamically
  const filteredNodes = nodes.filter((n) => {
    if (n.type === 'document') return showDocs;
    if (n.type === 'party') return showParties;
    if (n.type === 'clause') return showClauses;
    return true;
  });

  const filteredNodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = edges.filter(
    (e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target)
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }

    const simNodes: SimNode[] = filteredNodes.map((node) => {
      const cached = positionsRef.current.get(node.id);
      return {
        ...node,
        x: cached ? cached.x : undefined,
        y: cached ? cached.y : undefined,
      };
    });

    const simLinks: SimLink[] = filteredEdges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      type: edge.type,
    }));

    function draw() {
      if (!ctx || !canvas) {
        return;
      }
      // Save node positions in cache
      for (const node of simNodes) {
        if (node.x != null && node.y != null) {
          positionsRef.current.set(node.id, { x: node.x, y: node.y });
        }
      }

      ctx.clearRect(0, 0, width, height);

      ctx.save();
      // Apply zoom & pan translation
      ctx.translate(transformRef.current.x, transformRef.current.y);
      ctx.scale(transformRef.current.k, transformRef.current.k);

      // 1. Draw Edges
      for (const link of simLinks) {
        const source = link.source as SimNode;
        const target = link.target as SimNode;
        if (source.x == null || source.y == null || target.x == null || target.y == null) {
          continue;
        }

        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();

        // Edge label (Type)
        if (link.type) {
          ctx.font = '7px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const midX = (source.x + target.x) / 2;
          const midY = (source.y + target.y) / 2;

          const textWidth = ctx.measureText(link.type).width;
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(midX - textWidth / 2 - 2, midY - 5, textWidth + 4, 10);

          ctx.fillStyle = '#94a3b8';
          ctx.fillText(link.type, midX, midY);
        }
      }

      // 2. Draw Nodes
      for (const node of simNodes) {
        if (node.x == null || node.y == null) {
          continue;
        }

        let nodeColor = '#3b82f6'; // document -> Blue
        if (node.type === 'party') {
          nodeColor = '#10b981'; // party -> Emerald
        } else if (node.type === 'clause') {
          nodeColor = '#a855f7'; // clause -> Purple
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = nodeColor;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        // Highlight ring indicator
        if (highlightNodeId && highlightNodeId === node.id) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, NODE_RADIUS + 5, 0, Math.PI * 2);
          ctx.strokeStyle = '#f59e0b'; // Amber ring
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Node Label
        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Halo text outline for readability
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        const displayLabel = node.label || node.id;
        ctx.strokeText(displayLabel, node.x, node.y - NODE_RADIUS - 3);
        ctx.fillText(displayLabel, node.x, node.y - NODE_RADIUS - 3);
      }

      ctx.restore();
    }

    drawRef.current = draw;

    const simulation = forceSimulation(simNodes)
      .force('charge', forceManyBody().strength(-150))
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(70)
      )
      .force('center', forceCenter(width / 2, height / 2))
      .on('tick', draw);

    return () => {
      simulation.stop();
    };
  }, [filteredNodes, filteredEdges, width, height, highlightNodeId]);

  // Centering on highlighted node when specified
  useEffect(() => {
    if (!highlightNodeId) return;
    const pos = positionsRef.current.get(highlightNodeId);
    if (pos) {
      transformRef.current.x = width / 2 - pos.x * transformRef.current.k;
      transformRef.current.y = height / 2 - pos.y * transformRef.current.k;
      drawRef.current?.();
    }
  }, [highlightNodeId, width, height]);

  // Handle Pan/Drag Start
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Convert mouse to graph coordinate space
    const gx = (mx - transformRef.current.x) / transformRef.current.k;
    const gy = (my - transformRef.current.y) / transformRef.current.k;

    // Find node under mouse
    const canvasNodes = positionsRef.current;
    let clickedNodeId: string | null = null;
    let closestDist = NODE_RADIUS * 1.5;

    for (const n of filteredNodes) {
      const pos = canvasNodes.get(n.id);
      if (!pos) continue;
      const dx = pos.x - gx;
      const dy = pos.y - gy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= closestDist) {
        clickedNodeId = n.id;
        closestDist = dist;
      }
    }

    if (clickedNodeId) {
      const node = filteredNodes.find((n) => n.id === clickedNodeId);
      if (node) {
        const simNode = node as SimNode;
        draggedNodeRef.current = simNode;
        hasDraggedRef.current = false;
        dragStartPosRef.current = { x: mx, y: my };
        simNode.fx = simNode.x ?? gx;
        simNode.fy = simNode.y ?? gy;
      }
    } else {
      isPanningRef.current = true;
      panStartRef.current = { x: mx, y: my };
    }
  };

  // Handle Pan/Drag Move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      const gx = (mx - transformRef.current.x) / transformRef.current.k;
      const gy = (my - transformRef.current.y) / transformRef.current.k;

      draggedNodeRef.current.fx = gx;
      draggedNodeRef.current.fy = gy;

      const dragDist = Math.sqrt(
        Math.pow(mx - dragStartPosRef.current.x, 2) + Math.pow(my - dragStartPosRef.current.y, 2)
      );
      if (dragDist > 3) {
        hasDraggedRef.current = true;
      }
      drawRef.current?.();
    } else if (isPanningRef.current) {
      const dx = mx - panStartRef.current.x;
      const dy = my - panStartRef.current.y;

      transformRef.current.x += dx;
      transformRef.current.y += dy;
      panStartRef.current = { x: mx, y: my };

      drawRef.current?.();
    }
  };

  // Handle Mouse Up (Trigger clicks or end drag/pan)
  const handleMouseUp = () => {
    if (draggedNodeRef.current) {
      const node = draggedNodeRef.current;
      node.fx = null;
      node.fy = null;

      if (!hasDraggedRef.current && onNodeClick) {
        onNodeClick(node.id, node.type);
      }
      draggedNodeRef.current = null;
    }
    isPanningRef.current = false;
    drawRef.current?.();
  };

  // Handle zoom on wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomIntensity = 0.05;
    const scale = transformRef.current.k;
    const nextK = e.deltaY < 0 ? scale * (1 + zoomIntensity) : scale / (1 + zoomIntensity);
    const newK = Math.max(0.2, Math.min(4, nextK));

    // Scale centered on the mouse pointer
    transformRef.current.x = mouseX - (mouseX - transformRef.current.x) * (newK / scale);
    transformRef.current.y = mouseY - (mouseY - transformRef.current.y) * (newK / scale);
    transformRef.current.k = newK;

    drawRef.current?.();
  };

  // Helper buttons to adjust zoom manually
  const resetZoom = () => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    drawRef.current?.();
  };

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950/20 rounded-lg">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        role="img"
        aria-label="Knowledge graph view"
        data-testid="graph-view-canvas"
        className="block cursor-grab active:cursor-grabbing w-full h-full"
      />

      {/* Floating Filter Overlay */}
      <div className="absolute top-3 right-3 bg-slate-900/90 border border-slate-800 rounded-lg p-3 flex flex-col gap-2 shadow-lg backdrop-blur z-10 w-44">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Filter Entities
        </span>
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={showDocs}
              onChange={(e) => setShowDocs(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-blue-500"
            />
            <span className="h-2 w-2 rounded-full bg-blue-500"></span>
            Documents
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={showParties}
              onChange={(e) => setShowParties(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            Parties
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={showClauses}
              onChange={(e) => setShowClauses(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-purple-500 focus:ring-purple-500"
            />
            <span className="h-2 w-2 rounded-full bg-purple-500"></span>
            Clauses
          </label>
        </div>
        <div className="border-t border-slate-800 pt-2 mt-1 flex justify-between items-center text-[10px] text-slate-400">
          <span>Zoom: {Math.round(transformRef.current.k * 100)}%</span>
          <button
            onClick={resetZoom}
            className="hover:text-white bg-slate-800 px-1.5 py-0.5 rounded text-[9px]"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
