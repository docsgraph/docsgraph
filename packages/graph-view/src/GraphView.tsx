import { forceCenter, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { useEffect, useRef } from 'react';

export interface GraphNode {
  id: string;
  label?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphViewProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width?: number;
  height?: number;
}

interface SimNode extends GraphNode, SimulationNodeDatum {}
type SimLink = SimulationLinkDatum<SimNode>;

const NODE_RADIUS = 6;

/**
 * Minimal Obsidian-style force-directed graph renderer. Runs a d3-force
 * simulation and draws nodes/edges to a canvas on each tick. This is a
 * genuinely working baseline (not just a stub) — styling, interaction
 * (drag/zoom/click), and incremental updates are left for follow-up work.
 */
export function GraphView({ nodes, edges, width = 480, height = 320 }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }

    const simNodes: SimNode[] = nodes.map((node) => ({ ...node }));
    const simLinks: SimLink[] = edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
    }));

    function draw() {
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      for (const link of simLinks) {
        const source = link.source as SimNode;
        const target = link.target as SimNode;
        if (source.x == null || source.y == null || target.x == null || target.y == null) {
          continue;
        }
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }

      ctx.fillStyle = '#0f172a';
      for (const node of simNodes) {
        if (node.x == null || node.y == null) {
          continue;
        }
        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const simulation = forceSimulation(simNodes)
      .force('charge', forceManyBody().strength(-120))
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(60),
      )
      .force('center', forceCenter(width / 2, height / 2))
      .on('tick', draw);

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label="Knowledge graph view"
      data-testid="graph-view-canvas"
    />
  );
}
