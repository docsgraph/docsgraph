import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GraphView } from './GraphView';
import type { GraphEdge, GraphNode } from './GraphView';

describe('GraphView', () => {
  it('mounts a canvas for the given nodes and edges', () => {
    const nodes: GraphNode[] = [
      { id: 'a', label: 'Contract A' },
      { id: 'b', label: 'Contract B' },
    ];
    const edges: GraphEdge[] = [{ source: 'a', target: 'b' }];

    render(<GraphView nodes={nodes} edges={edges} width={200} height={150} />);

    const canvas = screen.getByTestId('graph-view-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveAttribute('width', '200');
    expect(canvas).toHaveAttribute('height', '150');
  });
});
