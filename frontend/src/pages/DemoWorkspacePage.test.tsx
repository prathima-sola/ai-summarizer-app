import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { DemoWorkspacePage } from './DemoWorkspacePage';

describe('DemoWorkspacePage', () => {
  it('lets anonymous visitors inspect source-grounded product behavior', () => {
    render(<MemoryRouter><DemoWorkspacePage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /inspect the complete grounded-reading workflow/i })).toBeInTheDocument();
    expect(screen.getByText(/Researchers said summaries only become useful/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Ask the document' }));
    expect(screen.getByText(/Researchers only considered a summary useful/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'evidence' }));
    expect(screen.getByText(/Check each quotation in context/i)).toBeInTheDocument();
  });
});
