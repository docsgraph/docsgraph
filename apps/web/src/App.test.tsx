import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the shell with a Button from @docsgraph/ui and a GraphView from @docsgraph/graph-view', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'docsgraph' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New document' })).toBeInTheDocument();
    expect(screen.getByTestId('graph-view-canvas')).toBeInTheDocument();
  });
});
